import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { txnDetail } from '@/lib/server/q/history';
import { InventoryView } from './InventoryView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await guardPage('inventory');
  const { edit } = await searchParams;
  const d = edit ? await txnDetail(edit) : null;
  return <InventoryView editProcessing={d && d.kind === 'PROCESSING' && !d.deletedAt ? d : null} />;
}
