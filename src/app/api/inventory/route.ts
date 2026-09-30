import { route, listParams } from '@/lib/server/api';
import { listInventory } from '@/lib/server/q/inventory';

export const GET = route({ pages: ['inventory'] }, async ({ url }) => {
  const p = listParams(url, ['name', 'sku', 'type', 'raw', 'finished', 'value'], 'name', 'asc');
  return listInventory({ ...p, typeId: url.searchParams.get('typeId') || undefined, status: url.searchParams.get('status') || undefined });
});
