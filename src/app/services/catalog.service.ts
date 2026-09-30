import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Product } from '../core/store.models';
import { SAMPLE_PRODUCTS } from '../data/sample-products';

export abstract class CatalogRepository {
  abstract getProducts(): Observable<readonly Product[]>;
  abstract getProductBySlug(slug: string): Observable<Product | undefined>;
}

@Injectable({ providedIn: 'root' })
export class CatalogService extends CatalogRepository {
  override getProducts(): Observable<readonly Product[]> {
    return of(SAMPLE_PRODUCTS);
  }

  override getProductBySlug(slug: string): Observable<Product | undefined> {
    return of(SAMPLE_PRODUCTS.find((product) => product.slug === slug));
  }

  search(products: readonly Product[], query: string, category = 'All'): readonly Product[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category;
      const searchable = `${product.name} ${product.category} ${product.shortDescription}`.toLocaleLowerCase();
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }

  recommend(
    products: readonly Product[],
    selectedProduct?: Product,
    cartProductIds: readonly string[] = [],
    limit = 4,
  ): readonly Product[] {
    const cartProducts = products.filter((product) => cartProductIds.includes(product.id));
    const preferredCategories = new Set([
      ...(selectedProduct?.complementaryCategories ?? []),
      ...cartProducts.flatMap((product) => product.complementaryCategories),
    ]);
    const excluded = new Set([...cartProductIds, ...(selectedProduct ? [selectedProduct.id] : [])]);

    return [...products]
      .filter((product) => product.inStock && !excluded.has(product.id))
      .sort((first, second) => {
        const firstScore = (preferredCategories.has(first.category) ? 2 : 0) + (first.featured ? 1 : 0);
        const secondScore = (preferredCategories.has(second.category) ? 2 : 0) + (second.featured ? 1 : 0);
        return secondScore - firstScore;
      })
      .slice(0, limit);
  }
}

