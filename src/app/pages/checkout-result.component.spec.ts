import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CheckoutStatus, PendingCheckout } from '../core/store.models';
import { CartService } from '../services/cart.service';
import { CheckoutService } from '../services/checkout.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { CheckoutResultComponent } from './checkout-result.component';

describe('CheckoutResultComponent', () => {
  const pending: PendingCheckout = {
    version: 1,
    idempotencyKey: 'checkout-token-123456',
    request: {
      customer: {
        fullName: 'Ama Mensah',
        email: 'ama@example.com',
        whatsappNumber: '0240000000',
        deliveryAddress: 'Osu, Accra',
        whatsappConsent: true,
      },
      items: [{ productId: '507f1f77bcf86cd799439011', quantity: 2 }],
    },
    cartSnapshot: [{ productId: '507f1f77bcf86cd799439011', quantity: 2 }],
    expectedAmountPesewas: 57800,
    createdAt: '2026-10-20T00:00:00.000Z',
    reconciled: false,
  };

  let checkout: jasmine.SpyObj<CheckoutService>;
  let cart: jasmine.SpyObj<CartService>;
  let whatsapp: jasmine.SpyObj<WhatsAppService>;
  let currentPending: WritableSignal<PendingCheckout | undefined>;

  beforeEach(() => {
    currentPending = signal<PendingCheckout | undefined>(pending);
    checkout = jasmine.createSpyObj<CheckoutService>('CheckoutService', ['getStatus', 'markReconciled', 'recordStatus'], {
      pending: currentPending,
    });
    cart = jasmine.createSpyObj<CartService>('CartService', ['reconcilePurchasedItems']);
    whatsapp = jasmine.createSpyObj<WhatsAppService>('WhatsAppService', ['buildPaidOrderUrl']);
    whatsapp.buildPaidOrderUrl.and.returnValue(undefined);
    TestBed.configureTestingModule({
      imports: [CheckoutResultComponent],
      providers: [
        provideRouter([]),
        { provide: CheckoutService, useValue: checkout },
        { provide: CartService, useValue: cart },
        { provide: WhatsAppService, useValue: whatsapp },
      ],
    });
  });

  it('trusts a backend paid status, reconciles the snapshot once, and does not require WhatsApp', fakeAsync(() => {
    checkout.getStatus.and.returnValue(of(status('paid')));
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();
    tick(0);

    expect(fixture.componentInstance.state).toBe('paid');
    expect(checkout.getStatus).toHaveBeenCalledWith(pending.idempotencyKey);
    expect(checkout.recordStatus).toHaveBeenCalledWith(status('paid'));
    expect(cart.reconcilePurchasedItems).toHaveBeenCalledOnceWith(pending.idempotencyKey, pending.cartSnapshot);
    expect(checkout.markReconciled).toHaveBeenCalled();
    expect(whatsapp.buildPaidOrderUrl).toHaveBeenCalledWith('KWM-20261020-ABC123');
    expect(fixture.componentInstance.whatsappUrl).toBeUndefined();
  }));

  it('maps failed, refunded, and needs-attention backend states distinctly', fakeAsync(() => {
    checkout.getStatus.and.returnValue(of(status('failed')));
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();
    tick(0);
    expect(fixture.componentInstance.state).toBe('failed');

    checkout.getStatus.and.returnValue(of(status('refunded')));
    fixture.componentInstance.checkStatus();
    tick(0);
    expect(fixture.componentInstance.state).toBe('refunded');

    checkout.getStatus.and.returnValue(of(status('needs_attention')));
    fixture.componentInstance.checkStatus();
    tick(0);
    expect(fixture.componentInstance.state).toBe('needs_attention');
  }));

  it('shows missing context instead of trusting callback query values', () => {
    currentPending.set(undefined);
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.state).toBe('missing_context');
    expect(checkout.getStatus).not.toHaveBeenCalled();
    expect(cart.reconcilePurchasedItems).not.toHaveBeenCalled();
  });
});

function status(paymentStatus: CheckoutStatus['paymentStatus']): CheckoutStatus {
  return {
    orderNumber: 'KWM-20261020-ABC123',
    paymentStatus,
    fulfillmentStatus: paymentStatus === 'paid' ? 'paid_awaiting_delivery' : 'cancelled',
    deliveryFeeStatus: 'not_quoted',
    amountPesewas: 57800,
    currency: 'GHS',
  };
}
