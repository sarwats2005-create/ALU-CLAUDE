import { NextResponse } from 'next/server';
import { route, listParams } from '@/lib/server/api';
import { HISTORY_SORT, listHistory } from '@/lib/server/q/history';
import { fmtCell } from '@/lib/format';
import { t } from '@/lib/i18n';
import { fileName } from '@/lib/server/docs/pdf';
import { audit } from '@/lib/server/audit';
import { todayIso } from '@/lib/dates';

/** Every transaction (filters + search + sort + paging). ?format=csv exports all matching rows. */
export const GET = route({ pages: ['dashboard'] }, async ({ url, lang, user }) => {
  const csv = url.searchParams.get('format') === 'csv';
  if (csv) url.searchParams.set('all', '1');
  const p = listParams(url, HISTORY_SORT, 'date', 'desc');
  const sp = url.searchParams;
  const res = await listHistory(
    {
      q: p.q,
      kind: sp.get('kind') ?? undefined,
      vault: sp.get('vault') ?? undefined,
      currency: sp.get('currency') ?? undefined,
      typeId: sp.get('typeId') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    },
    p,
  );
  if (!csv) return res;
  const cols = [
    ['number', 'common.number', 'text'],
    ['date', 'common.date', 'date'],
    ['kind', 'common.type', 'kind'],
    ['partyName', 'common.party', 'text'],
    ['products', 'common.product', 'text'],
    ['skus', 'common.sku', 'text'],
    ['kg', 'common.kg', 'kg'],
    ['total', 'common.amount', 'amountCur'],
    ['currency', 'common.currency', 'text'],
    ['totalUsd', 'common.usdEquivalent', 'money'],
    ['cashPaid', 'common.cashPaid', 'amountCur'],
    ['vault', 'common.vault', 'vault'],
    ['rate', 'common.rate100', 'rate'],
    ['status', 'common.status', 'text'],
  ] as const;
  const safe = (v: string) => (/^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && /[(=]/.test(v)) ? `'${v}` : v);
  const q = (raw: string) => {
    const v = safe(raw);
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [cols.map((c) => q(t(c[1], lang))).join(',')];
  for (const r of res.rows) {
    const row = r as unknown as Record<string, unknown>;
    lines.push(cols.map(([k, , f]) => q(k === 'status' ? t(`status.${r.status}`, lang) : fmtCell(row[k], f, lang, row))).join(','));
  }
  await audit({ user, action: 'export', module: 'history', reference: `${res.rows.length} rows` });
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': fileName(`transactions-${todayIso()}`, 'csv'), 'cache-control': 'no-store' },
  });
});
