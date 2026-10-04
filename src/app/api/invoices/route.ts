import { NextResponse } from 'next/server';
import type { TxnKind } from '@prisma/client';
import { route, listParams } from '@/lib/server/api';
import { HISTORY_SORT, listHistory } from '@/lib/server/q/history';
import { EDIT_WINDOW_MS } from '@/lib/lock';
import { prisma } from '@/lib/db';
import { fmtCell } from '@/lib/format';
import { t } from '@/lib/i18n';
import { fileName } from '@/lib/server/docs/pdf';
import { audit } from '@/lib/server/audit';
import { todayIso } from '@/lib/dates';

/**
 * Sales invoices OR purchase invoices for the Invoices page (type=sale|purchase — always one kind, they are
 * separate books). Filters: lock=open|locked (24-hour edit window), pay=owed (money still owed), from/to,
 * search. ?format=csv exports every matching row. Each row carries createdAt for the edit countdown; the
 * server enforces the lock on every edit and delete regardless.
 */
export const GET = route({ pages: ['invoices'] }, async ({ url, lang, user }) => {
  const csv = url.searchParams.get('format') === 'csv';
  if (csv) url.searchParams.set('all', '1');
  const p = listParams(url, HISTORY_SORT, 'created', 'desc');
  const sp = url.searchParams;
  const kind: TxnKind = sp.get('type') === 'purchase' ? 'PURCHASE' : 'SALE';
  const lock = sp.get('lock');
  const cutoff = new Date(Date.now() - EDIT_WINDOW_MS);
  const list = await listHistory(
    {
      q: p.q,
      kinds: [kind],
      currency: sp.get('currency') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      owed: sp.get('pay') === 'owed',
      ...(lock === 'open' ? { createdFrom: cutoff } : lock === 'locked' ? { createdBefore: cutoff } : {}),
    },
    p,
  );

  if (csv) {
    const cols = [
      ['number', 'common.number', 'text'],
      ['date', 'common.date', 'date'],
      ['partyName', kind === 'SALE' ? 'pos.customer' : 'pur.beneficiary', 'text'],
      ['products', 'common.product', 'text'],
      ['kg', 'common.kg', 'kg'],
      ['total', 'common.total', 'amountCur'],
      ['currency', 'common.currency', 'text'],
      ['totalUsd', 'common.usdEquivalent', 'money'],
      ['cashPaid', 'common.cashPaid', 'amountCur'],
      ['vault', 'common.vault', 'vault'],
      ['status', 'common.status', 'text'],
      ['createdByName', 'common.createdBy', 'text'],
    ] as const;
    const safe = (v: string) => (/^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && /[(=]/.test(v)) ? `'${v}` : v);
    const q = (raw: string) => {
      const v = safe(raw);
      return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [cols.map((c) => q(t(c[1], lang))).join(',')];
    for (const r of list.rows) {
      const row = r as unknown as Record<string, unknown>;
      lines.push(cols.map(([k, , f]) => q(k === 'status' ? t(`status.${r.status}`, lang) : fmtCell(row[k], f, lang, row))).join(','));
    }
    await audit({ user, action: 'export', module: 'invoices', reference: `${kind === 'SALE' ? 'sales' : 'purchases'} ${list.rows.length} rows` });
    return new NextResponse('﻿' + lines.join('\r\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': fileName(`${kind === 'SALE' ? 'sales' : 'purchase'}-invoices-${todayIso()}`, 'csv'), 'cache-control': 'no-store' },
    });
  }

  // Summary for this book (and the size of the other one, for its tab).
  const live = { deletedAt: null, kind };
  const [all, open, other, owed] = await Promise.all([
    prisma.txn.count({ where: live }),
    prisma.txn.count({ where: { ...live, createdAt: { gte: cutoff } } }),
    prisma.txn.count({ where: { deletedAt: null, kind: kind === 'SALE' ? 'PURCHASE' : 'SALE' } }),
    prisma.$queryRaw<{ n: bigint; usd: string | null }[]>`
      SELECT COUNT(*) AS n, SUM("totalUsd" - "cashPaidUsd")::text AS usd
      FROM "Txn" WHERE "deletedAt" IS NULL AND kind = ${kind}::"TxnKind" AND total > "cashPaid"`,
  ]);
  return { ...list, counts: { all, open, other, owed: Number(owed[0]?.n ?? 0), owedUsd: owed[0]?.usd ?? '0' } };
});
