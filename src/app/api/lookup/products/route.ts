import { route } from '@/lib/server/api';
import { lookupProducts } from '@/lib/server/q/inventory';

/** Product picker source: name, SKU, type and kg available per stock state. */
export const GET = route({ pages: ['pos', 'beneficiaries', 'inventory', 'reports', 'settings'] }, async ({ url }) => {
  return lookupProducts((url.searchParams.get('q') ?? '').trim().slice(0, 100), {
    inStockOnly: url.searchParams.get('inStock') === '1',
    limit: 30,
    ids: (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 60),
  });
});
