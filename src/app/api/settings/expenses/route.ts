import { route, body } from '@/lib/server/api';
import { expenseConfig, updateExpenseSettings } from '@/lib/server/expenses';

export const GET = route({ pages: ['settings', 'expenses'] }, async () => expenseConfig());

/** Which vault pays expenses: ask each time, or always the USD / IQD vault. */
export const PUT = route({ pages: ['settings'] }, async ({ req, user }) => updateExpenseSettings(await body<{ vaultMode?: unknown }>(req), user));
