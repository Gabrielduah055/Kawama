import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, from, map, mergeMap, Observable, of, shareReplay, switchMap, throwError, toArray } from 'rxjs';
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
  private readonly pageSize = 100;
  private readonly pageConcurrency = 4;
  private productsRequest?: Observable<readonly Product[]>;

  constructor(private readonly http: HttpClient) {
    super();
  }

  override getProducts(): Observable<readonly Product[]> {
    this.productsRequest ??= this.loadProductPage(1).pipe(
      switchMap((firstPage) => {
        const pageCount = Math.max(1, Math.ceil(firstPage.meta.total / Math.max(firstPage.meta.limit, 1)));
        if (pageCount === 1) return of([firstPage]);

        return from(Array.from({ length: pageCount - 1 }, (_, index) => index + 2)).pipe(
          mergeMap((page) => this.loadProductPage(page), this.pageConcurrency),
          toArray(),
          map((remainingPages) => [firstPage, ...remainingPages.sort((a, b) => a.meta.page - b.meta.page)]),
        );
      }),
      map((pages) => {
        const products = new Map<string, Product>();
        for (const product of pages.flatMap((page) => page.data)) products.set(product.id, product);
        return [...products.values()];
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    return this.productsRequest;
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

  private loadProductPage(page: number): Observable<PaginatedEnvelope<Product>> {
    const params = new HttpParams().set('limit', this.pageSize).set('page', page);
    return this.http.get<PaginatedEnvelope<Product>>(
      buildApiUrl(this.base, environment.apiEndpoints.products),
      { params },
    );
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
    const matchingCategories = new Set([
      ...(selectedProduct ? [selectedProduct.category] : []),
      ...cartProducts.map((product) => product.category),
    ]);
    const complementaryCategories = new Set([
      ...(selectedProduct?.complementaryCategories ?? []),
      ...cartProducts.flatMap((product) => product.complementaryCategories),
    ]);
    const excluded = new Set([...cartProductIds, ...(selectedProduct ? [selectedProduct.id] : [])]);

    return [...products]
      .filter((product) => product.inStock && !excluded.has(product.id))
      .sort((first, second) => {
        const firstScore =
          (matchingCategories.has(first.category) ? 4 : 0) +
          (complementaryCategories.has(first.category) ? 2 : 0) +
          (first.featured ? 1 : 0);
        const secondScore =
          (matchingCategories.has(second.category) ? 4 : 0) +
          (complementaryCategories.has(second.category) ? 2 : 0) +
          (second.featured ? 1 : 0);
        return secondScore - firstScore;
      })
      .slice(0, limit);
  }
}
