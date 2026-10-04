'use client';
// Weekly backup to a folder on this computer (File System Access API: Chrome / Edge desktop), the same way
// invoices are auto-saved. The folder handle lives in this browser's IndexedDB. The backup is written while
// the app is open: once a week (or right away when the last one is older than that), as
// alu-factory-backup-YYYY-MM-DD.json. Browsers may ask again for permission after a restart; then the backup
// waits until the owner clicks "Allow access" in Settings → Data.

import { RULES, DAY_MS } from '@/lib/rules';

type Perm = 'granted' | 'denied' | 'prompt';
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(opts: { mode: 'readwrite' }): Promise<Perm>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<Perm>;
};

export type BackupFolderState = { supported: boolean; name: string | null; permission: Perm | null; last: string | null; lastFile: string | null; due: boolean };

const DB = 'alu-local';
const STORE = 'kv';
const K_DIR = 'backupDir';
const K_LAST = 'backupLast';
const K_FILE = 'backupLastFile';
const WEEK = RULES.folderBackupDays * DAY_MS;
export const BACKUP_EVENT = 'alu:backup-folder';

export const backupFolderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window && window.isSecureContext;

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function kvGet<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}
async function kvSet(key: string, value: unknown): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    if (value === undefined) tx.objectStore(STORE).delete(key);
    else tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
const notify = () => window.dispatchEvent(new Event(BACKUP_EVENT));

async function getDir(): Promise<DirHandle | null> {
  if (!backupFolderSupported()) return null;
  try {
    return (await kvGet<DirHandle>(K_DIR)) ?? null;
  } catch {
    return null;
  }
}

export async function backupFolderState(): Promise<BackupFolderState> {
  const dir = await getDir();
  const permission = dir ? await dir.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt' as Perm) : null;
  const last = (await kvGet<string>(K_LAST).catch(() => undefined)) ?? null;
  const lastFile = (await kvGet<string>(K_FILE).catch(() => undefined)) ?? null;
  return { supported: backupFolderSupported(), name: dir?.name ?? null, permission, last, lastFile, due: !!dir && (!last || Date.now() - new Date(last).getTime() >= WEEK) };
}

/** Fetch the full backup from the server and write it into the folder. */
async function write(dir: DirHandle): Promise<string> {
  const res = await fetch('/api/settings/export?format=json', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`backup ${res.status}`);
  const text = await res.text();
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `alu-factory-backup-${stamp}.json`;
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([text], { type: 'application/json' }));
  await w.close();
  await kvSet(K_LAST, new Date().toISOString());
  await kvSet(K_FILE, name);
  notify();
  return name;
}

/** Pick (or change) the folder, then save a backup into it straight away. Must run from a click. */
export async function chooseBackupFolder(): Promise<string | null> {
  if (!backupFolderSupported()) return null;
  let dir: DirHandle;
  try {
    dir = (await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ id: 'alu-backups', mode: 'readwrite' })) as DirHandle;
  } catch {
    return null; // cancelled
  }
  await kvSet(K_DIR, dir);
  return write(dir);
}

/** "Save now" / "Allow access": asks permission if needed (this is a click), then writes. */
export async function saveBackupNow(): Promise<string> {
  const dir = await getDir();
  if (!dir) throw new Error('no folder');
  if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('permission');
  return write(dir);
}

export async function stopWeeklyBackup() {
  await kvSet(K_DIR, undefined);
  notify();
}

/** Called when the app opens: writes this week's backup if it's due and the browser still has permission. */
export async function runWeeklyBackupIfDue(): Promise<{ status: 'saved'; file: string } | { status: 'needs-access' } | { status: 'idle' }> {
  const s = await backupFolderState();
  if (!s.due) return { status: 'idle' };
  const dir = await getDir();
  if (!dir || s.permission !== 'granted') return { status: 'needs-access' };
  try {
    return { status: 'saved', file: await write(dir) };
  } catch {
    return { status: 'needs-access' };
  }
}
