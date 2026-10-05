import { route } from '@/lib/server/api';
import { eraseSnapshots } from '@/lib/server/erase';

/** Erase mode: delete one restore point from the database. */
export const DELETE = route<{ id: string }>({ owner: true, fail: 'err.delete' }, async ({ user, params }) => eraseSnapshots(user, params.id));
