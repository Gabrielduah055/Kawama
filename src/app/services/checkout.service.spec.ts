import { provideHttpClient } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';
import { CheckoutCreateRequest, CheckoutSession } from '../core/store.models';
import { CheckoutService, PendingCheckoutConflictError } from './checkout.service';

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

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CheckoutService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the exact backend payload with a persisted idempotency key', () => {
    let result: CheckoutSession | undefined;
    service.createSession(request, request.items, 57800).subscribe((session) => (result = session));
    const checkoutRequest = http.expectOne(
      buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.checkoutSessions),
    );
    const key = checkoutRequest.request.headers.get('Idempotency-Key');
    expect(checkoutRequest.request.method).toBe('POST');
    expect(key?.length).toBeGreaterThanOrEqual(16);
    expect(checkoutRequest.request.body).toEqual(request);
    expect(checkoutRequest.request.body.items[0].price).toBeUndefined();

    checkoutRequest.flush({ data: sessionResponse(key!) });
    expect(result?.orderNumber).toBe('KWM-20261020-ABC123');
    expect(service.pending()?.idempotencyKey).toBe(key!);
    expect(JSON.parse(sessionStorage.getItem('kawama.checkout.pending.v1') ?? '{}').request).toEqual(request);
  });

  it('reuses the same key and exact payload after an uncertain network error', () => {
    service.createSession(request, request.items, 57800).subscribe({ error: () => undefined });
    const first = http.expectOne(buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.checkoutSessions));
    const firstKey = first.request.headers.get('Idempotency-Key');
    first.error(new ProgressEvent('network'), { status: 0, statusText: 'Unknown Error' });

    service.createSession(request, request.items, 57800).subscribe();
    const retry = http.expectOne(buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.checkoutSessions));
    expect(retry.request.headers.get('Idempotency-Key')).toBe(firstKey);
    expect(retry.request.body).toEqual(first.request.body);
    retry.flush({ data: sessionResponse(firstKey!) });
  });

  it('blocks a changed payload while an unresolved checkout is saved', () => {
    service.createSession(request, request.items, 57800).subscribe({ error: () => undefined });
    http.expectOne(buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.checkoutSessions)).error(
      new ProgressEvent('network'),
      { status: 0, statusText: 'Unknown Error' },
    );

    const changed = { ...request, orderNotes: 'Different instructions' };
    expect(() => service.createSession(changed, changed.items, 57800)).toThrowError(PendingCheckoutConflictError);
  });

  it('recovers an initialized checkout from guarded session storage', () => {
    service.createSession(request, request.items, 57800).subscribe();
    const checkoutRequest = http.expectOne(
      buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.checkoutSessions),
    );
    const key = checkoutRequest.request.headers.get('Idempotency-Key')!;
    checkoutRequest.flush({ data: sessionResponse(key) });

    const recovered = new CheckoutService(TestBed.inject(HttpClient));
    expect(recovered.pending()?.session?.orderNumber).toBe('KWM-20261020-ABC123');
    expect(recovered.authorizationUrl(recovered.pending()!.session!)).toContain('checkout.paystack.com');
  });
});

function sessionResponse(checkoutToken: string): CheckoutSession {
  return {
    created: true,
    checkoutToken,
    orderNumber: 'KWM-20261020-ABC123',
    paymentStatus: 'pending',
    fulfillmentStatus: 'awaiting_payment',
    amountPesewas: 57800,
    currency: 'GHS',
    payment: {
      reference: 'KWM-20261020-ABC123',
      accessCode: 'access-code',
      authorizationUrl: 'https://checkout.paystack.com/access-code',
    },
  };
}
