import { NextResponse } from 'next/server';
import { route, body, listParams } from '@/lib/server/api';
import { listExpenses, type ExpenseFilters } from '@/lib/server/q/expenses';
import { checkExpensePin, createRule, saveExpense, type ExpenseInput } from '@/lib/server/expenses';
import { fileName } from '@/lib/server/docs/pdf';
import { audit } from '@/lib/server/audit';
import { fmtCell } from '@/lib/format';
import { t } from '@/lib/i18n';
import { todayIso } from '@/lib/dates';
import { isOwnScope } from '@/lib/server/scope';

function expenseScope(user: { id: string; isOwner: boolean; permissions: string[]; hasPersonalVault: boolean }, sp: URLSearchParams): ExpenseFilters {
  const tab = sp.get('tab'); // factory | staff (owner)
  const base: ExpenseFilters = {};
  if (isOwnScope(user, 'expenses')) {
    base.createdById = user.id;
    return base;
  }
  if (user.isOwner && tab === 'staff') {
    base.vaultOwner = 'personal';
    return base;
  }
  if (!user.isOwner && user.hasPersonalVault) {
    // Full staff with a wallet: factory expenses + their own personal ones.
    // Represented as vaultOwner null OR self — applied below via a special path.
    base.vaultOwner = null;
    (base as ExpenseFilters & { _alsoSelf?: string })._alsoSelf = user.id;
    return base;
  }
  // Owner factory tab / staff without personal vault: main vault only.
  base.vaultOwner = null;
  return base;
}

/** Expense list: search, category, date range, paging. ?format=csv exports every matching row. */
export const GET = route({ pages: ['expenses'] }, async ({ url, lang, user }) => {
  const csv = url.searchParams.get('format') === 'csv';
  if (csv) url.searchParams.set('all', '1');
  const p = listParams(url, ['date'], 'date', 'desc');
  const sp = url.searchParams;
  const scope = expenseScope(user, sp);
  const alsoSelf = (scope as ExpenseFilters & { _alsoSelf?: string })._alsoSelf;
  delete (scope as ExpenseFilters & { _alsoSelf?: string })._alsoSelf;

  let res;
  if (alsoSelf) {
    // Factory (main) + this staff member's personal-vault expenses.
    const { prisma } = await import('@/lib/db');
    const { dbToIso, isValidIsoDate, isoToDb, parseDmy } = await import('@/lib/dates');
    const { D } = await import('@/lib/money');
    const q = p.q;
    const categoryId = sp.get('category') ?? undefined;
    const from = sp.get('from') ?? undefined;
    const to = sp.get('to') ?? undefined;
    const date: { gte?: Date; lte?: Date } = {};
    if (isValidIsoDate(from)) date.gte = isoToDb(from!);
    if (isValidIsoDate(to)) date.lte = isoToDb(to!);
    const and: object[] = [
      { kind: 'EXPENSE' },
      { deletedAt: null },
      { OR: [{ vaultOwnerUserId: null }, { vaultOwnerUserId: alsoSelf }] },
    ];
    if (categoryId) and.push({ categoryId });
    if (date.gte || date.lte) and.push({ date });
    if (q) {
      const or: object[] = [
        { number: { contains: q, mode: 'insensitive' } },
        { label: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { createdByName: { contains: q, mode: 'insensitive' } },
      ];
      const n = q.replace(/[,\s$]/g, '').replace(/iqd$/i, '');
      if (/^\d+(\.\d+)?$/.test(n)) or.push({ total: { equals: n } });
      const iso = isValidIsoDate(q) ? q : parseDmy(q);
      if (iso) or.push({ date: isoToDb(iso) });
      and.push({ OR: or });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      prisma.txn.findMany({ where, orderBy: [{ date: p.dir }, { createdAt: p.dir }], take: p.size, skip: p.offset }),
      prisma.txn.count({ where }),
    ]);
    res = {
      total,
      rows: rows.map((t) => ({
        id: t.id,
        number: t.number,
        date: dbToIso(t.date),
        category: t.label,
        categoryId: t.categoryId,
        unitName: t.unitName,
        unitPrice: t.unitPrice?.toString() ?? null,
        quantity: t.quantity?.toString() ?? null,
        amount: t.total.toString(),
        currency: t.currency as 'USD' | 'IQD',
        totalUsd: t.totalUsd.toString(),
        vault: (t.vault ?? t.currency) as 'USD' | 'IQD',
        note: t.notes,
        source: (t.recurringId || t.runKey ? 'recurring' : 'manual') as 'manual' | 'recurring',
        createdByName: t.createdByName,
        createdById: t.createdById,
        vaultOwnerUserId: t.vaultOwnerUserId,
      })),
    };
    void D;
  } else {
    res = await listExpenses(
      { q: p.q, categoryId: sp.get('category') ?? undefined, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, ...scope },
      p,
    );
  }

  if (!csv) return res;
  const head = ['common.date', 'common.number', 'exp.category', 'exp.details', 'common.amount', 'common.currency', 'common.vault', 'common.notes', 'exp.source', 'common.createdBy'] as const;
  const safe = (v: string) => (/^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && /[(=]/.test(v)) ? `'${v}` : v);
  const qq = (raw: string) => {
    const v = safe(raw);
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [head.map((k) => qq(t(k, lang))).join(',')];
  for (const r of res.rows) {
    const details = r.unitPrice && r.quantity ? `${r.quantity} ${r.unitName} × ${r.unitPrice}` : '';
    lines.push(
      [fmtCell(r.date, 'date', lang), r.number, r.category, details, fmtCell(r.amount, 'amountCur', lang, { currency: r.currency }), r.currency, t(`vault.${r.vault}`, lang), r.note, t(`exp.src.${r.source}`, lang), r.createdByName]
        .map((x) => qq(String(x)))
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
