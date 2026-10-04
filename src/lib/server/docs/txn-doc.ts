import 'server-only';
import { t, type Lang } from '@/lib/i18n';
import { balanceLabel } from '@/lib/format';
import { conversionText } from '@/lib/conversion';
import { fmtDate } from '@/lib/dates';
import { convert, D, fmtCost, fmtKg, fmtMoney, fmtNum, fmtPct, fmtPrice, fmtRate, rateLine, roundMoney, type Cur } from '@/lib/money';
import { docKindOf, type Kind } from '@/lib/kinds';
import { getCompany } from '../common';
import { txnDetail } from '../q/history';
import { statementRows } from '../q/parties';
import { notFound } from '../errors';
import { docHtml, esc, num, type PageSize } from './shell';

const HEAD: Record<ReturnType<typeof docKindOf>, 'doc.invoice' | 'doc.receipt' | 'doc.voucher'> = { invoice: 'doc.invoice', receipt: 'doc.receipt', voucher: 'doc.voucher' };

/**
 * Sales invoice, purchase invoice, receipt (payments/refunds) or voucher (vault, processing, expense), in A5
 * (default) or A4. Sales and purchase invoices are visibly different documents: own title, own accent colour
 * (blue / teal), own wording for the party and the amount still owed.
 */
export async function txnDocument(id: string, lang: Lang, size: PageSize = 'A5') {
  const d = await txnDetail(id);
  if (!d) throw notFound();
  const company = await getCompany();
  const kind = d.kind as Kind;
  const cur = d.currency as Cur;
  const L = (k: Parameters<typeof t>[0], p?: Record<string, string | number>) => t(k, lang, p);
  const party = d.customer ?? d.beneficiary;
  const side = d.customer ? 'customer' : 'beneficiary';

  // Balance before/after this document, from the append-only ledger (skipped for deleted documents).
  let balance: { before: string; after: string } | null = null;
  if (party && !d.deletedAt) {
    const rows = await statementRows(side, party.id);
    const r = rows.find((x) => x.id === d.id);
    if (r) balance = { before: D(r.running).minus(D(r.effectUsd)).toString(), after: r.running };
  }

  const parts: string[] = [];
  if (party) {
    parts.push(`<section class="block row">
      <div class="box"><p class="lbl">${esc(kind === 'SALE' ? L('doc.billTo') : kind === 'PURCHASE' ? L('doc.supplier') : d.customer ? L('pos.customer') : L('pur.beneficiary'))}</p>
        <div class="val bidi">${esc(party.name)}</div>
        ${party.phone ? `<div class="s m">${num(party.phone)}</div>` : ''}
        ${party.address ? `<div class="s m bidi">${esc(party.address)}</div>` : ''}
      </div>
      ${kind === 'SALE' || kind === 'PURCHASE' ? '' : `<div class="box"><p class="lbl">${esc(L('common.currency'))} · ${esc(L('doc.vaultUsed'))}</p>
        <div class="val">${esc(L(`cur.${cur}`))}${d.vault ? ` · ${esc(L(`vault.${d.vault}` as 'vault.USD'))}` : ''}</div>
        <div class="s m">${esc(L('doc.rateApplied'))}: ${num(rateLine(d.rate))}</div>
      </div>`}
    </section>`);
  }

  if (kind === 'SALE' || kind === 'PURCHASE') {
    const totalKg = d.lines.reduce((sum, l) => sum.plus(D(l.kg)), D(0));
    parts.push(`<section class="block tablewrap"><table class="lines">
      <colgroup><col class="cn"><col><col class="cs hs"><col class="ck"><col class="cp"><col class="ct"></colgroup>
      <thead><tr><th class="c">${esc(L('doc.line'))}</th><th>${esc(L('common.product'))}</th><th class="hs">${esc(L('doc.state'))}</th><th class="e">${esc(L('common.kg'))}</th><th class="e">${esc(L('common.unitPriceShort'))}</th><th class="e">${esc(L('common.total'))}</th></tr></thead>
      <tbody>${d.lines
        .map(
          (l, i) => `<tr><td class="c m">${num(i + 1)}</td><td><div class="pname bidi">${esc(l.productName)}</div><div class="pmeta"><span class="chip n">${esc(l.sku)}</span> <span class="bidi">${esc(l.typeName)}</span></div></td>
          <td class="s hs">${esc(L(`state.${l.state}` as 'state.RAW'))}</td><td class="e">${num(fmtKg(l.kg))}</td><td class="e">${num(fmtPrice(l.unitPrice, cur))}</td><td class="e b">${num(fmtMoney(l.lineTotal, cur))}</td></tr>`,
        )
        .join('')}</tbody>
      <tfoot><tr><td></td><td>${esc(L('doc.itemsN', { n: d.lines.length }))}</td><td class="hs"></td><td class="e">${num(fmtKg(totalKg))}</td><td></td><td class="e">${num(fmtMoney(d.total, cur))}</td></tr></tfoot>
    </table></section>`);
    const due = D(d.total).minus(D(d.cashPaid));
    // Split payment: each currency on its own line, with what it is worth in the invoice currency.
    const r = D(d.rate);
    const usd = D(d.paidUsd);
    const iqd = D(d.paidIqd);
    const worth = (amount: ReturnType<typeof D>, from: Cur) =>
      from !== cur ? `<div class="s m">= ${num(fmtMoney(roundMoney(convert(amount, from, cur, r), cur), cur))}</div>` : '';
    const vaultWord = (v: Cur) => (kind === 'SALE' ? L('pay.toVault', { vault: L(`vault.${v}` as 'vault.USD') }) : L('pay.fromVault', { vault: L(`vault.${v}` as 'vault.USD') }));
    const payRow = (amount: ReturnType<typeof D>, from: Cur) =>
      amount.gt(0)
        ? `<tr><td class="m">${esc(L(from === 'USD' ? 'pay.inUsd' : 'pay.inIqd'))}<div class="s m">${esc(vaultWord(from))}</div></td><td class="e">${num(fmtMoney(amount, from))}${worth(amount, from)}</td></tr>`
        : '';
    const crossed = (cur === 'USD' && iqd.gt(0)) || (cur === 'IQD' && usd.gt(0));
    parts.push(`<section class="block sumrow">
      <div class="facts">
        <div>${esc(L('doc.payCurrency'))}: <b>${esc(L(`cur.${cur}`))}</b></div>
        <div>${esc(L('doc.rateApplied'))}: <b>${num(rateLine(d.rate))}</b></div>
        ${
          crossed
            ? // Only the amounts are isolated left-to-right, so the sentence wraps and reads correctly in Kurdish too.
              `<div>${esc(
                cur === 'USD'
                  ? L('pay.iqdWorth', { iqd: '\u0001', usd: '\u0002', rate: '\u0003' })
                  : L('pay.usdWorth', { usd: '\u0001', iqd: '\u0002', rate: '\u0003' }),
              )
                .replace('\u0001', num(cur === 'USD' ? fmtMoney(iqd, 'IQD') : fmtMoney(usd)))
                .replace('\u0002', num(cur === 'USD' ? fmtMoney(convert(iqd, 'IQD', 'USD', r).toDecimalPlaces(2)) : fmtMoney(roundMoney(convert(usd, 'USD', 'IQD', r), 'IQD'), 'IQD')))
                .replace('\u0003', num(fmtRate(r)))}</div>`
            : ''
        }
      </div>
      <table class="totals">
        <tr><td class="m">${esc(L('doc.subtotal'))}</td><td class="e b">${num(fmtMoney(d.total, cur))}</td></tr>
        ${cur === 'IQD' ? `<tr><td class="m">${esc(L('common.usdEquivalent'))}</td><td class="e">${num(fmtMoney(d.totalUsd))}</td></tr>` : ''}
        ${payRow(usd, 'USD')}
        ${payRow(iqd, 'IQD')}
        <tr><td class="m">${esc(kind === 'SALE' ? L('doc.paidByCustomer') : L('doc.paidToSupplier'))}</td><td class="e b">${num(fmtMoney(d.cashPaid, cur))}</td></tr>
        <tr class="grand"><td>${esc(due.isNegative() ? L('doc.overpaid') : kind === 'SALE' ? L('doc.amountDue') : L('doc.balanceToPay'))}</td><td class="e ${due.gt(0) ? 'neg' : ''}">${num(fmtMoney(due.abs(), cur))}${
          due.gt(0) && cur === 'USD' ? `<div class="s">= ${num(fmtMoney(roundMoney(convert(due, 'USD', 'IQD', r), 'IQD'), 'IQD'))}</div>` : ''
        }</td></tr>
      </table>
    </section>`);
  }

  if (kind.startsWith('CUSTOMER_') || kind.startsWith('BENEFICIARY_')) {
    parts.push(`<section class="block"><table class="totals" style="width:100%">
      <tr><td class="m">${esc(L(`kind.${kind}` as 'kind.SALE'))}</td><td class="e b">${num(fmtMoney(d.total, cur))}</td></tr>
      ${cur === 'IQD' ? `<tr><td class="m">${esc(L('common.usdEquivalent'))}</td><td class="e">${num(fmtMoney(d.totalUsd))}</td></tr>` : ''}
    </table></section>`);
  }

  if (kind.startsWith('VAULT_')) {
    const vcur = d.vault as Cur;
    parts.push(`<section class="block row">
      <div class="box"><p class="lbl">${esc(kind === 'VAULT_TRANSFER' ? L('vault.fromVault') : L('common.vault'))}</p><div class="val">${esc(L(`vault.${vcur}` as 'vault.USD'))}</div>
        <div class="val ${kind === 'VAULT_DEPOSIT' ? 'pos' : 'neg'}">${num(`${kind === 'VAULT_DEPOSIT' ? '+' : '−'}${fmtMoney(d.vaultAmount, vcur)}`)}</div></div>
      ${
        kind === 'VAULT_TRANSFER' && d.toVault
          ? `<div class="box"><p class="lbl">${esc(L('vault.toVault'))}</p><div class="val">${esc(L(`vault.${d.toVault}` as 'vault.USD'))}</div><div class="val pos">${num(`+${fmtMoney(d.toAmount, d.toVault as Cur)}`)}</div></div>`
          : d.label
            ? `<div class="box"><p class="lbl">${esc(kind === 'VAULT_WITHDRAWAL' ? L('common.reason') : L('common.source'))}</p><div class="val bidi">${esc(d.label)}</div></div>`
            : ''
      }
    </section>
    <p class="s m block">${esc(L('doc.rateApplied'))}: ${num(rateLine(d.rate))}</p>`);
  }

  if (kind === 'EXPENSE') {
    const vcur = d.vault as Cur;
    const unit = d.unitPrice && d.quantity ? `${fmtNum(d.quantity, D(d.quantity).isInteger() ? 0 : 2)} ${d.unitName} × ${fmtPrice(d.unitPrice, vcur)}` : '';
    parts.push(`<section class="block row">
      <div class="box"><p class="lbl">${esc(L('exp.category'))}</p><div class="val bidi">${esc(d.label)}</div>${unit ? `<div class="s m">${num(unit)}</div>` : ''}</div>
      <div class="box"><p class="lbl">${esc(L('exp.vault'))}</p><div class="val">${esc(L(`vault.${vcur}` as 'vault.USD'))}</div>
        <div class="val neg">${num(`−${fmtMoney(d.vaultAmount, vcur)}`)}</div></div>
    </section>
    <p class="s m block">${esc(L('doc.rateApplied'))}: ${num(rateLine(d.rate))}${vcur === 'IQD' ? ` · ${esc(L('common.usdEquivalent'))}: ${num(fmtMoney(d.totalUsd))}` : ''}</p>`);
  }

  if (kind === 'PROCESSING' && d.product) {
    const out = D(d.outputKg);
    parts.push(`<section class="block">
      <div class="box"><p class="lbl">${esc(L('common.product'))}</p><div class="val bidi">${esc(d.product.name)} <span class="chip n">${esc(d.product.sku)}</span></div></div>
      <table class="block"><thead><tr><th>${esc(L('detail.inputKg'))}</th><th>${esc(L('detail.method'))}</th><th class="e">${esc(L('detail.lossKg'))}</th><th class="e">${esc(L('detail.outputKg'))}</th><th class="e">${esc(L('inv.avgCostFinished'))}</th></tr></thead>
      <tbody><tr><td>${num(fmtKg(d.inputKg))}</td><td>${esc(d.lossMethod === 'PERCENT' ? L('prc.byPercent') : L('prc.byKg'))}</td><td class="e neg">${num(`${fmtKg(d.lossKg)} (${fmtPct(d.lossPercent)})`)}</td><td class="e b">${num(fmtKg(d.outputKg))}</td><td class="e">${num(out.gt(0) ? fmtCost(D(d.cogsUsd).div(out)) : '—')}</td></tr></tbody></table>
      <p class="note block">${esc(L('doc.processingNote', { in: fmtKg(d.inputKg), out: fmtKg(d.outputKg), loss: fmtKg(d.lossKg) }))}</p>
    </section>`);
  }

  // Vault conversion (e.g. "960,000 IQD ÷ 1,480 = $648.65 into USD Vault").
  if (d.vault && d.vault !== cur && D(d.cashPaid).gt(0) && !kind.startsWith('VAULT_') && kind !== 'SALE' && kind !== 'PURCHASE') {
    const dir = kind === 'CUSTOMER_PAYMENT' || kind === 'BENEFICIARY_REFUND' ? 'in' : 'out';
    const conv = conversionText(d.cashPaid, cur, d.vault as Cur, d.rate, dir, lang);
    if (conv) parts.push(`<p class="note block">${num(conv)}</p>`);
  }

  if (balance && party) {
    const b0 = balanceLabel(side, balance.before, lang);
    const b1 = balanceLabel(side, balance.after, lang);
    const tone = (x: string) => (x === 'danger' ? 'neg' : x === 'success' ? 'pos' : 'm');
    parts.push(`<section class="block row">
      <div class="box"><p class="lbl">${esc(L('pos.prevBalance'))}</p><div class="val ${tone(b0.tone)} bidi">${esc(b0.text)}</div></div>
      <div class="box"><p class="lbl">${esc(L('pos.newBalance'))}</p><div class="val ${tone(b1.tone)} bidi">${esc(b1.text)}</div></div>
    </section>`);
  }

  if (d.notes) parts.push(`<section class="block"><p class="lbl s m">${esc(L('common.notes'))}</p><div class="note bidi">${esc(d.notes)}</div></section>`);
  const tail = kind !== 'PROCESSING' ? `<div class="sign"><div>${esc(L('doc.signature'))}</div><div>${esc(kind === 'PURCHASE' ? L('doc.deliveredBy') : L('doc.receivedBy'))}</div></div>` : '';
  // Paid status for invoices — the one thing a reader looks for first.
  const owed = D(d.total).minus(D(d.cashPaid));
  const status = owed.lte(0) ? 'paid' : D(d.cashPaid).gt(0) ? 'partial' : 'unpaid';
  const badge = kind === 'SALE' || kind === 'PURCHASE' ? `<div><span class="stamp-badge st-${status}">${esc(L(`status.${status}` as 'status.paid'))}</span></div>` : '';

  const heading = kind === 'SALE' ? L('doc.invoice') : kind === 'PURCHASE' ? L('doc.purchaseInvoice') : kind === 'PROCESSING' || kind === 'EXPENSE' || kind.startsWith('VAULT_') ? L(`kind.${kind}` as 'kind.SALE') : L(HEAD[docKindOf(kind)]);
  const html = await docHtml({
    lang,
    title: `${d.number} · ${company.name}`,
    size,
    company,
    heading,
    badge,
    tail,
    accent: kind === 'PURCHASE' ? 'teal' : 'blue',
    meta: [
      { label: L('common.number'), value: num(d.number) },
      { label: L('common.date'), value: num(fmtDate(d.date)) },
      ...(d.createdByName ? [{ label: L('common.createdBy'), value: `<span class="bidi">${esc(d.createdByName)}</span>` }] : []),
    ],
    body: parts.join('\n'),
    deleted: !!d.deletedAt,
  });
  return { html, number: d.number, kind };
}
