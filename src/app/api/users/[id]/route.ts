import { route, body } from '@/lib/server/api';
import { saveUser, type UserInput } from '@/lib/server/catalog';

export const PUT = route<{ id: string }>({ owner: true }, async ({ req, user, params }) => saveUser(await body<UserInput>(req), user, params.id));
