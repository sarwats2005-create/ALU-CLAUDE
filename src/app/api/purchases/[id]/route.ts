import { route, body } from '@/lib/server/api';
import { savePurchase, type PurchaseInput } from '@/lib/server/txns';

export const PUT = route<{ id: string }>({ pages: ['beneficiaries'], fail: 'err.update' }, async ({ req, user, params }) =>
  savePurchase(await body<PurchaseInput>(req), user, params.id),
);
