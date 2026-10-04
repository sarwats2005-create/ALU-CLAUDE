import 'server-only';
import { RULES, PIN_RE } from '@/lib/rules';
import bcrypt from 'bcryptjs';
import type { Currency } from '@prisma/client';
import { prisma, withTx, type Tx } from '@/lib/db';
import { AppError, fieldError, notFound } from './errors';
import { assertStockNonNegative, lockParty, lockProducts, lockVaults, stockPos, type StockKey } from './ledger';
import { getSettings } from './common';
import { setEraseUntil, type SessionUser } from './auth';

// Owner-only ERASE MODE (Ctrl+Alt+R + PIN). Outside this mode history, the audit log and customer accounts
// with transactions can't be removed by anyone. Inside it, the owner can wipe them for good:
//  • a transaction is removed with every ledger row it ever wrote (vault, party balance, stock, unpaid dues),
//    so balances are exactly as if it never happened — then its audit lines are removed too;
//  • a customer is removed with all of their transactions;
//  • audit lines can be removed one by one.
// Nothing about erasing is logged: by design it leaves no trace. Each erase is still one database transaction,
// so it either happens completely or not at all.

const DEFAULT_PIN = '1122';
const MINUTES = RULES.eraseMinutes;
const MAX_WRONG = RULES.pinMaxTries;
const LOCK_MINUTES = RULES.pinLockMinutes;

export function eraseActive(user: SessionUser) {
  return user.isOwner && !!user.eraseUntil && user.eraseUntil > new Date();
}

/** Every erase endpoint calls this first. */
export function requireErase(user: SessionUser) {
  if (!user.isOwner) throw new AppError(403, 'err.forbidden');
  if (!eraseActive(user)) throw new AppError(403, 'erase.off');
}

export async function enterErase(user: SessionUser, pin: unknown) {
  if (!user.isOwner) throw new AppError(403, 'err.forbidden');
  const key = `erase:${user.id}`;
  const since = new Date(Date.now() - LOCK_MINUTES * 60 * 1000);
  if ((await prisma.loginAttempt.count({ where: { key, success: false, createdAt: { gte: since } } })) >= MAX_WRONG) throw new AppError(429, 'erase.pinLocked');
  const s = await getSettings();
  const p = typeof pin === 'string' ? pin.trim() : '';
  const ok = p.length > 0 && (s.erasePinHash ? await bcrypt.compare(p, s.erasePinHash) : p === DEFAULT_PIN);
  if (!ok) {
    await prisma.loginAttempt.create({ data: { key, success: false } });
    throw new AppError(403, 'erase.pinWrong');
  }
  await prisma.loginAttempt.deleteMany({ where: { key } });
  const until = new Date(Date.now() + MINUTES * 60 * 1000);
  await setEraseUntil(until);
  return { until: until.toISOString() };
}

export async function exitErase() {
  await setEraseUntil(null);
  return { until: null };
}

export async function setErasePin(user: SessionUser, pin: unknown) {
  requireErase(user);
  const p = typeof pin === 'string' ? pin.trim() : '';
  if (!PIN_RE.test(p)) throw fieldError('pin', 'erase.pinFormat');
  await getSettings();
  await prisma.appSettings.update({ where: { id: 1 }, data: { erasePinHash: await bcrypt.hash(p, 10) } });
  return { ok: true };
}

/** What can be erased in bulk (shown in the erase-mode bar). */
export async function eraseSummary() {
  return { voided: await prisma.txn.count({ where: { deletedAt: { not: null } } }) };
}

// ─── Erasing ───────────────────────────────────────────────────────────────────────────────────────

/** Remove one document and every row it wrote. Caller holds lockVaults(). Returns the vaults it touched. */
async function eraseOne(tx: Tx, id: string): Promise<{ number: string; vaults: Currency[]; keys: StockKey[] }> {
  const t = await tx.txn.findUnique({ where: { id }, include: { lines: { select: { productId: true } } } });
  if (!t) throw notFound();
  for (const pid of [t.customerId, t.beneficiaryId]) if (pid) await lockParty(tx, pid);
  await lockProducts(tx, [...t.lines.map((l) => l.productId), ...(t.productId ? [t.productId] : [])]);

  const vaults = (await tx.vaultEntry.findMany({ where: { txnId: id }, distinct: ['vault'], select: { vault: true } })).map((v) => v.vault);
  const keys = (await tx.stockEntry.groupBy({ by: ['productId', 'state'], where: { txnId: id } })).map((k) => ({ productId: k.productId, state: k.state }));

  await tx.vaultEntry.deleteMany({ where: { txnId: id } });
  await tx.vaultDue.deleteMany({ where: { txnId: id } });
  await tx.partyEntry.deleteMany({ where: { txnId: id } });
  await tx.stockEntry.deleteMany({ where: { txnId: id } });
  await tx.txnLine.deleteMany({ where: { txnId: id } });
  await tx.txn.delete({ where: { id } });
  await tx.auditLog.deleteMany({ where: { OR: [{ reference: t.number }, { reference: { startsWith: `${t.number} ` } }] } });
  return { number: t.number, vaults, keys };
}

/** After rows were removed: stock must stay ≥ 0, leftover cost on empty stock is cleared, running vault balances rebuilt. */
async function settle(tx: Tx, done: { number: string; vaults: Currency[]; keys: StockKey[] }[]) {
  for (const d of done) {
    if (d.keys.length) await assertStockNonNegative(tx, d.keys, { number: d.number, action: 'delete', txnId: '', createdAt: new Date() });
  }
  const seen = new Set<string>();
  for (const k of done.flatMap((d) => d.keys)) {
    const id = `${k.productId}:${k.state}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pos = await stockPos(tx, k.productId, k.state);
    if (!pos.kg.isZero() || pos.value.isZero()) continue;
    // Empty stock still carrying cost (rounding left by sales): clear it on the latest remaining movement.
    const last = await tx.stockEntry.findFirst({ where: { productId: k.productId, state: k.state }, orderBy: { id: 'desc' } });
    if (!last) continue;
    await tx.stockEntry.create({
      data: { productId: k.productId, state: k.state, kg: '0', valueUsd: pos.value.neg().toString(), unitCostUsd: '0', txnId: last.txnId, sourceType: last.sourceType, date: last.date, isReversal: true },
    });
  }
  for (const v of new Set(done.flatMap((d) => d.vaults))) {
    await tx.$executeRaw`
      UPDATE "VaultEntry" e SET "balanceAfter" = s.run
      FROM (SELECT id, SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) OVER (ORDER BY id) AS run
            FROM "VaultEntry" WHERE vault = ${v}::"Currency") s
      WHERE e.id = s.id AND e."balanceAfter" <> s.run`;
  }
}

export async function eraseTxn(user: SessionUser, id: string) {
  requireErase(user);
  return withTx(async (tx) => {
    await lockVaults(tx);
    const d = await eraseOne(tx, id);
    await settle(tx, [d]);
    return { number: d.number };
  });
}

/** Erase every voided (normally deleted) document: their effects are already undone, only the rows remain. */
export async function eraseVoided(user: SessionUser) {
  requireErase(user);
  return withTx(async (tx) => {
    await lockVaults(tx);
    const ids = await tx.txn.findMany({ where: { deletedAt: { not: null } }, select: { id: true } });
    const done = [];
    for (const { id } of ids) done.push(await eraseOne(tx, id));
    await settle(tx, done);
    return { count: done.length };
  });
}

export async function eraseCustomer(user: SessionUser, id: string) {
  requireErase(user);
  return withTx(async (tx) => {
    await lockVaults(tx);
    await lockParty(tx, id);
    const c = await tx.customer.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!c) throw notFound();
    const txns = await tx.txn.findMany({ where: { customerId: id }, select: { id: true }, orderBy: { createdAt: 'desc' } });
    const done = [];
    for (const t of txns) done.push(await eraseOne(tx, t.id));
    await tx.partyEntry.deleteMany({ where: { customerId: id } });
    await tx.customer.delete({ where: { id } });
    await tx.auditLog.deleteMany({ where: { module: 'customers', reference: c.name } });
    await settle(tx, done);
    return { name: c.name, count: done.length };
  });
}

export async function eraseAudit(user: SessionUser, ids: unknown) {
  requireErase(user);
  const list = Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 1000) : [];
  if (!list.length) throw new AppError(400, 'err.generic');
  const r = await prisma.auditLog.deleteMany({ where: { id: { in: list } } });
  return { count: r.count };
}

