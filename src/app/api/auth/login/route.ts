import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { attemptSucceeded, beginAttempt, clientIp, createSession, crossSite, isRateLimited } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { t, parseLang } from '@/lib/i18n';
import { firstAllowedHref } from '@/lib/permissions';

// A real hash to compare against when the email is unknown, so timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('alu-factory-timing-guard', 12);

export async function POST(req: NextRequest) {
  const lang = parseLang(req.cookies.get('alu_lang')?.value);
  if (crossSite(req)) return NextResponse.json({ error: t('err.forbidden', lang), code: 'err.forbidden' }, { status: 403 });
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  const ip = await clientIp();

  if (!email || !password) {
    return NextResponse.json({ error: t('auth.invalid', lang), code: 'auth.invalid' }, { status: 400 });
  }

  // Record first, then count: a burst of parallel guesses all see each other and the extras are refused.
  const pending = await beginAttempt(email, ip);
  if (await isRateLimited(email, ip)) {
    return NextResponse.json({ error: t('auth.rateLimited', lang), code: 'auth.rateLimited' }, { status: 429 });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await audit({ user: user ? { id: user.id, name: user.name } : null, action: 'login_failed', module: 'auth', reference: email });
    return NextResponse.json({ error: t('auth.invalid', lang), code: 'auth.invalid' }, { status: 401 });
  }
  if (!user.active) {
    await audit({ user: { id: user.id, name: user.name }, action: 'login_failed', module: 'auth', reference: `${email} (inactive)` });
    return NextResponse.json({ error: t(`auth.inactive`, user.lang), code: 'auth.inactive' }, { status: 403 });
  }

  await attemptSucceeded(email, ip, pending);
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ user: { id: user.id, name: user.name }, action: 'login', module: 'auth', reference: email });

  const res = NextResponse.json({ ok: true, redirect: firstAllowedHref(user) });
  res.cookies.set('alu_lang', user.lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
