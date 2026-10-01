import { route } from '@/lib/server/api';
import { runRecurringExpenses } from '@/lib/server/expenses';

/** "Retry now" for rules flagged Due. */
export const POST = route({ pages: ['expenses'] }, async () => ({ posted: await runRecurringExpenses() }));
