import 'server-only';
import type { Currency } from '@prisma/client';
import { prisma, withTx, type Tx } from '@/lib/db';
import { D, Dec, round2, round3, roundMoney, toUsd } from '@/lib/money';
import { dbToIso, isValidIsoDate, isoToDb, todayIso } from '@/lib/dates';
import { addPeriod } from '@/lib/recurrence';
import { Validator, conflict, fieldError, notFound } from './errors';
import { asCurrency, asState, cleanText, currentRate, nameKey, reqCurrency, reqDate, reqPositive } from './common';
import {
  clearResidualCost,
  lockProducts,
  lockVaults,
  nextNumber,
  payOut,
  stockIn,
  stockOut,
  type Src,
  type StockKey,
} from './ledger';
import { audit } from './audit';
import { snapshotTxn, type Actor, type Saved } from './txns';

const DEFAULT_NAME = 'Main Inventory';
const DEFAULT_KEY = 'main inventory';
const DEFAULT_ID = 'inv_main_default';

/** Ensure at least one default inventory exists (migrations + fresh installs). */
export async function ensureDefaultInventory(tx?: Tx) {
  const db = tx ?? prisma;
  const existing = await db.inventory.findFirst({ where: { isDefault: true }, orderBy: { createdAt: 'asc' } });
  if (existing) return existing;
  return db.inventory.create({
    data: { id: DEFAULT_ID, name: DEFAULT_NAME, nameKey: DEFAULT_KEY, isDefault: true },
  });
}

export async function resolveInventoryId(tx: Tx, id?: string | null): Promise<string> {
  if (id) {
    const row = await tx.inventory.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw fieldError('inventoryId', 'inv.locNotFound');
    return row.id;
  }
  return (await ensureDefaultInventory(tx)).id;
}

function serialize(inv: {
  id: string;
  name: string;
  address: string;
  size: string;
  rentAmount: { toString(): string } | null;
  rentVault: Currency | null;
  rentNextDue: Date | null;
  isDefault: boolean;
  createdAt: Date;
}) {
  const today = todayIso();
  const nextDue = inv.rentNextDue ? dbToIso(inv.rentNextDue) : null;
  const rentDue = !!(inv.rentAmount && inv.rentVault && nextDue && nextDue <= today);
  return {
    id: inv.id,
    name: inv.name,
    address: inv.address,
    size: inv.size,
    rentAmount: inv.rentAmount ? D(inv.rentAmount).toString() : null,
    rentVault: inv.rentVault,
    rentNextDue: nextDue,
    rentDue,
    isDefault: inv.isDefault,
    createdAt: inv.createdAt.toISOString(),
  };
}

export type InventoryRow = ReturnType<typeof serialize>;

export async function listInventories() {
  await ensureDefaultInventory();
  const rows = await prisma.inventory.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  return rows.map(serialize);
}

export async function getInventory(id: string) {
  await ensureDefaultInventory();
  const inv = await prisma.inventory.findUnique({ where: { id } });
  if (!inv) throw notFound();
  return serialize(inv);
}

export type InventoryInput = {
  name?: string;
  address?: string;
  size?: string;
  rentAmount?: string | null;
  rentVault?: string | null;
  rentNextDue?: string | null;
};

export async function saveInventory(input: InventoryInput, actor: Actor, id?: string) {
  const v = new Validator();
  const name = cleanText(input.name, 80);
  const address = cleanText(input.address, 200);
  const size = cleanText(input.size, 60);
  if (!name) v.add('name', 'v.required');

  let rentAmount: Dec | null = null;
  let rentVault: Currency | null = null;
  let rentNextDue: Date | null = null;
  const clearingRent = input.rentAmount === null || input.rentAmount === '';
  if (!clearingRent && input.rentAmount !== undefined) {
    rentAmount = roundMoney(reqPositive(v, 'rentAmount', input.rentAmount), asCurrency(input.rentVault) ?? 'USD');
    rentVault = reqCurrency(v, 'rentVault', input.rentVault);
    const dueIso = isValidIsoDate(input.rentNextDue) ? String(input.rentNextDue) : todayIso();
    rentNextDue = isoToDb(dueIso);
  } else if (clearingRent) {
    rentAmount = null;
    rentVault = null;
    rentNextDue = null;
  }
  v.throwIfAny();

  return withTx(async (tx) => {
    const key = nameKey(name);
    const clash = await tx.inventory.findUnique({ where: { nameKey: key }, select: { id: true } });
    if (clash && clash.id !== id) throw fieldError('name', 'inv.locExists');

    if (id) {
      const before = await tx.inventory.findUnique({ where: { id } });
      if (!before) throw notFound();
      const data: {
        name: string;
        nameKey: string;
        address: string;
        size: string;
        rentAmount?: string | null;
        rentVault?: Currency | null;
        rentNextDue?: Date | null;
      } = { name, nameKey: key, address, size };
      if (input.rentAmount !== undefined) {
        data.rentAmount = rentAmount?.toString() ?? null;
        data.rentVault = rentVault;
        data.rentNextDue = rentNextDue;
      }
      const after = await tx.inventory.update({ where: { id }, data });
      await audit({ user: actor, action: 'update', module: 'inventory', reference: `loc:${name}`, before, after }, tx);
      return serialize(after);
    }

    const created = await tx.inventory.create({
      data: {
        name,
        nameKey: key,
        address,
        size,
        rentAmount: rentAmount?.toString() ?? null,
        rentVault,
        rentNextDue,
        isDefault: false,
      },
    });
    await audit({ user: actor, action: 'create', module: 'inventory', reference: `loc:${name}`, after: created }, tx);
    return serialize(created);
  });
}

export async function deleteInventory(id: string, actor: Actor) {
  return withTx(async (tx) => {
    const inv = await tx.inventory.findUnique({ where: { id } });
    if (!inv) throw notFound();
    if (inv.isDefault) throw conflict('inv.locDefault');
    const stock = await tx.stockEntry.aggregate({ where: { inventoryId: id }, _sum: { kg: true } });
    if (!D(stock._sum.kg).isZero()) throw conflict('inv.locHasStock');
    const linked = await tx.txn.count({ where: { OR: [{ inventoryId: id }, { toInventoryId: id }], deletedAt: null } });
    if (linked > 0) throw conflict('inv.locInUse', { n: linked });
    await tx.inventory.delete({ where: { id } });
    await audit({ user: actor, action: 'delete', module: 'inventory', reference: `loc:${inv.name}`, before: inv }, tx);
  });
}

/** Configure or clear monthly rent on an inventory. */
export async function setInventoryRent(
  id: string,
  input: { amount?: string | null; vault?: string | null; nextDue?: string | null },
  actor: Actor,
) {
  const v = new Validator();
  const clearing = input.amount === null || input.amount === '';
  let amount: Dec | null = null;
  let vault: Currency | null = null;
  let nextDue: Date | null = null;
  if (!clearing) {
    vault = reqCurrency(v, 'vault', input.vault);
    amount = roundMoney(reqPositive(v, 'amount', input.amount), vault);
    const dueIso = isValidIsoDate(input.nextDue) ? String(input.nextDue) : todayIso();
    nextDue = isoToDb(dueIso);
  }
  v.throwIfAny();
  return withTx(async (tx) => {
    const before = await tx.inventory.findUnique({ where: { id } });
    if (!before) throw notFound();
    const after = await tx.inventory.update({
      where: { id },
      data: {
        rentAmount: amount?.toString() ?? null,
        rentVault: vault,
        rentNextDue: nextDue,
      },
    });
    await audit({ user: actor, action: 'update', module: 'inventory', reference: `rent:${before.name}`, before, after }, tx);
    return serialize(after);
  });
}

/** Pay this month's rent from a vault; advances rentNextDue by one month. */
export async function payInventoryRent(
  id: string,
  input: { vault?: string; date?: string; allowShortfall?: boolean },
  actor: Actor,
): Promise<Saved> {
  const v = new Validator();
  const date = reqDate(v, 'date', input.date ?? todayIso());
  const vaultPick = asCurrency(input.vault);
  v.throwIfAny();

  return withTx(async (tx) => {
    await lockVaults(tx);
    const inv = await tx.inventory.findUnique({ where: { id } });
    if (!inv) throw notFound();
    if (!inv.rentAmount || !inv.rentVault || !inv.rentNextDue) throw fieldError('amount', 'inv.rentNotSet');
    const nextDue = dbToIso(inv.rentNextDue);
    if (nextDue > todayIso()) throw conflict('inv.rentNotDue', { date: nextDue });

    const vault = vaultPick ?? inv.rentVault;
    const amount = roundMoney(D(inv.rentAmount), vault);
    const rate = await currentRate(tx);
    const number = await nextNumber(tx, 'EXPENSE');
    const label = `Rent · ${inv.name}`;
    const t = await tx.txn.create({
      data: {
        number,
        kind: 'EXPENSE',
        date,
        currency: vault,
        rate: rate.toString(),
        total: amount.toString(),
        totalUsd: round2(toUsd(amount, vault, rate)).toString(),
        vault,
        vaultAmount: amount.toString(),
        label,
        notes: '',
        inventoryId: inv.id,
        createdById: actor.id,
        createdByName: actor.name,
        updatedById: actor.id,
        updatedByName: actor.name,
      },
    });
    const src: Src = { txnId: t.id, kind: 'EXPENSE', date };
    await payOut(tx, src, vault, amount, input.allowShortfall === true);

    // Only roll the schedule forward when this month was fully paid from the vault.
    const short = await tx.vaultDue.findFirst({ where: { txnId: t.id, settledAt: null }, select: { id: true } });
    if (!short) {
      const anchor = Number(nextDue.slice(8, 10));
      const advanced = addPeriod(nextDue, 'MONTHLY', anchor);
      await tx.inventory.update({ where: { id: inv.id }, data: { rentNextDue: isoToDb(advanced) } });
    }
    await audit({ user: actor, action: 'create', module: 'inventory', reference: number, after: await snapshotTxn(tx, t.id) }, tx);
    return { id: t.id, number };
  });
}

export type TransferInput = {
  date?: string;
  productId?: string;
  state?: string;
  kg?: string;
  fromInventoryId?: string;
  toInventoryId?: string;
  notes?: string;
};

/** Move product stock between inventories at the moving-average cost (no money). */
export async function transferStock(input: TransferInput, actor: Actor): Promise<Saved> {
  const v = new Validator();
  const date = reqDate(v, 'date', input.date);
  const kg = round3(reqPositive(v, 'kg', input.kg));
  const state = asState(input.state);
  if (!state) v.add('state', 'v.required');
  if (!input.productId) v.add('productId', 'v.productRequired');
  if (!input.fromInventoryId) v.add('fromInventoryId', 'v.required');
  if (!input.toInventoryId) v.add('toInventoryId', 'v.required');
  if (input.fromInventoryId && input.toInventoryId && input.fromInventoryId === input.toInventoryId) {
    v.add('toInventoryId', 'inv.transferSame');
  }
  v.throwIfAny();
  if (kg.isZero()) throw fieldError('kg', 'v.positive');

  return withTx(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: input.productId! } });
    if (!product) throw fieldError('productId', 'v.productRequired');
    const fromId = await resolveInventoryId(tx, input.fromInventoryId);
    const toId = await resolveInventoryId(tx, input.toInventoryId);
    if (fromId === toId) throw fieldError('toInventoryId', 'inv.transferSame');

    await lockProducts(tx, [product.id]);
    const rate = await currentRate(tx);
    const number = await nextNumber(tx, 'STOCK_TRANSFER');
    const t = await tx.txn.create({
      data: {
        number,
        kind: 'STOCK_TRANSFER',
        date,
        currency: 'USD',
        rate: rate.toString(),
        total: '0',
        totalUsd: '0',
        productId: product.id,
        inputKg: kg.toString(),
        outputKg: kg.toString(),
        inventoryId: fromId,
        toInventoryId: toId,
        notes: cleanText(input.notes, 2000),
        label: product.name,
        createdById: actor.id,
        createdByName: actor.name,
        updatedById: actor.id,
        updatedByName: actor.name,
      },
    });
    const src: Src = { txnId: t.id, kind: 'STOCK_TRANSFER', date };
    const out = await stockOut(tx, src, product.id, state!, kg, product.name, fromId);
    await stockIn(tx, src, product.id, state!, kg, out.valueUsd, toId);
    const touched: StockKey[] = [
      { productId: product.id, state: state!, inventoryId: fromId },
      { productId: product.id, state: state!, inventoryId: toId },
    ];
    await clearResidualCost(tx, src, touched);
    await audit({ user: actor, action: 'create', module: 'inventory', reference: number, after: await snapshotTxn(tx, t.id) }, tx);
    return { id: t.id, number };
  });
}
