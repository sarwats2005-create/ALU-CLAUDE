import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { InvoicesView } from './InvoicesView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoices' };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await guardPage('invoices');
  const { type } = await searchParams;
  return <InvoicesView initialType={type === 'purchase' ? 'purchase' : 'sale'} />;
}
