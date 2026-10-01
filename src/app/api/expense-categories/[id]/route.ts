import { route, body } from '@/lib/server/api';
import { deleteCategory, saveCategory, type CategoryInput } from '@/lib/server/expenses';

export const PUT = route<{ id: string }>({ pages: ['settings'] }, async ({ req, user, params }) => {
  const c = await saveCategory(await body<CategoryInput>(req), user, params.id);
  return { id: c.id, name: c.name };
});

export const DELETE = route<{ id: string }>({ pages: ['settings'], fail: 'err.delete' }, async ({ user, params }) => {
  await deleteCategory(params.id, user);
  return { ok: true };
});
