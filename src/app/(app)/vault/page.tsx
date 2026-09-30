import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { txnDetail } from '@/lib/server/q/history';
import { VaultView } from './VaultView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vault' };

export default async function VaultPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await guardPage('vault');
  const { edit } = await searchParams;
  const d = edit ? await txnDetail(edit) : null;
  return <VaultView editOp={d && d.kind.startsWith('VAULT_') && !d.deletedAt ? d : null} />;
}
