import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product } from '../core/store.models';
import { ProductCardComponent } from '../shared/product-card.component';
import { CartService } from '../services/cart.service';
import { CatalogRepository, CatalogService } from '../services/catalog.service';
import { ReviewService } from '../services/review.service';
import { ShareService } from '../services/share.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent],
  templateUrl: './product-detail.component.html',
})
export class ProductDetailComponent implements OnInit {
  product?: Product;
  products: readonly Product[] = [];
  loading = true;
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
    this.catalogRepository.getProducts().subscribe((products) => {
      this.products = products;
    });
    this.route.paramMap.subscribe((params) => {
      this.loading = true;
      this.quantity = 1;
      this.activeImageIndex = 0;
      this.feedback = '';
      this.catalogRepository.getProductBySlug(params.get('slug') ?? '').subscribe((product) => {
        this.product = product;
        this.loading = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
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
