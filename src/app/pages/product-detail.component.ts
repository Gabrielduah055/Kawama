import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product } from '../core/store.models';
import { ProductCardComponent } from '../shared/product-card.component';
import { CartService } from '../services/cart.service';
import { CatalogRepository, CatalogService } from '../services/catalog.service';
import { ReviewService } from '../services/review.service';
import { ShareService } from '../services/share.service';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent, LoadingSpinnerComponent],
  templateUrl: './product-detail.component.html',
})
export class ProductDetailComponent implements OnInit {
  product?: Product;
  products: readonly Product[] = [];
  loading = true;
  loadError = false;
  reviewsLoading = false;
  reviewsError = false;
  private currentSlug = '';
  quantity = 1;
  feedback = '';
  shareError = false;
  activeImageIndex = 0;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly catalogRepository: CatalogRepository,
    private readonly catalogService: CatalogService,
    private readonly cart: CartService,
    readonly reviews: ReviewService,
    private readonly sharing: ShareService,
  ) {}

  ngOnInit(): void {
    this.catalogRepository.getProducts().subscribe({
      next: (products) => (this.products = products),
      error: () => (this.products = []),
    });
    this.route.paramMap.subscribe((params) => {
      this.currentSlug = params.get('slug') ?? '';
      this.loadProduct();
    });
  }

  loadProduct(): void {
    this.loading = true;
    this.loadError = false;
    this.reviewsError = false;
    this.quantity = 1;
    this.activeImageIndex = 0;
    this.feedback = '';
    this.catalogRepository.getProductBySlug(this.currentSlug).subscribe({
      next: (product) => {
        this.product = product;
        this.loading = false;
        if (product) {
          this.reviewsLoading = true;
          this.reviews.getByProductId(product.id).subscribe({
            next: () => (this.reviewsLoading = false),
            error: () => {
              this.reviewsLoading = false;
              this.reviewsError = true;
            },
          });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  get recommendations(): readonly Product[] {
    return this.product ? this.catalogService.recommend(this.products, this.product, [], 4) : [];
  }

  selectImage(index: number): void {
    if (!this.product?.images[index]) return;
    this.activeImageIndex = index;
  }

  addToCart(): void {
    if (!this.product?.inStock) return;
    this.cart.add(this.product.id, this.quantity);
    this.feedback = `${this.quantity} ${this.quantity === 1 ? 'item' : 'items'} added to your bag.`;
  }

  changeQuantity(delta: number): void {
    this.quantity = Math.min(Math.max(this.quantity + delta, 1), 20);
  }

  async share(): Promise<void> {
    if (!this.product) return;
    this.feedback = '';
    this.shareError = false;
    try {
      const result = await this.sharing.shareProduct(
        this.product.name,
        this.product.shortDescription,
        `/product/${this.product.slug}`,
      );
      this.feedback = result === 'copied' ? 'Product link copied.' : 'Product shared.';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.shareError = true;
      this.feedback = 'We could not share this product. Copy the page address from your browser instead.';
    }
  }
}
