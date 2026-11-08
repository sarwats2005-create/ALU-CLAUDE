import { route, body } from '@/lib/server/api';
import { paySalary, type PayInput } from '@/lib/server/employees';

/** Pay a salary by hand (daily worker: days × rate; monthly: the chosen month). Short vault → asks, then a due. */
export const POST = route({ pages: ['employees'], fail: 'err.save' }, async ({ req, user }) => paySalary(await body<PayInput>(req), user));
