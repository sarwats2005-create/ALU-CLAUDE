import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/server/auth';
import { firstAllowedHref } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? firstAllowedHref(user) : '/login');
}
