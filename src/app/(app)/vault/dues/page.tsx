import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { DuesView } from './DuesView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Unpaid dues' };

export default async function DuesPage() {
  await guardPage('vault');
  return <DuesView />;
}
