import { Review } from '../core/store.models';

export const SAMPLE_REVIEWS: readonly Review[] = [
  {
    id: 'review-001',
    productId: 'prd-pan-01',
    reviewerName: 'Ama K.',
    rating: 5,
    comment: 'It heats evenly and cleans up quickly. The handle also feels very secure.',
    createdAt: '2026-07-12T10:00:00.000Z',
  },
  {
    id: 'review-002',
    productId: 'prd-pan-01',
    reviewerName: 'Esi N.',
    rating: 4,
    comment: 'A useful everyday size and the nonstick surface has been reliable so far.',
    createdAt: '2026-08-03T14:30:00.000Z',
  },
  {
    id: 'review-003',
    productId: 'prd-bowl-02',
    reviewerName: 'Adwoa S.',
    rating: 5,
    comment: 'The sizes are practical and the colour looks beautiful on the table.',
    createdAt: '2026-08-20T09:15:00.000Z',
  },
  {
    id: 'review-004',
    productId: 'prd-knife-03',
    reviewerName: 'Kojo A.',
    rating: 4,
    comment: 'A tidy set with the knives I use most. The block does not take much space.',
    createdAt: '2026-06-28T16:45:00.000Z',
  },
  {
    id: 'review-005',
    productId: 'prd-fryer-04',
    reviewerName: 'Naa D.',
    rating: 5,
    comment: 'Simple controls, quick results, and a good size for two people.',
    createdAt: '2026-08-29T18:20:00.000Z',
  },
  {
    id: 'review-006',
    productId: 'prd-spice-05',
    reviewerName: 'Akosua B.',
    rating: 4,
    comment: 'My spice shelf is much easier to use now. The lids close firmly.',
    createdAt: '2026-07-31T11:05:00.000Z',
  },
];
