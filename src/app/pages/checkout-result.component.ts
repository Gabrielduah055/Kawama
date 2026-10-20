import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, map, of, Subscription, switchMap, take, takeWhile, timer } from 'rxjs';
import { pesewasToCedis } from '../core/money';
import { CheckoutStatus } from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';
import { CartService } from '../services/cart.service';
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

  constructor(
    private readonly checkout: CheckoutService,
    private readonly cart: CartService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  ngOnInit(): void {
    this.checkStatus();
  }

  ngOnDestroy(): void {
    this.pollSubscription?.unsubscribe();
  }

  checkStatus(): void {
    const pending = this.checkout.pending();
    if (!pending) {
      this.state = 'missing_context';
      this.polling = false;
      return;
    }

    this.orderNumber = pending.session?.orderNumber ?? '';
    this.pollSubscription?.unsubscribe();
    this.polling = true;
    this.state = 'loading';
    this.pollSubscription = timer(0, 5_000)
      .pipe(
        take(25),
        switchMap(() =>
          this.checkout.getStatus(pending.idempotencyKey).pipe(
            map((status): PollEvent => ({ status })),
            catchError((error: unknown) => of<PollEvent>({ error })),
          ),
        ),
        takeWhile((event) => !!event.error || event.status?.paymentStatus === 'pending', true),
      )
      .subscribe({
        next: (event) => {
          if (event.error) {
            this.handleStatusError(event.error);
          } else if (event.status) {
            this.applyStatus(event.status, pending.idempotencyKey);
          }
        },
        complete: () => (this.polling = false),
      });
  }

  private applyStatus(status: CheckoutStatus, checkoutToken: string): void {
    this.status = status;
    this.orderNumber = status.orderNumber;
    this.checkout.recordStatus(status);
    if (status.paymentStatus === 'paid') {
      const pending = this.checkout.pending();
      if (pending && !pending.reconciled) {
        this.cart.reconcilePurchasedItems(checkoutToken, pending.cartSnapshot);
        this.checkout.markReconciled();
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
      this.state = 'missing_context';
      this.pollSubscription?.unsubscribe();
      this.polling = false;
      return;
    }
    this.state = 'network';
  }
}
