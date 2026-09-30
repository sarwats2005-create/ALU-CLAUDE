import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { HistoryView } from './HistoryView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Transaction history' };

export default async function HistoryPage() {
  await guardPage('dashboard');
  return <HistoryView />;
}
