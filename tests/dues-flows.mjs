// Unpaid vault dues: "pay what the vault has, owe the rest" — end-to-end against a running server.
//   BASE=http://localhost:3000 OWNER_EMAIL=... OWNER_PASSWORD=... node tests/dues-flows.mjs
// Leaves the USD vault exactly as it found it. Never run it against production data.
const BASE = process.env.BASE ?? 'http://localhost:3000';
const EMAIL = process.env.OWNER_EMAIL ?? 'owner@alu.test';
const PASSWORD = process.env.OWNER_PASSWORD ?? 'password123';
const tag = Date.now().toString(36).toUpperCase();
const today = new Date().toISOString().slice(0, 10);

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${JSON.stringify(detail)}`}`);
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
const dues = async () => (await call('GET', '/api/vault/dues?vault=USD')).data;
const cashUsd = async () => Number((await dues()).cash.USD);
const owed = (d) => d.rows.reduce((s, r) => s + Number(r.remaining), 0);

check('owner can sign in', (await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })).status === 200);
const start = await dues();
check('starts with no open USD dues', start.rows.length === 0, start.rows);
const cash0 = Number(start.cash.USD);

// 1. A withdrawal bigger than the vault: refused until confirmed.
const wBody = { kind: 'VAULT_WITHDRAWAL', vault: 'USD', amount: String(cash0 + 300), date: today, label: `Dues test ${tag}` };
const w1 = await call('POST', '/api/vault/ops', wBody);
check('short withdrawal without consent → 409 vault.short', w1.status === 409 && w1.data.code === 'vault.short', w1);
check('nothing was recorded', (await cashUsd()) === cash0);
const w2 = await call('POST', '/api/vault/ops', { ...wBody, allowShortfall: true });
check('confirmed → recorded', w2.status === 200, w2);
let d = await dues();
check('vault cash is exactly 0 (never negative)', Number(d.cash.USD) === 0, d.cash);
check('one due of 300', d.rows.length === 1 && Number(d.rows[0].remaining) === 300, d.rows);

// 2. Exchanges stay strict.
const tr = await call('POST', '/api/vault/ops', { kind: 'VAULT_TRANSFER', vault: 'USD', toVault: 'IQD', amount: '10', rate: '1500', date: today, label: '' });
check('transfer from an empty vault → 409 vault.notEnough', tr.status === 409 && tr.data.code === 'vault.notEnough', tr);
const tr2 = await call('POST', '/api/vault/ops', { kind: 'VAULT_TRANSFER', vault: 'USD', toVault: 'IQD', amount: '10', rate: '1500', date: today, label: '', allowShortfall: true });
check('…even with allowShortfall', tr2.status === 409, tr2);

// 3. A second short payment (beneficiary) adds a second due.
const ben = await call('POST', '/api/beneficiaries', { name: `Dues Supplier ${tag}` });
const pay = await call('POST', '/api/payments', { kind: 'BENEFICIARY_PAYMENT', partyId: ben.data.id, date: today, amount: '50', currency: 'USD', vault: 'USD', allowShortfall: true });
check('short beneficiary payment confirmed', pay.status === 200, pay);
d = await dues();
check('two dues, 350 owed, oldest first', d.rows.length === 2 && owed(d) === 350 && Number(d.rows[0].remaining) === 300, d.rows);
const ov = (await call('GET', '/api/vault')).data;
const usdCard = ov?.vaults?.find?.((v) => v.vault === 'USD');
check('vault card: cash 0 / dues 350 / net −350', Number(usdCard.balance) === 0 && Number(usdCard.dues) === 350 && Number(usdCard.net) === -350, usdCard);

// 4. Paying with an empty vault is refused.
const p0 = await call('POST', `/api/vault/dues/${d.rows[0].id}`, {});
check('pay with empty vault → 409 due.noCash', p0.status === 409 && p0.data.code === 'due.noCash', p0);

// 5. Deposit 200 → Pay all pays the oldest due partly.
const dep1 = await call('POST', '/api/vault/ops', { kind: 'VAULT_DEPOSIT', vault: 'USD', amount: '200', date: today, label: `Dues test ${tag}` });
const pa = await call('POST', '/api/vault/dues/pay-all', { vault: 'USD' });
check('pay all with 200 → pays 200 on 1 due', pa.status === 200 && pa.data.count === 1, pa);
d = await dues();
check('cash back to 0, 150 still owed (100 + 50)', Number(d.cash.USD) === 0 && owed(d) === 150 && Number(d.rows[0].paid) === 200, d);

// 6. Deposit 1000 → pay the first due in full.
const dep2 = await call('POST', '/api/vault/ops', { kind: 'VAULT_DEPOSIT', vault: 'USD', amount: '1000', date: today, label: `Dues test ${tag}` });
const p1 = await call('POST', `/api/vault/dues/${d.rows[0].id}`, {});
check('pay one due → fully paid', p1.status === 200 && p1.data.left === null, p1);
d = await dues();
check('cash 900, only the 50 due left', Number(d.cash.USD) === 900 && d.rows.length === 1 && owed(d) === 50, d);
const again = await call('POST', `/api/vault/dues/${(await dues()).rows[0].id}`, {});
check('paying the remaining due works', again.status === 200);
d = await dues();
check('no dues left, cash 850', d.rows.length === 0 && Number(d.cash.USD) === 850, d);

// 7. Deleting the withdrawal gives back everything it took, including the due payments.
const del = await call('DELETE', `/api/txns/${w2.data.id}`);
check('delete the short withdrawal', del.status === 200, del);
check('cash = 850 + (cash0 + 300)', (await cashUsd()) === 850 + cash0 + 300, await cashUsd());

// 8. Editing a payment re-applies it; with money in the vault no due is created.
const ed = await call('PUT', `/api/payments/${pay.data.id}`, { kind: 'BENEFICIARY_PAYMENT', partyId: ben.data.id, date: today, amount: '40', currency: 'USD', vault: 'USD' });
check('edit payment 50 → 40', ed.status === 200, ed);
d = await dues();
check('no dues; cash = cash0 + 1200 − 40', d.rows.length === 0 && Number(d.cash.USD) === cash0 + 1160, d);

// 9. A due that is deleted with its document disappears.
const w3 = await call('POST', '/api/vault/ops', { ...wBody, amount: String(cash0 + 1160 + 25), allowShortfall: true });
d = await dues();
check('new due of 25', w3.status === 200 && owed(d) === 25, d);
await call('DELETE', `/api/txns/${w3.data.id}`);
d = await dues();
check('deleting the document removes its due', d.rows.length === 0, d);

// Clean up: back to where we started.
for (const id of [pay.data.id, dep1.data.id, dep2.data.id]) await call('DELETE', `/api/txns/${id}`);
check('USD vault back to its starting cash', (await cashUsd()) === cash0, { now: await cashUsd(), cash0 });

console.log(`\n${fail ? 'DUES FLOWS FAILED' : 'DUES FLOWS ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
