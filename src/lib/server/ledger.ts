import 'server-only';
import { Prisma, type Currency, type StockState, type TxnKind } from '@prisma/client';
import type { Tx } from '@/lib/db';
import { D, Dec, round4, fmtKg, fmtMoney } from '@/lib/money';
import { AppError } from './errors';

// ─── Document numbering ────────────────────────────────────────────────────────────────────────────
export const COUNTER_FOR: Record<TxnKind, string> = {
  SALE: 'INV',
  PURCHASE: 'PUR',
  CUSTOMER_PAYMENT: 'RCV',
  CUSTOMER_REFUND: 'RCV',
  BENEFICIARY_PAYMENT: 'PAY',
  BENEFICIARY_REFUND: 'PAY',
  VAULT_DEPOSIT: 'VLT',
  VAULT_WITHDRAWAL: 'VLT',
  VAULT_TRANSFER: 'VLT',
  PROCESSING: 'PRC',
  EXPENSE: 'EXP',
  STOCK_TRANSFER: 'STR',
  USER_VAULT_FUND: 'VLT',
};

/**
 * Next number from the counter table, incremented inside the caller's transaction (row-locked by the
 * UPSERT). If the transaction rolls back, the increment rolls back too; once committed, a number is
 * never handed out again — deleting a document leaves a permanent gap.
 */
export async function nextNumber(tx: Tx, kind: TxnKind): Promise<string> {
  const key = COUNTER_FOR[kind];
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${key}-${String(rows[0].value).padStart(5, '0')}`;
}

// ─── Locks ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * Serialize vault writers. Always locks the main USD/IQD pair first, then any personal wallets
 * (sorted) so concurrent main↔staff funding cannot deadlock.
 */
export async function lockVaults(tx: Tx, personalUserIds: (string | null | undefined)[] = []) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('alu:vault:main:USD'))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('alu:vault:main:IQD'))`;
  const ids = [...new Set(personalUserIds.filter((x): x is string => !!x))].sort();
  for (const id of ids) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'alu:vault:user:' + id + ':USD'}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'alu:vault:user:' + id + ':IQD'}))`;
  }
}

/** Row-lock products (sorted) so concurrent sales/purchases can't oversell the same stock. */
export async function lockProducts(tx: Tx, ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))].sort();
  if (!uniq.length) return;
  await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(uniq)}) ORDER BY "id" FOR UPDATE`;
}

export async function lockParty(tx: Tx, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'alu:party:' + id}))`;
}

// ─── Balances (always derived from the ledger) ─────────────────────────────────────────────────────
/** `ownerUserId` null = main factory vault; otherwise that staff user's personal wallet. */
export async function vaultBalance(tx: Tx, vault: Currency, ownerUserId: string | null = null): Promise<Dec> {
  const g = await tx.vaultEntry.groupBy({
    by: ['direction'],
    where: { vault, ownerUserId },
    _sum: { amount: true },
  });
  let bal = new Dec(0);
  for (const r of g) bal = r.direction === 'IN' ? bal.plus(D(r._sum.amount)) : bal.minus(D(r._sum.amount));
  return bal;
}

export async function stockPos(tx: Tx, productId: string, state: StockState, inventoryId: string): Promise<{ kg: Dec; value: Dec }> {
  const a = await tx.stockEntry.aggregate({ where: { productId, state, inventoryId }, _sum: { kg: true, valueUsd: true } });
  return { kg: D(a._sum.kg), value: D(a._sum.valueUsd) };
}

export async function customerBalance(tx: Tx, customerId: string): Promise<Dec> {
  const a = await tx.partyEntry.aggregate({ where: { customerId }, _sum: { amountUsd: true } });
  return D(a._sum.amountUsd);
}

export async function beneficiaryBalance(tx: Tx, beneficiaryId: string): Promise<Dec> {
  const a = await tx.partyEntry.aggregate({ where: { beneficiaryId }, _sum: { amountUsd: true } });
  return D(a._sum.amountUsd);
}

// ─── Ledger writers ────────────────────────────────────────────────────────────────────────────────
export type Src = { txnId: string; kind: TxnKind; date: Date };

export type VaultMoveOpts = { isReversal?: boolean; dueId?: string | null; ownerUserId?: string | null };

/** Append a vault movement. Caller must hold lockVaults(). A negative amount flips the direction. */
export async function vaultMove(
  tx: Tx,
  src: Src,
  vault: Currency,
  direction: 'IN' | 'OUT',
  amount: Dec,
  opts: VaultMoveOpts | boolean = {},
  dueIdLegacy?: string,
) {
  // Back-compat: older call sites used (…, isReversal, dueId).
  const optsObj: VaultMoveOpts =
    typeof opts === 'boolean' ? { isReversal: opts, dueId: dueIdLegacy } : opts;
  if (amount.isZero()) return;
  let dir = direction;
  let amt = amount;
  if (amt.isNegative()) {
    dir = dir === 'IN' ? 'OUT' : 'IN';
    amt = amt.neg();
  }
  const ownerUserId = optsObj.ownerUserId ?? null;
  const bal = await vaultBalance(tx, vault, ownerUserId);
  const after = dir === 'IN' ? bal.plus(amt) : bal.minus(amt);
  await tx.vaultEntry.create({
    data: {
      vault,
      ownerUserId,
      direction: dir,
      amount: amt.toString(),
      balanceAfter: after.toString(),
      txnId: src.txnId,
      sourceType: src.kind,
      date: src.date,
      isReversal: !!optsObj.isReversal,
      dueId: optsObj.dueId ?? null,
    },
  });
}

/**
 * Money leaving a vault. The vault holds real cash, so it never goes below zero: when it has less than
 * `amount`, the user must first confirm (allowShortfall) — then whatever is in the vault is paid now and
 * the rest is recorded as an unpaid VaultDue, to be paid from the vault later. Caller holds lockVaults().
 */
export async function payOut(
  tx: Tx,
  src: Src,
  vault: Currency,
  amount: Dec,
  allowShortfall: boolean,
  ownerUserId: string | null = null,
) {
  if (!amount.gt(0)) return vaultMove(tx, src, vault, 'OUT', amount, { ownerUserId });
  const bal = await vaultBalance(tx, vault, ownerUserId);
  if (bal.gte(amount)) return vaultMove(tx, src, vault, 'OUT', amount, { ownerUserId });
  const pay = bal.gt(0) ? bal : new Dec(0);
  const short = amount.minus(pay);
  if (!allowShortfall) {
    throw new AppError(409, 'vault.short', { vault: `@@vault.${vault}`, balance: fmtMoney(bal, vault), amount: fmtMoney(amount, vault), pay: fmtMoney(pay, vault), short: fmtMoney(short, vault) });
  }
  if (pay.gt(0)) await vaultMove(tx, src, vault, 'OUT', pay, { ownerUserId });
  await tx.vaultDue.create({ data: { txnId: src.txnId, vault, ownerUserId, amount: short.toString() } });
}

/** For moves that can't be left half-paid (vault transfers): the vault must hold the full amount. */
export async function assertCash(tx: Tx, vault: Currency, amount: Dec, ownerUserId: string | null = null) {
  const bal = await vaultBalance(tx, vault, ownerUserId);
  if (bal.lt(amount)) throw new AppError(409, 'vault.notEnough', { vault: `@@vault.${vault}`, balance: fmtMoney(bal, vault), amount: fmtMoney(amount, vault) });
}

export async function partyMove(
  tx: Tx,
  src: Src,
  party: { customerId?: string | null; beneficiaryId?: string | null },
  amountUsd: Dec,
  isReversal = false,
) {
  if (amountUsd.isZero()) return;
  await tx.partyEntry.create({
    data: {
      customerId: party.customerId ?? null,
      beneficiaryId: party.beneficiaryId ?? null,
      amountUsd: amountUsd.toString(),
      txnId: src.txnId,
      sourceType: src.kind,
      date: src.date,
      isReversal,
    },
  });
}

export async function stockIn(
  tx: Tx,
  src: Src,
  productId: string,
  state: StockState,
  kg: Dec,
  valueUsd: Dec,
  inventoryId: string,
  isReversal = false,
) {
  if (kg.isZero() && valueUsd.isZero()) return;
  await tx.stockEntry.create({
    data: {
      productId,
      inventoryId,
      state,
      kg: kg.toString(),
      valueUsd: round4(valueUsd).toString(),
      unitCostUsd: kg.isZero() ? '0' : round4(valueUsd.div(kg)).abs().toString(),
      txnId: src.txnId,
      sourceType: src.kind,
      date: src.date,
      isReversal,
    },
  });
}

/**
 * Take kg out of stock at the moving weighted-average cost. Taking everything takes the full remaining
 * value, so no residual cost is ever stranded. Throws `v.insufficientStock` when kg exceeds availability.
 */
export async function stockOut(
  tx: Tx,
  src: Src,
  productId: string,
  state: StockState,
  kg: Dec,
  productName: string,
  inventoryId: string,
): Promise<{ valueUsd: Dec; unitCostUsd: Dec }> {
  const pos = await stockPos(tx, productId, state, inventoryId);
  if (kg.gt(pos.kg)) {
    throw new AppError(422, 'v.insufficientStock', { kg: fmtKg(pos.kg.isNegative() ? 0 : pos.kg), product: productName });
  }
  const unitCostUsd = pos.kg.gt(0) ? round4(pos.value.div(pos.kg)) : new Dec(0);
  const valueUsd = kg.eq(pos.kg) ? pos.value : round4(kg.times(pos.value).div(pos.kg));
  await tx.stockEntry.create({
    data: {
      productId,
      inventoryId,
      state,
      kg: kg.neg().toString(),
      valueUsd: valueUsd.neg().toString(),
      unitCostUsd: unitCostUsd.toString(),
      txnId: src.txnId,
      sourceType: src.kind,
      date: src.date,
    },
  });
  return { valueUsd, unitCostUsd };
}

export type StockKey = { productId: string; state: StockState; inventoryId: string };

/**
 * Reverse every ledger effect a document currently has (net of earlier reversals), by appending
 * opposite rows. Nothing is updated or deleted. Returns the stock keys that were touched.
 */
export async function reverseEffects(tx: Tx, src: Src): Promise<StockKey[]> {
  const rev: Src = { ...src };
  // Unpaid dues belong to the old version of the document: any part already paid is returned by the vault
  // reversal below, and the new version records its own shortfall (if any) when it is posted again.
  await tx.vaultDue.deleteMany({ where: { txnId: src.txnId } });

  const vg = await tx.vaultEntry.groupBy({
    by: ['vault', 'direction', 'ownerUserId'],
    where: { txnId: src.txnId },
    _sum: { amount: true },
  });
  const netByKey = new Map<string, { vault: Currency; ownerUserId: string | null; net: Dec }>();
  for (const r of vg) {
    const key = `${r.ownerUserId ?? ''}:${r.vault}`;
    const cur = netByKey.get(key) ?? { vault: r.vault, ownerUserId: r.ownerUserId, net: new Dec(0) };
    cur.net = r.direction === 'IN' ? cur.net.plus(D(r._sum.amount)) : cur.net.minus(D(r._sum.amount));
    netByKey.set(key, cur);
  }
  for (const { vault, ownerUserId, net } of netByKey.values()) {
    if (!net.isZero()) await vaultMove(tx, rev, vault, 'OUT', net, { isReversal: true, ownerUserId });
  }

  const pg = await tx.partyEntry.groupBy({ by: ['customerId', 'beneficiaryId'], where: { txnId: src.txnId }, _sum: { amountUsd: true } });
  for (const r of pg) {
    const net = D(r._sum.amountUsd);
    if (!net.isZero()) await partyMove(tx, rev, { customerId: r.customerId, beneficiaryId: r.beneficiaryId }, net.neg(), true);
  }

  const sg = await tx.stockEntry.groupBy({
    by: ['productId', 'state', 'inventoryId'],
    where: { txnId: src.txnId },
    _sum: { kg: true, valueUsd: true },
  });
  const keys: StockKey[] = [];
  for (const r of sg) {
    const kg = D(r._sum.kg);
    const val = D(r._sum.valueUsd);
    keys.push({ productId: r.productId, state: r.state, inventoryId: r.inventoryId });
    if (!kg.isZero() || !val.isZero()) await stockIn(tx, rev, r.productId, r.state, kg.neg(), val.neg(), r.inventoryId, true);
  }
  return keys;
}

/**
 * Stock can never go negative. After an edit/delete, verify every touched product/state and block with
 * a message naming the documents that consumed the stock.
 */
export async function assertStockNonNegative(
  tx: Tx,
  keys: StockKey[],
  ctx: { number: string; action: 'delete' | 'update'; txnId: string; createdAt: Date },
) {
  const seen = new Set<string>();
  for (const k of keys) {
    const id = `${k.inventoryId}:${k.productId}:${k.state}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pos = await stockPos(tx, k.productId, k.state, k.inventoryId);
    if (!pos.kg.isNegative()) continue;
    const deficit = pos.kg.neg();
    const consumers = await tx.txn.findMany({
      where: {
        deletedAt: null,
        id: { not: ctx.txnId },
        inventoryId: k.inventoryId,
        OR: [
          { kind: 'SALE', lines: { some: { productId: k.productId, state: k.state } } },
          ...(k.state === 'RAW' ? [{ kind: 'PROCESSING' as const, productId: k.productId }] : []),
          { kind: 'STOCK_TRANSFER', productId: k.productId },
        ],
      },
      orderBy: { number: 'asc' },
      select: { number: true },
      take: 12,
    });
    const product = await tx.product.findUnique({ where: { id: k.productId }, select: { name: true } });
    const action = ctx.action === 'delete' ? 'block.actionDelete' : 'block.actionUpdate';
    if (consumers.length) {
      throw new AppError(409, 'block.stock', {
        action: `@@${action}`,
        number: ctx.number,
        kg: fmtKg(deficit),
        refs: consumers.map((c) => c.number).join(', '),
      });
    }
    throw new AppError(409, 'block.stockNoRefs', { action: `@@${action}`, number: ctx.number, kg: fmtKg(deficit), product: product?.name ?? '' });
  }
}

/** When a product/state is empty, clear any residual cost so the next average starts clean. */
export async function clearResidualCost(tx: Tx, src: Src, keys: StockKey[]) {
  const seen = new Set<string>();
  for (const k of keys) {
    const id = `${k.inventoryId}:${k.productId}:${k.state}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pos = await stockPos(tx, k.productId, k.state, k.inventoryId);
    if (pos.kg.isZero() && !pos.value.isZero()) {
      await tx.stockEntry.create({
        data: {
          productId: k.productId,
          inventoryId: k.inventoryId,
          state: k.state,
          kg: '0',
          valueUsd: pos.value.neg().toString(),
          unitCostUsd: '0',
          txnId: src.txnId,
          sourceType: src.kind,
          date: src.date,
          isReversal: false,
        },
      });
    }
  }
}
