import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { cedisToPesewas, orderLinesTotalPesewas, pesewasToCedis } from '../core/money';
import { CartItem, OrderLine, Product } from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';
import { CartService } from '../services/cart.service';
import { CatalogRepository } from '../services/catalog.service';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';
import { PaymentCheckoutComponent } from '../shared/payment-checkout.component';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent, PaymentCheckoutComponent],
  templateUrl: './cart.component.html',
})
export class CartComponent implements OnInit {
  products: readonly Product[] = [];
  loading = true;
  loadError = false;
  readonly config = STOREFRONT_CONFIG;
  readonly pesewasToCedis = pesewasToCedis;

  constructor(
    readonly cart: CartService,
    private readonly catalog: CatalogRepository,
  ) {}

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

  get checkoutLines(): readonly OrderLine[] {
    return this.lines.filter((line) => line.product.inStock);
  }

  get missingItems(): readonly CartItem[] {
    const productIds = new Set(this.products.map((product) => product.id));
    return this.cart.items().filter((item) => !productIds.has(item.productId));
  }

  get blockedItemCount(): number {
    return this.missingItems.length + this.lines.filter((line) => !line.product.inStock).length;
  }

  get subtotalPesewas(): number {
    return orderLinesTotalPesewas(this.checkoutLines);
  }

  adjust(line: OrderLine, delta: number): void {
    this.cart.setQuantity(line.product.id, line.quantity + delta);
  }

  lineTotal(line: OrderLine): number {
    return pesewasToCedis(cedisToPesewas(line.product.price) * line.quantity);
  }
}
