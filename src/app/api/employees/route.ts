import { route, body } from '@/lib/server/api';
import { employeesOverview, saveEmployee, type EmployeeInput } from '@/lib/server/employees';

/** Employees page: the list, salary history, unpaid salaries and figures. Posts this month's salaries first. */
export const GET = route({ pages: ['employees'] }, async ({ user }) => employeesOverview(user));

/** Add an employee. No PIN is needed for anything on the employees page. */
export const POST = route({ pages: ['employees'], fail: 'err.save' }, async ({ req, user }) => saveEmployee(await body<EmployeeInput>(req), user));
