import 'server-only';
import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { Lang } from '@/lib/i18n';

export const SESSION_COOKIE = 'alu_session';
export const LANG_COOKIE = 'alu_lang';
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
  active: boolean;
  lang: Lang;
  permissions: string[];
  prefs: Record<string, unknown>;
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await prisma.session.create({ data: { id: sha(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha(token) } });
  jar.delete(SESSION_COOKIE);
}

/** The signed-in, active user — or null. Sessions slide: they are extended when half-used. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { id: sha(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  if (s.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * 86400000) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
    await prisma.session.update({ where: { id: s.id }, data: { expiresAt } }).catch(() => {});
  }
  const u = s.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    isOwner: u.isOwner,
    active: u.active,
    lang: u.lang as Lang,
    permissions: u.permissions,
    prefs: (u.prefs ?? {}) as Record<string, unknown>,
  };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'local').trim();
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

/** True when this email or IP has too many recent failed sign-ins. */
export async function isRateLimited(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { key: `e:${email}`, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { key: `i:${ip}`, success: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_FAILS || byIp >= MAX_FAILS * 4;
}

export async function recordAttempt(email: string, ip: string, success: boolean) {
  await prisma.loginAttempt.createMany({
    data: [
      { key: `e:${email}`, success },
      { key: `i:${ip}`, success },
    ],
  });
  if (success) {
    await prisma.loginAttempt.deleteMany({ where: { key: `e:${email}`, success: false } });
  }
}
