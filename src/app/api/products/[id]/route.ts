import { route, body } from '@/lib/server/api';
import { deleteProduct, saveProduct, type ProductInput } from '@/lib/server/catalog';

export const PUT = route<{ id: string }>({ pages: ['settings', 'inventory'] }, async ({ req, user, params }) => {
  const p = await saveProduct(await body<ProductInput>(req), user, params.id);
  return { id: p.id, name: p.name, sku: p.sku };
});

export const DELETE = route<{ id: string }>({ pages: ['settings'] }, async ({ user, params }) => {
  await deleteProduct(params.id, user);
  return { ok: true };
});
