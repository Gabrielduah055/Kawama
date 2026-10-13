import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { resolveEndpoint } from '../core/endpoint';
import { OrderDraft } from '../core/store.models';
import { STOREFRONT_CONFIG } from '../core/storefront.config';

@Injectable({ providedIn: 'root' })
export class WhatsAppService {
  buildMessage(order: OrderDraft): string {
    const lines = order.lines.map(
      (line, index) =>
        `${index + 1}. ${line.product.name}\n   ${line.quantity} x ${this.money(line.product.price)} = ${this.money(line.product.price * line.quantity)}`,
    );
    return [
      `Hello ${STOREFRONT_CONFIG.businessName}, I would like to place this order:`,
      '',
      ...lines,
      '',
      `Subtotal: ${this.money(order.subtotal)}`,
      '',
      'Customer details',
      `Name: ${order.customer.customerName}`,
      `Phone: ${order.customer.phone}`,
      `Delivery area/address: ${order.customer.deliveryAddress}`,
      ...(order.customer.note ? [`Notes: ${order.customer.note}`] : []),
      '',
      'Please confirm availability and the delivery charge in this chat.',
    ].join('\n');
  }

  buildUrl(order: OrderDraft): string {
    const number = STOREFRONT_CONFIG.whatsappNumber.replace(/\D/g, '');
    const target = resolveEndpoint(environment.externalEndpoints.whatsappChat, { number });
    return `${target}?text=${encodeURIComponent(this.buildMessage(order))}`;
  }

  private money(value: number): string {
    return new Intl.NumberFormat(STOREFRONT_CONFIG.locale, {
      style: 'currency',
      currency: STOREFRONT_CONFIG.currencyCode,
      minimumFractionDigits: 0,
    }).format(value);
  }
}

