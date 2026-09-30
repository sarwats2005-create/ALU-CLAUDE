import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/server/auth';
import { parseLang } from '@/lib/i18n';

/** Language preference: saved on the user (when signed in) and in a cookie (for the sign-in screen). */
export async function PUT(req: NextRequest) {
  let body: { lang?: unknown } = {};
  try {
    body = await req.json();
  } catch {}
  const lang = parseLang(body.lang);
  const user = await getSessionUser();
  if (user) await prisma.user.update({ where: { id: user.id }, data: { lang } });
  const res = NextResponse.json({ ok: true, lang });
  res.cookies.set('alu_lang', lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
