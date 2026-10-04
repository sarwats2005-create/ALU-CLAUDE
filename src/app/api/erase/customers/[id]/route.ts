import { route } from '@/lib/server/api';
import { eraseCustomer } from '@/lib/server/erase';

/** Erase a customer account and all of its transactions (erase mode only). */
export const DELETE = route<{ id: string }>({ owner: true, fail: 'err.delete' }, async ({ user, params }) => eraseCustomer(user, params.id));
