import { CommonModule } from '@angular/common';
import { Component, Input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product } from '../core/store.models';
import { CartService } from '../services/cart.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './product-card.component.html',
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  readonly added = signal(false);

  constructor(private readonly cart: CartService) {}

  addToCart(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.product.inStock) return;
    this.cart.add(this.product.id);
    this.added.set(true);
    window.setTimeout(() => this.added.set(false), 1400);
  }
}
