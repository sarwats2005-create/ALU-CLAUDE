import { route } from '@/lib/server/api';
import { deleteRule, toggleRule } from '@/lib/server/expenses';
import { prisma } from '@/lib/db';
import { notFound } from '@/lib/server/errors';
import { seesAll } from '@/lib/permissions';
import type { SessionUser } from '@/lib/server/auth';

/** Staff without "see everyone's activity" may only touch the recurring rules they created. */
async function guardRule(id: string, user: SessionUser) {
  if (seesAll(user, 'expenses')) return;
  const r = await prisma.recurringExpense.findUnique({ where: { id }, select: { createdById: true } });
  if (!r || r.createdById !== user.id) throw notFound();
}

/** Pause ↔ resume a recurring rule. */
export const PUT = route<{ id: string }>({ pages: ['expenses'] }, async ({ user, params }) => {
  await guardRule(params.id, user);
  return toggleRule(params.id, user);
});

/** Stop a rule for good (expenses it already posted stay). */
export const DELETE = route<{ id: string }>({ pages: ['expenses'], fail: 'err.delete' }, async ({ user, params }) => {
  await guardRule(params.id, user);
  await deleteRule(params.id, user);
  return { ok: true };
});
