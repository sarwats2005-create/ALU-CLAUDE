import { route, body } from '@/lib/server/api';
import { payInventoryRent, setInventoryRent } from '@/lib/server/inventories';

export const PUT = route<{ id: string }>({ pages: ['inventory'] }, async ({ params, req, user }) =>
  setInventoryRent(params.id, await body(req), user),
);

export const POST = route<{ id: string }>({ pages: ['inventory'] }, async ({ params, req, user }) =>
  payInventoryRent(params.id, await body(req), user),
);
