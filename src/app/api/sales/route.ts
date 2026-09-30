import { route, body } from '@/lib/server/api';
import { saveSale, type SaleInput } from '@/lib/server/txns';

/** Record a sale. Totals, COGS and balances are computed on the server; the client total is only compared. */
export const POST = route({ pages: ['pos'], fail: 'err.save' }, async ({ req, user }) => saveSale(await body<SaleInput>(req), user));
