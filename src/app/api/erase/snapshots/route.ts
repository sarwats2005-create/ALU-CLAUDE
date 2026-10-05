import { route } from '@/lib/server/api';
import { eraseSnapshots } from '@/lib/server/erase';

/** Erase mode: delete every restore point from the database. */
export const DELETE = route({ owner: true, fail: 'err.delete' }, async ({ user }) => eraseSnapshots(user));
