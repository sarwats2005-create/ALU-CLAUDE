import { AppShell } from '@/components/shell/AppShell';
import { requireUser } from '@/lib/server/page';
import { getCompany, getSettings } from '@/lib/server/common';
import { D } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
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
