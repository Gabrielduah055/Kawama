import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SAMPLE_PRODUCTS } from '../data/sample-products';
import { CartService } from '../services/cart.service';
import { CatalogRepository } from '../services/catalog.service';
import { CheckoutService } from '../services/checkout.service';
import { CartComponent } from './cart.component';

describe('CartComponent', () => {
  beforeEach(() => localStorage.clear());

  it('retains unavailable items and keeps checkout inline without a duplicate checkout link', () => {
    const unavailable = { ...SAMPLE_PRODUCTS[0], inStock: false };
    TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogRepository, useValue: { getProducts: () => of([unavailable]), refreshProducts: () => of([unavailable]) } },
        {
          provide: CheckoutService,
          useValue: jasmine.createSpyObj<CheckoutService>(
            'CheckoutService',
            ['createSession', 'retryPending', 'authorizationUrl', 'clearPending'],
            { pending: signal(undefined) },
          ),
        },
      ],
    });
    const cart = TestBed.inject(CartService);
    cart.add(unavailable.id);
    cart.add('unresolved-product-id');

    const fixture = TestBed.createComponent(CartComponent);
    fixture.detectChanges();

    expect(cart.items().length).toBe(2);
    expect(fixture.componentInstance.blockedItemCount).toBe(2);
    expect(fixture.nativeElement.querySelector('app-payment-checkout')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Continue to secure checkout');
  });

  it('preserves cart and customer form state when a forced catalog refresh fails', () => {
    const product = SAMPLE_PRODUCTS[0];
    const catalog = {
      getProducts: () => of([product]),
      refreshProducts: () => throwError(() => new Error('refresh failed')),
    };
    TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogRepository, useValue: catalog },
        {
          provide: CheckoutService,
          useValue: jasmine.createSpyObj<CheckoutService>(
            'CheckoutService',
            ['createSession', 'retryPending', 'getStatus', 'recordStatus', 'authorizationUrl', 'clearPending', 'resolvePendingFailure'],
            { pending: signal(undefined) },
          ),
        },
      ],
    });
    const cart = TestBed.inject(CartService);
    cart.add(product.id);
    const fixture = TestBed.createComponent(CartComponent);
    fixture.detectChanges();
    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector('input[formcontrolname="fullName"]');
    nameInput.value = 'Ama Mensah';
    nameInput.dispatchEvent(new Event('input'));

    fixture.componentInstance.refreshCatalog();
    fixture.detectChanges();

    expect(cart.items()).toEqual([{ productId: product.id, quantity: 1 }]);
    expect(nameInput.value).toBe('Ama Mensah');
    expect(fixture.componentInstance.loadError).toBeFalse();
  });
});
