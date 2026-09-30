import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from './auth';
import { canPage, firstAllowedHref, type Page } from '@/lib/permissions';

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect('/login');
  return u;
}

/** Server-side page guard: users without access are sent to the first page they can open. */
export async function guardPage(page: Page, opts: { owner?: boolean } = {}): Promise<SessionUser> {
  const u = await requireUser();
  if (!canPage(u, page) || (opts.owner && !u.isOwner)) redirect(firstAllowedHref(u));
  return u;
}
