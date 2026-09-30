import { ReviewService } from './review.service';

describe('ReviewService', () => {
  beforeEach(() => localStorage.clear());

  it('aggregates seeded product reviews', () => {
    const service = new ReviewService();
    expect(service.summaryFor('prd-pan-01')).toEqual({ average: 4.5, count: 2 });
  });

  it('stores and includes a submitted review', () => {
    const service = new ReviewService();
    service.submit({ productId: 'prd-bowl-02', reviewerName: 'Yaw M.', rating: 4, comment: 'Useful sizes and easy to clean.' }).subscribe();
    const summary = service.summaryFor('prd-bowl-02');
    expect(summary.count).toBe(2);
    expect(service.forProduct('prd-bowl-02')[0].reviewerName).toBe('Yaw M.');
  });
});

