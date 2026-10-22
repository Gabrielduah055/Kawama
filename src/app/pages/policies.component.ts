import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STOREFRONT_CONFIG } from '../core/storefront.config';

@Component({
  standalone: true,
  imports: [RouterLink],
  templateUrl: './policies.component.html',
})
export class PoliciesComponent {
  readonly config = STOREFRONT_CONFIG;
}
