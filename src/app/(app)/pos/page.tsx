import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { txnDetail } from '@/lib/server/q/history';
import { PosView } from './PosView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Point of Sale' };

export default async function PosPage({ searchParams }: { searchParams: Promise<{ edit?: string; customer?: string }> }) {
  await guardPage('pos');
  const sp = await searchParams;
  const edit = sp.edit ? await txnDetail(sp.edit) : null;
  const editable = edit && edit.kind === 'SALE' && !edit.deletedAt ? edit : null;
  return <PosView key={editable?.id ?? 'new'} edit={editable} customerId={sp.customer ?? null} />;
}
