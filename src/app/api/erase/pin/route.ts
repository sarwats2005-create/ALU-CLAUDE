import { route, body } from '@/lib/server/api';
import { setErasePin } from '@/lib/server/erase';

/** Change the erase-mode PIN (only from inside erase mode). */
export const PUT = route({ owner: true, fail: 'err.save' }, async ({ req, user }) => setErasePin(user, (await body<{ pin?: unknown }>(req)).pin));
