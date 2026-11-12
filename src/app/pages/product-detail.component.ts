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

type ShareImageState = 'pending' | 'ready' | 'unavailable';

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
  sharePreparationFeedback = '';
  shareError = false;
  shareImageState: ShareImageState = 'unavailable';
  activeImageIndex = 0;
  activeImageFit: 'cover' | 'contain' = 'cover';
  private preparedShareImage?: File;
  private preparedShareImageSrc = '';
  private shareImageRequest = 0;

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
    this.activeImageFit = 'cover';
    this.feedback = '';
    this.clearPreparedShareImage();
    this.catalogRepository.getProductBySlug(this.currentSlug).subscribe({
      next: (product) => {
        this.product = product;
        this.loading = false;
        if (product) {
          void this.prepareSelectedShareImage();
          this.reviewsLoading = true;
          this.reviews.getByProductId(product.id).subscribe({
            next: () => (this.reviewsLoading = false),
            error: () => {
              this.reviewsLoading = false;
              this.reviewsError = true;
            },
          });
        }
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0 });
        }
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  get recommendations(): readonly Product[] {
    return this.product
      ? this.catalogService.recommend(
          this.products,
          this.product,
          this.cart.items().map((item) => item.productId),
          4,
        )
      : [];
  }

  selectImage(index: number): void {
    if (!this.product?.images[index]) return;
    this.activeImageIndex = index;
    this.activeImageFit = 'cover';
    void this.prepareSelectedShareImage();
  }

  updateImageFit(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    if (!image.naturalWidth || !image.naturalHeight) return;

    this.activeImageFit = image.naturalWidth / image.naturalHeight < 1.15 ? 'contain' : 'cover';
  }

  addToCart(): void {
    if (!this.product?.inStock) return;
    this.cart.add(this.product.id, this.quantity);
    this.feedback = `${this.quantity} ${this.quantity === 1 ? 'item' : 'items'} added to your bag.`;
  }

  changeQuantity(delta: number): void {
    this.quantity = Math.min(Math.max(this.quantity + delta, 1), 20);
  }

  roundedRating(productId: string): number {
    return Math.round(this.reviews.summaryFor(productId).average);
  }

  async share(): Promise<void> {
    if (!this.product || this.shareImageState === 'pending') return;
    this.feedback = '';
    this.sharePreparationFeedback = '';
    this.shareError = false;
    try {
      const result = await this.sharing.shareProduct(
        this.product.name,
        `${this.formatPrice(this.product.price, this.product.currency)}\n${this.product.shortDescription}`,
        `/product/${this.product.slug}`,
        this.shareImageState === 'ready' &&
        this.preparedShareImageSrc === this.product.images[this.activeImageIndex]?.src
          ? this.preparedShareImage
          : undefined,
      );
      this.feedback =
        result === 'shared-image'
          ? 'Product image and link shared.'
          : result === 'shared-link'
            ? 'Product link shared.'
            : 'Product link copied.';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.shareError = true;
      this.feedback = 'We could not share this product. Copy the page address from your browser instead.';
    }
  }

  private async prepareSelectedShareImage(): Promise<void> {
    const product = this.product;
    const imageSrc = product?.images[this.activeImageIndex]?.src;
    const request = ++this.shareImageRequest;
    this.preparedShareImage = undefined;
    this.preparedShareImageSrc = '';
    this.sharePreparationFeedback = '';
    this.shareImageState = imageSrc ? 'pending' : 'unavailable';
    if (!product || !imageSrc) {
      if (product) {
        this.sharePreparationFeedback = 'Product image sharing is unavailable. You can still share the product link.';
      }
      return;
    }

    if (!this.sharing.supportsFileSharing()) {
      this.shareImageState = 'unavailable';
      this.sharePreparationFeedback = 'Image file sharing is not supported here. You can still share the product link.';
      return;
    }

    let image: File | undefined;
    try {
      image = await this.sharing.prepareImage(imageSrc, product.name);
    } catch {
      image = undefined;
    }
    if (
      request !== this.shareImageRequest ||
      this.product?.id !== product.id ||
      this.product.images[this.activeImageIndex]?.src !== imageSrc
    ) {
      return;
    }

    if (image) {
      if (this.sharing.canShareImage(image)) {
        this.preparedShareImage = image;
        this.preparedShareImageSrc = imageSrc;
        this.shareImageState = 'ready';
        return;
      }

      this.shareImageState = 'unavailable';
      this.sharePreparationFeedback = 'This image type cannot be shared here. You can still share the product link.';
      return;
    }

    this.shareImageState = 'unavailable';
    this.sharePreparationFeedback = 'The product image could not be prepared for sharing. You can still share the product link.';
  }

  private clearPreparedShareImage(): void {
    this.shareImageRequest += 1;
    this.preparedShareImage = undefined;
    this.preparedShareImageSrc = '';
    this.shareImageState = 'unavailable';
    this.sharePreparationFeedback = '';
  }

  private formatPrice(price: number, currency: string): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }
}
