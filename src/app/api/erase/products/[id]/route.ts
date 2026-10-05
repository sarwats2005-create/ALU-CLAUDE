import { route } from '@/lib/server/api';
import { eraseProductHistory } from '@/lib/server/erase';

/** Erase mode: remove every transaction in this product's stock history (the product stays). */
export const DELETE = route<{ id: string }>({ owner: true, fail: 'err.delete' }, async ({ user, params }) => eraseProductHistory(user, params.id));
