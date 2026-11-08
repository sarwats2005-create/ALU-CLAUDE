import { route } from '@/lib/server/api';
import { restoreUser } from '@/lib/server/catalog';

export const POST = route<{ id: string }>({ owner: true, fail: 'err.save' }, async ({ user, params }) => restoreUser(params.id, user));
