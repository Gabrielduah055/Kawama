import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { map, Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';
import {
  CheckoutCreateRequest,
  CheckoutRequestItem,
  CheckoutSession,
  CheckoutStatus,
  PendingCheckout,
} from '../core/store.models';

interface ApiEnvelope<T> {
  readonly data: T;
}

const PENDING_CHECKOUT_STORAGE_KEY = 'kawama.checkout.pending.v1';

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
  private readonly pendingState = signal<PendingCheckout | undefined>(this.readPending());
  readonly pending = this.pendingState.asReadonly();

  constructor(private readonly http: HttpClient) {}

  createSession(
    request: CheckoutCreateRequest,
    cartSnapshot: readonly CheckoutRequestItem[],
    expectedAmountPesewas: number,
  ): Observable<CheckoutSession> {
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
          this.savePending({ ...pending, session });
        }),
      );
  }

  retryPending(): Observable<CheckoutSession> {
    const pending = this.pendingState();
    if (!pending) throw new PendingCheckoutConflictError();
    return this.createSession(pending.request, pending.cartSnapshot, pending.expectedAmountPesewas);
  }

  getStatus(checkoutToken: string): Observable<CheckoutStatus> {
    return this.http
      .get<ApiEnvelope<CheckoutStatus>>(
        buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.checkoutStatus, { checkoutToken }),
      )
      .pipe(map(({ data }) => data));
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
    const pending = this.pendingState();
    if (pending && !pending.reconciled) this.savePending({ ...pending, reconciled: true });
  }

  recordStatus(status: CheckoutStatus): void {
    const pending = this.pendingState();
    if (!pending?.session || pending.session.orderNumber !== status.orderNumber) return;
    try {
      this.savePending({
        ...pending,
        session: {
          ...pending.session,
          paymentStatus: status.paymentStatus,
          fulfillmentStatus: status.fulfillmentStatus,
          amountPesewas: status.amountPesewas,
          currency: status.currency,
        },
      });
    } catch {
      // Status remains available in the result page even if storage becomes unavailable.
    }
  }

  clearPending(): void {
    this.pendingState.set(undefined);
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
    } catch {
      // The in-memory state is still cleared when browser storage is unavailable.
    }
  }

  private preparePending(
    request: CheckoutCreateRequest,
    cartSnapshot: readonly CheckoutRequestItem[],
    expectedAmountPesewas: number,
  ): PendingCheckout {
    const current = this.pendingState();
    if (current) {
      if (
        JSON.stringify(current.request) !== JSON.stringify(request) ||
        JSON.stringify(current.cartSnapshot) !== JSON.stringify(cartSnapshot) ||
        current.expectedAmountPesewas !== expectedAmountPesewas
      ) {
        throw new PendingCheckoutConflictError();
      }
      return current;
    }

    const pending: PendingCheckout = {
      version: 1,
      idempotencyKey: this.randomCheckoutToken(),
      request,
      cartSnapshot,
      expectedAmountPesewas,
      createdAt: new Date().toISOString(),
      reconciled: false,
    };
    this.savePending(pending);
    return pending;
  }

  private savePending(pending: PendingCheckout): void {
    if (typeof sessionStorage === 'undefined') throw new CheckoutStorageError();
    this.pendingState.set(pending);
    try {
      sessionStorage.setItem(PENDING_CHECKOUT_STORAGE_KEY, JSON.stringify(pending));
    } catch {
      throw new CheckoutStorageError();
    }
  }

  private readPending(): PendingCheckout | undefined {
    if (typeof sessionStorage === 'undefined') return undefined;
    try {
      const parsed: unknown = JSON.parse(sessionStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY) ?? 'null');
      if (!this.isPendingCheckout(parsed)) {
        sessionStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
        return undefined;
      }
      return parsed;
    } catch {
      try {
        sessionStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
      } catch {
        // Ignore a second storage failure while recovering malformed state.
      }
      return undefined;
    }
  }

  private isPendingCheckout(value: unknown): value is PendingCheckout {
    if (!value || typeof value !== 'object') return false;
    const pending = value as Partial<PendingCheckout>;
    return (
      pending.version === 1 &&
      typeof pending.idempotencyKey === 'string' &&
      pending.idempotencyKey.length >= 16 &&
      typeof pending.createdAt === 'string' &&
      Number.isInteger(pending.expectedAmountPesewas) &&
      (pending.expectedAmountPesewas ?? -1) >= 0 &&
      typeof pending.reconciled === 'boolean' &&
      this.isCheckoutRequest(pending.request) &&
      this.isCheckoutItems(pending.cartSnapshot) &&
      (pending.session === undefined || this.isCheckoutSession(pending.session))
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

  private isCheckoutItems(value: unknown): value is readonly CheckoutRequestItem[] {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (item: unknown) =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as Partial<CheckoutRequestItem>).productId === 'string' &&
          Number.isInteger((item as Partial<CheckoutRequestItem>).quantity) &&
          ((item as Partial<CheckoutRequestItem>).quantity ?? 0) > 0,
      )
    );
  }

  private isCheckoutSession(value: unknown): value is CheckoutSession {
    if (!value || typeof value !== 'object') return false;
    const session = value as Partial<CheckoutSession>;
    const paymentStatuses = ['pending', 'paid', 'failed', 'refunded', 'needs_attention'];
    const fulfillmentStatuses = [
      'awaiting_payment',
      'paid_awaiting_delivery',
      'processing',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'needs_attention',
    ];
    const payment = session.payment as Partial<CheckoutSession['payment']> | undefined;
    return (
      typeof session.created === 'boolean' &&
      typeof session.checkoutToken === 'string' &&
      typeof session.orderNumber === 'string' &&
      paymentStatuses.includes(session.paymentStatus ?? '') &&
      fulfillmentStatuses.includes(session.fulfillmentStatus ?? '') &&
      Number.isInteger(session.amountPesewas) &&
      session.currency === 'GHS' &&
      (payment === undefined ||
        (typeof payment.reference === 'string' &&
          typeof payment.accessCode === 'string' &&
          typeof payment.authorizationUrl === 'string'))
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
