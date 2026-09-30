export interface StorefrontConfig {
  readonly businessName: string;
  readonly currencyCode: 'GHS';
  readonly locale: string;
  readonly whatsappNumber: string;
  readonly facebookUrl: string;
  readonly instagramUrl: string;
  readonly locationLabel: string;
}

export const STOREFRONT_CONFIG: StorefrontConfig = {
  businessName: 'Kawama',
  currencyCode: 'GHS',
  locale: 'en-GH',
  // Add the full international number without + or spaces before launch.
  whatsappNumber: '',
  facebookUrl: '',
  instagramUrl: '',
  locationLabel: 'Accra, Ghana',
};
