import 'server-only';
import { prisma } from '@/lib/db';
import { t, type Lang } from '@/lib/i18n';
import { balanceLabel, fmtCell, isNumericFmt } from '@/lib/format';
import { fmtDate, isValidIsoDate } from '@/lib/dates';
import { D, Dec, fmtMoney } from '@/lib/money';
import { REPORT_META, type ReportData } from '@/lib/reports-meta';
import { getCompany } from '../common';
import { statementRows, type PartyKind } from '../q/parties';
import { notFound } from '../errors';
import { docHtml, esc, num } from './shell';

/** Account statement (A4): opening balance, every document in the period with running balance, closing balance. */
export async function statementDocument(kind: PartyKind, id: string, lang: Lang, from?: string, to?: string) {
  const party =
    kind === 'customer'
      ? await prisma.customer.findUnique({ where: { id }, select: { name: true, phone: true, address: true } })
      : await prisma.beneficiary.findUnique({ where: { id }, select: { name: true, phone: true, address: true } });
  if (!party) throw notFound();
  const company = await getCompany();
  const L = (k: Parameters<typeof t>[0], p?: Record<string, string | number>) => t(k, lang, p);
  const all = await statementRows(kind, id);
  const f = isValidIsoDate(from) ? from! : '';
  const tt = isValidIsoDate(to) ? to! : '';
  const before = f ? all.filter((r) => r.date < f) : [];
  const rows = all.filter((r) => (!f || r.date >= f) && (!tt || r.date <= tt));
  const opening = before.length ? D(before[before.length - 1].running) : new Dec(0);
  const closing = rows.length ? D(rows[rows.length - 1].running) : opening;
  const debits = rows.reduce((s, r) => (D(r.effectUsd).gt(0) ? s.plus(D(r.effectUsd)) : s), new Dec(0));
  const credits = rows.reduce((s, r) => (D(r.effectUsd).isNegative() ? s.plus(D(r.effectUsd).abs()) : s), new Dec(0));
  const lbl = (v: Dec) => balanceLabel(kind, v.toString(), lang);
  const tone = (x: string) => (x === 'danger' ? 'neg' : x === 'success' ? 'pos' : 'm');
  const period = f || tt ? `${f ? fmtDate(f) : '…'} – ${tt ? fmtDate(tt) : '…'}` : L('rep.allTime');
  const ol = lbl(opening);
  const cl = lbl(closing);

  const body = `
  <section class="block row">
    <div class="box"><p class="lbl">${esc(kind === 'customer' ? L('pos.customer') : L('pur.beneficiary'))}</p>
      <div class="val bidi">${esc(party.name)}</div>
      ${party.phone ? `<div class="s m">${num(party.phone)}</div>` : ''}${party.address ? `<div class="s m bidi">${esc(party.address)}</div>` : ''}</div>
    <div class="box"><p class="lbl">${esc(L('doc.openingBalance'))}</p><div class="val ${tone(ol.tone)} bidi">${esc(ol.text)}</div></div>
    <div class="box"><p class="lbl">${esc(L('doc.closingBalance'))}</p><div class="val ${tone(cl.tone)} bidi">${esc(cl.text)}</div></div>
  </section>
  <section class="block"><table>
    <thead><tr><th>${esc(L('common.date'))}</th><th>${esc(L('common.number'))}</th><th>${esc(L('common.type'))}</th><th>${esc(L('common.details'))}</th><th class="e">${esc(L('common.amount'))}</th><th class="e">${esc(L('common.debitCredit'))}</th><th class="e">${esc(L('common.runningBalance'))}</th></tr></thead>
    <tbody>
      <tr><td></td><td></td><td colspan="4" class="m">${esc(L('doc.openingBalance'))}</td><td class="e b">${num(fmtMoney(opening))}</td></tr>
      ${rows
        .map((r) => {
          const e = D(r.effectUsd);
          return `<tr><td>${num(fmtDate(r.date))}</td><td class="b">${num(r.number)}</td><td>${esc(L(`kindShort.${r.kind}` as 'kindShort.SALE'))}</td><td class="s bidi">${esc(r.details)}</td>
          <td class="e">${num(fmtMoney(r.amount, r.currency))}</td><td class="e ${e.gt(0) ? 'neg' : e.isNegative() ? 'pos' : 'm'}">${num(e.isZero() ? '—' : `${e.gt(0) ? '+' : '−'}${fmtMoney(e.abs())}`)}</td><td class="e b">${num(fmtMoney(r.running))}</td></tr>`;
        })
        .join('')}
    </tbody>
    <tfoot><tr><td colspan="5">${esc(L('doc.closingBalance'))}</td><td class="e">${num(`+${fmtMoney(debits)} / −${fmtMoney(credits)}`)}</td><td class="e">${num(fmtMoney(closing))}</td></tr></tfoot>
  </table></section>`;

  const html = await docHtml({
    lang,
    title: `${L('doc.statement')} · ${party.name}`,
    size: 'A4',
    company,
    heading: L('doc.statement'),
    meta: [
      { label: L('doc.period'), value: num(period) },
      { label: L('rep.transactions'), value: num(rows.length) },
    ],
    body,
  });
  return { html, name: party.name };
}

/** Any report as a printable document (A4 portrait or landscape per report). */
export async function reportDocument(data: ReportData, lang: Lang) {
  const company = await getCompany();
  const meta = REPORT_META[data.type];
  const L = (k: Parameters<typeof t>[0], p?: Record<string, string | number>) => t(k, lang, p);
  const cell = (v: unknown, fmt: Parameters<typeof fmtCell>[1], row?: Record<string, unknown>, curKey?: string) => fmtCell(v, fmt, lang, row, curKey);
  const summary = data.summary.length
    ? `<section class="block sum">${data.summary
        .map((s) => {
          const d = D(s.value);
          const tone = s.tone === 'auto' ? (d.isNegative() ? 'neg' : d.gt(0) ? 'pos' : '') : '';
          return `<div class="box"><p class="lbl">${esc(L(s.label))}</p><div class="val ${tone}">${num(cell(s.value, s.fmt))}</div></div>`;
        })
        .join('')}</section>`
    : '';
  const tables = data.tables
    .map(
      (tb) => `${tb.title ? `<h3>${esc(L(tb.title))}</h3>` : ''}<section class="block"><table>
      <thead><tr>${tb.columns.map((c) => `<th class="${isNumericFmt(c.fmt) ? 'e' : ''}">${esc(L(c.label))}</th>`).join('')}</tr></thead>
      <tbody>${
        tb.rows.length
          ? tb.rows
              .map(
                (r) =>
                  `<tr>${tb.columns
                    .map((c) => {
                      const txt = cell(r[c.key], c.fmt, r, c.curKey);
                      return `<td class="${isNumericFmt(c.fmt) ? 'e' : 'bidi'}">${isNumericFmt(c.fmt) || c.fmt === 'date' || c.fmt === 'month' ? num(txt) : esc(txt)}</td>`;
                    })
                    .join('')}</tr>`,
              )
              .join('')
          : `<tr><td colspan="${tb.columns.length}" class="c m">${esc(L('rep.empty'))}</td></tr>`
      }</tbody>
      ${tb.totals ? `<tfoot><tr>${tb.columns.map((c, i) => `<td class="${isNumericFmt(c.fmt) ? 'e' : ''}">${i === 0 && !tb.totals![c.key] ? esc(L('common.total')) : isNumericFmt(c.fmt) ? num(cell(tb.totals![c.key], c.fmt, tb.totals)) : esc(cell(tb.totals![c.key], c.fmt, tb.totals))}</td>`).join('')}</tr></tfoot>` : ''}
    </table></section>`,
    )
    .join('\n');
  const html = await docHtml({
    lang,
    title: `${L(meta.title)} · ${company.name}`,
    size: meta.landscape ? 'A4L' : 'A4',
    company,
    heading: L(meta.title),
    meta: [{ label: L('doc.period'), value: num(`${fmtDate(data.from)} – ${fmtDate(data.to)}`) }],
    body: `<p class="s m block bidi">${esc(L(meta.desc))}</p>${summary}${tables}`,
  });
  return { html, landscape: meta.landscape };
}

/** CSV (UTF-8 with BOM so Excel opens Kurdish text correctly), formatted exactly like the screen. */
export function reportCsv(data: ReportData, lang: Lang): string {
  // Cells that a spreadsheet would run as a formula (e.g. a customer named "=HYPERLINK(...)") get a leading
  // apostrophe. Plain negative numbers like "-1,250.00" are left alone.
  const safe = (v: string) => (/^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && /[(=]/.test(v)) ? `'${v}` : v);
  const q = (raw: string) => {
    const v = safe(raw);
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const out: string[] = [];
  for (const tb of data.tables) {
    if (tb.title) out.push(q(t(tb.title, lang)));
    out.push(tb.columns.map((c) => q(t(c.label, lang))).join(','));
    for (const r of tb.rows) out.push(tb.columns.map((c) => q(fmtCell(r[c.key], c.fmt, lang, r, c.curKey))).join(','));
    if (tb.totals) out.push(tb.columns.map((c, i) => q(i === 0 && !tb.totals![c.key] ? t('common.total', lang) : fmtCell(tb.totals![c.key], c.fmt, lang, tb.totals, c.curKey))).join(','));
    out.push('');
  }
  return '﻿' + out.join('\r\n');
}
