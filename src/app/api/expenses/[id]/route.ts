import { route, body } from '@/lib/server/api';
import { saveExpense, type ExpenseInput } from '@/lib/server/expenses';

/** Edit an expense (no PIN — the PIN only guards creating new expenses). Delete goes through /api/txns/:id. */
export const PUT = route<{ id: string }>({ pages: ['expenses'], fail: 'err.update' }, async ({ req, user, params }) => {
  const b = await body<ExpenseInput>(req);
  return saveExpense({ ...b, recurring: false }, user, params.id);
});
