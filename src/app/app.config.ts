import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { CatalogRepository, CatalogService } from './services/catalog.service';
import { ReviewRepository, ReviewService } from './services/review.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' })),
    { provide: CatalogRepository, useExisting: CatalogService },
    { provide: ReviewRepository, useExisting: ReviewService },
  ]
};
