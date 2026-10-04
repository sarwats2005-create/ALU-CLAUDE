import { route } from '@/lib/server/api';
import { eraseVoided } from '@/lib/server/erase';

/** Erase every voided (deleted) transaction that is still kept in history (erase mode only). */
export const DELETE = route({ owner: true, fail: 'err.delete' }, async ({ user }) => eraseVoided(user));
