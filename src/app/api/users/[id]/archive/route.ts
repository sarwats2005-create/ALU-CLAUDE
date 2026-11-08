import { route } from '@/lib/server/api';
import { archiveUser } from '@/lib/server/catalog';

/** Archive (deactivate) a staff user; their vault cash returns to the main vault. */
export const POST = route<{ id: string }>({ owner: true, fail: 'err.save' }, async ({ user, params }) => archiveUser(params.id, user));
