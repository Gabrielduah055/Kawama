import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CatalogService } from './catalog.service';
import { SAMPLE_PRODUCTS } from '../data/sample-products';
import { environment } from '../../environments/environment';
import { Product } from '../core/store.models';
import { buildApiUrl } from '../core/endpoint';

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the catalog through the public API envelope', () => {
    let products = [] as readonly typeof SAMPLE_PRODUCTS[number][];
    service.getProducts().subscribe((value) => (products = value));
    const request = http.expectOne(
      (candidate) => candidate.url === buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.products),
    );
    expect(request.request.params.get('limit')).toBe('100');
    request.flush({ data: SAMPLE_PRODUCTS, meta: { page: 1, limit: 100, total: SAMPLE_PRODUCTS.length } });
    expect(products.length).toBe(SAMPLE_PRODUCTS.length);
  });

  it('loads managed categories for navigation and filters', () => {
    let categoryNames: readonly string[] = [];
    service.getCategories().subscribe((categories) => (categoryNames = categories.map((category) => category.name)));
    http.expectOne(buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.categories)).flush({
      data: [{ id: 'cat-1', name: 'Cookware', slug: 'cookware', description: '', displayOrder: 1 }],
    });
    expect(categoryNames).toEqual(['Cookware']);
  });

  it('maps a missing product response to undefined', () => {
    let product: Product | undefined = SAMPLE_PRODUCTS[0];
    service.getProductBySlug('missing-product').subscribe((value) => (product = value));
    http.expectOne(
      buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.productDetail, { slug: 'missing-product' }),
    ).flush(
      { error: { code: 'PRODUCT_NOT_FOUND', message: 'Missing', requestId: 'request-1' } },
      { status: 404, statusText: 'Not Found' },
    );
    expect(product).toBeUndefined();
  });

  it('filters products by query and category', () => {
    const results = service.search(SAMPLE_PRODUCTS, 'nonstick', 'Cookware');
    expect(results.length).toBe(1);
    expect(results[0].slug).toBe('onyx-everyday-frying-pan');
  });

  it('returns no unavailable products in recommendations', () => {
    const selected = SAMPLE_PRODUCTS[0];
    const results = service.recommend(SAMPLE_PRODUCTS, selected, [], 4);
    expect(results.some((product) => !product.inStock)).toBeFalse();
    expect(results.some((product) => product.id === selected.id)).toBeFalse();
  });

  it('excludes products that are already in the cart', () => {
    const excludedId = SAMPLE_PRODUCTS[1].id;
    const results = service.recommend(SAMPLE_PRODUCTS, undefined, [excludedId], 6);
    expect(results.some((product) => product.id === excludedId)).toBeFalse();
  });
});
