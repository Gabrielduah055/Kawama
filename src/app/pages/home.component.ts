import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product } from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';
import { CatalogRepository } from '../services/catalog.service';
import { ProductCardComponent } from '../shared/product-card.component';

interface CategoryCard {
  readonly name: string;
  readonly image: string;
  readonly alt: string;
  readonly category: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  products: readonly Product[] = [];
  readonly config = STOREFRONT_CONFIG;

  readonly categoryCards: readonly CategoryCard[] = [
    { name: 'Cookware', category: 'Cookware', image: '/images/kawama-category-cookware-black.png', alt: 'Black cookware set in a bright kitchen' },
    { name: 'Appliances', category: 'Appliances', image: '/images/kawama-air-fryer-wide.png', alt: 'Black digital air fryer on a kitchen counter' },
    { name: 'Kitchen Tools', category: 'Kitchen Tools', image: '/images/kawama-category-tools.png', alt: 'Black and wooden kitchen utensils in a holder' },
    { name: 'Storage', category: 'Storage', image: '/images/kawama-category-storage.png', alt: 'Clear pantry containers with bamboo lids' },
  ];

  constructor(private readonly catalogRepository: CatalogRepository) {}

  ngOnInit(): void {
    this.catalogRepository.getProducts().subscribe((products) => {
      this.products = products;
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
