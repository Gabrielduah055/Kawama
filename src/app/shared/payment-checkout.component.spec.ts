import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { SAMPLE_PRODUCTS } from '../data/sample-products';
import { CheckoutSession } from '../core/store.models';
import { CheckoutService } from '../services/checkout.service';
import { PaymentCheckoutComponent } from './payment-checkout.component';

describe('PaymentCheckoutComponent', () => {
  it('builds the exact checkout contract, blocks duplicate submits, and pauses on a price change', () => {
    const response = new Subject<CheckoutSession>();
    const checkout = jasmine.createSpyObj<CheckoutService>(
      'CheckoutService',
      ['createSession', 'retryPending', 'authorizationUrl', 'clearPending'],
      { pending: signal(undefined) },
    );
    checkout.createSession.and.returnValue(response);
    TestBed.configureTestingModule({
      imports: [PaymentCheckoutComponent],
      providers: [
        { provide: CheckoutService, useValue: checkout },
        { provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigate']) },
      ],
    });
    const fixture = TestBed.createComponent(PaymentCheckoutComponent);
    const component = fixture.componentInstance;
    component.lines = [{ product: SAMPLE_PRODUCTS[0], quantity: 2 }];
    component.checkoutForm.setValue({
      fullName: 'Ama Mensah',
      email: 'ama@example.com',
      whatsappNumber: '024 000 0000',
      deliveryAddress: 'Osu, Accra',
      orderNotes: 'Call on arrival',
      whatsappConsent: true,
    });

    component.submit();
    component.submit();
    expect(checkout.createSession).toHaveBeenCalledTimes(1);
    const [request, snapshot, expectedAmount] = checkout.createSession.calls.mostRecent().args;
    expect(request).toEqual({
      customer: {
        fullName: 'Ama Mensah',
        email: 'ama@example.com',
        whatsappNumber: '024 000 0000',
        deliveryAddress: 'Osu, Accra',
        whatsappConsent: true,
      },
      orderNotes: 'Call on arrival',
      items: [{ productId: SAMPLE_PRODUCTS[0].id, quantity: 2 }],
    });
    expect(snapshot).toEqual(request.items);
    expect(expectedAmount).toBe(SAMPLE_PRODUCTS[0].price * 200);

    response.next({
      created: true,
      checkoutToken: 'checkout-token-123456',
      orderNumber: 'KWM-20261020-ABC123',
      paymentStatus: 'pending',
      fulfillmentStatus: 'awaiting_payment',
      amountPesewas: expectedAmount + 100,
      currency: 'GHS',
      payment: {
        reference: 'KWM-20261020-ABC123',
        accessCode: 'access-code',
        authorizationUrl: 'https://checkout.paystack.com/access-code',
      },
    });
    expect(component.priceMismatch).toBeTrue();
  });

  it('clears a checkout that Paystack definitively failed to initialize', () => {
    const response = new Subject<CheckoutSession>();
    const checkout = jasmine.createSpyObj<CheckoutService>(
      'CheckoutService',
      ['createSession', 'retryPending', 'authorizationUrl', 'clearPending'],
      { pending: signal(undefined) },
    );
    checkout.createSession.and.returnValue(response);
    TestBed.configureTestingModule({
      imports: [PaymentCheckoutComponent],
      providers: [
        { provide: CheckoutService, useValue: checkout },
        { provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigate']) },
      ],
    });
    const component = TestBed.createComponent(PaymentCheckoutComponent).componentInstance;
    component.lines = [{ product: SAMPLE_PRODUCTS[0], quantity: 1 }];
    component.checkoutForm.setValue({
      fullName: 'Ama Mensah',
      email: 'ama@example.com',
      whatsappNumber: '024 000 0000',
      deliveryAddress: 'Osu, Accra',
      orderNotes: '',
      whatsappConsent: true,
    });

    component.submit();
    response.error(new HttpErrorResponse({
      status: 502,
      error: { error: { code: 'PAYSTACK_INITIALIZATION_FAILED' } },
    }));

    expect(checkout.clearPending).toHaveBeenCalled();
    expect(component.errorMessage).toContain('Nothing was charged');
  });
});
