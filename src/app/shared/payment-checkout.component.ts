import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, take, timeout } from 'rxjs';
import { cedisToPesewas, orderLinesTotalPesewas, pesewasToCedis } from '../core/money';
import {
  CheckoutCreateRequest,
  CheckoutSession,
  CheckoutSnapshotItem,
  CheckoutStatus,
  OrderLine,
  PendingCheckout,
} from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';
import {
  CheckoutService,
  CheckoutStorageError,
  PendingCheckoutConflictError,
} from '../services/checkout.service';

const RESUME_STATUS_TIMEOUT_MS = 10_000;

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
  @Output() readonly catalogRefreshRequested = new EventEmitter<void>();

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
    this.syncFormToActiveCheckout();
  }

  get activeCheckout(): PendingCheckout | undefined {
    return this.checkoutService.pending();
  }

  get subtotalPesewas(): number {
    return orderLinesTotalPesewas(this.lines);
  }

  get itemCount(): number {
    return this.lines.reduce((total, line) => total + line.quantity, 0);
  }

  get activeItemCount(): number {
    return this.activeCheckout?.cartSnapshot.reduce((total, item) => total + item.quantity, 0) ?? 0;
  }

  get submittedAmountPesewas(): number {
    return this.activeCheckout?.expectedAmountPesewas ?? this.subtotalPesewas;
  }

  get activeAmountPesewas(): number {
    return this.activeCheckout?.session?.amountPesewas ?? this.activeCheckout?.lastStatus?.amountPesewas ?? this.submittedAmountPesewas;
  }

  get activeCartMatches(): boolean {
    const active = this.activeCheckout;
    if (!active) return true;
    const current = this.lines
      .map((line) => `${line.product.id}:${line.quantity}`)
      .sort();
    const saved = active.cartSnapshot
      .map((item) => `${item.productId}:${item.quantity}`)
      .sort();
    return JSON.stringify(current) === JSON.stringify(saved);
  }

  lineTotal(line: OrderLine): number {
    return pesewasToCedis(cedisToPesewas(line.product.price) * line.quantity);
  }

  snapshotLineTotal(item: CheckoutSnapshotItem): number | undefined {
    return item.unitPricePesewas === undefined
      ? undefined
      : pesewasToCedis(item.unitPricePesewas * item.quantity);
  }

  submit(): void {
    if (this.submitting) return;
    if (this.activeCheckout) {
      this.syncFormToActiveCheckout();
      this.errorMessage = 'Finish or verify the payment already in progress before starting another.';
      return;
    }
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
        next: (session) => this.handleSession(session, !session.created),
        error: (error: unknown) => this.handleError(error),
      });
  }

  continueToPaystack(): void {
    if (this.initializedSession) this.continueWithSession(this.initializedSession);
  }

  resumeInitializedCheckout(): void {
    const active = this.activeCheckout;
    const session = active?.session;
    if (!active || !session || this.submitting) return;
    this.verifyAndContinue(active, session);
  }

  viewPaymentStatus(): void {
    void this.router.navigate(['/checkout/result']);
  }

  private startSession(request: CheckoutCreateRequest): void {
    this.submitting = true;
    const snapshot: readonly CheckoutSnapshotItem[] = this.lines.map((line) => ({
      productId: line.product.id,
      quantity: line.quantity,
      name: line.product.name,
      slug: line.product.slug,
      ...(line.product.images[0] ? { image: line.product.images[0] } : {}),
      unitPricePesewas: cedisToPesewas(line.product.price),
      currency: line.product.currency,
    }));
    this.checkoutService
      .createSession(request, snapshot, this.subtotalPesewas)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (session) => this.handleSession(session, !session.created),
        error: (error: unknown) => this.handleError(error),
      });
  }

  private handleSession(session: CheckoutSession, verifyExisting: boolean): void {
    this.initializedSession = session;
    this.syncFormToActiveCheckout();
    if (session.amountPesewas !== this.submittedAmountPesewas) {
      this.priceMismatch = true;
      return;
    }
    if (verifyExisting) {
      const active = this.activeCheckout;
      if (active) this.verifyAndContinue(active, session);
      return;
    }
    this.continueWithSession(session);
  }

  private verifyAndContinue(active: PendingCheckout, session: CheckoutSession): void {
    this.resetFeedback();
    this.submitting = true;
    this.checkoutService
      .getStatus(active.idempotencyKey)
      .pipe(take(1), timeout(RESUME_STATUS_TIMEOUT_MS), finalize(() => (this.submitting = false)))
      .subscribe({
        next: (status) => this.handleResumeStatus(status, session),
        error: (error: unknown) => this.handleResumeError(error),
      });
  }

  private handleResumeStatus(status: CheckoutStatus, session: CheckoutSession): void {
    this.checkoutService.recordStatus(status);
    if (status.paymentStatus === 'pending') {
      this.continueWithSession({
        ...session,
        paymentStatus: status.paymentStatus,
        fulfillmentStatus: status.fulfillmentStatus,
        amountPesewas: status.amountPesewas,
      });
      return;
    }
    void this.router.navigate(['/checkout/result']);
  }

  private handleResumeError(error: unknown): void {
    const responseError = error instanceof HttpErrorResponse
      ? error.error?.error as { code?: string } | undefined
      : undefined;
    const code = responseError?.code ?? '';
    if (
      error instanceof HttpErrorResponse &&
      (error.status === 404 || code === 'CHECKOUT_EXPIRED' || code === 'CHECKOUT_INITIALIZATION_FAILED')
    ) {
      if (this.checkoutService.resolvePendingFailure(code || 'CHECKOUT_NOT_FOUND')) {
        this.unlockCheckoutForm();
        this.errorMessage = 'That payment can no longer continue. Nothing was charged. Review your cart and try again.';
      } else {
        this.errorMessage = 'The payment ended, but this browser could not safely update its checkout record. Reload and check the payment status before trying again.';
      }
      return;
    }
    this.errorMessage = 'We could not check this payment yet. It remains protected; try again when your connection is stable.';
  }

  private continueWithSession(session: CheckoutSession): void {
    if (session.paymentStatus !== 'pending') {
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
      this.syncFormToActiveCheckout();
      this.errorCode = 'PENDING_CHECKOUT';
      this.errorMessage = 'A payment is already in progress. Check that order before starting another.';
      return;
    }
    if (error instanceof CheckoutStorageError) {
      this.syncFormToActiveCheckout();
      this.errorCode = 'CHECKOUT_STORAGE';
      this.errorMessage = this.activeCheckout
        ? 'The order may already exist, but this browser could not save its latest payment details. Try again to recover the same order safely.'
        : 'This browser could not safely save the payment session. Enable session storage and try again.';
      return;
    }
    if (!(error instanceof HttpErrorResponse)) {
      this.syncFormToActiveCheckout();
      this.errorMessage = 'We could not confirm whether Paystack started. Try again to continue the same payment safely.';
      return;
    }

    const responseError = error.error?.error as { code?: string; message?: string } | undefined;
    this.errorCode = responseError?.code ?? '';
    if (error.status === 422 || this.errorCode === 'VALIDATION_ERROR') {
      if (!this.clearUncreatedCheckout()) return;
      this.errorMessage = 'Some checkout details were not accepted. Review the form and try again.';
    } else if (this.errorCode === 'PRODUCT_UNAVAILABLE') {
      if (!this.clearUncreatedCheckout()) return;
      this.catalogRefreshRequested.emit();
      this.errorMessage = 'A product in your cart is no longer available. Review the refreshed cart before paying.';
    } else if (this.errorCode === 'INSUFFICIENT_STOCK') {
      if (!this.clearUncreatedCheckout()) return;
      this.catalogRefreshRequested.emit();
      this.errorMessage = 'There is not enough stock for one or more quantities. Review the refreshed cart and try again.';
    } else if (error.status === 429 || this.errorCode === 'CHECKOUT_RATE_LIMIT') {
      this.syncFormToActiveCheckout();
      this.errorMessage = 'Too many payment attempts were made. Wait a moment, then try the same payment again.';
    } else if (this.errorCode === 'CHECKOUT_INITIALIZING') {
      this.syncFormToActiveCheckout();
      this.errorMessage = 'Paystack is still preparing this payment. Wait a moment, then try again.';
    } else if (
      this.errorCode === 'CHECKOUT_EXPIRED' ||
      this.errorCode === 'CHECKOUT_INITIALIZATION_FAILED' ||
      this.errorCode === 'PAYSTACK_UNAVAILABLE' ||
      this.errorCode === 'PAYSTACK_INITIALIZATION_FAILED' ||
      this.errorCode === 'PAYSTACK_INVALID_RESPONSE' ||
      this.errorCode === 'CHECKOUT_NOT_FOUND'
    ) {
      this.resolveFailedCheckout(this.errorCode);
    } else if (error.status === 404) {
      this.resolveFailedCheckout(this.errorCode || 'CHECKOUT_NOT_FOUND');
    } else if (error.status === 0 || error.status >= 500) {
      this.syncFormToActiveCheckout();
      this.errorMessage = 'We could not confirm whether Paystack started. Try again to continue the same payment safely.';
    } else {
      this.syncFormToActiveCheckout();
      this.errorMessage = responseError?.message ?? 'We could not start payment. Please try the same Paystack payment again.';
    }
  }

  private resolveFailedCheckout(errorCode: string): void {
    if (this.checkoutService.resolvePendingFailure(errorCode)) {
      this.unlockCheckoutForm();
      this.errorMessage = 'Paystack could not start this payment. Nothing was charged. Review your cart and try again.';
    } else {
      this.syncFormToActiveCheckout();
      this.errorMessage = 'The payment failed, but this browser could not safely update its checkout record. Reload before trying again.';
    }
  }

  private clearUncreatedCheckout(): boolean {
    if (this.checkoutService.clearPending()) {
      this.unlockCheckoutForm();
      return true;
    }
    this.syncFormToActiveCheckout();
    this.errorMessage = 'This browser could not safely update the checkout record. Reload before trying another payment.';
    return false;
  }

  private syncFormToActiveCheckout(): void {
    const active = this.activeCheckout;
    if (!active) return;
    this.checkoutForm.reset({
      fullName: active.request.customer.fullName,
      email: active.request.customer.email,
      whatsappNumber: active.request.customer.whatsappNumber,
      deliveryAddress: active.request.customer.deliveryAddress,
      orderNotes: active.request.orderNotes ?? '',
      whatsappConsent: true,
    }, { emitEvent: false });
    this.checkoutForm.disable({ emitEvent: false });
  }

  private unlockCheckoutForm(): void {
    this.checkoutForm.enable({ emitEvent: false });
  }

  private resetFeedback(): void {
    this.errorMessage = '';
    this.errorCode = '';
    this.priceMismatch = false;
    this.initializedSession = undefined;
  }
}
