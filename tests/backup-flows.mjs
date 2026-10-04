// Backup / restore / start fresh — end-to-end against a running server.
//   BASE=http://localhost:3000 OWNER_EMAIL=... OWNER_PASSWORD=... node tests/backup-flows.mjs
// WIPES AND RESTORES THE WHOLE DATABASE (it ends exactly where it started). Never run it against production.
import { createHash } from 'node:crypto';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const EMAIL = process.env.OWNER_EMAIL ?? 'owner@alu.test';
const PASSWORD = process.env.OWNER_PASSWORD ?? 'password123';
const PIN = process.env.MASTER_PIN ?? '1122';

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${JSON.stringify(detail).slice(0, 400)}`}`);
}
let cookie = '';
async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const kv = c.split(';')[0];
    const k = kv.split('=')[0];
    cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; ');
  }
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
}
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const tableHashes = (f) => Object.fromEntries(Object.entries(f.data).filter(([t]) => t !== 'auditLog').map(([t, rows]) => [t, sha(rows)]));
const sameTables = (a, b) => Object.keys(a).filter((t) => a[t] !== b[t]);

check('owner signs in', (await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })).status === 200);

// 1. Export: complete, checksummed, repeatable.
const e1 = await call('GET', '/api/settings/export?format=json');
const f1 = e1.data;
check('export is a format-2 backup with a checksum', e1.status === 200 && f1.app === 'ALU FACTORY' && f1.format === 2 && /^[0-9a-f]{64}$/.test(f1.checksum), Object.keys(f1));
check('checksum matches the data', sha(f1.data) === f1.checksum);
for (const t of ['expenseCategory', 'recurringExpense', 'vaultDue', 'txn', 'vaultEntry', 'user'])
  check(`export includes ${t} (${f1.counts[t]} rows)`, Array.isArray(f1.data[t]) && f1.data[t].length === f1.counts[t]);
check('customer pictures are included (not stripped)', !JSON.stringify(f1.data.customer).includes('[image]'));
const h1 = tableHashes(f1);
const f1b = (await call('GET', '/api/settings/export?format=json')).data;
check('two exports in a row give identical data (except the audit line for the export)', sameTables(h1, tableHashes(f1b)).length === 0, sameTables(h1, tableHashes(f1b)));

// 2. Guards.
check('restore with wrong PIN → 403', (await call('POST', '/api/settings/backup/restore', { pin: '0000', file: f1 })).status === 403);
check('fresh start with wrong PIN → 403', (await call('POST', '/api/settings/backup/reset', { pin: '0000' })).status === 403);
const bad = JSON.parse(JSON.stringify(f1));
bad.data.txn[0].total = '999999';
const r0 = await call('POST', '/api/settings/backup/restore', { pin: PIN, file: bad });
check('edited file is refused (bk.damaged) and nothing changes', r0.status === 400 && r0.data.code === 'bk.damaged', r0);
const r0b = await call('POST', '/api/settings/backup/restore', { pin: PIN, file: { app: 'nope' } });
check('non-backup file is refused', r0b.status === 400 && r0b.data.code === 'bk.notBackup', r0b);

// 3. Start fresh.
const rs = await call('POST', '/api/settings/backup/reset', { pin: PIN });
check('start fresh with PIN 1122', rs.status === 200 && !!rs.data.snapshotId, rs);
const f2 = (await call('GET', '/api/settings/export?format=json')).data;
const nonEmpty = Object.entries(f2.counts).filter(([t, n]) => n > 0 && !['user', 'auditLog', 'appSettings', 'companyProfile'].includes(t));
check('every business table is empty', nonEmpty.length === 0, nonEmpty);
check('only the owner login is left', f2.counts.user === 1 && f2.data.user[0].email === EMAIL, f2.data.user);
check('dashboard still works on the empty app', (await call('GET', '/api/customers')).data.total === 0);
const snaps = (await call('GET', '/api/settings/backup/snapshots')).data.rows;
check('a "before-reset" restore point holds the old data', snaps[0]?.kind === 'before-reset' && snaps[0].counts.txn === f1.counts.txn, snaps[0]);

// 4. Restore from the file → identical to before.
const rr = await call('POST', '/api/settings/backup/restore', { pin: PIN, file: f1 });
check('restore from file', rr.status === 200, rr);
const f3 = (await call('GET', '/api/settings/export?format=json')).data;
check('every table is identical to the original', sameTables(h1, tableHashes(f3)).length === 0, sameTables(h1, tableHashes(f3)));
check('the original audit log is back (plus the restore line)', f1.data.auditLog.every((a) => f3.data.auditLog.some((b) => b.id === a.id)) && f3.data.auditLog.some((a) => a.reference === 'restored file'));

// 5. New records after a restore don't collide with restored ids.
const dep = await call('POST', '/api/vault/ops', { kind: 'VAULT_DEPOSIT', vault: 'USD', amount: '1', date: new Date().toISOString().slice(0, 10), label: 'backup test' });
check('new transactions work after a restore (numbering + ids continue)', dep.status === 200, dep);
await call('DELETE', `/api/txns/${dep.data.id}`);

// 6. Restore point round-trip: fresh start, then bring back the restore point taken before it.
await call('POST', '/api/settings/backup/reset', { pin: PIN });
const before = (await call('GET', '/api/settings/backup/snapshots')).data.rows.find((s) => s.kind === 'before-reset');
const rp = await call('POST', '/api/settings/backup/restore', { pin: PIN, snapshotId: before.id });
check('restore from a restore point', rp.status === 200, rp);
const f4 = (await call('GET', '/api/settings/export?format=json')).data;
const diff4 = sameTables(tableHashes(f3), tableHashes(f4)).filter((t) => !['txn', 'vaultEntry', 'counter'].includes(t));
check('data is back as it was before the second fresh start', diff4.length === 0, diff4);
const dl = await call('GET', `/api/settings/backup/snapshots/${before.id}`);
check('a restore point downloads as a valid backup file', dl.status === 200 && dl.data.format === 2 && sha(dl.data.data) === dl.data.checksum);

// 7. Put the database back exactly as the test found it.
const fin = await call('POST', '/api/settings/backup/restore', { pin: PIN, file: f1 });
const f5 = (await call('GET', '/api/settings/export?format=json')).data;
check('database left exactly as found', fin.status === 200 && sameTables(h1, tableHashes(f5)).length === 0, sameTables(h1, tableHashes(f5)));

console.log(`\n${fail ? 'BACKUP FLOWS FAILED' : 'BACKUP FLOWS ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
