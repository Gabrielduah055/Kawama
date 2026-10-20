import { HttpErrorResponse } from '@angular/common/http';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, Subject, throwError } from 'rxjs';
import { CheckoutResultContext, CheckoutStatus, PendingCheckout, ResolvedCheckout } from '../core/store.models';
import { SAMPLE_PRODUCTS } from '../data/sample-products';
import { CartService } from '../services/cart.service';
import { CatalogRepository } from '../services/catalog.service';
import { CheckoutService } from '../services/checkout.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { CheckoutResultComponent } from './checkout-result.component';

describe('CheckoutResultComponent', () => {
  let checkout: jasmine.SpyObj<CheckoutService>;
  let cart: jasmine.SpyObj<CartService>;
  let catalog: jasmine.SpyObj<CatalogRepository>;
  let whatsapp: jasmine.SpyObj<WhatsAppService>;
  let currentContext: CheckoutResultContext | undefined;

  beforeEach(() => {
    currentContext = pendingCheckout();
    checkout = jasmine.createSpyObj<CheckoutService>(
      'CheckoutService',
      ['getStatus', 'markReconciled', 'recordStatus', 'resultContext', 'resolvePendingFailure'],
    );
    checkout.resultContext.and.callFake(() => currentContext);
    cart = jasmine.createSpyObj<CartService>('CartService', ['reconcilePurchasedItems']);
    catalog = jasmine.createSpyObj<CatalogRepository>('CatalogRepository', ['refreshProducts']);
    catalog.refreshProducts.and.returnValue(of(SAMPLE_PRODUCTS));
    whatsapp = jasmine.createSpyObj<WhatsAppService>('WhatsAppService', ['buildPaidOrderUrl']);
    whatsapp.buildPaidOrderUrl.and.returnValue(undefined);
    TestBed.configureTestingModule({
      imports: [CheckoutResultComponent],
      providers: [
        provideRouter([]),
        { provide: CheckoutService, useValue: checkout },
        { provide: CartService, useValue: cart },
        { provide: CatalogRepository, useValue: catalog },
        { provide: WhatsAppService, useValue: whatsapp },
      ],
    });
  });

  it('trusts a backend paid status, reconciles once, refreshes catalog and does not require WhatsApp', fakeAsync(() => {
    checkout.getStatus.and.returnValue(of(status('paid')));
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();
    tick(0);
    const pending = currentContext as PendingCheckout;

    expect(fixture.componentInstance.state).toBe('paid');
    expect(checkout.getStatus).toHaveBeenCalledWith(pending.idempotencyKey);
    expect(checkout.recordStatus).toHaveBeenCalledWith(status('paid'));
    expect(cart.reconcilePurchasedItems).toHaveBeenCalledOnceWith(pending.idempotencyKey, pending.cartSnapshot);
    expect(checkout.markReconciled).toHaveBeenCalled();
    expect(catalog.refreshProducts).toHaveBeenCalled();
    expect(whatsapp.buildPaidOrderUrl).toHaveBeenCalledWith('KWM-20261020-ABC123');
    expect(fixture.componentInstance.whatsappUrl).toBeUndefined();
  }));

  it('revisits resolved history without reconciling the cart again', fakeAsync(() => {
    currentContext = resolvedCheckout('paid');
    checkout.getStatus.and.returnValue(of(status('paid')));
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();
    tick(0);

    expect(fixture.componentInstance.state).toBe('paid');
    expect(cart.reconcilePurchasedItems).not.toHaveBeenCalled();
    expect(checkout.markReconciled).not.toHaveBeenCalled();
    expect(catalog.refreshProducts).not.toHaveBeenCalled();
  }));

  it('maps failed, refunded and needs-attention backend states distinctly', fakeAsync(() => {
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
    currentContext = undefined;
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.state).toBe('missing_context');
    expect(checkout.getStatus).not.toHaveBeenCalled();
    expect(cart.reconcilePurchasedItems).not.toHaveBeenCalled();
  });

  it('does not cancel a status response that takes longer than the five-second poll interval', fakeAsync(() => {
    const response = new Subject<CheckoutStatus>();
    checkout.getStatus.and.returnValue(response);
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();
    tick(0);
    expect(checkout.getStatus).toHaveBeenCalledTimes(1);

    tick(6_000);
    expect(checkout.getStatus).toHaveBeenCalledTimes(1);
    response.next(status('paid'));
    response.complete();
    tick(0);

    expect(fixture.componentInstance.state).toBe('paid');
    expect(checkout.getStatus).toHaveBeenCalledTimes(1);
  }));

  it('times out a hanging request as a network state without assuming failure or starting request storms', fakeAsync(() => {
    checkout.getStatus.and.returnValue(NEVER);
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();
    tick(0);
    tick(10_001);

    expect(fixture.componentInstance.state).toBe('network');
    expect(checkout.getStatus).toHaveBeenCalledTimes(2);
    expect(checkout.recordStatus).not.toHaveBeenCalled();
  }));

  it('stops automatic polling after a terminal response', fakeAsync(() => {
    checkout.getStatus.and.returnValue(of(status('paid')));
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();
    tick(30_000);

    expect(checkout.getStatus).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.polling).toBeFalse();
  }));

  it('allows a manual retry after a network error', fakeAsync(() => {
    checkout.getStatus.and.returnValues(
      throwError(() => new HttpErrorResponse({ status: 0 })),
      of(status('paid')),
    );
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();
    tick(0);
    expect(fixture.componentInstance.state).toBe('network');

    fixture.componentInstance.checkStatus();
    tick(0);
    expect(fixture.componentInstance.state).toBe('paid');
    expect(checkout.getStatus).toHaveBeenCalledTimes(2);
  }));

  it('unsubscribes a pending status request when the component is destroyed', fakeAsync(() => {
    let cancelled = false;
    checkout.getStatus.and.returnValue(new Observable(() => () => (cancelled = true)));
    const fixture = TestBed.createComponent(CheckoutResultComponent);
    fixture.detectChanges();
    tick(0);

    fixture.destroy();
    tick(5_000);
    expect(cancelled).toBeTrue();
    expect(checkout.getStatus).toHaveBeenCalledTimes(1);
  }));
});

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
      items: [{ productId: '507f1f77bcf86cd799439011', quantity: 2 }],
    },
    cartSnapshot: [{ productId: '507f1f77bcf86cd799439011', quantity: 2, name: 'Onyx Frying Pan' }],
    expectedAmountPesewas: 57_800,
    createdAt: '2026-10-20T00:00:00.000Z',
    reconciled: false,
  };
}

function resolvedCheckout(resolution: ResolvedCheckout['resolution']): ResolvedCheckout {
  return {
    ...pendingCheckout(),
    lifecycle: 'resolved',
    resolution,
    resolvedAt: '2026-10-20T00:05:00.000Z',
    reconciled: resolution === 'paid',
    lastStatus: status(resolution),
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
