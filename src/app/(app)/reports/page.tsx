import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { isReportType } from '@/lib/reports-meta';
import { ReportsView } from './ReportsView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await guardPage('reports');
  const { type } = await searchParams;
  return <ReportsView initial={isReportType(type) ? type : 'pl'} />;
}
