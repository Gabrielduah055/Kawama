export interface ProductImage {
  readonly src: string;
  readonly alt: string;
}

export interface Product {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly category: string;
  readonly categorySlug?: string;
  readonly shortDescription: string;
  readonly description: string;
  readonly price: number;
  readonly compareAtPrice?: number;
  readonly currency: 'GHS';
  readonly images: readonly ProductImage[];
  readonly inStock: boolean;
  readonly stockLevel?: 'in_stock' | 'low_stock' | 'out_of_stock';
  readonly featured: boolean;
  readonly isNew?: boolean;
  readonly isBestSeller?: boolean;
  readonly complementaryCategories: readonly string[];
  readonly details: readonly string[];
  readonly specifications?: readonly ProductSpecification[];
}

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly image?: ProductImage;
  readonly displayOrder: number;
}

export interface ProductSpecification {
  readonly label: string;
  readonly value: string;
}

export interface Review {
  readonly id: string;
  readonly productId: string;
  readonly reviewerName: string;
  readonly rating: number;
  readonly comment: string;
  readonly createdAt: string;
}

export interface ReviewSummary {
  readonly average: number;
  readonly count: number;
}

export interface ReviewSubmission {
  readonly id: string;
  readonly status: 'pending';
}

export interface CartItem {
  readonly productId: string;
  readonly quantity: number;
}

export interface CheckoutDetails {
  readonly customerName: string;
  readonly phone: string;
  readonly deliveryAddress: string;
  readonly note?: string;
}

export interface OrderLine {
  readonly product: Product;
  readonly quantity: number;
}

export interface OrderDraft {
  readonly lines: readonly OrderLine[];
  readonly customer: CheckoutDetails;
  readonly subtotal: number;
}
