import 'server-only';
import bcrypt from 'bcryptjs';
import { prisma, withTx } from '@/lib/db';
import { D, parseDec, rateLine, round3, round4 } from '@/lib/money';
import { sanitizePermissions } from '@/lib/permissions';
import { parseLang } from '@/lib/i18n';
import { AppError, Validator, conflict, fieldError, notFound } from './errors';
import { cleanMultiline, cleanText, getSettings, nameKey, phone } from './common';
import { audit } from './audit';
import { revokeOtherSessions } from './auth';
import type { Actor } from './txns';
import type { Tx } from '@/lib/db';
import { skuFor } from '@/lib/rules';

const IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMG = 900_000; // chars of base64 (~650 KB) — the client crops to 256px, so this is generous

function cleanImage(v: unknown, field: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !IMG.test(v)) throw fieldError(field, 'v.required');
  if (v.length > MAX_IMG) throw fieldError(field, 'v.imageTooLarge');
  return v;
}

// ─── Customers & beneficiaries ─────────────────────────────────────────────────────────────────────
export type PartyInput = { name?: string; phone?: string; address?: string; avatar?: string | null };
type PartyKind = 'customer' | 'beneficiary';

export async function saveParty(kind: PartyKind, input: PartyInput, actor: Actor, id?: string, opts: { isDemo?: boolean } = {}) {
  const name = cleanText(input.name, 120);
  if (!name) throw fieldError('name', 'v.required');
  const key = nameKey(name);
  const data = {
    name,
    nameKey: key,
    phone: phone(input.phone),
    address: cleanMultiline(input.address, 300),
  };
  const existsKey = kind === 'customer' ? 'v.customerExists' : 'v.beneficiaryExists';
  const module = kind === 'customer' ? 'customers' : 'beneficiaries';
  return withTx(async (tx) => {
    const clash =
      kind === 'customer'
        ? await tx.customer.findUnique({ where: { nameKey: key }, select: { id: true } })
        : await tx.beneficiary.findUnique({ where: { nameKey: key }, select: { id: true } });
    if (clash && clash.id !== id) throw fieldError('name', existsKey);
    if (kind === 'customer') {
      const avatar = cleanImage(input.avatar, 'avatar');
      if (id) {
        const before = await tx.customer.findUnique({ where: { id } });
        if (!before) throw notFound();
        const after = await tx.customer.update({ where: { id }, data: { ...data, ...(avatar !== undefined ? { avatar } : {}) } });
        await audit({ user: actor, action: 'update', module, reference: name, before: { ...before, avatar: before.avatar ? '[image]' : null }, after: { ...after, avatar: after.avatar ? '[image]' : null } }, tx);
        return after;
      }
      const c = await tx.customer.create({ data: { ...data, avatar: avatar ?? null, isDemo: !!opts.isDemo } });
      await audit({ user: actor, action: 'create', module, reference: name, after: { ...c, avatar: c.avatar ? '[image]' : null } }, tx);
      return c;
    }
    if (id) {
      const before = await tx.beneficiary.findUnique({ where: { id } });
      if (!before) throw notFound();
      const after = await tx.beneficiary.update({ where: { id }, data });
      await audit({ user: actor, action: 'update', module, reference: name, before, after }, tx);
      return after;
    }
    const b = await tx.beneficiary.create({ data: { ...data, isDemo: !!opts.isDemo } });
    await audit({ user: actor, action: 'create', module, reference: name, after: b }, tx);
    return b;
  });
}

export async function deleteParty(kind: PartyKind, id: string, actor: Actor) {
  return withTx(async (tx) => {
    const where = kind === 'customer' ? { customerId: id } : { beneficiaryId: id };
    const party = kind === 'customer' ? await tx.customer.findUnique({ where: { id } }) : await tx.beneficiary.findUnique({ where: { id } });
    if (!party) throw notFound();
    const n = await tx.txn.count({ where });
    if (n > 0) throw conflict('block.partyHasTxns', { name: party.name, n });
    if (kind === 'customer') await tx.customer.delete({ where: { id } });
    else await tx.beneficiary.delete({ where: { id } });
    await audit({ user: actor, action: 'delete', module: kind === 'customer' ? 'customers' : 'beneficiaries', reference: party.name, before: { ...party, avatar: undefined } }, tx);
    return { name: party.name };
  });
}

// ─── Aluminum types ────────────────────────────────────────────────────────────────────────────────
export async function saveType(input: { name?: string }, actor: Actor, id?: string, opts: { isDemo?: boolean } = {}) {
  const name = cleanText(input.name, 60);
  if (!name) throw fieldError('name', 'v.required');
  return withTx(async (tx) => {
    const clash = await tx.aluminumType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
    if (clash && clash.id !== id) throw fieldError('name', 'v.typeExists');
    if (id) {
      const before = await tx.aluminumType.findUnique({ where: { id } });
      if (!before) throw notFound();
      const after = await tx.aluminumType.update({ where: { id }, data: { name } });
      await audit({ user: actor, action: 'update', module: 'settings', reference: `type:${name}`, before, after }, tx);
      return after;
    }
    const tRow = await tx.aluminumType.create({ data: { name, isDemo: !!opts.isDemo } });
    await audit({ user: actor, action: 'create', module: 'settings', reference: `type:${name}`, after: tRow }, tx);
    return tRow;
  });
}

export async function deleteType(id: string, actor: Actor) {
  return withTx(async (tx) => {
    const tRow = await tx.aluminumType.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!tRow) throw notFound();
    if (tRow._count.products > 0) throw conflict('block.typeInUse', { n: tRow._count.products });
    await tx.aluminumType.delete({ where: { id } });
    await audit({ user: actor, action: 'delete', module: 'settings', reference: `type:${tRow.name}`, before: tRow }, tx);
  });
}

// ─── Products ──────────────────────────────────────────────────────────────────────────────────────
// Every product gets its code (SKU) automatically: ALU-00001, ALU-00002, … from a running counter that only
// goes up, so a code is never given twice, not even after a product is deleted. Codes never change.
export type ProductInput = { name?: string; typeId?: string; lowStockKg?: string | null };

/** Take the next free product code (inside the caller's transaction). Skips codes already in use. */
export async function nextSku(tx: Tx): Promise<string> {
  for (;;) {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "Counter" ("key", "value") VALUES ('SKU', 1)
      ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
      RETURNING "value"`;
    const sku = skuFor(rows[0].value);
    if (!(await tx.product.findUnique({ where: { sku }, select: { id: true } }))) return sku;
  }
}

/** The code the next new product will most likely get (preview only; nothing is reserved). */
export async function peekSku(): Promise<string> {
  const c = await prisma.counter.findUnique({ where: { key: 'SKU' } });
  let n = (c?.value ?? 0) + 1;
  while (await prisma.product.findUnique({ where: { sku: skuFor(n) }, select: { id: true } })) n++;
  return skuFor(n);
}

export async function saveProduct(input: ProductInput, actor: Actor, id?: string, opts: { isDemo?: boolean } = {}) {
  const v = new Validator();
  const name = cleanText(input.name, 120);
  if (!name) v.add('name', 'v.required');
  if (!input.typeId) v.add('typeId', 'v.typeRequired');
  let low: string | null = null;
  if (input.lowStockKg !== undefined && input.lowStockKg !== null && input.lowStockKg !== '') {
    const d = parseDec(input.lowStockKg);
    if (!d) v.add('lowStockKg', 'v.number');
    else if (d.isNegative()) v.add('lowStockKg', 'v.nonNegative');
    else low = round3(d).toString();
  }
  v.throwIfAny();
  return withTx(async (tx) => {
    const type = await tx.aluminumType.findUnique({ where: { id: input.typeId! } });
    if (!type) throw fieldError('typeId', 'v.typeRequired');
    const data = { name, typeId: type.id, lowStockKg: low };
    if (id) {
      // The code stays as it is: invoices, statements and reports already show it.
      const before = await tx.product.findUnique({ where: { id } });
      if (!before) throw notFound();
      const after = await tx.product.update({ where: { id }, data });
      await audit({ user: actor, action: 'update', module: 'products', reference: before.sku, before, after }, tx);
      return after;
    }
    const sku = await nextSku(tx);
    const p = await tx.product.create({ data: { ...data, sku, isDemo: !!opts.isDemo } });
    await audit({ user: actor, action: 'create', module: 'products', reference: sku, after: p }, tx);
    return p;
  });
}

export async function deleteProduct(id: string, actor: Actor) {
  return withTx(async (tx) => {
    const p = await tx.product.findUnique({ where: { id }, include: { _count: { select: { lines: true, stock: true, processing: true } } } });
    if (!p) throw notFound();
    if (p._count.lines + p._count.stock + p._count.processing > 0) throw conflict('block.productInUse');
    await tx.product.delete({ where: { id } });
    await audit({ user: actor, action: 'delete', module: 'products', reference: p.sku, before: p }, tx);
  });
}

// ─── Settings ──────────────────────────────────────────────────────────────────────────────────────
export async function updateRate(rateInput: unknown, actor: Actor) {
  const r = parseDec(rateInput);
  if (!r || !r.gt(0)) throw fieldError('rate', 'v.rate');
  const newRate = round4(r);
  return withTx(async (tx) => {
    const s = await getSettings(tx);
    const oldRate = D(s.exchangeRate);
    if (oldRate.eq(newRate)) return { rate: newRate.toString() };
    await tx.appSettings.update({ where: { id: 1 }, data: { exchangeRate: newRate.toString() } });
    await tx.exchangeRateLog.create({ data: { oldRate: oldRate.toString(), newRate: newRate.toString(), userId: actor.id, userName: actor.name } });
    await audit({ user: actor, action: 'rate', module: 'settings', reference: rateLine(newRate), before: { rate: oldRate.toString() }, after: { rate: newRate.toString() } }, tx);
    return { rate: newRate.toString() };
  });
}

export type AlertSettingsInput = Partial<{
  lowStockKg: string;
  alertCustomerDue: boolean;
  customerDueUsd: string;
  alertBeneficiaryDue: boolean;
  beneficiaryDueUsd: string;
  alertLowStock: boolean;
  alertVault: boolean;
  vaultMinUsd: string;
  vaultMinIqd: string;
  alertOverdue: boolean;
  overdueDays: string | number;
}>;

export async function updateAlertSettings(input: AlertSettingsInput, actor: Actor) {
  const v = new Validator();
  const data: Record<string, unknown> = {};
  const num = (f: keyof AlertSettingsInput, dp: number, allowNegative = false) => {
    const raw = input[f];
    if (raw === undefined) return;
    const d = parseDec(raw);
    if (!d) return v.add(f, 'v.number');
    if (!allowNegative && d.isNegative()) return v.add(f, 'v.nonNegative');
    data[f] = d.toDecimalPlaces(dp).toString();
  };
  num('lowStockKg', 3);
  num('customerDueUsd', 2);
  num('beneficiaryDueUsd', 2);
  num('vaultMinUsd', 2, true);
  num('vaultMinIqd', 0, true);
  if (input.overdueDays !== undefined) {
    const n = Number(input.overdueDays);
    if (!Number.isInteger(n) || n < 1 || n > 3650) v.add('overdueDays', 'v.positive');
    else data.overdueDays = n;
  }
  for (const f of ['alertCustomerDue', 'alertBeneficiaryDue', 'alertLowStock', 'alertVault', 'alertOverdue'] as const) {
    if (typeof input[f] === 'boolean') data[f] = input[f];
  }
  v.throwIfAny();
  return withTx(async (tx) => {
    const before = await getSettings(tx);
    const after = await tx.appSettings.update({ where: { id: 1 }, data });
    await audit({ user: actor, action: 'settings', module: 'settings', reference: 'alerts', before, after }, tx);
    return after;
  });
}

export type CompanyInput = { name?: string; logo?: string | null; address?: string; phones?: string; footerNote?: string };

export async function updateCompany(input: CompanyInput, actor: Actor) {
  const name = cleanText(input.name, 120) || 'ALU FACTORY';
  const logo = cleanImage(input.logo, 'logo');
  return withTx(async (tx) => {
    const before = await tx.companyProfile.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    const after = await tx.companyProfile.update({
      where: { id: 1 },
      data: {
        name,
        address: cleanMultiline(input.address, 300),
        phones: cleanText(input.phones, 120),
        footerNote: cleanMultiline(input.footerNote, 300),
        ...(logo !== undefined ? { logo } : {}),
      },
    });
    await audit({ user: actor, action: 'settings', module: 'settings', reference: 'company', before: { ...before, logo: before.logo ? '[image]' : null }, after: { ...after, logo: after.logo ? '[image]' : null } }, tx);
    return after;
  });
}

// ─── Users ─────────────────────────────────────────────────────────────────────────────────────────
export type UserInput = { name?: string; email?: string; password?: string; active?: boolean; permissions?: string[]; lang?: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveUser(input: UserInput, actor: Actor, id?: string) {
  const v = new Validator();
  const name = cleanText(input.name, 120);
  const email = cleanText(input.email, 200).toLowerCase();
  if (!name) v.add('name', 'v.required');
  if (!email) v.add('email', 'v.required');
  else if (!EMAIL.test(email)) v.add('email', 'v.email');
  const password = typeof input.password === 'string' ? input.password : '';
  if (!id && password.length < 8) v.add('password', 'auth.passwordMin');
  if (id && password && password.length < 8) v.add('password', 'auth.passwordMin');
  v.throwIfAny();
  const permissions = sanitizePermissions(input.permissions);
  return withTx(async (tx) => {
    const clash = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (clash && clash.id !== id) throw fieldError('email', 'v.emailExists');
    const hash = password ? await bcrypt.hash(password, 12) : undefined;
    if (id) {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw notFound();
      if (before.isOwner) {
        // The owner keeps full access and can never be deactivated; only name/email/password change.
        if (input.active === false || actor.id !== before.id) throw new AppError(409, 'block.ownerLocked');
        const after = await tx.user.update({ where: { id }, data: { name, email, ...(hash ? { passwordHash: hash } : {}) } });
        if (hash) await revokeOtherSessions(tx, id);
        await audit({ user: actor, action: 'update', module: 'users', reference: email, before: pub(before), after: pub(after) }, tx);
        return pub(after);
      }
      const active = input.active !== false;
      const after = await tx.user.update({ where: { id }, data: { name, email, active, permissions, ...(hash ? { passwordHash: hash } : {}) } });
      if (!active || hash) await tx.session.deleteMany({ where: { userId: id } });
      const permsChanged = JSON.stringify([...before.permissions].sort()) !== JSON.stringify([...permissions].sort()) || before.active !== active;
      await audit({ user: actor, action: permsChanged ? 'permission' : 'update', module: 'users', reference: email, before: pub(before), after: pub(after) }, tx);
      return pub(after);
    }
    const u = await tx.user.create({ data: { name, email, passwordHash: hash!, active: input.active !== false, permissions, lang: parseLang(input.lang) } });
    await audit({ user: actor, action: 'permission', module: 'users', reference: email, after: pub(u) }, tx);
    return pub(u);
  });
}

function pub(u: { id: string; name: string; email: string; isOwner: boolean; active: boolean; permissions: string[]; lastLoginAt: Date | null; lang: string }) {
  return { id: u.id, name: u.name, email: u.email, isOwner: u.isOwner, active: u.active, permissions: u.permissions, lastLoginAt: u.lastLoginAt, lang: u.lang };
}

export async function listUsers() {
  const rows = await prisma.user.findMany({ orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }] });
  return rows.map(pub);
}
