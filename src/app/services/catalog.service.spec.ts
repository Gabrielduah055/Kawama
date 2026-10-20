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

  it('shares completed cached reads until an explicit refresh is requested', () => {
    let firstResult: readonly Product[] = [];
    let cachedResult: readonly Product[] = [];
    service.getProducts().subscribe((products) => (firstResult = products));
    http.expectOne((request) => request.params.get('page') === '1').flush({
      data: [SAMPLE_PRODUCTS[0]],
      meta: { page: 1, limit: 100, total: 1 },
    });

    service.getProducts().subscribe((products) => (cachedResult = products));
    http.expectNone((request) => request.url === buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.products));
    expect(cachedResult).toEqual(firstResult);
  });

  it('forces a new request and publishes changed prices and availability', () => {
    service.getProducts().subscribe();
    http.expectOne((request) => request.params.get('page') === '1').flush({
      data: [SAMPLE_PRODUCTS[0]],
      meta: { page: 1, limit: 100, total: 1 },
    });

    const changed = { ...SAMPLE_PRODUCTS[0], price: SAMPLE_PRODUCTS[0].price + 25, inStock: false };
    let refreshed: readonly Product[] = [];
    service.refreshProducts().subscribe((products) => (refreshed = products));
    http.expectOne((request) => request.params.get('page') === '1').flush({
      data: [changed],
      meta: { page: 1, limit: 100, total: 1 },
    });

    expect(refreshed[0].price).toBe(changed.price);
    expect(refreshed[0].inStock).toBeFalse();
  });

  it('does not publish a partial refreshed catalog when a later page fails', () => {
    let emissions = 0;
    let failed = false;
    service.refreshProducts().subscribe({
      next: () => emissions += 1,
      error: () => (failed = true),
    });
    http.expectOne((request) => request.params.get('page') === '1').flush({
      data: [SAMPLE_PRODUCTS[0]],
      meta: { page: 1, limit: 100, total: 101 },
    });
    http.expectOne((request) => request.params.get('page') === '2').flush(
      { error: { code: 'CATALOG_UNAVAILABLE' } },
      { status: 503, statusText: 'Unavailable' },
    );

    expect(emissions).toBe(0);
    expect(failed).toBeTrue();
  });

  it('loads every catalog page before publishing a deduplicated result', () => {
    const first = SAMPLE_PRODUCTS[0];
    const second = { ...SAMPLE_PRODUCTS[1], id: 'page-two-product' };
    const third = { ...SAMPLE_PRODUCTS[2], id: 'page-three-product' };
    let emissions = 0;
    let products: readonly Product[] = [];

    service.getProducts().subscribe((value) => {
      emissions += 1;
      products = value;
    });
    http.expectOne((request) => request.params.get('page') === '1').flush({
      data: [first],
      meta: { page: 1, limit: 100, total: 201 },
    });
    expect(emissions).toBe(0);

    const remaining = http.match(
      (request) => request.url === buildApiUrl(environment.apiBaseUrl, environment.apiEndpoints.products),
    );
    expect(remaining.length).toBe(2);
    remaining.find((request) => request.request.params.get('page') === '3')!.flush({
      data: [third, first],
      meta: { page: 3, limit: 100, total: 201 },
    });
    remaining.find((request) => request.request.params.get('page') === '2')!.flush({
      data: [second],
      meta: { page: 2, limit: 100, total: 201 },
    });

    expect(emissions).toBe(1);
    expect(products.map((product) => product.id)).toEqual([first.id, second.id, third.id]);
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

  it('prefers the selected product category before complementary categories', () => {
    const selected = SAMPLE_PRODUCTS[0];
    const results = service.recommend(SAMPLE_PRODUCTS, selected, [], 4);
    expect(results[0].category).toBe(selected.category);
  });

  it('uses cart categories and excludes cart items from recommendations', () => {
    const cartProduct = SAMPLE_PRODUCTS.find((product) => product.category === 'Storage' && product.inStock)!;
    const results = service.recommend(SAMPLE_PRODUCTS, undefined, [cartProduct.id], 4);
    expect(results[0].category).toBe('Storage');
    expect(results.some((product) => product.id === cartProduct.id)).toBeFalse();
  });
});
