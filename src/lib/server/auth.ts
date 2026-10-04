import 'server-only';
import { RULES, MIN_MS } from '@/lib/rules';
import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { prisma, type Tx } from '@/lib/db';
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
  /** Owner erase mode: active until this moment, or null. */
  eraseUntil: Date | null;
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
    secure: process.env.NODE_ENV === 'production',
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

/** After a password change: sign this user out everywhere except the browser that made the change. */
export async function revokeOtherSessions(tx: Tx, userId: string): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await tx.session.deleteMany({ where: { userId, ...(token ? { id: { not: sha(token) } } : {}) } });
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
    eraseUntil: u.isOwner && s.eraseUntil && s.eraseUntil > new Date() ? s.eraseUntil : null,
  };
}

/** Turn erase mode on (until a moment) or off for this browser's session only. */
export async function setEraseUntil(until: Date | null): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;
  await prisma.session.updateMany({ where: { id: sha(token) }, data: { eraseUntil: until } });
}

/**
 * The visitor's real IP. Behind Cloudflare, CF-Connecting-IP is set by Cloudflare itself; the left-most
 * X-Forwarded-For entry is only a fallback because a client can put anything there.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('cf-connecting-ip') ?? h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? 'local').trim().slice(0, 64);
}

const WINDOW_MS = RULES.loginWindowMinutes * MIN_MS;
/** Wrong passwords for one account from one IP before that IP is paused for the account. */
const MAX_FAILS_EMAIL_IP = RULES.loginMaxTries;
/** Wrong passwords from one IP across all accounts. */
const MAX_FAILS_IP = 20;
/** Wrong passwords for one account from everywhere: high enough that a stranger can't lock the owner out cheaply. */
const MAX_FAILS_EMAIL = 50;

const keys = (email: string, ip: string) => ({ e: `e:${email}`, ei: `ei:${email}|${ip}`, i: `i:${ip}` });

/** True when this account/IP has too many recent failed sign-ins. Called after beginAttempt, so the counts include this attempt. */
export async function isRateLimited(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const k = keys(email, ip);
  const count = (key: string) => prisma.loginAttempt.count({ where: { key, success: false, createdAt: { gte: since } } });
  const [byEmailIp, byIp, byEmail] = await Promise.all([count(k.ei), count(k.i), count(k.e)]);
  return byEmailIp > MAX_FAILS_EMAIL_IP || byIp > MAX_FAILS_IP || byEmail > MAX_FAILS_EMAIL;
}

/**
 * Counts an attempt as failed BEFORE the password is checked, so a burst of parallel guesses can't all slip
 * under the limit; a correct password then clears that account's failures. Old rows are pruned now and then.
 */
export async function beginAttempt(email: string, ip: string): Promise<number[]> {
  const k = keys(email, ip);
  const rows = await prisma.loginAttempt.createManyAndReturn({
    data: [{ key: k.e, success: false }, { key: k.ei, success: false }, { key: k.i, success: false }],
    select: { id: true },
  });
  if (Math.random() < 0.05) {
    const dayAgo = new Date(Date.now() - 86400000);
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: dayAgo } } }).catch(() => {});
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  }
  return rows.map((r) => r.id);
}

/** Correct password: clear this account's failures and this attempt's own IP row (staff sharing one office IP aren't counted). */
export async function attemptSucceeded(email: string, ip: string, pending: number[]): Promise<void> {
  const k = keys(email, ip);
  await prisma.loginAttempt.deleteMany({ where: { OR: [{ key: { in: [k.e, k.ei] }, success: false }, { id: { in: pending } }] } });
}

/**
 * Cross-site request check for anything that changes data: the browser's Origin header must match this site.
 * Requests without an Origin (same-origin navigations, non-browser tools) fall back to the SameSite cookie.
 */
export function crossSite(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return false;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return true;
  }
  const allowed = [req.headers.get('x-forwarded-host'), req.headers.get('host'), ...(process.env.ALLOWED_HOSTS ?? '').split(',')]
    .flatMap((h) => (h ?? '').split(','))
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return !allowed.includes(host.toLowerCase());
}
