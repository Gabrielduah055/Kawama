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

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'needs_attention';

export type FulfillmentStatus =
  | 'awaiting_payment'
  | 'paid_awaiting_delivery'
  | 'processing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'needs_attention';

export type DeliveryFeeStatus = 'not_quoted' | 'quoted' | 'collected' | 'waived';

export interface CheckoutCustomer {
  readonly fullName: string;
  readonly email: string;
  readonly whatsappNumber: string;
  readonly deliveryAddress: string;
  readonly whatsappConsent: true;
}

export interface CheckoutRequestItem {
  readonly productId: string;
  readonly quantity: number;
}

export interface CheckoutSnapshotItem extends CheckoutRequestItem {
  readonly name?: string;
  readonly slug?: string;
  readonly image?: ProductImage;
  readonly unitPricePesewas?: number;
  readonly currency?: 'GHS';
}

export interface CheckoutCreateRequest {
  readonly customer: CheckoutCustomer;
  readonly orderNotes?: string;
  readonly items: readonly CheckoutRequestItem[];
}

export interface CheckoutPayment {
  readonly reference: string;
  readonly accessCode: string;
  readonly authorizationUrl: string;
}

export interface CheckoutSession {
  readonly created: boolean;
  readonly checkoutToken: string;
  readonly orderNumber: string;
  readonly paymentStatus: PaymentStatus;
  readonly fulfillmentStatus: FulfillmentStatus;
  readonly amountPesewas: number;
  readonly currency: 'GHS';
  readonly payment?: CheckoutPayment;
}

export interface CheckoutStatus {
  readonly orderNumber: string;
  readonly paymentStatus: PaymentStatus;
  readonly fulfillmentStatus: FulfillmentStatus;
  readonly deliveryFeeStatus: DeliveryFeeStatus;
  readonly amountPesewas: number;
  readonly currency: 'GHS';
  readonly receipt?: {
    readonly number?: string;
    readonly url?: string;
  };
}

interface CheckoutRecord {
  readonly version: 2;
  readonly idempotencyKey: string;
  readonly request: CheckoutCreateRequest;
  readonly cartSnapshot: readonly CheckoutSnapshotItem[];
  readonly expectedAmountPesewas: number;
  readonly createdAt: string;
  readonly session?: CheckoutSession;
  readonly lastStatus?: CheckoutStatus;
  readonly lastErrorCode?: string;
  readonly reconciled: boolean;
}

export interface PendingCheckout extends CheckoutRecord {
  readonly lifecycle: 'active';
}

export interface ResolvedCheckout extends CheckoutRecord {
  readonly lifecycle: 'resolved';
  readonly resolution: 'paid' | 'failed' | 'refunded';
  readonly resolvedAt: string;
}

export type CheckoutResultContext = PendingCheckout | ResolvedCheckout;
