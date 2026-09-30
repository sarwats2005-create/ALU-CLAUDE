import 'server-only';
import { Prisma, type Currency, type StockState, type TxnKind } from '@prisma/client';
import type { Tx } from '@/lib/db';
import { D, Dec, round4, fmtKg } from '@/lib/money';
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
/** Serialize all vault writers (always in the same order, so no deadlocks between vaults). */
export async function lockVaults(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('alu:vault:USD'))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('alu:vault:IQD'))`;
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
export async function vaultBalance(tx: Tx, vault: Currency): Promise<Dec> {
  const g = await tx.vaultEntry.groupBy({ by: ['direction'], where: { vault }, _sum: { amount: true } });
  let bal = new Dec(0);
  for (const r of g) bal = r.direction === 'IN' ? bal.plus(D(r._sum.amount)) : bal.minus(D(r._sum.amount));
  return bal;
}

export async function stockPos(tx: Tx, productId: string, state: StockState): Promise<{ kg: Dec; value: Dec }> {
  const a = await tx.stockEntry.aggregate({ where: { productId, state }, _sum: { kg: true, valueUsd: true } });
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

/** Append a vault movement. Caller must hold lockVaults(). A negative amount flips the direction. */
export async function vaultMove(tx: Tx, src: Src, vault: Currency, direction: 'IN' | 'OUT', amount: Dec, isReversal = false) {
  if (amount.isZero()) return;
  let dir = direction;
  let amt = amount;
  if (amt.isNegative()) {
    dir = dir === 'IN' ? 'OUT' : 'IN';
    amt = amt.neg();
  }
  const bal = await vaultBalance(tx, vault);
  const after = dir === 'IN' ? bal.plus(amt) : bal.minus(amt);
  await tx.vaultEntry.create({
    data: {
      vault,
      direction: dir,
      amount: amt.toString(),
      balanceAfter: after.toString(),
      txnId: src.txnId,
      sourceType: src.kind,
      date: src.date,
      isReversal,
    },
  });
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

export async function stockIn(tx: Tx, src: Src, productId: string, state: StockState, kg: Dec, valueUsd: Dec, isReversal = false) {
  if (kg.isZero() && valueUsd.isZero()) return;
  await tx.stockEntry.create({
    data: {
      productId,
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
): Promise<{ valueUsd: Dec; unitCostUsd: Dec }> {
  const pos = await stockPos(tx, productId, state);
  if (kg.gt(pos.kg)) {
    throw new AppError(422, 'v.insufficientStock', { kg: fmtKg(pos.kg.isNegative() ? 0 : pos.kg), product: productName });
  }
  const unitCostUsd = pos.kg.gt(0) ? round4(pos.value.div(pos.kg)) : new Dec(0);
  const valueUsd = kg.eq(pos.kg) ? pos.value : round4(kg.times(pos.value).div(pos.kg));
  await tx.stockEntry.create({
    data: {
      productId,
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

export type StockKey = { productId: string; state: StockState };

/**
 * Reverse every ledger effect a document currently has (net of earlier reversals), by appending
 * opposite rows. Nothing is updated or deleted. Returns the stock keys that were touched.
 */
export async function reverseEffects(tx: Tx, src: Src): Promise<StockKey[]> {
  const rev: Src = { ...src };

  const vg = await tx.vaultEntry.groupBy({ by: ['vault', 'direction'], where: { txnId: src.txnId }, _sum: { amount: true } });
  const netByVault = new Map<Currency, Dec>();
  for (const r of vg) {
    const cur = netByVault.get(r.vault) ?? new Dec(0);
    netByVault.set(r.vault, r.direction === 'IN' ? cur.plus(D(r._sum.amount)) : cur.minus(D(r._sum.amount)));
  }
  for (const [vault, net] of netByVault) {
    if (!net.isZero()) await vaultMove(tx, rev, vault, 'OUT', net, true); // OUT of +net == undo net IN
  }

  const pg = await tx.partyEntry.groupBy({ by: ['customerId', 'beneficiaryId'], where: { txnId: src.txnId }, _sum: { amountUsd: true } });
  for (const r of pg) {
    const net = D(r._sum.amountUsd);
    if (!net.isZero()) await partyMove(tx, rev, { customerId: r.customerId, beneficiaryId: r.beneficiaryId }, net.neg(), true);
  }

  const sg = await tx.stockEntry.groupBy({ by: ['productId', 'state'], where: { txnId: src.txnId }, _sum: { kg: true, valueUsd: true } });
  const keys: StockKey[] = [];
  for (const r of sg) {
    const kg = D(r._sum.kg);
    const val = D(r._sum.valueUsd);
    keys.push({ productId: r.productId, state: r.state });
    if (!kg.isZero() || !val.isZero()) await stockIn(tx, rev, r.productId, r.state, kg.neg(), val.neg(), true);
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
    const id = `${k.productId}:${k.state}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pos = await stockPos(tx, k.productId, k.state);
    if (!pos.kg.isNegative()) continue;
    const deficit = pos.kg.neg();
    const consumers = await tx.txn.findMany({
      where: {
        deletedAt: null,
        id: { not: ctx.txnId },
        OR: [
          { kind: 'SALE', lines: { some: { productId: k.productId, state: k.state } } },
          ...(k.state === 'RAW' ? [{ kind: 'PROCESSING' as const, productId: k.productId }] : []),
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
    const id = `${k.productId}:${k.state}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pos = await stockPos(tx, k.productId, k.state);
    if (pos.kg.isZero() && !pos.value.isZero()) {
      await tx.stockEntry.create({
        data: {
          productId: k.productId,
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
