import { route, body } from '@/lib/server/api';
import { listUsers, saveUser, type UserInput } from '@/lib/server/catalog';

export const GET = route({ owner: true }, async () => listUsers());
export const POST = route({ owner: true }, async ({ req, user }) => saveUser(await body<UserInput>(req), user));
