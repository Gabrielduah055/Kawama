import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, Injectable, signal } from '@angular/core';
import { defer, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';
import {
  CheckoutCreateRequest,
  CheckoutResultContext,
  CheckoutSession,
  CheckoutSnapshotItem,
  CheckoutStatus,
  PendingCheckout,
  ResolvedCheckout,
} from '../core/store.models';

interface ApiEnvelope<T> {
  readonly data: T;
}

interface CheckoutStoreState {
  readonly version: 2;
  readonly active?: PendingCheckout;
  readonly history: readonly ResolvedCheckout[];
}

interface LegacyPendingCheckout {
  readonly version: 1;
  readonly idempotencyKey: string;
  readonly request: CheckoutCreateRequest;
  readonly cartSnapshot: readonly CheckoutSnapshotItem[];
  readonly expectedAmountPesewas: number;
  readonly createdAt: string;
  readonly session?: CheckoutSession;
  readonly reconciled: boolean;
}

const CHECKOUT_STORAGE_KEY = 'kawama.checkout.state.v2';
const LEGACY_PENDING_CHECKOUT_STORAGE_KEY = 'kawama.checkout.pending.v1';
const HISTORY_LIMIT = 10;

export class PendingCheckoutConflictError extends Error {
  constructor() {
    super('A different checkout is already pending. Resume it before starting another one.');
    this.name = 'PendingCheckoutConflictError';
  }
}

export class CheckoutStorageError extends Error {
  constructor() {
    super('This browser could not safely save the checkout session.');
    this.name = 'CheckoutStorageError';
  }
}

@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private readonly storeState = signal<CheckoutStoreState>(this.readStore());
  readonly pending = computed(() => this.storeState().active);
  readonly history = computed(() => this.storeState().history);

  constructor(private readonly http: HttpClient) {}

  createSession(
    request: CheckoutCreateRequest,
    cartSnapshot: readonly CheckoutSnapshotItem[],
    expectedAmountPesewas: number,
  ): Observable<CheckoutSession> {
    return defer(() => {
      const pending = this.preparePending(request, cartSnapshot, expectedAmountPesewas);
      if (pending.session) return of(pending.session);

      const headers = new HttpHeaders({ 'Idempotency-Key': pending.idempotencyKey });
      return this.http
        .post<ApiEnvelope<CheckoutSession>>(
          buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.checkoutSessions),
          request,
          { headers },
        )
        .pipe(
          map(({ data }) => data),
          tap((session) => {
            if (session.checkoutToken !== pending.idempotencyKey) {
              throw new Error('The checkout response did not match the saved session.');
            }
            this.saveActive({ ...pending, session });
          }),
        );
    });
  }

  retryPending(): Observable<CheckoutSession> {
    return defer(() => {
      const pending = this.pending();
      if (!pending) throw new PendingCheckoutConflictError();
      return this.createSession(pending.request, pending.cartSnapshot, pending.expectedAmountPesewas);
    });
  }

  getStatus(checkoutToken: string): Observable<CheckoutStatus> {
    return this.http
      .get<ApiEnvelope<CheckoutStatus>>(
        buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.checkoutStatus, { checkoutToken }),
      )
      .pipe(map(({ data }) => data));
  }

  resultContext(): CheckoutResultContext | undefined {
    return this.pending() ?? this.history()[0];
  }

  authorizationUrl(session: CheckoutSession): string | undefined {
    const rawUrl = session.payment?.authorizationUrl;
    if (!rawUrl) return undefined;
    try {
      const url = new URL(rawUrl);
      const paystackHost = url.hostname === 'paystack.com' || url.hostname.endsWith('.paystack.com');
      return url.protocol === 'https:' && paystackHost ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  markReconciled(): void {
    const active = this.pending();
    if (!active || active.reconciled) return;
    const updated = { ...active, reconciled: true };
    try {
      if (this.paymentStatus(updated) === 'paid') {
        this.archiveActive(updated, 'paid');
      } else {
        this.saveActive(updated);
      }
    } catch {
      // The cart also records reconciled tokens. Keeping this active is safer than allowing a duplicate charge.
    }
  }

  recordStatus(status: CheckoutStatus): void {
    const active = this.pending();
    if (!active || (active.session && active.session.orderNumber !== status.orderNumber)) return;
    const updated: PendingCheckout = {
      ...active,
      lastStatus: status,
      ...(active.session
        ? {
            session: {
              ...active.session,
              paymentStatus: status.paymentStatus,
              fulfillmentStatus: status.fulfillmentStatus,
              amountPesewas: status.amountPesewas,
              currency: status.currency,
            },
          }
        : {}),
    };
    try {
      if (status.paymentStatus === 'failed' || status.paymentStatus === 'refunded') {
        this.archiveActive(updated, status.paymentStatus);
      } else {
        this.saveActive(updated);
      }
    } catch {
      // The caller still has the verified response. The active record remains to prevent a second charge.
    }
  }

  resolvePendingFailure(errorCode: string): boolean {
    const active = this.pending();
    if (!active) return true;
    try {
      this.archiveActive({ ...active, lastErrorCode: errorCode }, 'failed');
      return true;
    } catch {
      return false;
    }
  }

  clearPending(): boolean {
    if (!this.pending()) return true;
    try {
      this.writeStore({ ...this.storeState(), active: undefined });
      return true;
    } catch {
      return false;
    }
  }

  private preparePending(
    request: CheckoutCreateRequest,
    cartSnapshot: readonly CheckoutSnapshotItem[],
    expectedAmountPesewas: number,
  ): PendingCheckout {
    const current = this.pending();
    if (current) {
      if (
        JSON.stringify(current.request) !== JSON.stringify(request) ||
        current.expectedAmountPesewas !== expectedAmountPesewas
      ) {
        throw new PendingCheckoutConflictError();
      }
      return current;
    }

    const pending: PendingCheckout = {
      version: 2,
      lifecycle: 'active',
      idempotencyKey: this.randomCheckoutToken(),
      request,
      cartSnapshot: cartSnapshot.map((item) => ({ ...item })),
      expectedAmountPesewas,
      createdAt: new Date().toISOString(),
      reconciled: false,
    };
    this.saveActive(pending);
    return pending;
  }

  private saveActive(active: PendingCheckout): void {
    this.writeStore({ ...this.storeState(), active });
  }

  private archiveActive(active: PendingCheckout, resolution: ResolvedCheckout['resolution']): void {
    const resolved: ResolvedCheckout = {
      ...active,
      lifecycle: 'resolved',
      resolution,
      resolvedAt: new Date().toISOString(),
    };
    const history = [
      resolved,
      ...this.storeState().history.filter((entry) => entry.idempotencyKey !== resolved.idempotencyKey),
    ].slice(0, HISTORY_LIMIT);
    this.writeStore({ version: 2, active: undefined, history });
  }

  private paymentStatus(checkout: PendingCheckout): CheckoutStatus['paymentStatus'] | undefined {
    return checkout.lastStatus?.paymentStatus ?? checkout.session?.paymentStatus;
  }

  private writeStore(store: CheckoutStoreState): void {
    if (typeof sessionStorage === 'undefined') throw new CheckoutStorageError();
    try {
      sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(store));
    } catch {
      throw new CheckoutStorageError();
    }
    try {
      sessionStorage.removeItem(LEGACY_PENDING_CHECKOUT_STORAGE_KEY);
    } catch {
      // The v2 record is already durable; an obsolete legacy copy is harmless.
    }
    this.storeState.set(store);
  }

  private readStore(): CheckoutStoreState {
    const empty: CheckoutStoreState = { version: 2, history: [] };
    if (typeof sessionStorage === 'undefined') return empty;
    try {
      const parsed: unknown = JSON.parse(sessionStorage.getItem(CHECKOUT_STORAGE_KEY) ?? 'null');
      if (this.isCheckoutStore(parsed)) return parsed;

      const legacy: unknown = JSON.parse(sessionStorage.getItem(LEGACY_PENDING_CHECKOUT_STORAGE_KEY) ?? 'null');
      if (this.isLegacyPendingCheckout(legacy)) return this.migrateLegacy(legacy);
      return empty;
    } catch {
      return empty;
    }
  }

  private migrateLegacy(legacy: LegacyPendingCheckout): CheckoutStoreState {
    const active: PendingCheckout = {
      ...legacy,
      version: 2,
      lifecycle: 'active',
      cartSnapshot: legacy.cartSnapshot.map((item) => ({ ...item })),
    };
    const paymentStatus = active.session?.paymentStatus;
    if (paymentStatus === 'failed' || paymentStatus === 'refunded' || (paymentStatus === 'paid' && active.reconciled)) {
      return {
        version: 2,
        history: [{
          ...active,
          lifecycle: 'resolved',
          resolution: paymentStatus,
          resolvedAt: active.createdAt,
        }],
      };
    }
    return { version: 2, active, history: [] };
  }

  private isCheckoutStore(value: unknown): value is CheckoutStoreState {
    if (!value || typeof value !== 'object') return false;
    const store = value as Partial<CheckoutStoreState>;
    return (
      store.version === 2 &&
      Array.isArray(store.history) &&
      store.history.every((entry) => this.isResolvedCheckout(entry)) &&
      (store.active === undefined || this.isPendingCheckout(store.active))
    );
  }

  private isLegacyPendingCheckout(value: unknown): value is LegacyPendingCheckout {
    if (!value || typeof value !== 'object') return false;
    const pending = value as Partial<LegacyPendingCheckout>;
    return pending.version === 1 && this.isCheckoutRecord(pending);
  }

  private isPendingCheckout(value: unknown): value is PendingCheckout {
    if (!value || typeof value !== 'object') return false;
    const pending = value as Partial<PendingCheckout>;
    return pending.version === 2 && pending.lifecycle === 'active' && this.isCheckoutRecord(pending);
  }

  private isResolvedCheckout(value: unknown): value is ResolvedCheckout {
    if (!value || typeof value !== 'object') return false;
    const resolved = value as Partial<ResolvedCheckout>;
    return (
      resolved.version === 2 &&
      resolved.lifecycle === 'resolved' &&
      ['paid', 'failed', 'refunded'].includes(resolved.resolution ?? '') &&
      typeof resolved.resolvedAt === 'string' &&
      this.isCheckoutRecord(resolved)
    );
  }

  private isCheckoutRecord(value: {
    readonly idempotencyKey?: unknown;
    readonly request?: unknown;
    readonly cartSnapshot?: unknown;
    readonly expectedAmountPesewas?: unknown;
    readonly createdAt?: unknown;
    readonly session?: unknown;
    readonly lastStatus?: unknown;
    readonly lastErrorCode?: unknown;
    readonly reconciled?: unknown;
  }): boolean {
    return (
      typeof value.idempotencyKey === 'string' &&
      value.idempotencyKey.length >= 16 &&
      typeof value.createdAt === 'string' &&
      Number.isInteger(value.expectedAmountPesewas) &&
      Number(value.expectedAmountPesewas) >= 0 &&
      typeof value.reconciled === 'boolean' &&
      this.isCheckoutRequest(value.request) &&
      this.isCheckoutSnapshot(value.cartSnapshot) &&
      (value.session === undefined || this.isCheckoutSession(value.session)) &&
      (value.lastStatus === undefined || this.isCheckoutStatus(value.lastStatus)) &&
      (value.lastErrorCode === undefined || typeof value.lastErrorCode === 'string')
    );
  }

  private isCheckoutRequest(value: unknown): value is CheckoutCreateRequest {
    if (!value || typeof value !== 'object') return false;
    const request = value as Partial<CheckoutCreateRequest>;
    const customer = request.customer as Partial<CheckoutCreateRequest['customer']> | undefined;
    return (
      !!customer &&
      typeof customer.fullName === 'string' &&
      typeof customer.email === 'string' &&
      typeof customer.whatsappNumber === 'string' &&
      typeof customer.deliveryAddress === 'string' &&
      customer.whatsappConsent === true &&
      (request.orderNotes === undefined || typeof request.orderNotes === 'string') &&
      this.isCheckoutItems(request.items)
    );
  }

  private isCheckoutSnapshot(value: unknown): value is readonly CheckoutSnapshotItem[] {
    return (
      this.isCheckoutItems(value) &&
      value.every((item) => {
        const snapshot = item as CheckoutSnapshotItem;
        return (
          (snapshot.name === undefined || typeof snapshot.name === 'string') &&
          (snapshot.slug === undefined || typeof snapshot.slug === 'string') &&
          (snapshot.image === undefined ||
            (typeof snapshot.image.src === 'string' && typeof snapshot.image.alt === 'string')) &&
          (snapshot.unitPricePesewas === undefined ||
            (Number.isInteger(snapshot.unitPricePesewas) && snapshot.unitPricePesewas >= 0)) &&
          (snapshot.currency === undefined || snapshot.currency === 'GHS')
        );
      })
    );
  }

  private isCheckoutItems(value: unknown): value is readonly CheckoutSnapshotItem[] {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (item: unknown) =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as Partial<CheckoutSnapshotItem>).productId === 'string' &&
          Number.isInteger((item as Partial<CheckoutSnapshotItem>).quantity) &&
          ((item as Partial<CheckoutSnapshotItem>).quantity ?? 0) > 0,
      )
    );
  }

  private isCheckoutSession(value: unknown): value is CheckoutSession {
    if (!value || typeof value !== 'object') return false;
    const session = value as Partial<CheckoutSession>;
    const payment = session.payment as Partial<CheckoutSession['payment']> | undefined;
    return (
      typeof session.created === 'boolean' &&
      typeof session.checkoutToken === 'string' &&
      typeof session.orderNumber === 'string' &&
      ['pending', 'paid', 'failed', 'refunded', 'needs_attention'].includes(session.paymentStatus ?? '') &&
      ['awaiting_payment', 'paid_awaiting_delivery', 'processing', 'out_for_delivery', 'delivered', 'cancelled', 'needs_attention'].includes(session.fulfillmentStatus ?? '') &&
      Number.isInteger(session.amountPesewas) &&
      session.currency === 'GHS' &&
      (payment === undefined ||
        (typeof payment.reference === 'string' &&
          typeof payment.accessCode === 'string' &&
          typeof payment.authorizationUrl === 'string'))
    );
  }

  private isCheckoutStatus(value: unknown): value is CheckoutStatus {
    if (!value || typeof value !== 'object') return false;
    const status = value as Partial<CheckoutStatus>;
    return (
      typeof status.orderNumber === 'string' &&
      ['pending', 'paid', 'failed', 'refunded', 'needs_attention'].includes(status.paymentStatus ?? '') &&
      ['awaiting_payment', 'paid_awaiting_delivery', 'processing', 'out_for_delivery', 'delivered', 'cancelled', 'needs_attention'].includes(status.fulfillmentStatus ?? '') &&
      ['not_quoted', 'quoted', 'collected', 'waived'].includes(status.deliveryFeeStatus ?? '') &&
      Number.isInteger(status.amountPesewas) &&
      status.currency === 'GHS'
    );
  }

  private randomCheckoutToken(): string {
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
      throw new CheckoutStorageError();
    }
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }
}
