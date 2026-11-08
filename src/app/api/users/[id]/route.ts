import { route, body } from '@/lib/server/api';
import { deleteUser, saveUser, type UserInput } from '@/lib/server/catalog';

export const PUT = route<{ id: string }>({ owner: true }, async ({ req, user, params }) => saveUser(await body<UserInput>(req), user, params.id));
/** Permanent delete — only for a user who never recorded anything (otherwise archive). */
export const DELETE = route<{ id: string }>({ owner: true, fail: 'err.delete' }, async ({ user, params }) => deleteUser(params.id, user));
