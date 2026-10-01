import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { ExpensesView } from './ExpensesView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Expenses' };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await guardPage('expenses');
  const sp = await searchParams;
  return <ExpensesView editId={sp.edit ?? null} />;
}
