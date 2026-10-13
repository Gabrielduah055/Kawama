import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';
import { Review, ReviewSubmission, ReviewSummary } from '../core/store.models';

interface ApiEnvelope<T> {
  readonly data: T;
}

export abstract class ReviewRepository {
  abstract getByProductId(productId: string): Observable<readonly Review[]>;
  abstract submit(review: Omit<Review, 'id' | 'createdAt'>): Observable<ReviewSubmission>;
}

@Injectable({ providedIn: 'root' })
export class ReviewService extends ReviewRepository {
  private readonly reviewsState = signal<readonly Review[]>([]);
  readonly reviews = this.reviewsState.asReadonly();

  constructor(private readonly http: HttpClient) {
    super();
  }

  override getByProductId(productId: string): Observable<readonly Review[]> {
    return this.http
      .get<ApiEnvelope<readonly Review[]>>(
        buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.productReviews, { productId }),
      )
      .pipe(
        map(({ data }) => data),
        tap((reviews) => {
          this.reviewsState.update((current) => [
            ...current.filter((review) => review.productId !== productId),
            ...reviews,
          ]);
        }),
      );
  }

  override submit(review: Omit<Review, 'id' | 'createdAt'>): Observable<ReviewSubmission> {
    const { productId, reviewerName, rating, comment } = review;
    return this.http
      .post<ApiEnvelope<ReviewSubmission>>(
        buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.productReviews, { productId }),
        { reviewerName, rating, comment },
      )
      .pipe(map(({ data }) => data));
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
}
