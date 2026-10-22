import { provideHttpClient } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';
import { CheckoutCreateRequest, CheckoutSession, CheckoutSnapshotItem, CheckoutStatus } from '../core/store.models';
import {
  CheckoutService,
  CheckoutStorageError,
  PendingCheckoutConflictError,
} from './checkout.service';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let http: HttpTestingController;

  const request: CheckoutCreateRequest = {
    customer: {
      fullName: 'Ama Mensah',
      email: 'ama@example.com',
      whatsappNumber: '0240000000',
      deliveryAddress: 'Osu, Accra',
      whatsappConsent: true,
    },
    orderNotes: 'Call on arrival',
    items: [{ productId: '507f1f77bcf86cd799439011', quantity: 2 }],
  };
  const snapshot: readonly CheckoutSnapshotItem[] = [{
    ...request.items[0],
    name: 'Onyx Frying Pan',
    slug: 'onyx-frying-pan',
    unitPricePesewas: 28_900,
    currency: 'GHS',
  }];

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CheckoutService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the exact backend payload with a persisted idempotency key and immutable display snapshot', () => {
    let result: CheckoutSession | undefined;
    service.createSession(request, snapshot, 57_800).subscribe((session) => (result = session));
    const checkoutRequest = http.expectOne(checkoutUrl());
    const key = checkoutRequest.request.headers.get('Idempotency-Key');
    expect(checkoutRequest.request.method).toBe('POST');
    expect(key?.length).toBeGreaterThanOrEqual(16);
    expect(checkoutRequest.request.body).toEqual(request);
    expect(checkoutRequest.request.body.items[0].price).toBeUndefined();

    checkoutRequest.flush({ data: sessionResponse(key!) });
    expect(result?.orderNumber).toBe('KWM-20261020-ABC123');
    expect(service.pending()?.cartSnapshot).toEqual(snapshot);
    const stored = JSON.parse(sessionStorage.getItem('kawama.checkout.state.v2') ?? '{}');
    expect(stored.active.request).toEqual(request);
    expect(stored.history).toEqual([]);
  });

  it('reuses the same key and exact payload after an uncertain network error', () => {
    service.createSession(request, snapshot, 57_800).subscribe({ error: () => undefined });
    const first = http.expectOne(checkoutUrl());
    const firstKey = first.request.headers.get('Idempotency-Key');
    first.error(new ProgressEvent('network'), { status: 0, statusText: 'Unknown Error' });

    service.retryPending().subscribe();
    const retry = http.expectOne(checkoutUrl());
    expect(retry.request.headers.get('Idempotency-Key')).toBe(firstKey);
    expect(retry.request.body).toEqual(first.request.body);
    retry.flush({ data: sessionResponse(firstKey!) });
  });

  it('reports a changed payload through the observable while an unresolved checkout is active', () => {
    service.createSession(request, snapshot, 57_800).subscribe({ error: () => undefined });
    http.expectOne(checkoutUrl()).error(new ProgressEvent('network'), { status: 0, statusText: 'Unknown Error' });

    const changed = { ...request, orderNotes: 'Different instructions' };
    let receivedError: unknown;
    service.createSession(changed, snapshot, 57_800).subscribe({ error: (error) => (receivedError = error) });

    expect(receivedError).toBeInstanceOf(PendingCheckoutConflictError);
    http.expectNone(checkoutUrl());
  });

  it('recovers an initialized checkout from guarded session storage', () => {
    service.createSession(request, snapshot, 57_800).subscribe();
    const checkoutRequest = http.expectOne(checkoutUrl());
    const key = checkoutRequest.request.headers.get('Idempotency-Key')!;
    checkoutRequest.flush({ data: sessionResponse(key) });

    const recovered = new CheckoutService(TestBed.inject(HttpClient));
    expect(recovered.pending()?.session?.orderNumber).toBe('KWM-20261020-ABC123');
    expect(recovered.authorizationUrl(recovered.pending()!.session!)).toContain('checkout.paystack.com');
  });

  it('archives a reconciled paid checkout and gives a consecutive purchase a fresh key', () => {
    service.createSession(request, snapshot, 57_800).subscribe();
    const first = http.expectOne(checkoutUrl());
    const firstKey = first.request.headers.get('Idempotency-Key')!;
    first.flush({ data: sessionResponse(firstKey) });

    service.recordStatus(status('paid'));
    expect(service.pending()).toBeDefined();
    service.markReconciled();
    expect(service.pending()).toBeUndefined();
    expect(service.resultContext()?.lifecycle).toBe('resolved');
    expect(service.history()[0].resolution).toBe('paid');

    const nextRequest: CheckoutCreateRequest = {
      ...request,
      items: [{ productId: '507f1f77bcf86cd799439022', quantity: 1 }],
    };
    const nextSnapshot = [{ ...nextRequest.items[0], name: 'Storage Jar', unitPricePesewas: 19_990, currency: 'GHS' as const }];
    service.createSession(nextRequest, nextSnapshot, 19_990).subscribe();
    const second = http.expectOne(checkoutUrl());
    expect(second.request.headers.get('Idempotency-Key')).not.toBe(firstKey);
    second.flush({ data: sessionResponse(second.request.headers.get('Idempotency-Key')!, 'KWM-SECOND', 19_990) });
  });

  it('archives a backend-confirmed failure and allows a fresh retry key', () => {
    service.createSession(request, snapshot, 57_800).subscribe();
    const first = http.expectOne(checkoutUrl());
    const firstKey = first.request.headers.get('Idempotency-Key')!;
    first.flush({ data: sessionResponse(firstKey) });

    service.recordStatus(status('failed'));
    expect(service.pending()).toBeUndefined();
    expect(service.history()[0].resolution).toBe('failed');

    service.createSession(request, snapshot, 57_800).subscribe();
    const retry = http.expectOne(checkoutUrl());
    expect(retry.request.headers.get('Idempotency-Key')).not.toBe(firstKey);
    retry.flush({ data: sessionResponse(retry.request.headers.get('Idempotency-Key')!) });
  });

  it('keeps needs-attention payments active and blocks a replacement charge', () => {
    service.createSession(request, snapshot, 57_800).subscribe();
    const first = http.expectOne(checkoutUrl());
    const key = first.request.headers.get('Idempotency-Key')!;
    first.flush({ data: sessionResponse(key) });
    service.recordStatus(status('needs_attention'));

    expect(service.pending()?.lastStatus?.paymentStatus).toBe('needs_attention');
    let receivedError: unknown;
    service.createSession({ ...request, orderNotes: 'new' }, snapshot, 57_800).subscribe({
      error: (error) => (receivedError = error),
    });
    expect(receivedError).toBeInstanceOf(PendingCheckoutConflictError);
    http.expectNone(checkoutUrl());
  });

  it('keeps a resolved result available when the result page is revisited', () => {
    service.createSession(request, snapshot, 57_800).subscribe();
    const post = http.expectOne(checkoutUrl());
    const key = post.request.headers.get('Idempotency-Key')!;
    post.flush({ data: sessionResponse(key) });
    service.recordStatus(status('failed'));

    const recovered = new CheckoutService(TestBed.inject(HttpClient));
    expect(recovered.pending()).toBeUndefined();
    expect(recovered.resultContext()?.idempotencyKey).toBe(key);
    expect(recovered.resultContext()?.lifecycle).toBe('resolved');
  });

  it('sends no request and reports storage failure when the initial pending record cannot be persisted', () => {
    spyOn(sessionStorage, 'setItem').and.throwError('quota exceeded');
    let receivedError: unknown;
    service.createSession(request, snapshot, 57_800).subscribe({ error: (error) => (receivedError = error) });

    expect(receivedError).toBeInstanceOf(CheckoutStorageError);
    expect(service.pending()).toBeUndefined();
    http.expectNone(checkoutUrl());
  });

  it('retains the original idempotency context when saving the initialization response fails', () => {
    const originalSetItem = sessionStorage.setItem.bind(sessionStorage);
    let writes = 0;
    spyOn(sessionStorage, 'setItem').and.callFake((key, value) => {
      writes += 1;
      if (writes === 2) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      originalSetItem(key, value);
    });

    let receivedError: unknown;
    service.createSession(request, snapshot, 57_800).subscribe({ error: (error) => (receivedError = error) });
    const first = http.expectOne(checkoutUrl());
    const originalKey = first.request.headers.get('Idempotency-Key')!;
    first.flush({ data: sessionResponse(originalKey) });

    expect(receivedError).toBeInstanceOf(CheckoutStorageError);
    expect(service.pending()?.idempotencyKey).toBe(originalKey);
    expect(service.pending()?.session).toBeUndefined();

    service.retryPending().subscribe();
    const recovery = http.expectOne(checkoutUrl());
    expect(recovery.request.headers.get('Idempotency-Key')).toBe(originalKey);
    recovery.flush({ data: { ...sessionResponse(originalKey), created: false } });
    expect(service.pending()?.session?.checkoutToken).toBe(originalKey);
  });
});

function checkoutUrl(): string {
  return buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.checkoutSessions);
}

function sessionResponse(
  checkoutToken: string,
  orderNumber = 'KWM-20261020-ABC123',
  amountPesewas = 57_800,
): CheckoutSession {
  return {
    created: true,
    checkoutToken,
    orderNumber,
    paymentStatus: 'pending',
    fulfillmentStatus: 'awaiting_payment',
    amountPesewas,
    currency: 'GHS',
    payment: {
      reference: orderNumber,
      accessCode: 'access-code',
      authorizationUrl: 'https://checkout.paystack.com/access-code',
    },
  };
}

function status(paymentStatus: CheckoutStatus['paymentStatus']): CheckoutStatus {
  return {
    orderNumber: 'KWM-20261020-ABC123',
    paymentStatus,
    fulfillmentStatus: paymentStatus === 'paid' ? 'paid_awaiting_delivery' : paymentStatus === 'pending' ? 'awaiting_payment' : paymentStatus === 'needs_attention' ? 'needs_attention' : 'cancelled',
    deliveryFeeStatus: 'not_quoted',
    amountPesewas: 57_800,
    currency: 'GHS',
  };
}
