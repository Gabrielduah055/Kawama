import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home.component';
import { ProductDetailComponent } from './pages/product-detail.component';
import { CartComponent } from './pages/cart.component';
import { ReviewComponent } from './pages/review.component';
import { NotFoundComponent } from './pages/not-found.component';
import { ShopComponent } from './pages/shop.component';
import { CheckoutComponent } from './pages/checkout.component';
import { ContactComponent } from './pages/contact.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'Kawama | Kitchenware for everyday homes' },
  { path: 'shop', component: ShopComponent, title: 'Shop kitchenware | Kawama' },
  { path: 'product/:slug', component: ProductDetailComponent, title: 'Product | Kawama' },
  { path: 'cart', component: CartComponent, title: 'Your cart | Kawama' },
  { path: 'checkout', component: CheckoutComponent, title: 'Checkout | Kawama' },
  { path: 'contact', component: ContactComponent, title: 'Contact | Kawama' },
  { path: 'review/:slug', component: ReviewComponent, title: 'Write a review | Kawama' },
  { path: '**', component: NotFoundComponent, title: 'Page not found | Kawama' },
];
