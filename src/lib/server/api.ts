import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getSessionUser, type SessionUser } from './auth';
import { AppError } from './errors';
import { t, type DictKey, type Lang } from '@/lib/i18n';
import { canAction, canAnyPage, type Action, type Page } from '@/lib/permissions';

export type Ctx<P = Record<string, string>> = {
  req: NextRequest;
  user: SessionUser;
  lang: Lang;
  params: P;
  url: URL;
};

type Guard = {
  /** Any one of these pages grants access. Omit for "any signed-in user". */
  pages?: Page[];
  action?: Action;
  owner?: boolean;
  /** Message used when an unexpected failure happens. */
  fail?: DictKey;
};

export function errorResponse(e: unknown, lang: Lang, fail: DictKey = 'err.generic') {
  if (e instanceof AppError) {
    const fieldErrors = e.fieldErrors
      ? Object.fromEntries(Object.entries(e.fieldErrors).map(([f, v]) => [f, t(v.key, lang, v.params)]))
      : undefined;
    return NextResponse.json({ error: t(e.key, lang, e.params), code: e.key, fieldErrors }, { status: e.status });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
    return NextResponse.json({ error: t('err.notFound', lang), code: 'err.notFound' }, { status: 404 });
  }
  console.error('[api]', e);
  return NextResponse.json({ error: t(fail, lang), code: fail }, { status: 500 });
}

export function route<P = Record<string, string>>(guard: Guard, handler: (ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    let lang: Lang = 'en';
    try {
      const user = await getSessionUser();
      if (!user) {
        return NextResponse.json({ error: t('auth.sessionExpired', lang), code: 'auth.sessionExpired' }, { status: 401 });
      }
      lang = user.lang;
      if (guard.owner && !user.isOwner) throw new AppError(403, 'err.forbidden');
      if (guard.pages && !canAnyPage(user, guard.pages)) throw new AppError(403, 'err.forbidden');
      if (guard.action && !canAction(user, guard.action)) throw new AppError(403, 'err.forbidden');
      const params = (await ctx.params) ?? ({} as P);
      const out = await handler({ req, user, lang, params, url: new URL(req.url) });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e, lang, guard.fail);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError(400, 'err.generic');
  }
}

/** Standard list query params: q, page, size (25/50/100), sort, dir. */
export function listParams(url: URL, sortable: string[], defaultSort: string, defaultDir: 'asc' | 'desc' = 'desc') {
  const size = [25, 50, 100].includes(Number(url.searchParams.get('size'))) ? Number(url.searchParams.get('size')) : 25;
  const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
  const sortRaw = url.searchParams.get('sort') ?? '';
  const sort = sortable.includes(sortRaw) ? sortRaw : defaultSort;
  const dir: 'asc' | 'desc' = url.searchParams.get('dir') === 'asc' ? 'asc' : url.searchParams.get('dir') === 'desc' ? 'desc' : defaultDir;
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const all = url.searchParams.get('all') === '1';
  return { size: all ? 10000 : size, page: all ? 1 : page, sort, dir, q, offset: all ? 0 : (page - 1) * size, all };
}
