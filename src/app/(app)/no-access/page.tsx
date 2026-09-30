import { Lock } from 'lucide-react';
import { requireUser } from '@/lib/server/page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** Signed-in users who have not been granted any page yet land here. */
export default async function NoAccessPage() {
  const user = await requireUser();
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-tint text-brand-ink">
        <Lock className="h-7 w-7" aria-hidden="true" />
      </span>
      <p className="max-w-md text-body text-muted">{t('nav.noAccess', user.lang)}</p>
    </div>
  );
}
