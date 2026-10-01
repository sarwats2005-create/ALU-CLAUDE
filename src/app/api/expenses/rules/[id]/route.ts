import { route } from '@/lib/server/api';
import { deleteRule, toggleRule } from '@/lib/server/expenses';

/** Pause ↔ resume a recurring rule. */
export const PUT = route<{ id: string }>({ pages: ['expenses'] }, async ({ user, params }) => toggleRule(params.id, user));

/** Stop a rule for good (expenses it already posted stay). */
export const DELETE = route<{ id: string }>({ pages: ['expenses'], fail: 'err.delete' }, async ({ user, params }) => {
  await deleteRule(params.id, user);
  return { ok: true };
});
