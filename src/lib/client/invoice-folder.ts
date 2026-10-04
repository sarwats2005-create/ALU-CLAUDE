'use client';
// Automatic invoice saving to a folder on this computer (File System Access API: Chrome / Edge desktop).
// The chosen folder handle is kept in this browser's IndexedDB, so the setting belongs to this computer and
// browser only. Browsers may ask for permission again after a restart; invoices created while permission
// is missing are queued and saved when the user clicks "Allow access" on the Invoices page.

import { docUrl } from './paper';

type Perm = 'granted' | 'denied' | 'prompt';
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(opts: { mode: 'readwrite' }): Promise<Perm>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<Perm>;
};
type Pending = { id: string; number: string };

export type FolderState = {
  supported: boolean;
  name: string | null;
  permission: Perm | null;
  pending: number;
};

export type SaveResult = { status: 'off' } | { status: 'saved'; file: string; folder: string } | { status: 'pending'; file: string };

const DB = 'alu-local';
const STORE = 'kv';
const K_DIR = 'invoiceDir';
const K_PENDING = 'invoicePending';
export const FOLDER_EVENT = 'alu:invoice-folder';

export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window && window.isSecureContext;

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

const notify = () => window.dispatchEvent(new Event(FOLDER_EVENT));
const fileOf = (number: string) => `${number.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`;

async function getDir(): Promise<DirHandle | null> {
  if (!folderSupported()) return null;
  try {
    return (await kvGet<DirHandle>(K_DIR)) ?? null;
  } catch {
    return null;
  }
}
async function getPending(): Promise<Pending[]> {
  try {
    return (await kvGet<Pending[]>(K_PENDING)) ?? [];
  } catch {
    return [];
  }
}
async function setPending(list: Pending[]) {
  await kvSet(K_PENDING, list.length ? list : undefined).catch(() => {});
}
async function addPending(p: Pending) {
  const list = (await getPending()).filter((x) => x.id !== p.id);
  await setPending([...list, p]);
}

export async function folderState(): Promise<FolderState> {
  const supported = folderSupported();
  const dir = await getDir();
  const permission = dir ? await dir.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt' as Perm) : null;
  return { supported, name: dir?.name ?? null, permission, pending: dir ? (await getPending()).length : 0 };
}

/** Ask permission when it has lapsed. Only succeeds right after a click (browsers require a user gesture). */
async function ensurePermission(dir: DirHandle): Promise<boolean> {
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  try {
    return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

async function writePdf(dir: DirHandle, id: string, number: string): Promise<void> {
  const res = await fetch(docUrl(id, 'pdf'), { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PDF ${res.status}`);
  const blob = await res.blob();
  const fh = await dir.getFileHandle(fileOf(number), { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

/** Called after an invoice is created or edited: (re)writes <number>.pdf in the chosen folder. */
export async function autoSaveInvoice(id: string, number: string): Promise<SaveResult> {
  const dir = await getDir();
  if (!dir) return { status: 'off' };
  const file = fileOf(number);
  try {
    if (!(await ensurePermission(dir))) throw new Error('permission');
    await writePdf(dir, id, number);
    await setPending((await getPending()).filter((x) => x.id !== id));
    notify();
    return { status: 'saved', file, folder: dir.name };
  } catch {
    await addPending({ id, number });
    notify();
    return { status: 'pending', file };
  }
}

/** Called after an invoice is deleted: removes its PDF from the folder (and from the waiting list). */
export async function removeInvoiceFile(id: string, number: string): Promise<void> {
  await setPending((await getPending()).filter((x) => x.id !== id));
  const dir = await getDir();
  if (dir && (await dir.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt')) === 'granted') {
    await dir.removeEntry(fileOf(number)).catch(() => {});
  }
  notify();
}

/** Save every queued invoice. Returns how many were saved. */
export async function flushPending(): Promise<number> {
  const dir = await getDir();
  if (!dir || !(await ensurePermission(dir))) return 0;
  const left: Pending[] = [];
  let done = 0;
  for (const p of await getPending()) {
    try {
      await writePdf(dir, p.id, p.number);
      done++;
    } catch {
      left.push(p);
    }
  }
  await setPending(left);
  notify();
  return done;
}

/** Opens the folder picker. Returns the folder name, or null if the user cancelled. */
export async function chooseFolder(): Promise<string | null> {
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
  let dir: DirHandle;
  try {
    dir = await picker({ id: 'alu-invoices', mode: 'readwrite', startIn: 'documents' });
  } catch {
    return null;
  }
  await kvSet(K_DIR, dir);
  await flushPending();
  notify();
  return dir.name;
}

export async function allowAccess(): Promise<boolean> {
  const dir = await getDir();
  if (!dir || !(await ensurePermission(dir))) return false;
  await flushPending();
  notify();
  return true;
}

export async function stopAutoSave(): Promise<void> {
  await kvSet(K_DIR, undefined);
  await setPending([]);
  notify();
}
