import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Category, Product } from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';
import { CatalogRepository } from '../services/catalog.service';
import { LoadingSpinnerComponent } from '../shared/loading-spinner.component';
import { ProductCardComponent } from '../shared/product-card.component';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent, LoadingSpinnerComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  products: readonly Product[] = [];
  categories: readonly Category[] = [];
  loading = true;
  loadError = false;
  readonly config = STOREFRONT_CONFIG;

  constructor(private readonly catalogRepository: CatalogRepository) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = false;
    forkJoin({
      products: this.catalogRepository.getProducts(),
      categories: this.catalogRepository.getCategories(),
    }).subscribe({
      next: ({ products, categories }) => {
        this.products = products;
        this.categories = categories;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  get featuredProducts(): readonly Product[] {
    return this.products.filter((product) => product.featured && product.inStock).slice(0, 4);
  }

  get exploreProducts(): readonly Product[] {
    const featuredIds = new Set(this.featuredProducts.map((product) => product.id));
    return this.products.filter((product) => product.inStock && !featuredIds.has(product.id)).slice(0, 4);
  }
}
