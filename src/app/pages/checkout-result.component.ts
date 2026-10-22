import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  catchError,
  EMPTY,
  exhaustMap,
  finalize,
  map,
  of,
  Subscription,
  take,
  takeWhile,
  timeout,
  timer,
} from 'rxjs';
import { pesewasToCedis } from '../core/money';
import { CheckoutResultContext, CheckoutStatus } from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';
import { CartService } from '../services/cart.service';
import { CatalogRepository } from '../services/catalog.service';
import { CheckoutService } from '../services/checkout.service';
import { WhatsAppService } from '../services/whatsapp.service';

type CheckoutResultState =
  | 'loading'
  | 'paid'
  | 'pending'
  | 'failed'
  | 'refunded'
  | 'needs_attention'
  | 'network'
  | 'missing_context';

type PollEvent = { readonly status: CheckoutStatus; readonly error?: never } | { readonly error: unknown; readonly status?: never };

const POLL_INTERVAL_MS = 5_000;
const STATUS_REQUEST_TIMEOUT_MS = 10_000;
const MAX_POLL_TICKS = 25;

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './checkout-result.component.html',
})
export class CheckoutResultComponent implements OnInit, OnDestroy {
  state: CheckoutResultState = 'loading';
  status?: CheckoutStatus;
  orderNumber = '';
  polling = false;
  whatsappUrl?: string;
  readonly config = STOREFRONT_CONFIG;
  readonly pesewasToCedis = pesewasToCedis;
  private pollSubscription?: Subscription;
  private catalogRefreshSubscription?: Subscription;

  constructor(
    private readonly checkout: CheckoutService,
    private readonly cart: CartService,
    private readonly catalog: CatalogRepository,
    private readonly whatsapp: WhatsAppService,
  ) {}

  ngOnInit(): void {
    this.checkStatus();
  }

  ngOnDestroy(): void {
    this.pollSubscription?.unsubscribe();
    this.catalogRefreshSubscription?.unsubscribe();
  }

  checkStatus(): void {
    const context = this.checkout.resultContext();
    if (!context) {
      this.state = 'missing_context';
      this.polling = false;
      return;
    }

    this.orderNumber = context.lastStatus?.orderNumber ?? context.session?.orderNumber ?? '';
    this.pollSubscription?.unsubscribe();
    this.polling = true;
    this.state = 'loading';
    this.pollSubscription = timer(0, POLL_INTERVAL_MS)
      .pipe(
        take(MAX_POLL_TICKS),
        exhaustMap(() =>
          this.checkout.getStatus(context.idempotencyKey).pipe(
            timeout(STATUS_REQUEST_TIMEOUT_MS),
            map((status): PollEvent => ({ status })),
            catchError((error: unknown) => of<PollEvent>({ error })),
          ),
        ),
        takeWhile((event) => !!event.error || event.status?.paymentStatus === 'pending', true),
        finalize(() => (this.polling = false)),
      )
      .subscribe((event) => {
        if (event.error) {
          this.handleStatusError(event.error);
        } else if (event.status) {
          this.applyStatus(event.status, context);
        }
      });
  }

  private applyStatus(status: CheckoutStatus, context: CheckoutResultContext): void {
    this.status = status;
    this.orderNumber = status.orderNumber;
    this.checkout.recordStatus(status);
    if (status.paymentStatus === 'paid') {
      if (context.lifecycle === 'active' && !context.reconciled) {
        this.cart.reconcilePurchasedItems(context.idempotencyKey, context.cartSnapshot);
        this.checkout.markReconciled();
        this.refreshCatalog();
      }
      this.whatsappUrl = this.whatsapp.buildPaidOrderUrl(status.orderNumber);
      this.state = 'paid';
    } else if (status.paymentStatus === 'failed') {
      this.state = 'failed';
    } else if (status.paymentStatus === 'refunded') {
      this.state = 'refunded';
    } else if (status.paymentStatus === 'needs_attention') {
      this.state = 'needs_attention';
    } else {
      this.state = 'pending';
    }
  }

  private handleStatusError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.checkout.resolvePendingFailure('CHECKOUT_NOT_FOUND');
      this.state = 'missing_context';
      this.pollSubscription?.unsubscribe();
      this.polling = false;
      return;
    }
    this.state = 'network';
  }

  private refreshCatalog(): void {
    this.catalogRefreshSubscription?.unsubscribe();
    this.catalogRefreshSubscription = this.catalog
      .refreshProducts()
      .pipe(take(1), catchError(() => EMPTY))
      .subscribe();
  }
}
