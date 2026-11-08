import { route } from '@/lib/server/api';
import { userActivity } from '@/lib/server/q/users';

/** Owner view of one staff user: their vault balances and the documents they recorded. */
export const GET = route<{ id: string }>({ owner: true }, async ({ params }) => userActivity(params.id));
