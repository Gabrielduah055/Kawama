import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="not-found page-shell">
      <div>
        <p class="detail-category">Page not found</p>
        <h1 class="page-title">This part of the kitchen is empty.</h1>
        <p class="text-[15px]! font-medium! leading-7! sm:text-base!">The page may have moved, but the Kawama collection is still ready to browse.</p>
        <a class="button button-dark" routerLink="/">Return to the shop</a>
      </div>
    </section>
  `,
})
export class NotFoundComponent {}
