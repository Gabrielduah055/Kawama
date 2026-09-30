import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { STOREFRONT_CONFIG } from './core/storefront.config';
import { CartService } from './services/cart.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  @ViewChild('shopMenu') private shopMenu?: ElementRef<HTMLElement>;
  @ViewChild('mobileMenu') private mobileMenu?: ElementRef<HTMLElement>;
  @ViewChild('menuButton') private menuButton?: ElementRef<HTMLButtonElement>;

  readonly config = STOREFRONT_CONFIG;
  readonly menuOpen = signal(false);
  readonly shopMenuOpen = signal(false);
  searchTerm = '';

  constructor(
    readonly cart: CartService,
    private readonly router: Router,
  ) {}

  submitSearch(): void {
    const query = this.searchTerm.trim();
    void this.router.navigate(['/shop'], {
      queryParams: query ? { q: query } : {},
    });
    this.menuOpen.set(false);
    this.shopMenuOpen.set(false);
  }

  toggleShopMenu(event: Event): void {
    event.stopPropagation();
    this.shopMenuOpen.update((open) => !open);
  }

  toggleMobileMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
    this.shopMenuOpen.set(false);
  }

  closeMenus(): void {
    this.menuOpen.set(false);
    this.shopMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.shopMenuOpen() && !this.shopMenu?.nativeElement.contains(target)) {
      this.shopMenuOpen.set(false);
    }
    if (
      this.menuOpen() &&
      !this.mobileMenu?.nativeElement.contains(target) &&
      !this.menuButton?.nativeElement.contains(target)
    ) {
      this.menuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
  }
}
