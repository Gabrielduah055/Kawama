import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderLine, Product } from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';
import { CartService } from '../services/cart.service';
import { CatalogRepository } from '../services/catalog.service';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent],
  templateUrl: './cart.component.html',
})
export class CartComponent implements OnInit {
  products: readonly Product[] = [];
  loading = true;
  loadError = false;
  readonly config = STOREFRONT_CONFIG;

  constructor(readonly cart: CartService, private readonly catalog: CatalogRepository) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = false;
    this.catalog.getProducts().subscribe({
      next: (products) => {
        this.products = products;
        this.loading = false;
        const validIds = new Set(products.map((product) => product.id));
        this.cart.items().filter((item) => !validIds.has(item.productId)).forEach((item) => this.cart.remove(item.productId));
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  get lines(): readonly OrderLine[] {
    return this.cart.items().flatMap((item) => {
      const product = this.products.find((candidate) => candidate.id === item.productId);
      return product ? [{ product, quantity: item.quantity }] : [];
    });
  }

  get subtotal(): number {
    return this.lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  }

  adjust(line: OrderLine, delta: number): void {
    this.cart.setQuantity(line.product.id, line.quantity + delta);
  }
}
