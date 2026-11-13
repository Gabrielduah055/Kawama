import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WhatsAppService } from '../services/whatsapp.service';

@Component({
  standalone: true,
  imports: [RouterLink],
  templateUrl: './whatsapp-checkout-result.component.html',
})
export class WhatsAppCheckoutResultComponent {
  readonly whatsappUrl: string | undefined;

  constructor(whatsapp: WhatsAppService) {
    this.whatsappUrl = whatsapp.buildPaymentStatusCheckUrl();
  }
}
