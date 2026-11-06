import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, distinctUntilChanged, EMPTY, map, Subscription, switchMap, tap } from 'rxjs';
import { Product, ReviewInvitation } from '../core/store.models';
import { CatalogRepository } from '../services/catalog.service';
import { ReviewRepository } from '../services/review.service';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';

type ReviewPageError =
  | 'missing-token'
  | 'invalid-link'
  | 'product-mismatch'
  | 'ineligible'
  | 'configuration-unavailable'
  | 'load-error';

function trimmedLength(minLength: number, maxLength: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const length = typeof control.value === 'string' ? control.value.trim().length : 0;
    return length >= minLength && length <= maxLength ? null : { trimmedLength: true };
  };
}

function integerRating(control: AbstractControl): ValidationErrors | null {
  return Number.isInteger(control.value) && control.value >= 1 && control.value <= 5
    ? null
    : { integerRating: true };
}

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingSpinnerComponent],
  templateUrl: './review.component.html',
})
export class ReviewComponent implements OnInit {
  invitation?: ReviewInvitation;
  product?: Product;
  loading = true;
  pageError: ReviewPageError | null = null;
  submitErrorMessage = '';
  submitting = false;
  submitted = false;
  alreadySubmitted = false;
  readonly reviewForm;

  private token = '';
  private imageSubscription?: Subscription;
  private submitSubscription?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly catalog: CatalogRepository,
    private readonly reviews: ReviewRepository,
    private readonly destroyRef: DestroyRef,
    formBuilder: FormBuilder,
  ) {
    this.reviewForm = formBuilder.nonNullable.group({
      reviewerName: ['', [Validators.required, trimmedLength(2, 60)]],
      rating: [0, [Validators.required, integerRating]],
      comment: ['', [Validators.required, trimmedLength(10, 500)]],
    });
  }

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(
        map(([params, query]) => ({
          slug: params.get('slug') ?? '',
          token: query.get('token')?.trim() ?? '',
        })),
        distinctUntilChanged(
          (previous, current) => previous.slug === current.slug && previous.token === current.token,
        ),
        tap(() => this.resetForLink()),
        switchMap(({ slug, token }) => {
          if (!token) {
            this.loading = false;
            this.pageError = 'missing-token';
            return EMPTY;
          }

          return this.reviews.getInvitation(token).pipe(
            map((invitation) => ({ invitation, slug, token })),
            catchError((error: unknown) => {
              this.handleLookupError(error);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ invitation, slug, token }) => {
        this.loading = false;
        this.invitation = invitation;

        if (slug !== invitation.product.slug) {
          this.pageError = 'product-mismatch';
          return;
        }

        this.token = token;
        this.alreadySubmitted = invitation.alreadySubmitted;
        if (this.alreadySubmitted) this.reviewForm.disable();
        this.loadOptionalProduct(invitation.product.id, invitation.product.slug);
      });
  }

  setRating(rating: number): void {
    if (this.submitting || this.submitted || this.alreadySubmitted) return;
    this.reviewForm.controls.rating.setValue(rating);
    this.reviewForm.controls.rating.markAsTouched();
  }

  submit(): void {
    if (
      this.submitting ||
      this.submitted ||
      this.alreadySubmitted ||
      this.pageError ||
      !this.invitation ||
      !this.token
    ) {
      return;
    }

    const reviewerName = this.reviewForm.controls.reviewerName.value.trim();
    const comment = this.reviewForm.controls.comment.value.trim();
    const rating = this.reviewForm.controls.rating.value;
    this.reviewForm.controls.reviewerName.setValue(reviewerName);
    this.reviewForm.controls.comment.setValue(comment);
    this.reviewForm.updateValueAndValidity();

    if (this.reviewForm.invalid || !Number.isInteger(rating)) {
      this.reviewForm.markAllAsTouched();
      return;
    }

    this.submitErrorMessage = '';
    this.submitting = true;
    this.submitSubscription = this.reviews
      .submit(this.invitation.product.id, { token: this.token, reviewerName, rating, comment })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting = false;
          this.submitted = true;
          this.reviewForm.disable();
        },
        error: (error: unknown) => this.handleSubmitError(error),
      });
  }

  private resetForLink(): void {
    this.imageSubscription?.unsubscribe();
    this.submitSubscription?.unsubscribe();
    this.imageSubscription = undefined;
    this.submitSubscription = undefined;
    this.invitation = undefined;
    this.product = undefined;
    this.token = '';
    this.loading = true;
    this.pageError = null;
    this.submitErrorMessage = '';
    this.submitting = false;
    this.submitted = false;
    this.alreadySubmitted = false;
    this.reviewForm.enable();
    this.reviewForm.reset({ reviewerName: '', rating: 0, comment: '' });
  }

  private loadOptionalProduct(productId: string, slug: string): void {
    this.imageSubscription = this.catalog
      .getProductBySlug(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (product) => {
          if (this.invitation?.product.id === productId && product?.id === productId) this.product = product;
        },
        error: () => {
          // The secure invitation remains usable when optional catalog imagery is unavailable.
        },
      });
  }

  private handleLookupError(error: unknown): void {
    this.loading = false;
    this.pageError = this.errorStateFor(error);
  }

  private handleSubmitError(error: unknown): void {
    this.submitting = false;
    const code = this.errorCode(error);

    if (code === 'REVIEW_ALREADY_SUBMITTED') {
      this.alreadySubmitted = true;
      this.reviewForm.disable();
      return;
    }

    const state = this.errorStateFor(error);
    if (state !== 'load-error') {
      this.pageError = state;
      this.reviewForm.disable();
      return;
    }

    this.submitErrorMessage =
      code === 'VALIDATION_ERROR'
        ? 'Check your name, rating, and review, then try again.'
        : 'We could not submit your review. Your answers are still here, so you can try again.';
  }

  private errorStateFor(error: unknown): ReviewPageError {
    const code = this.errorCode(error);
    if (code.includes('MISMATCH')) return 'product-mismatch';
    if (code.includes('INELIGIBLE') || code.includes('NOT_ELIGIBLE')) return 'ineligible';
    if (code.includes('REVIEW') && (code.includes('CONFIG') || code.includes('UNAVAILABLE'))) {
      return 'configuration-unavailable';
    }
    if (
      code.includes('INVALID') ||
      code.includes('EXPIRED') ||
      code.includes('NOT_FOUND') ||
      (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 410))
    ) {
      return 'invalid-link';
    }
    return 'load-error';
  }

  private errorCode(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return '';
    return ((error.error?.error as { code?: string } | undefined)?.code ?? '').toUpperCase();
  }
}
