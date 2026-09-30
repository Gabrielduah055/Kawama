import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product } from '../core/store.models';
import { CatalogRepository } from '../services/catalog.service';
import { ReviewRepository } from '../services/review.service';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './review.component.html',
})
export class ReviewComponent implements OnInit {
  product?: Product;
  loading = true;
  submitted = false;
  readonly reviewForm;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly catalog: CatalogRepository,
    private readonly reviews: ReviewRepository,
    formBuilder: FormBuilder,
  ) {
    this.reviewForm = formBuilder.nonNullable.group({
      reviewerName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
      rating: [0, [Validators.required, Validators.min(1), Validators.max(5)]],
      comment: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.loading = true;
      this.catalog.getProductBySlug(params.get('slug') ?? '').subscribe((product) => {
        this.product = product;
        this.loading = false;
      });
    });
  }

  setRating(rating: number): void {
    this.reviewForm.controls.rating.setValue(rating);
    this.reviewForm.controls.rating.markAsTouched();
  }

  submit(): void {
    if (!this.product || this.reviewForm.invalid) {
      this.reviewForm.markAllAsTouched();
      return;
    }
    this.reviews.submit({ ...this.reviewForm.getRawValue(), productId: this.product.id }).subscribe(() => {
      this.submitted = true;
    });
  }
}

