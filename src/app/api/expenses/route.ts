import { NextResponse } from 'next/server';
import { route, body, listParams } from '@/lib/server/api';
import { listExpenses } from '@/lib/server/q/expenses';
import { checkExpensePin, createRule, saveExpense, type ExpenseInput } from '@/lib/server/expenses';
import { fileName } from '@/lib/server/docs/pdf';
import { audit } from '@/lib/server/audit';
import { fmtCell } from '@/lib/format';
import { t } from '@/lib/i18n';
import { todayIso } from '@/lib/dates';

/** Expense list: search, category, date range, paging. ?format=csv exports every matching row. */
export const GET = route({ pages: ['expenses'] }, async ({ url, lang, user }) => {
  const csv = url.searchParams.get('format') === 'csv';
  if (csv) url.searchParams.set('all', '1');
  const p = listParams(url, ['date'], 'date', 'desc');
  const sp = url.searchParams;
  const res = await listExpenses({ q: p.q, categoryId: sp.get('category') ?? undefined, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined }, p);
  if (!csv) return res;
  const head = ['common.date', 'common.number', 'exp.category', 'exp.details', 'common.amount', 'common.currency', 'common.vault', 'common.notes', 'exp.source'] as const;
  const safe = (v: string) => (/^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && /[(=]/.test(v)) ? `'${v}` : v);
  const q = (raw: string) => {
    const v = safe(raw);
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [head.map((k) => q(t(k, lang))).join(',')];
  for (const r of res.rows) {
    const details = r.unitPrice && r.quantity ? `${r.quantity} ${r.unitName} × ${r.unitPrice}` : '';
    lines.push(
      [fmtCell(r.date, 'date', lang), r.number, r.category, details, fmtCell(r.amount, 'amountCur', lang, { currency: r.currency }), r.currency, t(`vault.${r.vault}`, lang), r.note, t(`exp.src.${r.source}`, lang)]
        .map((x) => q(String(x)))
        .join(','),
    );
  }
  await audit({ user, action: 'export', module: 'expenses', reference: `${res.rows.length} rows` });
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': fileName(`expenses-${todayIso()}`, 'csv'), 'cache-control': 'no-store' },
  });
});

/** New expense, or a new recurring rule (recurring: true). Both need the expense PIN when one is set. */
export const POST = route({ pages: ['expenses'], fail: 'err.save' }, async ({ req, user }) => {
  const b = await body<ExpenseInput>(req);
  await checkExpensePin(b.pin, user.id);
  if (b.recurring === true) return createRule(b, user);
  return saveExpense(b, user);
});
