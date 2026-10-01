import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { createSession, crossSite } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { t, parseLang, type DictKey } from '@/lib/i18n';
import { ACTIONS, PAGES, actionKey, pageKey } from '@/lib/permissions';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Creates the very first account, which becomes the Owner permanently. Refused once any user exists. */
export async function POST(req: NextRequest) {
  const lang = parseLang(req.cookies.get('alu_lang')?.value);
  if (crossSite(req)) return NextResponse.json({ error: t('err.forbidden', lang), code: 'err.forbidden' }, { status: 403 });
  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fieldErrors: Record<string, string> = {};
  const fe = (f: string, k: DictKey) => (fieldErrors[f] = t(k, lang));
  if (!name) fe('name', 'v.required');
  if (!email) fe('email', 'v.required');
  else if (!EMAIL.test(email)) fe('email', 'v.email');
  if (password.length < 8) fe('password', 'auth.passwordMin');
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: t('err.fixFields', lang), code: 'err.fixFields', fieldErrors }, { status: 422 });
  }

  const hash = await bcrypt.hash(password, 12);
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('alu:setup'))`;
    if ((await tx.user.count()) > 0) return null;
    return tx.user.create({
      data: {
        name,
        email,
        passwordHash: hash,
        isOwner: true,
        lang,
        permissions: [...PAGES.map(pageKey), ...ACTIONS.map(actionKey)],
      },
    });
  });
  if (!created) {
    return NextResponse.json({ error: t('auth.alreadySetup', lang), code: 'auth.alreadySetup' }, { status: 409 });
  }
  await audit({ user: { id: created.id, name: created.name }, action: 'create', module: 'users', reference: `${email} (owner)` });
  await createSession(created.id);
  await prisma.user.update({ where: { id: created.id }, data: { lastLoginAt: new Date() } });
  await audit({ user: { id: created.id, name: created.name }, action: 'login', module: 'auth', reference: email });
  return NextResponse.json({ ok: true, redirect: '/dashboard' });
}
