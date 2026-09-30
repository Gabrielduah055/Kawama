import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Review, ReviewSummary } from '../core/store.models';
import { SAMPLE_REVIEWS } from '../data/sample-reviews';

const REVIEW_STORAGE_KEY = 'kawama.reviews.v1';

export abstract class ReviewRepository {
  abstract getByProductId(productId: string): Observable<readonly Review[]>;
  abstract submit(review: Omit<Review, 'id' | 'createdAt'>): Observable<Review>;
}

@Injectable({ providedIn: 'root' })
export class ReviewService extends ReviewRepository {
  private readonly reviewsState = signal<readonly Review[]>([...SAMPLE_REVIEWS, ...this.readStoredReviews()]);
  readonly reviews = this.reviewsState.asReadonly();

  override getByProductId(productId: string): Observable<readonly Review[]> {
    return of(this.forProduct(productId));
  }

  override submit(review: Omit<Review, 'id' | 'createdAt'>): Observable<Review> {
    const created: Review = {
      ...review,
      rating: Math.min(Math.max(Math.round(review.rating), 1), 5),
      id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
    };
    const localReviews = [...this.readStoredReviews(), created];
    try {
      localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(localReviews));
    } catch {
      // The new review is still available for this session.
    }
    this.reviewsState.set([...SAMPLE_REVIEWS, ...localReviews]);
    return of(created);
  }

  forProduct(productId: string): readonly Review[] {
    return this.reviewsState()
      .filter((review) => review.productId === productId)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }

  summaryFor(productId: string): ReviewSummary {
    const reviews = this.forProduct(productId);
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return { average: reviews.length ? total / reviews.length : 0, count: reviews.length };
  }

  private readStoredReviews(): readonly Review[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (review): review is Review =>
          typeof review === 'object' &&
          review !== null &&
          typeof (review as Review).id === 'string' &&
          typeof (review as Review).productId === 'string' &&
          typeof (review as Review).reviewerName === 'string' &&
          typeof (review as Review).comment === 'string' &&
          typeof (review as Review).createdAt === 'string' &&
          Number.isInteger((review as Review).rating) &&
          (review as Review).rating >= 1 &&
          (review as Review).rating <= 5,
      );
    } catch {
      return [];
    }
  }
}

