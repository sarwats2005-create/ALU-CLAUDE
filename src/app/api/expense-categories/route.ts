import { route, body } from '@/lib/server/api';
import { listCategories, saveCategory, type CategoryInput } from '@/lib/server/expenses';

export const GET = route({ pages: ['settings', 'expenses'] }, async () => listCategories());

/** Categories are managed in Settings → Expenses. */
export const POST = route({ pages: ['settings'] }, async ({ req, user }) => {
  const c = await saveCategory(await body<CategoryInput>(req), user);
  return { id: c.id, name: c.name };
});
