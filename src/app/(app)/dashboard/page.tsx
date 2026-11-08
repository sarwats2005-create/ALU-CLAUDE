import { guardPage } from '@/lib/server/page';
import { dashboard, staffDashboard } from '@/lib/server/q/dashboard';
import { DashboardView } from './DashboardView';
import { StaffDashboardView } from './StaffDashboardView';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await guardPage('dashboard');
  // Staff get their own dashboard: their vault and their sales — no factory totals, no profit.
  if (!user.isOwner) return <StaffDashboardView data={await staffDashboard(user.id)} />;
  const data = await dashboard();
  return <DashboardView data={data} />;
}
