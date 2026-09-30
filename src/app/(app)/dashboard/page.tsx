import { guardPage } from '@/lib/server/page';
import { dashboard } from '@/lib/server/q/dashboard';
import { DashboardView } from './DashboardView';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await guardPage('dashboard');
  const data = await dashboard();
  return <DashboardView data={data} />;
}
