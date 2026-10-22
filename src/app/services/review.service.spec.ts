import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Review } from '../core/store.models';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';
import { ReviewService } from './review.service';

describe('ReviewService', () => {
  let service: ReviewService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ReviewService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and aggregates approved product reviews', () => {
    service.getByProductId('prd-pan-01').subscribe();
    const reviews: readonly Review[] = [
      { id: '1', productId: 'prd-pan-01', reviewerName: 'Ama', rating: 5, comment: 'Very useful product.', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', productId: 'prd-pan-01', reviewerName: 'Esi', rating: 4, comment: 'Works well every day.', createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    http.expectOne(
      buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.productReviews, { productId: 'prd-pan-01' }),
    ).flush({ data: reviews });
    expect(service.summaryFor('prd-pan-01')).toEqual({ average: 4.5, count: 2 });
  });

  it('submits a review for moderation without publishing it locally', () => {
    let status = '';
    service.submit({ productId: 'prd-bowl-02', reviewerName: 'Yaw M.', rating: 4, comment: 'Useful sizes and easy to clean.' }).subscribe((result) => (status = result.status));
    const request = http.expectOne(
      buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.productReviews, { productId: 'prd-bowl-02' }),
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reviewerName: 'Yaw M.', rating: 4, comment: 'Useful sizes and easy to clean.' });
    request.flush({ data: { id: 'review-1', status: 'pending' } });
    expect(status).toBe('pending');
    expect(service.forProduct('prd-bowl-02')).toEqual([]);
  });

  it('finds a homepage highlight beyond the first six products with bounded requests', () => {
    const products = Array.from({ length: 7 }, (_, index) => ({
      ...SAMPLE_PRODUCT,
      id: `product-${index + 1}`,
      slug: `product-${index + 1}`,
      inStock: true,
    }));
    let highlightedProductId = '';
    service.getHighlights(products, 3, 4).subscribe((result) => {
      highlightedProductId = result.highlights[0]?.product.id ?? '';
    });

    const initialRequests = http.match((request) => request.url.includes('/reviews'));
    expect(initialRequests.length).toBe(4);
    initialRequests.forEach((request) => request.flush({ data: [] }));
    for (let index = 4; index < products.length; index += 1) {
      const product = products[index];
      const request = http.expectOne(
        buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.productReviews, { productId: product.id }),
      );
      request.flush({
        data:
          index === 6
            ? [{ id: 'review-seven', productId: product.id, reviewerName: 'Abena', rating: 5, comment: 'Excellent quality.', createdAt: '2026-02-01T00:00:00.000Z' }]
            : [],
      });
    }

    expect(highlightedProductId).toBe('product-7');
  });
});

const SAMPLE_PRODUCT = {
  id: 'sample-product',
  slug: 'sample-product',
  name: 'Sample product',
  category: 'Cookware',
  shortDescription: 'A sample product.',
  description: 'A sample product for review tests.',
  price: 12.5,
  currency: 'GHS' as const,
  images: [],
  inStock: true,
  featured: false,
  complementaryCategories: [],
  details: [],
};
