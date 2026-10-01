import 'server-only';
import { t, type Lang } from '@/lib/i18n';
import { balanceLabel } from '@/lib/format';
import { conversionText } from '@/lib/conversion';
import { fmtDate } from '@/lib/dates';
import { D, fmtCost, fmtKg, fmtMoney, fmtNum, fmtPct, fmtPrice, rateLine, type Cur } from '@/lib/money';
import { docKindOf, type Kind } from '@/lib/kinds';
import { getCompany } from '../common';
import { txnDetail } from '../q/history';
import { statementRows } from '../q/parties';
import { notFound } from '../errors';
import { docHtml, esc, num } from './shell';

const HEAD: Record<ReturnType<typeof docKindOf>, 'doc.invoice' | 'doc.receipt' | 'doc.voucher'> = { invoice: 'doc.invoice', receipt: 'doc.receipt', voucher: 'doc.voucher' };

/** Invoice (sales), receipt (payments/refunds) or voucher (purchase, vault, processing) — always A5. */
export async function txnDocument(id: string, lang: Lang) {
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
      <div class="box"><p class="lbl">${esc(kind === 'SALE' ? L('doc.billTo') : d.customer ? L('pos.customer') : L('pur.beneficiary'))}</p>
        <div class="val bidi">${esc(party.name)}</div>
        ${party.phone ? `<div class="s m">${num(party.phone)}</div>` : ''}
        ${party.address ? `<div class="s m bidi">${esc(party.address)}</div>` : ''}
      </div>
      <div class="box"><p class="lbl">${esc(L('common.currency'))} · ${esc(L('doc.vaultUsed'))}</p>
        <div class="val">${esc(L(`cur.${cur}`))}${d.vault ? ` · ${esc(L(`vault.${d.vault}` as 'vault.USD'))}` : ''}</div>
        <div class="s m">${esc(L('doc.rateApplied'))}: ${num(rateLine(d.rate))}</div>
      </div>
    </section>`);
  }

  if (kind === 'SALE' || kind === 'PURCHASE') {
    parts.push(`<section class="block"><table>
      <thead><tr><th class="c" style="width:22px">${esc(L('doc.line'))}</th><th>${esc(L('common.product'))}</th><th>${esc(L('common.stockState'))}</th><th class="e">${esc(L('common.kg'))}</th><th class="e">${esc(L('common.unitPriceShort'))}</th><th class="e">${esc(L('common.total'))}</th></tr></thead>
      <tbody>${d.lines
        .map(
          (l, i) => `<tr><td class="c m">${num(i + 1)}</td><td><div class="bidi b">${esc(l.productName)}</div><span class="chip n">${esc(l.sku)}</span> <span class="s m bidi">${esc(l.typeName)}</span></td>
          <td class="s">${esc(L(`state.${l.state}` as 'state.RAW'))}</td><td class="e">${num(fmtKg(l.kg))}</td><td class="e">${num(fmtPrice(l.unitPrice, cur))}</td><td class="e b">${num(fmtMoney(l.lineTotal, cur))}</td></tr>`,
        )
        .join('')}</tbody>
    </table></section>`);
    const due = D(d.total).minus(D(d.cashPaid));
    parts.push(`<section class="block"><table class="totals">
      <tr><td class="m">${esc(L('common.total'))}</td><td class="e b">${num(fmtMoney(d.total, cur))}</td></tr>
      ${cur === 'IQD' ? `<tr><td class="m">${esc(L('common.usdEquivalent'))}</td><td class="e">${num(fmtMoney(d.totalUsd))}</td></tr>` : ''}
      <tr><td class="m">${esc(L('common.cashPaid'))}</td><td class="e">${num(fmtMoney(d.cashPaid, cur))}</td></tr>
      <tr class="grand"><td>${esc(due.isNegative() ? L('doc.overpaid') : L('doc.amountDue'))}</td><td class="e ${due.gt(0) ? 'neg' : ''}">${num(fmtMoney(due.abs(), cur))}</td></tr>
    </table></section>`);
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
  if (d.vault && d.vault !== cur && D(d.cashPaid).gt(0) && !kind.startsWith('VAULT_')) {
    const dir = kind === 'SALE' || kind === 'CUSTOMER_PAYMENT' || kind === 'BENEFICIARY_REFUND' ? 'in' : 'out';
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
  if (kind !== 'PROCESSING') parts.push(`<div class="sign"><div>${esc(L('doc.signature'))}</div><div>${esc(L('doc.receivedBy'))}</div></div>`);

  const heading = kind === 'SALE' ? L('doc.invoice') : kind === 'PURCHASE' || kind === 'PROCESSING' || kind === 'EXPENSE' || kind.startsWith('VAULT_') ? L(`kind.${kind}` as 'kind.SALE') : L(HEAD[docKindOf(kind)]);
  const html = await docHtml({
    lang,
    title: `${d.number} · ${company.name}`,
    size: 'A5',
    company,
    heading,
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
