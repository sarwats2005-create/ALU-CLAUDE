import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { guardPage } from '@/lib/server/page';
import { isLocked } from '@/lib/lock';
import { txnDetail } from '@/lib/server/q/history';
import { PosView } from './PosView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Point of Sale' };

export default async function PosPage({ searchParams }: { searchParams: Promise<{ edit?: string; customer?: string }> }) {
  await guardPage('pos');
  const sp = await searchParams;
  const edit = sp.edit ? await txnDetail(sp.edit) : null;
  // A locked invoice (older than 24 hours) can't be edited: send the user back to the invoice list.
  if (edit && edit.kind === 'SALE' && !edit.deletedAt && isLocked(edit.kind, edit.createdAt)) redirect('/invoices');
  const editable = edit && edit.kind === 'SALE' && !edit.deletedAt ? edit : null;
  return <PosView key={editable?.id ?? 'new'} edit={editable} customerId={sp.customer ?? null} />;
}
