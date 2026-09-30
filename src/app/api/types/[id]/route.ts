import { route, body } from '@/lib/server/api';
import { deleteType, saveType } from '@/lib/server/catalog';

export const PUT = route<{ id: string }>({ pages: ['settings'] }, async ({ req, user, params }) => {
  const r = await saveType(await body<{ name?: string }>(req), user, params.id);
  return { id: r.id, name: r.name };
});

export const DELETE = route<{ id: string }>({ pages: ['settings'] }, async ({ user, params }) => {
  await deleteType(params.id, user);
  return { ok: true };
});
