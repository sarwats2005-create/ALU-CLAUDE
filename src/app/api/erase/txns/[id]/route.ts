import { route } from '@/lib/server/api';
import { eraseTxn } from '@/lib/server/erase';

/** Erase one transaction for good, with every effect it had (erase mode only). */
export const DELETE = route<{ id: string }>({ owner: true, fail: 'err.delete' }, async ({ user, params }) => eraseTxn(user, params.id));
