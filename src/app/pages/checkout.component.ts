import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CheckoutDetails, OrderDraft, OrderLine, Product } from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';
import { CartService } from '../services/cart.service';
import { CatalogRepository } from '../services/catalog.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingSpinnerComponent],
  templateUrl: './checkout.component.html',
})
export class CheckoutComponent implements OnInit {
  products: readonly Product[] = [];
  loading = true;
  loadError = false;
  submitted = false;
  readonly config = STOREFRONT_CONFIG;
  readonly checkoutForm;

  constructor(
    readonly cart: CartService,
    private readonly catalog: CatalogRepository,
    private readonly whatsapp: WhatsAppService,
    formBuilder: FormBuilder,
  ) {
    this.checkoutForm = formBuilder.nonNullable.group({
      customerName: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.pattern(/^[+0-9][0-9\s-]{7,19}$/)]],
      deliveryAddress: ['', [Validators.required, Validators.minLength(4)]],
      note: ['', [Validators.maxLength(300)]],
    });
  }

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
        const validIds = new Set(products.filter((product) => product.inStock).map((product) => product.id));
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

  checkout(): void {
    this.submitted = true;
    if (this.checkoutForm.invalid || !this.lines.length || !this.config.whatsappNumber) {
      this.checkoutForm.markAllAsTouched();
      return;
    }
    const customer: CheckoutDetails = this.checkoutForm.getRawValue();
    const order: OrderDraft = { lines: this.lines, customer, subtotal: this.subtotal };
    if (typeof window !== 'undefined') {
      window.open(this.whatsapp.buildUrl(order), '_blank', 'noopener,noreferrer');
    }
  }
}
