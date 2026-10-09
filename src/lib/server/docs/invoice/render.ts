import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { t, type Lang } from '@/lib/i18n';
import { convert, D, fmtKg, fmtMoney, fmtPrice, rateLine, roundMoney, type Cur } from '@/lib/money';
import { fmtDate } from './format';
import { INVOICE_DICT } from './i18n';
import { SPRITE, iconRef, scatterIcons, type Corner } from './icons';
import type { PageSize } from '../shell';

/*
 * Sales / purchase invoice in the "Alu Factory invoice" design (the design package in `public/invoice/`):
 * colour strip, logo + contact header, big title with status + number, three meta cards, bill-to block,
 * full-grid table, notes + totals, signatures, footer. English (Cairo) and Kurdish Sorani (RTL, Vazirmatn —
 * Cairo has no Kurdish letters). Fully self-contained: fonts and images are embedded, nothing is fetched,
 * so preview, print and PDF are the same document.
 */

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
/** Numbers and amounts stay left-to-right and tabular inside Kurdish text. */
const num = (s: string) => `<span class="inv__num">${esc(s)}</span>`;

type Dec = ReturnType<typeof D>;
export type InvoiceLineData = { productName: string; sku: string; typeName: string; state: string; kg: string; unitPrice: string; lineTotal: string };
export type InvoiceData = {
  kind: 'SALE' | 'PURCHASE';
  number: string;
  date: string | Date;
  currency: Cur;
  rate: string;
  total: string;
  totalUsd: string;
  cashPaid: string;
  paidUsd: string;
  paidIqd: string;
  notes: string | null;
  deleted: boolean;
  party: { name: string; phone?: string | null; address?: string | null } | null;
  lines: InvoiceLineData[];
  /** Customer / supplier balance before and after this invoice (already worded, e.g. "Owes $1,200.00"). */
  balance: { before: string; after: string } | null;
};
export type InvoiceCompany = { name: string; logo: string | null; address: string; phones: string; footerNote: string };

// ── Embedded assets (read once) ────────────────────────────────────────────────────────────────────────
const cache: { css?: string; fonts?: string; logo?: string; wm?: string } = {};
const pub = (...p: string[]) => join(process.cwd(), 'public', ...p);
const dataUrl = async (file: string, mime: string) => {
  try {
    return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
  } catch {
    return '';
  }
};
async function assets() {
  if (!cache.css) cache.css = await readFile(pub('invoice', 'invoice.css'), 'utf8').catch(() => '');
  if (!cache.logo) cache.logo = await dataUrl(pub('invoice', 'logo.png'), 'image/png');
  if (!cache.wm) cache.wm = await dataUrl(pub('invoice', 'watermark.png'), 'image/png');
  if (!cache.fonts) {
    const faces: [string, string, string][] = [
      ['Cairo', 'cairo-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
      ['Cairo', 'cairo-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
      ['Vazirmatn', 'vazirmatn-arabic.woff2', 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC'],
    ];
    const css = await Promise.all(
      faces.map(async ([fam, file, range]) => {
        const src = await dataUrl(pub('fonts', file), 'font/woff2');
        return src ? `@font-face{font-family:'${fam}';font-weight:100 900;font-style:normal;src:url(${src}) format('woff2');unicode-range:${range};}` : '';
      }),
    );
    cache.fonts = css.join('\n');
  }
  return cache as Required<typeof cache>;
}

/** "FINISHED" → "Finished" (Kurdish words are left as they are). */
const stateWord = (w: string) => (/^[A-Z ]+$/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w);

// Rows that fit on one page before the table runs onto a second sheet (the footer then drops "Page 1 / 1").
const ONE_PAGE_ROWS: Record<'A4' | 'A5', number> = { A4: 9, A5: 5 };

export async function invoiceHtml(d: InvoiceData, company: InvoiceCompany, lang: Lang, size: PageSize): Promise<string> {
  const page: 'A4' | 'A5' = size === 'A5' ? 'A5' : 'A4';
  const x = INVOICE_DICT[lang];
  const L = (k: Parameters<typeof t>[0], p?: Record<string, string | number>) => t(k, lang, p);
  const a = await assets();
  const cur = d.currency;
  const other: Cur = cur === 'USD' ? 'IQD' : 'USD';
  const rate = D(d.rate);
  const total = D(d.total);
  const paid = D(d.cashPaid);
  const due = total.minus(paid);
  const purchase = d.kind === 'PURCHASE';
  const status = due.lte(0) ? 'paid' : paid.gt(0) ? 'part' : 'due';
  const statusText = status === 'paid' ? x.statusPaid : status === 'part' ? x.statusPartly : x.statusDue;
  const vaultName = (v: Cur) => L(`vault.${v}` as 'vault.USD');

  const icons = scatterIcons(d.number);
  const corners = (['tl', 'tr', 'bl', 'br'] as Corner[]).map((c) => `<div class="inv__cn inv__cn--${c}">${icons[c]}</div>`).join('');

  const totalKg = d.lines.reduce((s, l) => s.plus(D(l.kg)), D(0));
  const rows = d.lines
    .map(
      (l, i) => `<tr>
        <td>${i + 1}</td>
        <td class="inv__name"><b dir="auto">${esc(l.productName)}</b><span class="inv__sku">${esc(l.sku)}</span></td>
        <td class="inv__desc"><span dir="auto">${esc(l.typeName)}</span> · ${esc(stateWord(L(`state.${l.state}` as 'state.RAW')))}</td>
        <td>${num(fmtKg(l.kg))}</td>
        <td>${num(fmtPrice(l.unitPrice, cur) + ' / kg')}</td>
        <td><b>${num(fmtMoney(l.lineTotal, cur))}</b></td>
      </tr>`,
    )
    .join('');

  // ── Totals: the Total bar, then what was paid (one row per currency for a split payment), then what is left.
  const usd = D(d.paidUsd);
  const iqd = D(d.paidIqd);
  const crossed = (cur === 'USD' && iqd.gt(0)) || (cur === 'IQD' && usd.gt(0));
  const split = crossed || (usd.gt(0) && iqd.gt(0));
  const worth = (amount: Dec, from: Cur) => (from !== cur ? `<small>= ${num(fmtMoney(roundMoney(convert(amount, from, cur, rate), cur), cur))}</small>` : '');
  const payRow = (amount: Dec, from: Cur) =>
    amount.gt(0)
      ? `<div class="inv__row inv__row--sub"><span>${esc(L(from === 'USD' ? 'pay.inUsd' : 'pay.inIqd'))}<small>${esc(
          purchase ? L('pay.fromVault', { vault: vaultName(from) }) : L('pay.toVault', { vault: vaultName(from) }),
        )}</small></span><b>${num(fmtMoney(amount, from))}${worth(amount, from)}</b></div>`
      : '';
  const totals: string[] = [`<div class="inv__grand"><span>${esc(x.grandTotal)}</span><strong>${num(fmtMoney(total, cur))}</strong></div>`];
  if (split) totals.push(payRow(usd, 'USD') + payRow(iqd, 'IQD'));
  if (status === 'paid' && due.isZero()) {
    totals.push(`<div class="inv__paid">${esc(x.paidInFull)}</div>`);
  } else {
    if (paid.gt(0)) totals.push(`<div class="inv__row"><span>${esc(x.amountPaid)}</span><b>${num(fmtMoney(paid, cur))}</b></div>`);
    totals.push(
      due.isNegative()
        ? `<div class="inv__row inv__row--bal"><span>${esc(x.overpaid)}</span><b>${num(fmtMoney(due.abs(), cur))}</b></div>`
        : `<div class="inv__row inv__row--bal"><span>${esc(purchase ? x.balanceToPay : x.balanceDue)}</span><b>${num(fmtMoney(due, cur))}</b></div>`,
    );
  }
  const equiv = cur === 'USD' ? roundMoney(convert(total, 'USD', 'IQD', rate), 'IQD') : D(d.totalUsd);
  totals.push(
    `<div class="inv__iqd"><div><span>${esc(cur === 'USD' ? x.iqdEquivalent : x.usdEquivalent)}</span><small>${esc(x.rateNote)}</small></div>${num(fmtMoney(equiv, other))}</div>`,
  );
  if (d.balance) {
    totals.push(`<div class="inv__acct">
      <div><span>${esc(L('pos.prevBalance'))}</span><b dir="auto">${esc(d.balance.before)}</b></div>
      <div><span>${esc(L('pos.newBalance'))}</span><b dir="auto">${esc(d.balance.after)}</b></div>
    </div>`);
  }

  const party = d.party;
  const partyLines = party
    ? [
        party.address ? `<span class="inv__it">${iconRef('pin')}<span dir="auto">${esc(party.address)}</span></span>` : '',
        party.phone ? `<span class="inv__it">${iconRef('phone')}${num(party.phone)}</span>` : '',
      ].join('')
    : '';

  const phones = company.phones
    .split(/[,;\n|/]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' · ');
  const contact = [
    company.address ? `<div>${iconRef('pin')}<span dir="auto">${esc(company.address)}</span></div>` : '',
    phones ? `<div>${iconRef('phone')}${num(phones)}</div>` : '',
    `<div>${iconRef('globe')}<span>alufactoryerp.com</span></div>`,
  ].join('');

  const note = d.notes?.trim() || x.defaultNote;
  const thanks = company.footerNote.trim() || x.thanks;
  const onePage = d.lines.length <= ONE_PAGE_ROWS[page];
  const logo = company.logo || a.logo;

  const article = `<article class="inv inv--${page.toLowerCase()}" dir="${x.dir}" lang="${x.htmlLang}">
  ${SPRITE}
  ${a.wm ? `<img class="inv__wm" src="${a.wm}" alt="">` : ''}
  <div class="inv__icons" aria-hidden="true">${corners}</div>
  ${d.deleted ? `<div class="inv__void">${esc(x.deleted)}</div>` : ''}
  <div class="inv__strip"><i></i><i></i><i></i><i></i></div>
  <div class="inv__in">
    <header class="inv__head">
      <div class="inv__brand">
        ${logo ? `<img class="inv__logo" src="${esc(logo)}" alt="" width="64" height="64">` : ''}
        <div><b dir="auto">${esc(company.name)}</b><span>${esc(x.tagline)}</span></div>
      </div>
      <div class="inv__contact">${contact}</div>
    </header>

    <div class="inv__title">
      <h1>${esc(purchase ? x.purchaseInvoice : x.invoice)}</h1>
      <div class="inv__tr"><span class="inv__stat inv__stat--${status}">${esc(statusText)}</span><span class="inv__pill">${num(d.number)}</span></div>
    </div>

    <section class="inv__meta">
      <div class="inv__card inv__card--blue"><small>${esc(x.issueDate)}</small><strong>${num(fmtDate(d.date))}</strong></div>
      <div class="inv__card inv__card--green"><small>${esc(x.currency)}</small><strong>${esc(L(`cur.${cur}`))}</strong></div>
      <div class="inv__card inv__card--amber"><small>${esc(x.exchangeRate)}</small><strong>${num(rateLine(d.rate))}</strong></div>
    </section>

    ${
      party
        ? `<section class="inv__bill">
      <span class="inv__k">${esc(purchase ? x.supplier : x.billTo)}</span>
      <div class="inv__bl"><h3 dir="auto">${esc(party.name)}</h3><div class="inv__bd">${partyLines}</div></div>
    </section>`
        : ''
    }

    <table class="inv__table">
      <thead><tr><th class="inv__idx">#</th><th>${esc(x.product)}</th><th>${esc(x.description)}</th><th>${esc(x.qty)}</th><th>${esc(x.unitPrice)}</th><th>${esc(x.rowTotal)}</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">${esc(x.totalWeight)}</td><td>${num(fmtKg(totalKg))}</td><td colspan="2"></td></tr></tfoot>
    </table>

    <section class="inv__bottom">
      <div class="inv__note"><b>${esc(x.notes)}</b><div class="inv__note-body" dir="auto">${esc(note)}</div></div>
      <div class="inv__tot">${totals.join('')}</div>
    </section>

    <section class="inv__sign"><div>${esc(x.authorized)}</div><div>${esc(purchase ? x.delivered : x.received)}</div></section>

    <footer class="inv__foot"><b dir="auto">${esc(thanks)}</b>${onePage ? `<span>${esc(x.page)} ${num('1 / 1')}</span>` : ''}</footer>
  </div>
</article>`;

  return `<!DOCTYPE html><html lang="${x.htmlLang}" dir="${x.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.number)} · ${esc(company.name)}</title>
<style>${a.fonts}</style>
<style>${a.css}</style>
<style>${EXTRA_CSS}
@page{size:${page} portrait;margin:0}</style></head>
<body>${article}</body></html>`;
}

/** Additions to the design's CSS for what the app shows on top of it, plus the screen preview frame. */
const EXTRA_CSS = `
html,body{margin:0;background:#f3f4f6}
.inv[lang=ckb]{font-family:'Vazirmatn','Cairo',Tahoma,sans-serif}
.inv[lang=ckb] .inv__title h1{letter-spacing:0}
.inv__row--sub{align-items:flex-start}
.inv__row--sub span small,.inv__row--sub b small{display:block;font-size:11px;font-weight:400;color:var(--muted)}
.inv__row--sub b{text-align:end}
.inv__acct{margin-top:10px;padding:8px 10px;border-radius:8px;background:var(--tile);font-size:12px}
.inv__acct div{display:flex;justify-content:space-between;gap:10px;padding:2px 0}
.inv__acct span{color:var(--muted)}
.inv__void{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:88px;font-weight:800;color:rgba(220,38,38,.18);transform:rotate(-24deg)}
/* A5: notes and totals side by side and tighter spacing, so a normal invoice stays on one sheet */
.inv--a5 .inv__in{padding:16px 20px 14px}
.inv--a5 .inv__title{margin:12px 0 10px}
.inv--a5 .inv__title h1{font-size:28px}
.inv--a5 .inv__card{padding:6px 10px}
.inv--a5 .inv__bill{margin:10px 0 12px;padding:14px 14px 10px}
.inv--a5 .inv__bottom{grid-template-columns:1fr 1.15fr;gap:12px;margin-top:12px}
.inv--a5 .inv__note{min-height:0;padding:10px 12px;font-size:10.5px;line-height:1.55}
.inv--a5 .inv__grand{margin-top:0;padding:9px 12px}
.inv--a5 .inv__grand span{font-size:13px}
.inv--a5 .inv__grand strong{font-size:19px}
.inv--a5 .inv__row{padding:5px 3px;font-size:11.5px}
.inv--a5 .inv__paid{margin-top:6px;padding:5px;font-size:11px}
.inv--a5 .inv__iqd{margin-top:6px;font-size:11.5px}
.inv--a5 .inv__iqd small{font-size:9.5px}
.inv--a5 .inv__acct{margin-top:6px;padding:6px 8px;font-size:10.5px}
.inv--a5 .inv__sign{padding-top:22px}
.inv--a5 .inv__sign div{font-size:10.5px}
.inv--a5 .inv__foot{margin-top:12px;padding-top:8px;font-size:10.5px}
.inv--a5 .inv__foot b{font-size:11px}
@media screen{body{padding:24px 0}.inv{margin:0 auto}}
@media print{html,body{background:#fff}}
`;
