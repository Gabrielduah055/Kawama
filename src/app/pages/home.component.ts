import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { Category, Product } from '../core/store.models';
import { CartService } from '../services/cart.service';
import { CatalogRepository, CatalogService } from '../services/catalog.service';
import { ReviewHighlight, ReviewService } from '../services/review.service';
import { ShoppingChatService } from '../services/shopping-chat.service';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';
import { ProductCardComponent } from '../shared/product-card.component';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent, LoadingSpinnerComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  products: readonly Product[] = [];
  categories: readonly Category[] = [];
  reviewHighlights: readonly ReviewHighlight[] = [];
  loading = true;
  loadError = false;
  reviewLoadIncomplete = false;
  private reviewSubscription?: Subscription;

  constructor(
    readonly cart: CartService,
    private readonly catalogRepository: CatalogRepository,
    private readonly catalogService: CatalogService,
    private readonly reviewService: ReviewService,
    private readonly destroyRef: DestroyRef,
    readonly shoppingChat: ShoppingChatService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = false;
    forkJoin({
      products: this.catalogRepository.getProducts(),
      categories: this.catalogRepository.getCategories(),
    }).subscribe({
      next: ({ products, categories }) => {
        this.products = products;
        this.categories = categories;
        this.loading = false;
        this.loadReviewHighlights(products);
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  get featuredProducts(): readonly Product[] {
    return this.products.filter((product) => product.featured && product.inStock).slice(0, 4);
  }

  get recommendations(): readonly Product[] {
    return this.catalogService.recommend(
      this.products,
      undefined,
      this.cart.items().map((item) => item.productId),
      4,
      this.featuredProducts.map((product) => product.id),
    );
  }

  get recommendationContext(): string {
    return this.cart.itemCount()
      ? 'Selected to complement products already in your cart.'
      : 'A useful starting point from the current featured collection.';
  }

  private loadReviewHighlights(products: readonly Product[]): void {
    this.reviewSubscription?.unsubscribe();
    this.reviewHighlights = [];
    this.reviewLoadIncomplete = false;
    if (!products.some((product) => product.inStock)) return;

    this.reviewSubscription = this.reviewService
      .getHighlights(products)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ highlights, failedProductCount }) => {
        this.reviewHighlights = highlights;
        this.reviewLoadIncomplete = failedProductCount > 0;
      });
  }
}
