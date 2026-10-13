export const apiEndpoints = {
  products: '/products',
  productDetail: '/products/:slug',
  categories: '/categories',
  productReviews: '/products/:productId/reviews',
} as const;

export const externalEndpoints = {
  whatsappChat: 'https://wa.me/:number',
} as const;
