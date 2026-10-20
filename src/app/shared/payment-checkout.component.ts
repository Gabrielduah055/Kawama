import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { cedisToPesewas, orderLinesTotalPesewas, pesewasToCedis } from '../core/money';
import { CheckoutCreateRequest, CheckoutSession, OrderLine } from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';
import {
  CheckoutService,
  CheckoutStorageError,
  PendingCheckoutConflictError,
} from '../services/checkout.service';

function whatsappNumberValidator(control: AbstractControl<string>): ValidationErrors | null {
  const compact = control.value.trim().replace(/[\s().-]/g, '');
  return /^0\d{9}$/.test(compact) || /^233\d{9}$/.test(compact) || /^\+[1-9]\d{7,14}$/.test(compact)
    ? null
    : { whatsappNumber: true };
}

@Component({
  selector: 'app-payment-checkout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './payment-checkout.component.html',
})
export class PaymentCheckoutComponent {
  @Input({ required: true }) lines: readonly OrderLine[] = [];
  @Input() blockedItemCount = 0;

  submitted = false;
  submitting = false;
  errorMessage = '';
  errorCode = '';
  priceMismatch = false;
  initializedSession?: CheckoutSession;
  readonly config = STOREFRONT_CONFIG;
  readonly pesewasToCedis = pesewasToCedis;
  readonly checkoutForm;

  constructor(
    readonly checkoutService: CheckoutService,
    private readonly router: Router,
    formBuilder: FormBuilder,
  ) {
    this.checkoutForm = formBuilder.nonNullable.group({
      fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      whatsappNumber: ['', [Validators.required, whatsappNumberValidator]],
      deliveryAddress: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
      orderNotes: ['', [Validators.maxLength(500)]],
      whatsappConsent: [false, [Validators.requiredTrue]],
    });
  }

  get subtotalPesewas(): number {
    return orderLinesTotalPesewas(this.lines);
  }

  get itemCount(): number {
    return this.lines.reduce((total, line) => total + line.quantity, 0);
  }

  get submittedAmountPesewas(): number {
    return this.checkoutService.pending()?.expectedAmountPesewas ?? this.subtotalPesewas;
  }

  lineTotal(line: OrderLine): number {
    return pesewasToCedis(cedisToPesewas(line.product.price) * line.quantity);
  }

  submit(): void {
    if (this.submitting) return;
    this.submitted = true;
    this.resetFeedback();
    if (this.checkoutForm.invalid || !this.lines.length || this.blockedItemCount > 0 || this.lines.length > 20) {
      this.checkoutForm.markAllAsTouched();
      if (this.blockedItemCount > 0) {
        this.errorMessage = 'Remove unavailable items before starting payment.';
      } else if (this.lines.length > 20) {
        this.errorMessage = 'Checkout supports up to 20 different products at a time.';
      }
      return;
    }

    const form = this.checkoutForm.getRawValue();
    const orderNotes = form.orderNotes.trim();
    const request: CheckoutCreateRequest = {
      customer: {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        whatsappNumber: form.whatsappNumber.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        whatsappConsent: true,
      },
      ...(orderNotes ? { orderNotes } : {}),
      items: this.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    };
    this.startSession(request);
  }

  retryCheckout(): void {
    if (this.submitting) return;
    this.resetFeedback();
    this.submitting = true;
    this.checkoutService
      .retryPending()
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (session) => this.handleSession(session),
        error: (error: unknown) => this.handleError(error),
      });
  }

  continueToPaystack(): void {
    if (this.initializedSession) this.continueWithSession(this.initializedSession);
  }

  resumeInitializedCheckout(): void {
    const session = this.checkoutService.pending()?.session;
    if (session) this.handleSession(session);
  }

  private startSession(request: CheckoutCreateRequest): void {
    this.submitting = true;
    const snapshot = request.items.map((item) => ({ ...item }));
    this.checkoutService
      .createSession(request, snapshot, this.subtotalPesewas)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (session) => this.handleSession(session),
        error: (error: unknown) => this.handleError(error),
      });
  }

  private handleSession(session: CheckoutSession): void {
    this.initializedSession = session;
    if (session.amountPesewas !== this.submittedAmountPesewas) {
      this.priceMismatch = true;
      return;
    }
    this.continueWithSession(session);
  }

  private continueWithSession(session: CheckoutSession): void {
    if (session.paymentStatus === 'paid') {
      void this.router.navigate(['/checkout/result']);
      return;
    }
    const authorizationUrl = this.checkoutService.authorizationUrl(session);
    if (authorizationUrl && typeof window !== 'undefined') {
      window.location.assign(authorizationUrl);
      return;
    }
    void this.router.navigate(['/checkout/result']);
  }

  private handleError(error: unknown): void {
    if (error instanceof PendingCheckoutConflictError) {
      this.errorCode = 'PENDING_CHECKOUT';
      this.errorMessage = 'A payment request is already in progress. Try Paystack again to continue it safely.';
      return;
    }
    if (error instanceof CheckoutStorageError) {
      this.errorCode = 'CHECKOUT_STORAGE';
      this.errorMessage = 'This browser could not safely save the payment session. Enable session storage and try again.';
      return;
    }
    if (!(error instanceof HttpErrorResponse)) {
      this.errorMessage = 'We could not confirm whether Paystack started. Try again to continue safely.';
      return;
    }

    const responseError = error.error?.error as { code?: string; message?: string } | undefined;
    this.errorCode = responseError?.code ?? '';
    if (error.status === 422 || this.errorCode === 'VALIDATION_ERROR') {
      this.checkoutService.clearPending();
      this.errorMessage = 'Some checkout details were not accepted. Review the form and try again.';
    } else if (this.errorCode === 'PRODUCT_UNAVAILABLE') {
      this.checkoutService.clearPending();
      this.errorMessage = 'A product in your cart is no longer available. Remove it or refresh the cart before paying.';
    } else if (this.errorCode === 'INSUFFICIENT_STOCK') {
      this.checkoutService.clearPending();
      this.errorMessage = 'There is not enough stock for one or more quantities. Reduce the quantity and try again.';
    } else if (error.status === 429 || this.errorCode === 'CHECKOUT_RATE_LIMIT') {
      this.errorMessage = 'Too many payment attempts were made. Wait a moment, then try Paystack again.';
    } else if (this.errorCode === 'CHECKOUT_INITIALIZING') {
      this.errorMessage = 'Paystack is still preparing your payment. Wait a moment, then try again.';
    } else if (
      this.errorCode === 'CHECKOUT_EXPIRED' ||
      this.errorCode === 'CHECKOUT_INITIALIZATION_FAILED' ||
      this.errorCode === 'PAYSTACK_UNAVAILABLE' ||
      this.errorCode === 'PAYSTACK_INITIALIZATION_FAILED' ||
      this.errorCode === 'PAYSTACK_INVALID_RESPONSE' ||
      this.errorCode === 'CHECKOUT_NOT_FOUND'
    ) {
      this.checkoutService.clearPending();
      this.errorMessage = 'Paystack could not start this payment. Nothing was charged. Please try again shortly.';
    } else if (error.status === 404) {
      this.checkoutService.clearPending();
      this.errorMessage = 'Paystack checkout is not available on the server right now. Please try again later.';
    } else if (error.status === 0 || error.status >= 500) {
      this.errorMessage = 'We could not confirm whether Paystack started. Try again to continue safely.';
    } else {
      this.errorMessage = responseError?.message ?? 'We could not start payment. Please try Paystack again.';
    }
  }

  private resetFeedback(): void {
    this.errorMessage = '';
    this.errorCode = '';
    this.priceMismatch = false;
    this.initializedSession = undefined;
  }
}
