import { route } from '@/lib/server/api';
import { productHistory } from '@/lib/server/q/inventory';

export const GET = route<{ id: string }>({ pages: ['inventory', 'pos', 'beneficiaries'] }, async ({ params, url }) =>
  productHistory(params.id, url.searchParams.get('inventoryId') || undefined),
);
