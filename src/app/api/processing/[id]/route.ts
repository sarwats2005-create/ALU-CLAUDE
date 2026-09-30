import { route, body } from '@/lib/server/api';
import { saveProcessing, type ProcessingInput } from '@/lib/server/txns';

export const PUT = route<{ id: string }>({ pages: ['inventory'], fail: 'err.update' }, async ({ req, user, params }) =>
  saveProcessing(await body<ProcessingInput>(req), user, params.id),
);
