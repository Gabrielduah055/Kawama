import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  templateUrl: './checkout.component.html',
})
export class CheckoutComponent implements OnInit {
  constructor(private readonly router: Router) {}

  ngOnInit(): void {
    void this.router.navigate(['/cart'], { fragment: 'cart-checkout', replaceUrl: true });
  }
}
