import { CartService } from './cart.service';

describe('CartService', () => {
  beforeEach(() => localStorage.clear());

  it('adds products and combines matching quantities', () => {
    const service = new CartService();
    service.add('prd-pan-01');
    service.add('prd-pan-01', 2);
    expect(service.items()).toEqual([{ productId: 'prd-pan-01', quantity: 3 }]);
    expect(service.itemCount()).toBe(3);
  });

  it('removes an item when its quantity reaches zero', () => {
    const service = new CartService();
    service.add('prd-pan-01');
    service.setQuantity('prd-pan-01', 0);
    expect(service.items()).toEqual([]);
  });

  it('restores a valid stored cart and ignores invalid data', () => {
    localStorage.setItem('kawama.cart.v1', JSON.stringify([{ productId: 'prd-bowl-02', quantity: 2 }]));
    expect(new CartService().itemCount()).toBe(2);

    localStorage.setItem('kawama.cart.v1', '{not valid');
    expect(new CartService().items()).toEqual([]);
  });
});

