import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { clientIp, createSession, isRateLimited, recordAttempt } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { t, parseLang } from '@/lib/i18n';
import { firstAllowedHref } from '@/lib/permissions';

// A real hash to compare against when the email is unknown, so timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('alu-factory-timing-guard', 12);

export async function POST(req: NextRequest) {
  const lang = parseLang(req.cookies.get('alu_lang')?.value);
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
  if (await isRateLimited(email, ip)) {
    return NextResponse.json({ error: t('auth.rateLimited', lang), code: 'auth.rateLimited' }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await recordAttempt(email, ip, false);
    await audit({ user: user ? { id: user.id, name: user.name } : null, action: 'login_failed', module: 'auth', reference: email });
    return NextResponse.json({ error: t('auth.invalid', lang), code: 'auth.invalid' }, { status: 401 });
  }
  if (!user.active) {
    await recordAttempt(email, ip, false);
    await audit({ user: { id: user.id, name: user.name }, action: 'login_failed', module: 'auth', reference: `${email} (inactive)` });
    return NextResponse.json({ error: t(`auth.inactive`, user.lang), code: 'auth.inactive' }, { status: 403 });
  }

  await recordAttempt(email, ip, true);
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ user: { id: user.id, name: user.name }, action: 'login', module: 'auth', reference: email });

  const res = NextResponse.json({ ok: true, redirect: firstAllowedHref(user) });
  res.cookies.set('alu_lang', user.lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
