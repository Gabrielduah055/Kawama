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
    expect(message).toContain('2 x GH₵289 = GH₵578');
    expect(message).toContain('1 x GH₵245 = GH₵245');
    expect(message).toContain('Subtotal: GH₵823');
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
});
