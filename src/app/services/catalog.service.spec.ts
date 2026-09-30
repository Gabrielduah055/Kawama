import { CatalogService } from './catalog.service';
import { SAMPLE_PRODUCTS } from '../data/sample-products';

describe('CatalogService', () => {
  const service = new CatalogService();

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

