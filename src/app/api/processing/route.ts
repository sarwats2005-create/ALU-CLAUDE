import { route, body } from '@/lib/server/api';
import { saveProcessing, type ProcessingInput } from '@/lib/server/txns';

export const POST = route({ pages: ['inventory'], fail: 'err.save' }, async ({ req, user }) => saveProcessing(await body<ProcessingInput>(req), user));
