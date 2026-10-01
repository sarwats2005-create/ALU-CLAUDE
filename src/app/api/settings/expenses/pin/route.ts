import { route, body } from '@/lib/server/api';
import { setExpensePin } from '@/lib/server/expenses';

/** Set (4–8 digits) or remove (empty) the PIN needed to record new expenses. Owner only. */
export const PUT = route({ owner: true }, async ({ req, user }) => setExpensePin(await body<{ pin?: unknown }>(req), user));
