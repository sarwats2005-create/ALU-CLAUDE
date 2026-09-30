import 'server-only';
import { NextResponse } from 'next/server';
import type { TxnKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { t } from '@/lib/i18n';
import type { Page } from '@/lib/permissions';
import { route, body, listParams } from './api';
import { saveParty, deleteParty, type PartyInput } from './catalog';
import { notFound } from './errors';
import { balanceSeries, listParties, lookupParties, pageStatement, partyDetail, statementRows, type BalanceFilter, type PartyKind } from './q/parties';

const PAGE: Record<PartyKind, Page> = { customer: 'customers', beneficiary: 'beneficiaries' };

/** GET list (paginated, filterable by balance state) + POST create. */
export function partyCollection(kind: PartyKind) {
  const page = PAGE[kind];
  return {
    GET: route({ pages: [page] }, async ({ url }) => {
      const p = listParams(url, ['name', 'balance', 'total', 'count', 'createdAt'], 'name', 'asc');
      const st = url.searchParams.get('state') ?? '';
      const state: BalanceFilter = st === 'owes' || st === 'settled' || st === 'credit' ? st : '';
      return listParties(kind, { ...p, state });
    }),
    POST: route({ pages: kind === 'customer' ? ['customers', 'pos'] : ['beneficiaries'] }, async ({ req, user }) => {
      const b = await body<PartyInput>(req);
      const p = await saveParty(kind, b, user);
      return { id: p.id, name: p.name, phone: p.phone, balance: '0' };
    }),
  };
}

/** GET profile + cards + balance series, PUT update, DELETE (blocked when the party has transactions). */
export function partyItem(kind: PartyKind) {
  const page = PAGE[kind];
  return {
    GET: route<{ id: string }>({ pages: [page] }, async ({ params }) => {
      const [detail, rows] = await Promise.all([partyDetail(kind, params.id), statementRows(kind, params.id)]);
      return { ...detail, series: balanceSeries(rows) };
    }),
    PUT: route<{ id: string }>({ pages: [page] }, async ({ req, user, params }) => {
      const b = await body<PartyInput>(req);
      const p = await saveParty(kind, b, user, params.id);
      return { id: p.id, name: p.name };
    }),
    DELETE: route<{ id: string }>({ pages: [page] }, async ({ user, params }) => deleteParty(kind, params.id, user)),
  };
}

/** Statement rows (running balance always computed over full history, then filtered/paged). */
export function partyStatement(kind: PartyKind) {
  return {
    GET: route<{ id: string }>({ pages: [PAGE[kind]] }, async ({ params, url, lang }) => {
      const rows = await statementRows(kind, params.id);
      const p = listParams(url, ['date', 'number', 'amount', 'effect'], 'date', 'desc');
      return pageStatement(rows, {
        ...p,
        from: url.searchParams.get('from') ?? undefined,
        to: url.searchParams.get('to') ?? undefined,
        kindLabel: (k: TxnKind) => t(`kind.${k}`, lang),
      });
    }),
  };
}

export function partyLookup(kind: PartyKind, pages: Page[]) {
  return {
    GET: route({ pages }, async ({ url }) => {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 50);
      return lookupParties(kind, (url.searchParams.get('q') ?? '').trim().slice(0, 100), 20, ids);
    }),
  };
}

/** Customer avatar as an image response (cached by version query). */
export const customerAvatar = route<{ id: string }>({ pages: ['customers', 'pos', 'dashboard'] }, async ({ params }) => {
  const c = await prisma.customer.findUnique({ where: { id: params.id }, select: { avatar: true } });
  if (!c?.avatar) throw notFound();
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(c.avatar);
  if (!m) throw notFound();
  return new NextResponse(Buffer.from(m[2], 'base64'), {
    headers: { 'content-type': m[1], 'cache-control': 'private, max-age=31536000, immutable' },
  });
});
