import type { Metadata } from 'next';
import { guardPage } from '@/lib/server/page';
import { allowedReports, isReportType } from '@/lib/reports-meta';
import { ReportsView } from './ReportsView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await guardPage('reports');
  const { type } = await searchParams;
  // Staff never see P&L / the main vault; without the Reports activity toggle only their own sales & purchases.
  const allowed = allowedReports(user);
  return <ReportsView initial={isReportType(type) && allowed.includes(type) ? type : allowed[0]} allowed={allowed} />;
}
