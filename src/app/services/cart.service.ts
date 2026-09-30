import { computed, Injectable, signal } from '@angular/core';
import { CartItem } from '../core/store.models';

const CART_STORAGE_KEY = 'kawama.cart.v1';
const MAX_QUANTITY = 20;

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly itemsState = signal<readonly CartItem[]>(this.readStoredCart());

  readonly items = this.itemsState.asReadonly();
  readonly itemCount = computed(() => this.itemsState().reduce((total, item) => total + item.quantity, 0));

  add(productId: string, quantity = 1): void {
    if (!productId || !Number.isInteger(quantity) || quantity < 1) return;
    const existing = this.itemsState().find((item) => item.productId === productId);
    const next = existing
      ? this.itemsState().map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.min(item.quantity + quantity, MAX_QUANTITY) }
            : item,
        )
      : [...this.itemsState(), { productId, quantity: Math.min(quantity, MAX_QUANTITY) }];
    this.update(next);
  }

  setQuantity(productId: string, quantity: number): void {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.remove(productId);
      return;
    }
    const normalized = Math.min(Math.max(Math.trunc(quantity), 1), MAX_QUANTITY);
    this.update(
      this.itemsState().map((item) => (item.productId === productId ? { ...item, quantity: normalized } : item)),
    );
  }

  remove(productId: string): void {
    this.update(this.itemsState().filter((item) => item.productId !== productId));
  }

  clear(): void {
    this.update([]);
  }

  private update(items: readonly CartItem[]): void {
    this.itemsState.set(items);
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The cart remains usable in memory when storage is unavailable.
    }
  }

  private readStoredCart(): readonly CartItem[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (item): item is CartItem =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as CartItem).productId === 'string' &&
            Number.isInteger((item as CartItem).quantity) &&
            (item as CartItem).quantity > 0,
        )
        .map((item) => ({ ...item, quantity: Math.min(item.quantity, MAX_QUANTITY) }));
    } catch {
      return [];
    }
  }
}

