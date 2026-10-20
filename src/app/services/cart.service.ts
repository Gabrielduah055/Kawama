import { computed, Injectable, signal } from '@angular/core';
import { CartItem } from '../core/store.models';

const CART_STORAGE_KEY = 'kawama.cart.v1';
const RECONCILED_CHECKOUTS_STORAGE_KEY = 'kawama.cart.reconciled.v1';
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

  reconcilePurchasedItems(checkoutToken: string, purchasedItems: readonly CartItem[]): boolean {
    if (!checkoutToken || this.reconciledCheckoutTokens().has(checkoutToken)) return false;

    const purchasedQuantities = new Map(purchasedItems.map((item) => [item.productId, item.quantity]));
    const next = this.itemsState().flatMap((item) => {
      const remaining = item.quantity - (purchasedQuantities.get(item.productId) ?? 0);
      return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
    });
    this.update(next);
    this.recordReconciledCheckout(checkoutToken);
    return true;
  }

  private update(items: readonly CartItem[]): void {
    this.itemsState.set(items);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The cart remains usable in memory when storage is unavailable.
    }
  }

  private readStoredCart(): readonly CartItem[] {
    if (typeof localStorage === 'undefined') return [];
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

  private reconciledCheckoutTokens(): ReadonlySet<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(RECONCILED_CHECKOUTS_STORAGE_KEY) ?? '[]');
      return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []);
    } catch {
      return new Set();
    }
  }

  private recordReconciledCheckout(checkoutToken: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const tokens = [...this.reconciledCheckoutTokens(), checkoutToken].slice(-50);
      localStorage.setItem(RECONCILED_CHECKOUTS_STORAGE_KEY, JSON.stringify(tokens));
    } catch {
      // The cart is already reconciled in memory if storage becomes unavailable.
    }
  }
}

