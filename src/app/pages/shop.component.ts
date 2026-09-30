import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product } from '../core/store.models';
import { CatalogRepository, CatalogService } from '../services/catalog.service';
import { ProductCardComponent } from '../shared/product-card.component';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProductCardComponent],
  templateUrl: './shop.component.html',
})
export class ShopComponent implements OnInit {
  products: readonly Product[] = [];
  searchQuery = '';
  activeCategory = 'All';
  sortBy: 'featured' | 'name' | 'price-low' | 'price-high' = 'featured';
  readonly filtersOpen = signal(false);

  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly catalogService: CatalogService,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.catalogRepository.getProducts().subscribe((products) => {
      this.products = products;
    });
    this.route.queryParamMap.subscribe((params) => {
      this.searchQuery = params.get('q')?.trim() ?? '';
      this.activeCategory = params.get('category')?.trim() || 'All';
    });
  }

  get categories(): readonly string[] {
    return ['All', ...new Set(this.products.map((product) => product.category))];
  }

  get filteredProducts(): readonly Product[] {
    const products = [...this.catalogService.search(this.products, this.searchQuery, this.activeCategory)];
    if (this.sortBy === 'name') return products.sort((a, b) => a.name.localeCompare(b.name));
    if (this.sortBy === 'price-low') return products.sort((a, b) => a.price - b.price);
    if (this.sortBy === 'price-high') return products.sort((a, b) => b.price - a.price);
    return products.sort((a, b) => Number(b.featured) - Number(a.featured));
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.activeCategory = 'All';
    this.sortBy = 'featured';
  }
}
