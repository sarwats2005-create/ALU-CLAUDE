import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getSessionUser, LANG_COOKIE } from '@/lib/server/auth';
import { firstAllowedHref } from '@/lib/permissions';
import { parseLang } from '@/lib/i18n';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(firstAllowedHref(user));
  const sp = await searchParams;
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const needsSetup = (await prisma.user.count()) === 0;
  return <LoginForm lang={lang} needsSetup={needsSetup} expired={sp.expired === '1'} />;
}
