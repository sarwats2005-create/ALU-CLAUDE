import { guardPage } from '@/lib/server/page';
import { txnDetail } from '@/lib/server/q/history';
import { PartyDetail } from '@/components/parties/PartyDetail';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  await guardPage('customers');
  const { id } = await params;
  const { edit } = await searchParams;
  const d = edit ? await txnDetail(edit) : null;
  const editPayment = d && !d.deletedAt && d.customer?.id === id && d.kind.startsWith('CUSTOMER') ? d : null;
  return <PartyDetail key={id} kind="customer" id={id} editPayment={editPayment} />;
}
