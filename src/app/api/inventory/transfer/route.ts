import { route, body } from '@/lib/server/api';
import { transferStock, type TransferInput } from '@/lib/server/inventories';

export const POST = route({ pages: ['inventory'] }, async ({ req, user }) =>
  transferStock(await body<TransferInput>(req), { id: user.id, name: user.name }),
);