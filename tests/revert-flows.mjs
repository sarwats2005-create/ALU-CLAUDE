// Revert processing to raw (master PIN) + erase-mode inventory history and restore points.
//   BASE=http://localhost:3000 OWNER_EMAIL=... OWNER_PASSWORD=... node tests/revert-flows.mjs
// Creates its own records. ERASES ALL RESTORE POINTS at the end — never run it against production.
const BASE = process.env.BASE ?? 'http://localhost:3000';
const EMAIL = process.env.OWNER_EMAIL ?? 'owner@alu.test';
const PASSWORD = process.env.OWNER_PASSWORD ?? 'password123';
const PIN = process.env.MASTER_PIN ?? '1122';
const tag = Date.now().toString(36).toUpperCase();
const today = new Date().toISOString().slice(0, 10);
let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${String(JSON.stringify(detail)).slice(0, 400)}`}`);
};
let cookie = '';
async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const kv = c.split(';')[0];
    cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(kv.split('=')[0] + '=')), kv].join('; ');
  }
  return { status: res.status, data: await res.json().catch(() => null) };
}
const stock = async (id) => (await call('GET', `/api/inventory/${id}`)).data.stock;

check('owner signs in', (await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })).status === 200);
await call('POST', '/api/erase', { action: 'exit' });
let typeId = (await call('GET', '/api/lookup/types')).data[0]?.id;
if (!typeId) typeId = (await call('POST', '/api/types', { name: `Rev type ${tag}` })).data.id;
const ben = (await call('POST', '/api/beneficiaries', { name: `Rev Supplier ${tag}` })).data;
const cust = (await call('POST', '/api/customers', { name: `Rev Customer ${tag}` })).data;
await call('POST', '/api/purchases', { date: today, beneficiaryId: ben.id, newProduct: { name: `Rev bar ${tag}`, typeId }, state: 'RAW', kg: '400', unitPrice: '2', currency: 'USD', vault: 'USD', cashPaid: '0' });
const prod = (await call('GET', `/api/lookup/products?q=${encodeURIComponent(`Rev bar ${tag}`)}`)).data[0];

// 1. Process 400 kg at 5% loss → 380 kg finished.
const prc = await call('POST', '/api/processing', { productId: prod.id, date: today, inputKg: '400', method: 'PERCENT', lossPercent: '5' });
let s = await stock(prod.id);
check('processing: 0 raw / 380 finished', prc.status === 200 && Number(s.RAW.kg) === 0 && Number(s.FINISHED.kg) === 380, s);

// 2. Guards.
const del = await call('DELETE', `/api/txns/${prc.data.id}`);
check('a processing run can no longer be deleted (409 prc.useRevert)', del.status === 409 && del.data.code === 'prc.useRevert', del);
const noPin = await call('POST', `/api/processing/${prc.data.id}/revert`, {});
const badPin = await call('POST', `/api/processing/${prc.data.id}/revert`, { pin: '0000' });
check('revert without / with a wrong master PIN is refused', noPin.status === 403 && badPin.status === 403, [noPin, badPin]);
s = await stock(prod.id);
check('nothing moved after refused reverts', Number(s.FINISHED.kg) === 380, s);

// 3. Revert with the master PIN: 380 finished + 20 loss → 400 raw at the original $800.
const rv = await call('POST', `/api/processing/${prc.data.id}/revert`, { pin: PIN });
s = await stock(prod.id);
check('revert with PIN 1122 succeeds', rv.status === 200, rv);
check('finished back to 0, raw back to 400 kg (loss returned)', Number(s.FINISHED.kg) === 0 && Number(s.RAW.kg) === 400, s);
check('raw cost restored ($2.00/kg, $800 total)', Number(s.RAW.avg).toFixed(2) === '2.00', s.RAW);
const d = (await call('GET', `/api/txns/${prc.data.id}`)).data;
check('the run keeps its number, marked reverted', !!d.deletedAt && d.label === 'reverted' && d.number === prc.data.number, d);
const again = await call('POST', `/api/processing/${prc.data.id}/revert`, { pin: PIN });
check('reverting twice is refused', again.status === 404, again);

// 4. Refused once part of the finished kg was sold.
const prc2 = await call('POST', '/api/processing', { productId: prod.id, date: today, inputKg: '100', method: 'KG', lossKg: '10' });
await call('POST', '/api/sales', { date: today, customerId: cust.id, currency: 'USD', vault: 'USD', cashPaid: '0', lines: [{ productId: prod.id, state: 'FINISHED', kg: '50', unitPrice: '5' }] });
const blocked = await call('POST', `/api/processing/${prc2.data.id}/revert`, { pin: PIN });
s = await stock(prod.id);
check('revert refused when finished kg were already sold', blocked.status >= 400 && Number(s.FINISHED.kg) === 40, [blocked.status, blocked.data?.code, s]);

// 5. Erase mode: product history and restore points (owner only, mode on).
const offE = await call('DELETE', `/api/erase/products/${prod.id}`);
check('erasing product history needs erase mode', offE.status === 403, offE);
check('enter erase mode', (await call('POST', '/api/erase', { action: 'enter', pin: PIN })).status === 200);
const hist = (await call('GET', `/api/inventory/${prod.id}`)).data.rows.length;
const ep = await call('DELETE', `/api/erase/products/${prod.id}`);
const after = await call('GET', `/api/inventory/${prod.id}`);
check(`erase product history (${hist} movements)`, ep.status === 200 && ep.data.count >= 3 && after.data.rows.length === 0, [ep, after.data?.rows?.length]);
check('the product itself stays, with zero stock', after.status === 200 && Number(after.data.stock.RAW.kg) === 0 && Number(after.data.stock.FINISHED.kg) === 0, after.data?.stock);

await call('POST', '/api/settings/backup/snapshots');
let snaps = (await call('GET', '/api/settings/backup/snapshots')).data.rows;
const one = await call('DELETE', `/api/erase/snapshots/${snaps[0].id}`);
const snaps2 = (await call('GET', '/api/settings/backup/snapshots')).data.rows;
check('erase one restore point', one.status === 200 && snaps2.length === snaps.length - 1, [one, snaps.length, snaps2.length]);
const all = await call('DELETE', '/api/erase/snapshots');
snaps = (await call('GET', '/api/settings/backup/snapshots')).data.rows;
check('erase all restore points', all.status === 200 && snaps.length === 0, [all, snaps.length]);
await call('POST', '/api/erase', { action: 'exit' });
const offS = await call('DELETE', '/api/erase/snapshots');
check('restore points can’t be erased outside erase mode', offS.status === 403, offS);

console.log(`\n${fail ? 'REVERT FLOWS FAILED' : 'REVERT FLOWS ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
