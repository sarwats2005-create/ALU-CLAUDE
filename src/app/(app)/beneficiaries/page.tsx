import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { BeneficiariesView } from './BeneficiariesView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Beneficiaries' };

export default async function BeneficiariesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await guardPage('beneficiaries');
  const { tab } = await searchParams;
  return <BeneficiariesView initialTab={tab === 'purchases' ? 'purchases' : 'list'} />;
}
