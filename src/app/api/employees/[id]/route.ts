import { route, body } from '@/lib/server/api';
import { deleteEmployee, saveEmployee, type EmployeeInput } from '@/lib/server/employees';

type P = { id: string };

export const PUT = route<P>({ pages: ['employees'], fail: 'err.save' }, async ({ req, user, params }) => saveEmployee(await body<EmployeeInput>(req), user, params.id));

/** Removes the employee; their salary history stays. */
export const DELETE = route<P>({ pages: ['employees'], fail: 'err.delete' }, async ({ user, params }) => deleteEmployee(params.id, user));
