import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { catchError, from, map, mergeMap, Observable, of, shareReplay, throwError, toArray } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';
import { Product, Review, ReviewSubmission, ReviewSummary } from '../core/store.models';

interface ApiEnvelope<T> {
  readonly data: T;
}

export interface ReviewHighlight {
  readonly product: Product;
  readonly review: Review;
}

export interface ReviewHighlightsResult {
  readonly highlights: readonly ReviewHighlight[];
  readonly failedProductCount: number;
}

export abstract class ReviewRepository {
  abstract getByProductId(productId: string): Observable<readonly Review[]>;
  abstract submit(review: Omit<Review, 'id' | 'createdAt'>): Observable<ReviewSubmission>;
}

@Injectable({ providedIn: 'root' })
export class ReviewService extends ReviewRepository {
  private readonly reviewsState = signal<readonly Review[]>([]);
  private readonly requests = new Map<string, Observable<readonly Review[]>>();
  readonly reviews = this.reviewsState.asReadonly();

  constructor(private readonly http: HttpClient) {
    super();
  }

  override getByProductId(productId: string): Observable<readonly Review[]> {
    const cached = this.requests.get(productId);
    if (cached) return cached;

    const request = this.http
      .get<ApiEnvelope<readonly Review[]>>(
        buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.productReviews, { productId }),
      )
      .pipe(
        map(({ data }) => data),
        map((reviews) => {
          this.reviewsState.update((current) => [
            ...current.filter((review) => review.productId !== productId),
            ...reviews,
          ]);
          return reviews;
        }),
        catchError((error: unknown) => {
          this.requests.delete(productId);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    this.requests.set(productId, request);
    return request;
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

  getHighlights(
    products: readonly Product[],
    limit = 3,
    concurrency = 4,
  ): Observable<ReviewHighlightsResult> {
    return from(products.filter((product) => product.inStock)).pipe(
      mergeMap(
        (product) =>
          this.getByProductId(product.id).pipe(
            map((reviews) => ({
              failed: false,
              highlights: reviews.map((review) => ({ product, review })),
            })),
            catchError(() => of({ failed: true, highlights: [] as ReviewHighlight[] })),
          ),
        concurrency,
      ),
      toArray(),
      map((results) => ({
        failedProductCount: results.filter((result) => result.failed).length,
        highlights: results
          .flatMap((result) => result.highlights)
          .sort(
            (first, second) =>
              second.review.rating - first.review.rating ||
              second.review.createdAt.localeCompare(first.review.createdAt),
          )
          .slice(0, limit),
      })),
    );
  }
}
