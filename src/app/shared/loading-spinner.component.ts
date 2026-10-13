import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  template: `
    <section class="loading-state" role="status" aria-live="polite">
      <i class="uil uil-spinner-alt" aria-hidden="true"></i>
      <p>{{ label() }}</p>
    </section>
  `,
})
export class LoadingSpinnerComponent {
  readonly label = input('Loading...');
}
