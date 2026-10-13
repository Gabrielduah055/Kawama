import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';
import { Category, Product } from '../core/store.models';

interface ApiEnvelope<T> {
  readonly data: T;
}

interface PaginatedEnvelope<T> extends ApiEnvelope<readonly T[]> {
  readonly meta: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
  };
}

export abstract class CatalogRepository {
  abstract getProducts(): Observable<readonly Product[]>;
  abstract getProductBySlug(slug: string): Observable<Product | undefined>;
  abstract getCategories(): Observable<readonly Category[]>;
}

@Injectable({ providedIn: 'root' })
export class CatalogService extends CatalogRepository {
  private readonly base = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {
    super();
  }

  override getProducts(): Observable<readonly Product[]> {
    const params = new HttpParams().set('limit', 100);
    return this.http
      .get<PaginatedEnvelope<Product>>(buildApiUrl(this.base, environment.apiEndpoints.products), { params })
      .pipe(map(({ data }) => data));
  }

  override getProductBySlug(slug: string): Observable<Product | undefined> {
    return this.http.get<ApiEnvelope<Product>>(
      buildApiUrl(this.base, environment.apiEndpoints.productDetail, { slug }),
    ).pipe(
      map(({ data }) => data),
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 404 ? of(undefined) : throwError(() => error),
      ),
    );
  }

  override getCategories(): Observable<readonly Category[]> {
    return this.http
      .get<ApiEnvelope<readonly Category[]>>(buildApiUrl(this.base, environment.apiEndpoints.categories))
      .pipe(map(({ data }) => [...data].sort((first, second) => first.displayOrder - second.displayOrder)));
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
