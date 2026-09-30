import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { CustomersView } from './CustomersView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage() {
  await guardPage('customers');
  return <CustomersView />;
}
