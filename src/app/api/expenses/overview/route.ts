import { route } from '@/lib/server/api';
import { seesAll } from '@/lib/permissions';
import { expenseStats } from '@/lib/server/q/expenses';
import { expenseConfig, listCategories, listRules, runRecurringExpenses } from '@/lib/server/expenses';

/** Everything around the expense list. Due recurring expenses are posted first, so the page is current. */
export const GET = route({ pages: ['expenses'] }, async ({ user }) => {
  let posted = 0;
  try {
    posted = await runRecurringExpenses();
  } catch (e) {
    console.error('[recurring]', e);
  }
  // Staff without "see everyone's activity" see only their own expenses and recurring rules.
  const own = !seesAll(user, 'expenses') ? user.id : undefined;
  const [stats, allRules, categories, config] = await Promise.all([
    expenseStats(own ? { createdById: own } : user.isOwner ? { vaultOwner: null } : {}),
    listRules(),
    listCategories(),
    expenseConfig(),
  ]);
  const rules = own ? allRules.filter((r) => r.createdById === own) : allRules;
  return { posted, stats, rules, categories, config };
});
