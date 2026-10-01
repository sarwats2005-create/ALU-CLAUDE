import { route } from '@/lib/server/api';
import { expenseStats } from '@/lib/server/q/expenses';
import { expenseConfig, listCategories, listRules, runRecurringExpenses } from '@/lib/server/expenses';

/** Everything around the expense list. Due recurring expenses are posted first, so the page is current. */
export const GET = route({ pages: ['expenses'] }, async () => {
  let posted = 0;
  try {
    posted = await runRecurringExpenses();
  } catch (e) {
    console.error('[recurring]', e);
  }
  const [stats, rules, categories, config] = await Promise.all([expenseStats(), listRules(), listCategories(), expenseConfig()]);
  return { posted, stats, rules, categories, config };
});
