import 'server-only';
import type { Currency, LossMethod, StockState, TxnKind } from '@prisma/client';
import { withTx, type Tx } from '@/lib/db';
import { D, Dec, convert, fmtKg, fmtMoney, parseDec, round2, round3, round4, roundMoney, toUsd } from '@/lib/money';
import { AppError, Validator, fieldError, notFound, type FieldErrors } from './errors';
import {
  assertCash,
  assertStockNonNegative,
  beneficiaryBalance,
  clearResidualCost,
  customerBalance,
  lockParty,
  lockProducts,
  lockVaults,
  nextNumber,
  partyMove,
  payOut,
  reverseEffects,
  stockIn,
  stockOut,
  stockPos,
  vaultMove,
  type Src,
  type StockKey,
} from './ledger';
import { asState, cleanMultiline, cleanText, currentRate, reqCurrency, reqDate, reqNonNegative, reqPositive } from './common';
import { audit, jsonSafe } from './audit';
import { isLocked } from '@/lib/lock';

export type Actor = { id: string; name: string };
type Opts = { isDemo?: boolean; allowShortfall?: boolean };
/** The user confirmed recording a payment the vault can't fully cover (see payOut). */
const shortOk = (input: { allowShortfall?: unknown }, opts: Opts) => input.allowShortfall === true || !!opts.allowShortfall;
export type Saved = { id: string; number: string };

// ─── Split payment (sales & purchases) ──────────────────────────────────────────────────────────────
// A sale or purchase can be paid partly in USD and partly in IQD. Each part goes to its own vault and
// counts toward the invoice at the invoice's rate (e.g. rate 100 USD = 157,500 IQD → 157,500 IQD pays $100).
// Older clients send one amount (cashPaid, in the invoice currency) + one vault; that still works.
type PayInput = { paidUsd?: string; paidIqd?: string; vault?: string; cashPaid?: string };
type PayRead = { split: true; usd: Dec; iqd: Dec } | { split: false; vault: Currency; cash: Dec };

function readPay(v: Validator, input: PayInput): PayRead {
  if (input.paidUsd !== undefined || input.paidIqd !== undefined) {
    return { split: true, usd: reqNonNegative(v, 'paidUsd', input.paidUsd), iqd: reqNonNegative(v, 'paidIqd', input.paidIqd) };
  }
  return { split: false, vault: reqCurrency(v, 'vault', input.vault), cash: reqNonNegative(v, 'cashPaid', input.cashPaid) };
}

/** What was paid, per vault, and what it is worth in the invoice currency and in USD. */
function payParts(p: PayRead, currency: Currency, rate: Dec, total: Dec, totalUsd: Dec) {
  let usd: Dec;
  let iqd: Dec;
  let cash: Dec;
  if (p.split) {
    usd = roundMoney(p.usd, 'USD');
    iqd = roundMoney(p.iqd, 'IQD');
    cash = roundMoney(convert(usd, 'USD', currency, rate).plus(convert(iqd, 'IQD', currency, rate)), currency);
  } else {
    cash = roundMoney(p.cash, currency);
    const amt = roundMoney(convert(cash, currency, p.vault, rate), p.vault);
    usd = p.vault === 'USD' ? amt : new Dec(0);
    iqd = p.vault === 'IQD' ? amt : new Dec(0);
  }
  // Paid in full (after rounding to the invoice currency) → no cent of debt left from conversion rounding.
  const cashUsd = cash.eq(total) ? totalUsd : round2(p.split ? usd.plus(toUsd(iqd, 'IQD', rate)) : toUsd(cash, currency, rate));
  // `vault` / `vaultAmount` keep pointing at one vault for older screens; paidUsd / paidIqd are the full story.
  const vault: Currency = usd.gt(0) ? 'USD' : iqd.gt(0) ? 'IQD' : p.split ? currency : p.vault;
  return { usd, iqd, cash, cashUsd, vault, vaultAmount: vault === 'USD' ? usd : iqd };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────────────────────────
/** Lock parties in a stable order (after vaults, before products) so refunds see a stable balance. */
async function lockParties(tx: Tx, ids: (string | null | undefined)[]) {
  for (const id of [...new Set(ids.filter((x): x is string => !!x))].sort()) await lockParty(tx, id);
}

// ─── (edit loading) ───────────────────────────────────────────────────────────────────────────────────────
async function loadForEdit(tx: Tx, id: string, kinds: TxnKind[]) {
  const old = await tx.txn.findUnique({ where: { id }, include: { lines: true } });
  if (!old || old.deletedAt || !kinds.includes(old.kind)) throw notFound();
  if (isLocked(old.kind, old.createdAt)) throw new AppError(409, 'invc.locked', { number: old.number });
  return old;
}

export async function snapshotTxn(tx: Tx, id: string) {
  const t = await tx.txn.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: 'asc' }, include: { product: { select: { name: true, sku: true } } } },
      customer: { select: { name: true } },
      beneficiary: { select: { name: true } },
      product: { select: { name: true, sku: true } },
    },
  });
  return jsonSafe(t);
}

/** Client totals are display-only. When they disagree with the server, the server wins and we log it. */
async function checkClientTotal(tx: Tx, actor: Actor, number: string, client: unknown, server: Dec) {
  if (client === undefined || client === null || client === '') return;
  const c = parseDec(client);
  if (c && c.eq(server)) return;
  await audit({ user: actor, action: 'mismatch', module: 'integrity', reference: number, before: { clientTotal: String(client) }, after: { serverTotal: server.toString() } }, tx);
}

const stamp = (actor: Actor, create: boolean) =>
  create
    ? { createdById: actor.id, createdByName: actor.name, updatedById: actor.id, updatedByName: actor.name }
    : { updatedById: actor.id, updatedByName: actor.name };

// ─── Purchase ──────────────────────────────────────────────────────────────────────────────────────
export type PurchaseInput = {
  date?: string;
  beneficiaryId?: string;
  productId?: string;
  newProduct?: { name?: string; sku?: string; typeId?: string } | null;
  state?: string;
  kg?: string;
  unitPrice?: string;
  currency?: string;
  vault?: string;
  cashPaid?: string;
  paidUsd?: string;
  paidIqd?: string;
  notes?: string;
  clientTotal?: string;
  allowShortfall?: boolean;
};

export async function savePurchase(input: PurchaseInput, actor: Actor, editId?: string, opts: Opts = {}): Promise<Saved> {
  const v = new Validator();
  const date = reqDate(v, 'date', input.date);
  const kg = round3(reqPositive(v, 'kg', input.kg));
  const unitPrice = round4(reqPositive(v, 'unitPrice', input.unitPrice));
  const currency = reqCurrency(v, 'currency', input.currency);
  const pay = readPay(v, input);
  const state = asState(input.state);
  if (!state) v.add('state', 'v.required');
  if (!input.beneficiaryId) v.add('beneficiaryId', 'v.beneficiaryRequired');
  const np = input.productId ? null : input.newProduct;
  const npName = cleanText(np?.name, 120);
  const npSku = cleanText(np?.sku, 60).toUpperCase();
  if (!input.productId) {
    if (!np) v.add('productId', 'v.productRequired');
    else {
      if (!npName) v.add('newProduct.name', 'v.required');
      if (!npSku) v.add('newProduct.sku', 'v.required');
      if (!np.typeId) v.add('newProduct.typeId', 'v.typeRequired');
    }
  }
  v.throwIfAny();
  if (kg.isZero()) throw fieldError('kg', 'v.positive');

  return withTx(async (tx) => {
    const ben = await tx.beneficiary.findUnique({ where: { id: input.beneficiaryId! } });
    if (!ben) throw fieldError('beneficiaryId', 'v.beneficiaryRequired');

    let productId = input.productId ?? '';
    if (!productId) {
      if (await tx.product.findUnique({ where: { sku: npSku } })) throw fieldError('newProduct.sku', 'v.skuExists');
      const type = await tx.aluminumType.findUnique({ where: { id: np!.typeId! } });
      if (!type) throw fieldError('newProduct.typeId', 'v.typeRequired');
      const p = await tx.product.create({ data: { name: npName, sku: npSku, typeId: type.id, isDemo: !!opts.isDemo } });
      await audit({ user: actor, action: 'create', module: 'products', reference: p.sku, after: p }, tx);
      productId = p.id;
    } else if (!(await tx.product.findUnique({ where: { id: productId } }))) {
      throw fieldError('productId', 'v.productRequired');
    }

    await lockVaults(tx);
    const old = editId ? await loadForEdit(tx, editId, ['PURCHASE']) : null;
    await lockParties(tx, [ben.id, old?.beneficiaryId]);
    await lockProducts(tx, [productId, ...(old ? old.lines.map((l) => l.productId) : [])]);
    const before = old ? await snapshotTxn(tx, old.id) : null;

    const rate = old ? D(old.rate) : await currentRate(tx);
    const total = roundMoney(kg.times(unitPrice), currency);
    const totalUsd = round2(toUsd(total, currency, rate));
    const valueUsd = round4(toUsd(total, currency, rate));
    const paid = payParts(pay, currency, rate, total, totalUsd);
    const cashUsd = paid.cashUsd;
    const notes = cleanMultiline(input.notes);

    const touched: StockKey[] = [];
    let txnId: string;
    let number: string;
    const data = {
      date,
      beneficiaryId: ben.id,
      customerId: null,
      currency,
      total: total.toString(),
      totalUsd: totalUsd.toString(),
      cashPaid: paid.cash.toString(),
      cashPaidUsd: cashUsd.toString(),
      paidUsd: paid.usd.toString(),
      paidIqd: paid.iqd.toString(),
      vault: paid.vault,
      vaultAmount: paid.vaultAmount.toString(),
      notes,
    };
    const line = {
      position: 0,
      productId,
      state: state!,
      kg: kg.toString(),
      unitPrice: unitPrice.toString(),
      lineTotal: total.toString(),
      lineTotalUsd: valueUsd.toString(),
      unitCostUsd: round4(valueUsd.div(kg)).toString(),
      cogsUsd: '0',
    };
    if (old) {
      touched.push(...(await reverseEffects(tx, { txnId: old.id, kind: old.kind, date: old.date })));
      await tx.txnLine.deleteMany({ where: { txnId: old.id } });
      await tx.txn.update({ where: { id: old.id }, data: { ...data, ...stamp(actor, false), lines: { create: [line] } } });
      txnId = old.id;
      number = old.number;
    } else {
      number = await nextNumber(tx, 'PURCHASE');
      const t = await tx.txn.create({
        data: { ...data, number, kind: 'PURCHASE', rate: rate.toString(), isDemo: !!opts.isDemo, ...stamp(actor, true), lines: { create: [line] } },
      });
      txnId = t.id;
    }

    const src: Src = { txnId, kind: 'PURCHASE', date };
    await stockIn(tx, src, productId, state!, kg, valueUsd);
    await payOut(tx, src, 'USD', paid.usd, shortOk(input, opts));
    await payOut(tx, src, 'IQD', paid.iqd, shortOk(input, opts));
    await partyMove(tx, src, { beneficiaryId: ben.id }, totalUsd.minus(cashUsd));
    touched.push({ productId, state: state! });
    if (old) await assertStockNonNegative(tx, touched, { number, action: 'update', txnId, createdAt: old.createdAt });
    await clearResidualCost(tx, src, touched);

    await checkClientTotal(tx, actor, number, input.clientTotal, total);
    await audit({ user: actor, action: old ? 'update' : 'create', module: 'purchases', reference: number, before, after: await snapshotTxn(tx, txnId) }, tx);
    return { id: txnId, number };
  });
}

// ─── Sale ──────────────────────────────────────────────────────────────────────────────────────────
export type SaleLineInput = { productId?: string; state?: string; kg?: string; unitPrice?: string };
export type SaleInput = {
  date?: string;
  customerId?: string;
  currency?: string;
  vault?: string;
  cashPaid?: string;
  paidUsd?: string;
  paidIqd?: string;
  notes?: string;
  lines?: SaleLineInput[];
  clientTotal?: string;
};

export async function saveSale(input: SaleInput, actor: Actor, editId?: string, opts: Opts = {}): Promise<Saved> {
  const v = new Validator();
  const date = reqDate(v, 'date', input.date);
  const currency = reqCurrency(v, 'currency', input.currency);
  const pay = readPay(v, input);
  if (!input.customerId) v.add('customerId', 'v.customerRequired');
  const rawLines = Array.isArray(input.lines) ? input.lines.slice(0, 60) : [];
  if (!rawLines.length) v.add('lines', 'v.lineRequired');
  const lines = rawLines.map((l, i) => {
    if (!l.productId) v.add(`lines.${i}.productId`, 'v.productRequired');
    const state = asState(l.state);
    if (!state) v.add(`lines.${i}.state`, 'v.required');
    const kg = round3(reqPositive(v, `lines.${i}.kg`, l.kg));
    const unitPrice = round4(reqPositive(v, `lines.${i}.unitPrice`, l.unitPrice));
    if (kg.isZero()) v.add(`lines.${i}.kg`, 'v.positive');
    return { productId: l.productId ?? '', state: (state ?? 'RAW') as StockState, kg, unitPrice };
  });
  v.throwIfAny();

  return withTx(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId! } });
    if (!customer) throw fieldError('customerId', 'v.customerRequired');

    await lockVaults(tx);
    const old = editId ? await loadForEdit(tx, editId, ['SALE']) : null;
    await lockParties(tx, [customer.id, old?.customerId]);
    await lockProducts(tx, [...lines.map((l) => l.productId), ...(old ? old.lines.map((l) => l.productId) : [])]);
    const before = old ? await snapshotTxn(tx, old.id) : null;

    const products = await tx.product.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.productId))] } }, select: { id: true, name: true } });
    const nameOf = new Map(products.map((p) => [p.id, p.name]));
    const pv = new Validator();
    lines.forEach((l, i) => {
      if (!nameOf.has(l.productId)) pv.add(`lines.${i}.productId`, 'v.productRequired');
    });
    pv.throwIfAny();

    const touched: StockKey[] = [];
    if (old) touched.push(...(await reverseEffects(tx, { txnId: old.id, kind: old.kind, date: old.date })));

    // Validate every line against current stock (after returning this invoice's own stock, when editing).
    const need = new Map<string, { kg: Dec; idx: number[]; productId: string; state: StockState }>();
    lines.forEach((l, i) => {
      const k = `${l.productId}:${l.state}`;
      const cur = need.get(k) ?? { kg: new Dec(0), idx: [], productId: l.productId, state: l.state };
      cur.kg = cur.kg.plus(l.kg);
      cur.idx.push(i);
      need.set(k, cur);
    });
    const stockErrors: FieldErrors = {};
    let firstParams: Record<string, string> | undefined;
    for (const n of need.values()) {
      const pos = await stockPos(tx, n.productId, n.state);
      if (n.kg.gt(pos.kg)) {
        const params = { kg: fmtKg(pos.kg.isNegative() ? 0 : pos.kg), product: nameOf.get(n.productId) ?? '' };
        firstParams ??= params;
        for (const i of n.idx) stockErrors[`lines.${i}.kg`] = { key: 'v.insufficientStock', params };
      }
    }
    if (firstParams) throw new AppError(422, 'v.insufficientStock', firstParams, stockErrors);

    const rate = old ? D(old.rate) : await currentRate(tx);
    const computed = lines.map((l) => {
      const lineTotal = roundMoney(l.kg.times(l.unitPrice), currency);
      return { ...l, lineTotal, lineTotalUsd: round4(toUsd(lineTotal, currency, rate)) };
    });
    const total = computed.reduce((s, l) => s.plus(l.lineTotal), new Dec(0));
    const totalUsd = round2(toUsd(total, currency, rate));
    const paid = payParts(pay, currency, rate, total, totalUsd);
    const cashUsd = paid.cashUsd;

    const data = {
      date,
      customerId: customer.id,
      beneficiaryId: null,
      currency,
      total: total.toString(),
      totalUsd: totalUsd.toString(),
      cashPaid: paid.cash.toString(),
      cashPaidUsd: cashUsd.toString(),
      paidUsd: paid.usd.toString(),
      paidIqd: paid.iqd.toString(),
      vault: paid.vault,
      vaultAmount: paid.vaultAmount.toString(),
      notes: cleanMultiline(input.notes),
    };
    let txnId: string;
    let number: string;
    if (old) {
      await tx.txnLine.deleteMany({ where: { txnId: old.id } });
      await tx.txn.update({ where: { id: old.id }, data: { ...data, ...stamp(actor, false) } });
      txnId = old.id;
      number = old.number;
    } else {
      number = await nextNumber(tx, 'SALE');
      const t = await tx.txn.create({ data: { ...data, number, kind: 'SALE', rate: rate.toString(), isDemo: !!opts.isDemo, ...stamp(actor, true) } });
      txnId = t.id;
    }

    const src: Src = { txnId, kind: 'SALE', date };
    let cogsTotal = new Dec(0);
    for (const [i, l] of computed.entries()) {
      const out = await stockOut(tx, src, l.productId, l.state, l.kg, nameOf.get(l.productId) ?? '');
      cogsTotal = cogsTotal.plus(out.valueUsd);
      await tx.txnLine.create({
        data: {
          txnId,
          position: i,
          productId: l.productId,
          state: l.state,
          kg: l.kg.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString(),
          lineTotalUsd: l.lineTotalUsd.toString(),
          unitCostUsd: out.unitCostUsd.toString(),
          cogsUsd: out.valueUsd.toString(),
        },
      });
      touched.push({ productId: l.productId, state: l.state });
    }
    await tx.txn.update({ where: { id: txnId }, data: { cogsUsd: round4(cogsTotal).toString() } });
    await vaultMove(tx, src, 'USD', 'IN', paid.usd);
    await vaultMove(tx, src, 'IQD', 'IN', paid.iqd);
    await partyMove(tx, src, { customerId: customer.id }, totalUsd.minus(cashUsd));
    if (old) await assertStockNonNegative(tx, touched, { number, action: 'update', txnId, createdAt: old.createdAt });
    await clearResidualCost(tx, src, touched);

    await checkClientTotal(tx, actor, number, input.clientTotal, total);
    await audit({ user: actor, action: old ? 'update' : 'create', module: 'sales', reference: number, before, after: await snapshotTxn(tx, txnId) }, tx);
    return { id: txnId, number };
  });
}

// ─── Payments & refunds ────────────────────────────────────────────────────────────────────────────
export const PAYMENT_KINDS = ['CUSTOMER_PAYMENT', 'CUSTOMER_REFUND', 'BENEFICIARY_PAYMENT', 'BENEFICIARY_REFUND'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export type PaymentInput = { kind?: string; partyId?: string; date?: string; amount?: string; currency?: string; vault?: string; notes?: string; allowShortfall?: boolean };

export async function savePayment(input: PaymentInput, actor: Actor, editId?: string, opts: Opts = {}): Promise<Saved> {
  const v = new Validator();
  const kind = PAYMENT_KINDS.find((k) => k === input.kind);
  if (!kind) v.add('kind', 'v.required');
  const date = reqDate(v, 'date', input.date);
  const amount = reqPositive(v, 'amount', input.amount);
  const currency = reqCurrency(v, 'currency', input.currency);
  const vault = reqCurrency(v, 'vault', input.vault);
  if (!input.partyId && !editId) v.add('partyId', kind?.startsWith('CUSTOMER') ? 'v.customerRequired' : 'v.beneficiaryRequired');
  v.throwIfAny();
  const isCustomer = kind!.startsWith('CUSTOMER');

  return withTx(async (tx) => {
    await lockVaults(tx);
    const old = editId ? await loadForEdit(tx, editId, [kind!]) : null;
    const partyId = old ? (isCustomer ? old.customerId : old.beneficiaryId) ?? '' : input.partyId!;
    await lockParties(tx, [partyId]);
    const party = isCustomer
      ? await tx.customer.findUnique({ where: { id: partyId }, select: { id: true, name: true } })
      : await tx.beneficiary.findUnique({ where: { id: partyId }, select: { id: true, name: true } });
    if (!party) throw fieldError('partyId', isCustomer ? 'v.customerRequired' : 'v.beneficiaryRequired');
    const before = old ? await snapshotTxn(tx, old.id) : null;

    const rate = old ? D(old.rate) : await currentRate(tx);
    if (old) await reverseEffects(tx, { txnId: old.id, kind: old.kind, date: old.date });

    const amt = roundMoney(amount, currency);
    if (amt.isZero()) throw fieldError('amount', 'v.positive');
    const amtUsd = round2(toUsd(amt, currency, rate));
    const vaultAmount = roundMoney(convert(amt, currency, vault, rate), vault);

    if (kind === 'CUSTOMER_REFUND' || kind === 'BENEFICIARY_REFUND') {
      const bal = isCustomer ? await customerBalance(tx, party.id) : await beneficiaryBalance(tx, party.id);
      const available = bal.neg(); // credit (customer) / advance (beneficiary)
      if (!available.gt(0)) throw fieldError('amount', isCustomer ? 'v.refundNoCredit' : 'v.refundNoAdvance');
      if (amtUsd.gt(available)) throw fieldError('amount', isCustomer ? 'v.refundTooHigh' : 'v.refundTooHighBen', { x: fmtMoney(available) });
    }

    const data = {
      date,
      currency,
      total: amt.toString(),
      totalUsd: amtUsd.toString(),
      cashPaid: amt.toString(),
      cashPaidUsd: amtUsd.toString(),
      vault,
      vaultAmount: vaultAmount.toString(),
      notes: cleanMultiline(input.notes),
    };
    let txnId: string;
    let number: string;
    if (old) {
      await tx.txn.update({ where: { id: old.id }, data: { ...data, ...stamp(actor, false) } });
      txnId = old.id;
      number = old.number;
    } else {
      number = await nextNumber(tx, kind!);
      const t = await tx.txn.create({
        data: {
          ...data,
          number,
          kind: kind!,
          rate: rate.toString(),
          customerId: isCustomer ? party.id : null,
          beneficiaryId: isCustomer ? null : party.id,
          isDemo: !!opts.isDemo,
          ...stamp(actor, true),
        },
      });
      txnId = t.id;
    }
    const src: Src = { txnId, kind: kind!, date };
    const p = isCustomer ? { customerId: party.id } : { beneficiaryId: party.id };
    switch (kind) {
      case 'CUSTOMER_PAYMENT':
        await vaultMove(tx, src, vault, 'IN', vaultAmount);
        await partyMove(tx, src, p, amtUsd.neg());
        break;
      case 'CUSTOMER_REFUND':
        await payOut(tx, src, vault, vaultAmount, shortOk(input, opts));
        await partyMove(tx, src, p, amtUsd);
        break;
      case 'BENEFICIARY_PAYMENT':
        await payOut(tx, src, vault, vaultAmount, shortOk(input, opts));
        await partyMove(tx, src, p, amtUsd.neg());
        break;
      case 'BENEFICIARY_REFUND':
        await vaultMove(tx, src, vault, 'IN', vaultAmount);
        await partyMove(tx, src, p, amtUsd);
        break;
    }
    await audit({ user: actor, action: old ? 'update' : 'create', module: isCustomer ? 'customers' : 'beneficiaries', reference: number, before, after: await snapshotTxn(tx, txnId) }, tx);
    return { id: txnId, number };
  });
}

// ─── Vault operations ──────────────────────────────────────────────────────────────────────────────
export const VAULT_KINDS = ['VAULT_DEPOSIT', 'VAULT_WITHDRAWAL', 'VAULT_TRANSFER'] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];
export type VaultOpInput = { kind?: string; date?: string; vault?: string; toVault?: string; amount?: string; rate?: string; label?: string; notes?: string; allowShortfall?: boolean };

export async function saveVaultOp(input: VaultOpInput, actor: Actor, editId?: string, opts: Opts = {}): Promise<Saved> {
  const v = new Validator();
  const kind = VAULT_KINDS.find((k) => k === input.kind);
  if (!kind) v.add('kind', 'v.required');
  const date = reqDate(v, 'date', input.date);
  const vault = reqCurrency(v, 'vault', input.vault);
  const amount = reqPositive(v, 'amount', input.amount);
  let toVault: Currency | null = null;
  let opRate: Dec | null = null;
  if (kind === 'VAULT_TRANSFER') {
    toVault = reqCurrency(v, 'toVault', input.toVault);
    if (toVault === vault) v.add('toVault', 'v.sameVault');
    if (input.rate !== undefined && input.rate !== '') {
      const r = parseDec(input.rate);
      if (!r || !r.gt(0)) v.add('rate', 'v.rate');
      else opRate = round4(r);
    }
  }
  v.throwIfAny();

  return withTx(async (tx) => {
    await lockVaults(tx);
    const old = editId ? await loadForEdit(tx, editId, [kind!]) : null;
    const before = old ? await snapshotTxn(tx, old.id) : null;
    const rate = opRate ?? (old ? D(old.rate) : await currentRate(tx));
    if (old) await reverseEffects(tx, { txnId: old.id, kind: old.kind, date: old.date });

    const amt = roundMoney(amount, vault);
    if (amt.isZero()) throw fieldError('amount', 'v.positive');
    const totalUsd = round2(toUsd(amt, vault, rate));
    const toAmount = toVault ? roundMoney(convert(amt, vault, toVault, rate), toVault) : null;
    const data = {
      date,
      currency: vault,
      rate: rate.toString(),
      total: amt.toString(),
      totalUsd: totalUsd.toString(),
      vault,
      vaultAmount: amt.toString(),
      toVault,
      toAmount: toAmount?.toString() ?? null,
      label: cleanText(input.label, 120),
      notes: cleanMultiline(input.notes),
    };
    let txnId: string;
    let number: string;
    if (old) {
      await tx.txn.update({ where: { id: old.id }, data: { ...data, ...stamp(actor, false) } });
      txnId = old.id;
      number = old.number;
    } else {
      number = await nextNumber(tx, kind!);
      const t = await tx.txn.create({ data: { ...data, number, kind: kind!, isDemo: !!opts.isDemo, ...stamp(actor, true) } });
      txnId = t.id;
    }
    const src: Src = { txnId, kind: kind!, date };
    if (kind === 'VAULT_DEPOSIT') await vaultMove(tx, src, vault, 'IN', amt);
    else if (kind === 'VAULT_WITHDRAWAL') await payOut(tx, src, vault, amt, shortOk(input, opts));
    else {
      // A transfer can't be half-made: the source vault must hold the full amount.
      await assertCash(tx, vault, amt);
      await vaultMove(tx, src, vault, 'OUT', amt);
      await vaultMove(tx, src, toVault!, 'IN', toAmount!);
    }
    await audit({ user: actor, action: old ? 'update' : 'create', module: 'vault', reference: number, before, after: await snapshotTxn(tx, txnId) }, tx);
    return { id: txnId, number };
  });
}

// ─── Processing (loss) ─────────────────────────────────────────────────────────────────────────────
export type ProcessingInput = { productId?: string; date?: string; inputKg?: string; method?: string; lossPercent?: string; lossKg?: string; notes?: string };

/** Pure loss math shared by the preview and the server: returns loss kg, loss %, output kg. */
export function computeLoss(inputKg: Dec, method: LossMethod, lossPercent: Dec | null, lossKg: Dec | null) {
  if (method === 'PERCENT') {
    const pct = lossPercent ?? new Dec(0);
    const loss = round3(inputKg.times(pct).div(100));
    return { lossKg: loss, lossPercent: round4(pct), outputKg: inputKg.minus(loss) };
  }
  const loss = round3(lossKg ?? new Dec(0));
  return { lossKg: loss, lossPercent: inputKg.gt(0) ? round4(loss.div(inputKg).times(100)) : new Dec(0), outputKg: inputKg.minus(loss) };
}

export async function saveProcessing(input: ProcessingInput, actor: Actor, editId?: string, opts: Opts = {}): Promise<Saved> {
  const v = new Validator();
  const date = reqDate(v, 'date', input.date);
  const inputKg = round3(reqPositive(v, 'inputKg', input.inputKg));
  const method: LossMethod | null = input.method === 'PERCENT' || input.method === 'KG' ? input.method : null;
  if (!method) v.add('method', 'v.required');
  let pct: Dec | null = null;
  let lossKg: Dec | null = null;
  if (method === 'PERCENT') {
    pct = parseDec(input.lossPercent);
    if (input.lossPercent === undefined || input.lossPercent === '') v.add('lossPercent', 'v.required');
    else if (!pct || pct.isNegative() || pct.gte(100)) v.add('lossPercent', 'v.lossRangePct');
  } else if (method === 'KG') {
    lossKg = parseDec(input.lossKg);
    if (input.lossKg === undefined || input.lossKg === '') v.add('lossKg', 'v.required');
    else if (!lossKg || lossKg.isNegative() || lossKg.gte(inputKg)) v.add('lossKg', 'v.lossRangeKg');
  }
  if (!input.productId && !editId) v.add('productId', 'v.productRequired');
  v.throwIfAny();

  return withTx(async (tx) => {
    const old = editId ? await loadForEdit(tx, editId, ['PROCESSING']) : null;
    const productId = old?.productId ?? input.productId!;
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw fieldError('productId', 'v.productRequired');
    await lockProducts(tx, [productId]);
    const before = old ? await snapshotTxn(tx, old.id) : null;

    const touched: StockKey[] = [];
    if (old) touched.push(...(await reverseEffects(tx, { txnId: old.id, kind: old.kind, date: old.date })));

    const raw = await stockPos(tx, productId, 'RAW');
    if (inputKg.gt(raw.kg)) throw fieldError('inputKg', 'v.processTooMuch', { kg: fmtKg(raw.kg.isNegative() ? 0 : raw.kg) });
    const res = computeLoss(inputKg, method!, pct, lossKg);
    if (!res.outputKg.gt(0)) throw fieldError(method === 'PERCENT' ? 'lossPercent' : 'lossKg', method === 'PERCENT' ? 'v.lossRangePct' : 'v.lossRangeKg');

    const rate = old ? D(old.rate) : await currentRate(tx);
    const data = {
      date,
      productId,
      currency: 'USD' as const,
      inputKg: inputKg.toString(),
      lossKg: res.lossKg.toString(),
      outputKg: res.outputKg.toString(),
      lossMethod: method!,
      lossPercent: res.lossPercent.toString(),
      notes: cleanMultiline(input.notes),
    };
    let txnId: string;
    let number: string;
    if (old) {
      await tx.txn.update({ where: { id: old.id }, data: { ...data, ...stamp(actor, false) } });
      txnId = old.id;
      number = old.number;
    } else {
      number = await nextNumber(tx, 'PROCESSING');
      const t = await tx.txn.create({
        data: { ...data, number, kind: 'PROCESSING', rate: rate.toString(), total: '0', totalUsd: '0', isDemo: !!opts.isDemo, ...stamp(actor, true) },
      });
      txnId = t.id;
    }
    const src: Src = { txnId, kind: 'PROCESSING', date };
    const out = await stockOut(tx, src, productId, 'RAW', inputKg, product.name);
    // The loss is carried into cost: finished cost/kg = cost of raw consumed ÷ output kg.
    await stockIn(tx, src, productId, 'FINISHED', res.outputKg, out.valueUsd);
    await tx.txn.update({
      where: { id: txnId },
      data: { cogsUsd: round4(out.valueUsd).toString(), total: round2(out.valueUsd).toString(), totalUsd: round2(out.valueUsd).toString() },
    });
    touched.push({ productId, state: 'RAW' }, { productId, state: 'FINISHED' });
    if (old) await assertStockNonNegative(tx, touched, { number, action: 'update', txnId, createdAt: old.createdAt });
    await clearResidualCost(tx, src, touched);
    await audit({ user: actor, action: old ? 'update' : 'create', module: 'inventory', reference: number, before, after: await snapshotTxn(tx, txnId) }, tx);
    return { id: txnId, number };
  });
}

// ─── Delete (any kind) ─────────────────────────────────────────────────────────────────────────────
const MODULE_OF: Record<TxnKind, string> = {
  SALE: 'sales',
  PURCHASE: 'purchases',
  CUSTOMER_PAYMENT: 'customers',
  CUSTOMER_REFUND: 'customers',
  BENEFICIARY_PAYMENT: 'beneficiaries',
  BENEFICIARY_REFUND: 'beneficiaries',
  VAULT_DEPOSIT: 'vault',
  VAULT_WITHDRAWAL: 'vault',
  VAULT_TRANSFER: 'vault',
  PROCESSING: 'inventory',
  EXPENSE: 'expenses',
};

/**
 * Permanent delete: reverse all effects, keep a tombstone so the number is never reused, and store the
 * full snapshot in the audit log so every gap in the sequence is explained.
 */
export async function deleteTxn(id: string, actor: Actor): Promise<Saved> {
  return withTx(async (tx) => {
    await lockVaults(tx);
    const t = await tx.txn.findUnique({ where: { id }, include: { lines: true } });
    if (!t || t.deletedAt) throw notFound();
    if (isLocked(t.kind, t.createdAt)) throw new AppError(409, 'invc.locked', { number: t.number });
    await lockParties(tx, [t.customerId, t.beneficiaryId]);
    await lockProducts(tx, [...t.lines.map((l) => l.productId), ...(t.productId ? [t.productId] : [])]);
    const snap = await snapshotTxn(tx, id);
    const src: Src = { txnId: t.id, kind: t.kind, date: t.date };
    const touched = await reverseEffects(tx, src);
    await assertStockNonNegative(tx, touched, { number: t.number, action: 'delete', txnId: t.id, createdAt: t.createdAt });
    await clearResidualCost(tx, src, touched);
    await tx.txn.update({ where: { id }, data: { deletedAt: new Date(), ...stamp(actor, false) } });
    await audit({ user: actor, action: 'delete', module: MODULE_OF[t.kind], reference: t.number, before: snap }, tx);
    return { id, number: t.number };
  });
}
