import { route, body } from '@/lib/server/api';
import { saveSale, type SaleInput } from '@/lib/server/txns';

export const PUT = route<{ id: string }>({ pages: ['pos'], fail: 'err.update' }, async ({ req, user, params }) => saveSale(await body<SaleInput>(req), user, params.id));
