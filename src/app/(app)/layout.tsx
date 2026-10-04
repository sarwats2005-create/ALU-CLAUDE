import { AppShell } from '@/components/shell/AppShell';
import { requireUser } from '@/lib/server/page';
import { getCompany, getSettings } from '@/lib/server/common';
import { D } from '@/lib/money';
import { ensureDailySnapshot } from '@/lib/server/backup';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Daily restore point: taken in the background on the first visit of the day (never slows the page).
  void ensureDailySnapshot().catch((e) => console.error('[backup] daily snapshot failed', e));
  const [settings, company] = await Promise.all([getSettings(), getCompany()]);
  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email, isOwner: user.isOwner, permissions: user.permissions }}
      lang={user.lang}
      rate={D(settings.exchangeRate).toString()}
      company={company.name}
    >
      {children}
    </AppShell>
  );
}
