import { route, body } from '@/lib/server/api';
import { deleteInventory, getInventory, saveInventory, type InventoryInput } from '@/lib/server/inventories';

export const GET = route<{ id: string }>({ pages: ['inventory', 'pos', 'beneficiaries'] }, async ({ params }) => getInventory(params.id));

export const PUT = route<{ id: string }>({ pages: ['inventory'] }, async ({ params, req, user }) =>
  saveInventory(await body<InventoryInput>(req), user, params.id),
);

export const DELETE = route<{ id: string }>({ pages: ['inventory'] }, async ({ params, user }) => {
  await deleteInventory(params.id, user);
  return { ok: true };
});
