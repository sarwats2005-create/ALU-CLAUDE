import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { txnDetail } from '@/lib/server/q/history';
import { PurchaseForm } from './PurchaseForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New purchase' };

export default async function PurchasePage({ searchParams }: { searchParams: Promise<{ edit?: string; beneficiary?: string; product?: string }> }) {
  await guardPage('beneficiaries');
  const sp = await searchParams;
  const d = sp.edit ? await txnDetail(sp.edit) : null;
  const edit = d && d.kind === 'PURCHASE' && !d.deletedAt ? d : null;
  return <PurchaseForm key={edit?.id ?? 'new'} edit={edit} beneficiaryId={sp.beneficiary ?? null} productId={sp.product ?? null} />;
}
