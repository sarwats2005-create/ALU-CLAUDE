import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { EmployeesView } from './EmployeesView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Employees' };

export default async function EmployeesPage() {
  await guardPage('employees');
  return <EmployeesView />;
}
