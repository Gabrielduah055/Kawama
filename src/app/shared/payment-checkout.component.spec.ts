import { HttpErrorResponse } from '@angular/common/http';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CheckoutSession, CheckoutStatus, PendingCheckout } from '../core/store.models';
import { SAMPLE_PRODUCTS } from '../data/sample-products';
import {
  CheckoutService,
  CheckoutStorageError,
  PendingCheckoutConflictError,
} from '../services/checkout.service';
import { PaymentCheckoutComponent } from './payment-checkout.component';

describe('PaymentCheckoutComponent', () => {
  it('builds the exact checkout contract and immutable display snapshot, blocks duplicates, and pauses on price change', () => {
    const response = new Subject<CheckoutSession>();
    const { component, checkout } = createComponent();
    checkout.createSession.and.returnValue(response);
    component.lines = [{ product: SAMPLE_PRODUCTS[0], quantity: 2 }];
    fillForm(component);

    component.submit();
    component.submit();
    expect(checkout.createSession).toHaveBeenCalledTimes(1);
    const [request, snapshot, expectedAmount] = checkout.createSession.calls.mostRecent().args;
    expect(request.items).toEqual([{ productId: SAMPLE_PRODUCTS[0].id, quantity: 2 }]);
    expect(snapshot[0]).toEqual(jasmine.objectContaining({
      productId: SAMPLE_PRODUCTS[0].id,
      quantity: 2,
      name: SAMPLE_PRODUCTS[0].name,
      unitPricePesewas: SAMPLE_PRODUCTS[0].price * 100,
    }));
    expect(expectedAmount).toBe(SAMPLE_PRODUCTS[0].price * 200);

    response.next(session(expectedAmount + 100));
    expect(component.priceMismatch).toBeTrue();
  });

  it('shows the immutable active order rather than a changed cart and locks its saved customer details', () => {
    const active = pendingCheckout();
    const { fixture, component } = createComponent(active);
    component.lines = [{ product: SAMPLE_PRODUCTS[1], quantity: 3 }];
    fixture.detectChanges();

    expect(component.activeCartMatches).toBeFalse();
    expect(component.checkoutForm.controls.fullName.value).toBe('Ama Mensah');
    expect(component.checkoutForm.controls.fullName.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Saved Spice Jar');
    expect(fixture.nativeElement.textContent).toContain('current cart is different');
    expect(fixture.nativeElement.textContent).not.toContain(SAMPLE_PRODUCTS[1].name);
  });

  it('detects when the current cart changes only the saved product quantity', () => {
    const active = pendingCheckout();
    const { component } = createComponent(active);
    component.lines = [{
      product: { ...SAMPLE_PRODUCTS[0], id: 'saved-product' },
      quantity: active.cartSnapshot[0].quantity + 1,
    }];

    expect(component.activeCartMatches).toBeFalse();
    expect(component.activeItemCount).toBe(2);
  });

  it('checks backend status before deliberately continuing an initialized payment', () => {
    const active = pendingCheckout();
    const { component, checkout, router } = createComponent(active);
    checkout.getStatus.and.returnValue(of(status('pending')));
    checkout.authorizationUrl.and.returnValue(undefined);

    component.resumeInitializedCheckout();

    expect(checkout.getStatus).toHaveBeenCalledOnceWith(active.idempotencyKey);
    expect(checkout.recordStatus).toHaveBeenCalledWith(status('pending'));
    expect(checkout.authorizationUrl).toHaveBeenCalledWith(jasmine.objectContaining({ orderNumber: 'KWM-ACTIVE' }));
    expect(router.navigate).toHaveBeenCalledWith(['/checkout/result']);
  });

  it('does not reopen Paystack for failed or already-paid sessions', () => {
    const active = pendingCheckout();
    const { component, checkout, router } = createComponent(active);
    checkout.getStatus.and.returnValue(of(status('failed')));
    component.resumeInitializedCheckout();
    expect(checkout.authorizationUrl).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/checkout/result']);

    checkout.getStatus.and.returnValue(of(status('paid')));
    component.resumeInitializedCheckout();
    expect(checkout.authorizationUrl).not.toHaveBeenCalled();
    expect(checkout.recordStatus).toHaveBeenCalledWith(status('paid'));
  });

  it('turns an expired cached session into an explicit fresh-attempt path', () => {
    const active = pendingCheckout();
    const { component, checkout } = createComponent(active);
    checkout.getStatus.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 404,
      error: { error: { code: 'CHECKOUT_NOT_FOUND' } },
    })));
    checkout.resolvePendingFailure.and.returnValue(true);

    component.resumeInitializedCheckout();

    expect(checkout.resolvePendingFailure).toHaveBeenCalledWith('CHECKOUT_NOT_FOUND');
    expect(component.errorMessage).toContain('can no longer continue');
    expect(component.submitting).toBeFalse();
  });

  it('retains an unresolved payment when its status cannot be checked', () => {
    const active = pendingCheckout();
    const { component, checkout } = createComponent(active);
    checkout.getStatus.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    component.resumeInitializedCheckout();

    expect(checkout.resolvePendingFailure).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('remains protected');
    expect(component.submitting).toBeFalse();
  });

  it('recovers the button and shows feedback for synchronous preparation and storage failures', () => {
    const { component, checkout } = createComponent();
    component.lines = [{ product: SAMPLE_PRODUCTS[0], quantity: 1 }];
    fillForm(component);
    checkout.createSession.and.returnValue(throwError(() => new CheckoutStorageError()));

    component.submit();

    expect(component.submitting).toBeFalse();
    expect(component.errorCode).toBe('CHECKOUT_STORAGE');
    expect(component.errorMessage).toContain('could not safely save');

    checkout.createSession.and.returnValue(throwError(() => new PendingCheckoutConflictError()));
    component.submit();
    expect(component.submitting).toBeFalse();
    expect(component.errorCode).toBe('PENDING_CHECKOUT');
  });

  it('keeps the known idempotency context after response persistence fails', () => {
    const current = signal<PendingCheckout | undefined>(undefined);
    const { component, checkout } = createComponent(undefined, current);
    component.lines = [{ product: SAMPLE_PRODUCTS[0], quantity: 1 }];
    fillForm(component);
    checkout.createSession.and.callFake(() => {
      current.set({ ...pendingCheckout(), session: undefined });
      return throwError(() => new CheckoutStorageError());
    });

    component.submit();

    expect(component.submitting).toBeFalse();
    expect(current()).toBeDefined();
    expect(component.checkoutForm.disabled).toBeTrue();
    expect(component.errorMessage).toContain('order may already exist');
  });

  it('refreshes catalog data after a stock error without clearing form values', () => {
    const response = new Subject<CheckoutSession>();
    const { component, checkout } = createComponent();
    checkout.createSession.and.returnValue(response);
    checkout.clearPending.and.returnValue(true);
    component.lines = [{ product: SAMPLE_PRODUCTS[0], quantity: 1 }];
    fillForm(component);
    let refreshes = 0;
    component.catalogRefreshRequested.subscribe(() => refreshes += 1);

    component.submit();
    response.error(new HttpErrorResponse({
      status: 409,
      error: { error: { code: 'INSUFFICIENT_STOCK' } },
    }));

    expect(refreshes).toBe(1);
    expect(component.checkoutForm.controls.fullName.value).toBe('Ama Mensah');
  });
});

function createComponent(
  initialPending?: PendingCheckout,
  currentPending: WritableSignal<PendingCheckout | undefined> = signal(initialPending),
): {
  fixture: ReturnType<typeof TestBed.createComponent<PaymentCheckoutComponent>>;
  component: PaymentCheckoutComponent;
  checkout: jasmine.SpyObj<CheckoutService>;
  router: jasmine.SpyObj<Router>;
} {
  const checkout = jasmine.createSpyObj<CheckoutService>(
    'CheckoutService',
    ['createSession', 'retryPending', 'getStatus', 'recordStatus', 'authorizationUrl', 'clearPending', 'resolvePendingFailure'],
    { pending: currentPending },
  );
  checkout.clearPending.and.returnValue(true);
  checkout.resolvePendingFailure.and.returnValue(true);
  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
  TestBed.configureTestingModule({
    imports: [PaymentCheckoutComponent],
    providers: [
      { provide: CheckoutService, useValue: checkout },
      { provide: Router, useValue: router },
    ],
  });
  const fixture = TestBed.createComponent(PaymentCheckoutComponent);
  return { fixture, component: fixture.componentInstance, checkout, router };
}

function fillForm(component: PaymentCheckoutComponent): void {
  component.checkoutForm.setValue({
    fullName: 'Ama Mensah',
    email: 'ama@example.com',
    whatsappNumber: '024 000 0000',
    deliveryAddress: 'Osu, Accra',
    orderNotes: 'Call on arrival',
    whatsappConsent: true,
  });
}

function pendingCheckout(): PendingCheckout {
  return {
    version: 2,
    lifecycle: 'active',
    idempotencyKey: 'checkout-token-123456',
    request: {
      customer: {
        fullName: 'Ama Mensah',
        email: 'ama@example.com',
        whatsappNumber: '0240000000',
        deliveryAddress: 'Osu, Accra',
        whatsappConsent: true,
      },
      items: [{ productId: 'saved-product', quantity: 2 }],
    },
    cartSnapshot: [{
      productId: 'saved-product',
      quantity: 2,
      name: 'Saved Spice Jar',
      unitPricePesewas: 9_995,
      currency: 'GHS',
    }],
    expectedAmountPesewas: 19_990,
    createdAt: '2026-10-20T00:00:00.000Z',
    reconciled: false,
    session: session(19_990),
  };
}

function session(amountPesewas: number): CheckoutSession {
  return {
    created: true,
    checkoutToken: 'checkout-token-123456',
    orderNumber: 'KWM-ACTIVE',
    paymentStatus: 'pending',
    fulfillmentStatus: 'awaiting_payment',
    amountPesewas,
    currency: 'GHS',
    payment: {
      reference: 'KWM-ACTIVE',
      accessCode: 'access-code',
      authorizationUrl: 'https://checkout.paystack.com/access-code',
    },
  };
}

function status(paymentStatus: CheckoutStatus['paymentStatus']): CheckoutStatus {
  return {
    orderNumber: 'KWM-ACTIVE',
    paymentStatus,
    fulfillmentStatus: paymentStatus === 'pending' ? 'awaiting_payment' : paymentStatus === 'paid' ? 'paid_awaiting_delivery' : 'cancelled',
    deliveryFeeStatus: 'not_quoted',
    amountPesewas: 19_990,
    currency: 'GHS',
  };
}
