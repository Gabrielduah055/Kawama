export const apiEndpoints = {
  products: '/products',
  productDetail: '/products/:slug',
  categories: '/categories',
  productReviews: '/products/:productId/reviews',
  checkoutSessions: '/checkout/sessions',
  checkoutStatus: '/checkout/sessions/:checkoutToken',
  shoppingChat: '/ai/chat',
} as const;

export const externalEndpoints = {
  whatsappChat: 'https://wa.me/:number',
} as const;
