import { route, body } from '@/lib/server/api';
import { listInventories, saveInventory, type InventoryInput } from '@/lib/server/inventories';

export const GET = route({ pages: ['inventory', 'pos', 'beneficiaries', 'reports'] }, async () => listInventories());

export const POST = route({ pages: ['inventory'] }, async ({ req, user }) =>
  saveInventory(await body<InventoryInput>(req), { id: user.id, name: user.name }),
);
