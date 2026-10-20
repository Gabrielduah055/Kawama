import { OrderDraft } from '../core/store.models';
import { SAMPLE_PRODUCTS } from '../data/sample-products';
import { WhatsAppService } from './whatsapp.service';

describe('WhatsAppService', () => {
  const service = new WhatsAppService();
  const order: OrderDraft = {
    lines: [
      { product: SAMPLE_PRODUCTS[0], quantity: 2 },
      { product: SAMPLE_PRODUCTS[1], quantity: 1 },
    ],
    customer: {
      customerName: 'Ama Mensah',
      phone: '024 000 0000',
      deliveryAddress: 'Osu, Accra',
      note: 'Call on arrival',
    },
    subtotal: SAMPLE_PRODUCTS[0].price * 2 + SAMPLE_PRODUCTS[1].price,
  };

  it('includes every order line, customer detail, and subtotal', () => {
    const message = service.buildMessage(order);
    expect(message).toContain('2 x GH₵289.00 = GH₵578.00');
    expect(message).toContain('1 x GH₵245.00 = GH₵245.00');
    expect(message).toContain('Subtotal: GH₵823.00');
    expect(message).toContain('Name: Ama Mensah');
    expect(message).toContain('Delivery area/address: Osu, Accra');
    expect(message).toContain('Notes: Call on arrival');
    expect(message).toContain('Please confirm availability and the delivery charge in this chat.');
  });

  it('encodes the full message in the WhatsApp URL', () => {
    const url = new URL(service.buildUrl(order));
    expect(url.hostname).toBe('wa.me');
    expect(url.searchParams.get('text')).toBe(service.buildMessage(order));
  });

  it('builds an exact single-item order summary without optional notes', () => {
    const singleItemOrder: OrderDraft = {
      lines: [{ product: SAMPLE_PRODUCTS[2], quantity: 1 }],
      customer: {
        customerName: 'Kojo Asare',
        phone: '+233 24 111 2233',
        deliveryAddress: 'East Legon, Accra',
      },
      subtotal: SAMPLE_PRODUCTS[2].price,
    };

    expect(service.buildMessage(singleItemOrder)).toBe(
      [
        'Hello Kawama, I would like to place this order:',
        '',
        '1. Forge 7pc Knife Set',
        '   1 x GH₵499.00 = GH₵499.00',
        '',
        'Subtotal: GH₵499.00',
        '',
        'Customer details',
        'Name: Kojo Asare',
        'Phone: +233 24 111 2233',
        'Delivery area/address: East Legon, Accra',
        '',
        'Please confirm availability and the delivery charge in this chat.',
      ].join('\n'),
    );
  });

  it('formats decimal product money with exactly two digits', () => {
    const decimalOrder: OrderDraft = {
      ...order,
      lines: [{ product: { ...SAMPLE_PRODUCTS[0], price: 12.35 }, quantity: 3 }],
      subtotal: 37.05,
    };

    expect(service.buildMessage(decimalOrder)).toContain('3 x GH₵12.35 = GH₵37.05');
    expect(service.buildMessage(decimalOrder)).toContain('Subtotal: GH₵37.05');
  });
});
