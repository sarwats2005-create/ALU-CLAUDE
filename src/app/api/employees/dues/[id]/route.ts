import { route } from '@/lib/server/api';
import { payDue } from '@/lib/server/dues';
import { assertSalaryDue } from '@/lib/server/employees';

/** Pay an unpaid salary from its vault (in full, or as much as the vault holds). Salary dues only. */
export const POST = route<{ id: string }>({ pages: ['employees'], fail: 'err.save' }, async ({ user, params }) => {
  await assertSalaryDue(params.id);
  return payDue(params.id, user);
});
