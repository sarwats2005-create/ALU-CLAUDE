import 'server-only';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db';
import { AppError, notFound } from './errors';
import { getSettings } from './common';
import { RULES, MIN_MS, HOUR_MS } from '@/lib/rules';
import { audit, jsonSafe } from './audit';
import type { SessionUser } from './auth';

// ─── Backups ──────────────────────────────────────────────────────────────────────────────────────
// One format for everything: the JSON file the owner downloads, the weekly file saved to a folder,
// and the restore points kept inside the database.
//  • Complete — every business table, every column (avatars and logins included).
//  • Consistent — read inside ONE repeatable-read transaction, so all tables are from the same instant.
//  • Verified — a SHA-256 checksum of the data; a file that was edited or damaged is refused.
//  • All-or-nothing restore — inside one transaction; any error leaves the current data untouched.
//  • Nothing is lost — before every restore or fresh start the current data is saved as a restore point.

export const BACKUP_FORMAT = 2;
const APP = 'ALU FACTORY';
const DEFAULT_PIN = '1122';

/** Insert order (parents first). Deleting goes the other way. Sessions / login attempts are never backed up. */
const TABLES = [
  'user',
  'companyProfile',
  'appSettings',
  'exchangeRateLog',
  'counter',
  'aluminumType',
  'product',
  'customer',
  'beneficiary',
  'expenseCategory',
  'recurringExpense',
  'txn',
  'txnLine',
  'vaultDue',
  'vaultEntry',
  'partyEntry',
  'stockEntry',
  'auditLog',
] as const;
type Table = (typeof TABLES)[number];
type Rows = Record<string, unknown>[];
export type BackupData = Record<Table, Rows>;
export type BackupFile = { app: string; format: number; exportedAt: string; counts: Record<Table, number>; checksum: string; data: BackupData };

/** Tables with an auto-increment id (their sequence is moved past the restored ids). */
const SERIAL: Partial<Record<Table, string>> = { exchangeRateLog: 'ExchangeRateLog', vaultEntry: 'VaultEntry', partyEntry: 'PartyEntry', stockEntry: 'StockEntry', auditLog: 'AuditLog' };
/** Nullable JSON columns: a JSON null must be written as DbNull. */
const JSON_NULLABLE: Partial<Record<Table, string[]>> = { auditLog: ['before', 'after'] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const model = (tx: Tx, t: Table) => (tx as any)[t] as { findMany: (a?: unknown) => Promise<Rows>; createMany: (a: unknown) => Promise<unknown>; deleteMany: (a?: unknown) => Promise<unknown> };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function readAll(tx: Tx): Promise<BackupData> {
  const out = {} as BackupData;
  for (const t of TABLES) {
    out[t] = jsonSafe(await model(tx, t).findMany()) as Rows;
  }
  // Stable order so the same data always gives the same checksum.
  for (const t of TABLES) out[t].sort((a, b) => String(a.id ?? a.key).localeCompare(String(b.id ?? b.key), 'en', { numeric: true }));
  return out;
}

function wrap(data: BackupData): BackupFile {
  const counts = Object.fromEntries(TABLES.map((t) => [t, data[t].length])) as Record<Table, number>;
  return { app: APP, format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), counts, checksum: sha(JSON.stringify(data)), data };
}

/** The complete backup, read as one consistent snapshot of the database. */
export async function buildBackup(): Promise<BackupFile> {
  const data = await prisma.$transaction((tx) => readAll(tx), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000, maxWait: 20_000 });
  return wrap(data);
}

/** Check a backup (file or restore point) before anything is touched. */
export function validateBackup(raw: unknown): BackupFile {
  const f = raw as Partial<BackupFile> | null;
  if (!f || typeof f !== 'object' || f.app !== APP) throw new AppError(400, 'bk.notBackup');
  if (f.format !== BACKUP_FORMAT || !f.data || typeof f.data !== 'object') throw new AppError(400, 'bk.oldFormat');
  for (const t of TABLES) if (!Array.isArray((f.data as BackupData)[t])) throw new AppError(400, 'bk.damaged');
  if (sha(JSON.stringify(f.data)) !== f.checksum) throw new AppError(400, 'bk.damaged');
  if (!(f.data as BackupData).user.some((u) => u.isOwner)) throw new AppError(400, 'bk.damaged');
  return f as BackupFile;
}

// ─── Master PIN (same PIN as erase mode; default 1122) ───────────────────────────────────────────
export async function checkMasterPin(user: SessionUser, pin: unknown) {
  if (!user.isOwner) throw new AppError(403, 'err.forbidden');
  const key = `master:${user.id}`;
  const since = new Date(Date.now() - RULES.pinLockMinutes * MIN_MS);
  if ((await prisma.loginAttempt.count({ where: { key, success: false, createdAt: { gte: since } } })) >= RULES.pinMaxTries) throw new AppError(429, 'erase.pinLocked');
  const s = await getSettings();
  const p = typeof pin === 'string' ? pin.trim() : '';
  const ok = p.length > 0 && (s.erasePinHash ? await bcrypt.compare(p, s.erasePinHash) : p === DEFAULT_PIN);
  if (!ok) {
    await prisma.loginAttempt.create({ data: { key, success: false } });
    throw new AppError(403, 'erase.pinWrong');
  }
  await prisma.loginAttempt.deleteMany({ where: { key } });
}

// ─── Restore points ───────────────────────────────────────────────────────────────────────────────
const KEEP = { daily: RULES.keepDailySnapshots, other: RULES.keepOtherSnapshots };

export async function saveSnapshot(kind: 'daily' | 'before-restore' | 'before-reset' | 'manual', byName = '') {
  const file = await buildBackup();
  const gz = gzipSync(Buffer.from(JSON.stringify(file)), { level: 9 });
  const snap = await prisma.snapshot.create({
    data: { kind, createdByName: byName, sizeBytes: gz.length, counts: file.counts, checksum: file.checksum, data: gz },
    select: { id: true, createdAt: true },
  });
  // Retention: the newest 14 daily copies and the newest 20 of the others.
  const daily = kind === 'daily';
  const old = await prisma.snapshot.findMany({
    where: daily ? { kind: 'daily' } : { kind: { not: 'daily' } },
    orderBy: { createdAt: 'desc' },
    skip: daily ? KEEP.daily : KEEP.other,
    select: { id: true },
  });
  if (old.length) await prisma.snapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return snap;
}

/** Take today's automatic restore point if the last one is older than 20 hours. Safe to call often. */
export async function ensureDailySnapshot() {
  const last = await prisma.snapshot.findFirst({ where: { kind: 'daily' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  if (last && Date.now() - last.createdAt.getTime() < RULES.dailySnapshotHours * HOUR_MS) return false;
  // Only one server process takes it (others skip instead of waiting).
  const got = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(hashtext('alu:daily-snapshot')) AS ok`;
  if (!got[0]?.ok) return false;
  try {
    const again = await prisma.snapshot.findFirst({ where: { kind: 'daily' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    if (again && Date.now() - again.createdAt.getTime() < RULES.dailySnapshotHours * HOUR_MS) return false;
    await saveSnapshot('daily', 'automatic');
    return true;
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext('alu:daily-snapshot'))`;
  }
}

export async function listSnapshots() {
  const rows = await prisma.snapshot.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, createdAt: true, createdByName: true, sizeBytes: true, counts: true } });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function snapshotFile(id: string): Promise<BackupFile> {
  const s = await prisma.snapshot.findUnique({ where: { id }, select: { data: true } });
  if (!s) throw notFound();
  return JSON.parse(gunzipSync(Buffer.from(s.data)).toString('utf8')) as BackupFile;
}

// ─── Restore & fresh start ───────────────────────────────────────────────────────────────────────
async function wipe(tx: Tx, keepUserId: string) {
  await tx.alertRead.deleteMany();
  for (const t of [...TABLES].reverse()) {
    if (t === 'user') await tx.user.deleteMany({ where: { id: { not: keepUserId } } });
    else await model(tx, t).deleteMany();
  }
  await tx.loginAttempt.deleteMany({ where: { key: { startsWith: 'pin:' } } });
}

async function resetSequences(tx: Tx) {
  for (const name of Object.values(SERIAL)) {
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${name}"', 'id'), COALESCE((SELECT MAX(id) FROM "${name}"), 0) + 1, false)`,
    );
  }
}

function prepare(t: Table, rows: Rows): Rows {
  const nul = JSON_NULLABLE[t];
  if (!nul) return rows;
  return rows.map((r) => {
    const c = { ...r };
    for (const k of nul) if (c[k] === null || c[k] === undefined) c[k] = Prisma.DbNull;
    return c;
  });
}

/**
 * Replace ALL business data with a backup. The signed-in owner keeps their own login (so nobody is locked
 * out); every other account comes from the backup. Runs in one transaction: it either completes or nothing
 * changes. A restore point of the current data is saved first.
 */
export async function restoreBackup(user: SessionUser, raw: unknown, source: string) {
  const file = validateBackup(raw);
  await saveSnapshot('before-restore', user.name);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, email: true } });
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('alu:vaults'))`;
      await wipe(tx, me.id);
      for (const t of TABLES) {
        let rows = file.data[t];
        if (t === 'user') rows = rows.filter((u) => u.id !== me.id && String(u.email).toLowerCase() !== me.email.toLowerCase()).map((u) => ({ ...u, isOwner: false }));
        rows = prepare(t, rows);
        for (let i = 0; i < rows.length; i += 500) await model(tx, t).createMany({ data: rows.slice(i, i + 500) });
      }
      // Backups made before split payment have no paidUsd / paidIqd: take them from the one vault used.
      await tx.$executeRaw`UPDATE "Txn" SET "paidUsd" = "vaultAmount" WHERE kind IN ('SALE','PURCHASE') AND vault = 'USD' AND "paidUsd" = 0 AND "paidIqd" = 0`;
      await tx.$executeRaw`UPDATE "Txn" SET "paidIqd" = "vaultAmount" WHERE kind IN ('SALE','PURCHASE') AND vault = 'IQD' AND "paidUsd" = 0 AND "paidIqd" = 0`;
      await resetSequences(tx);
    },
    { timeout: 300_000, maxWait: 20_000 },
  );
  // Sign out everyone else: their sessions may belong to accounts that changed.
  await prisma.session.deleteMany({ where: { userId: { not: me.id } } });
  await audit({ user, action: 'settings', module: 'backup', reference: `restored ${source}`, after: { exportedAt: file.exportedAt, counts: file.counts } });
  return { exportedAt: file.exportedAt, counts: file.counts };
}

/** Start fresh: an empty app with only the owner's login. Everything before it is kept as a restore point. */
export async function startFresh(user: SessionUser) {
  const snap = await saveSnapshot('before-reset', user.name);
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('alu:vaults'))`;
      await wipe(tx, user.id);
      await resetSequences(tx);
    },
    { timeout: 300_000, maxWait: 20_000 },
  );
  await prisma.session.deleteMany({ where: { userId: { not: user.id } } });
  return { snapshotId: snap.id };
}
