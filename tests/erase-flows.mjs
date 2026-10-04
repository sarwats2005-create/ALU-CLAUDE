// Owner erase mode (Ctrl+Alt+R + PIN): end-to-end against a running server.
//   BASE=http://localhost:3000 OWNER_EMAIL=... OWNER_PASSWORD=... node tests/erase-flows.mjs
// Creates its own records and erases them again. Never run it against production data.
const BASE = process.env.BASE ?? 'http://localhost:3000';
const EMAIL = process.env.OWNER_EMAIL ?? 'owner@alu.test';
const PASSWORD = process.env.OWNER_PASSWORD ?? 'password123';
const PIN = process.env.ERASE_PIN ?? '1122';
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
const cash = async () => Number((await call('GET', '/api/vault/dues?vault=USD')).data.cash.USD);
const auditHas = async (ref) => (await call('GET', `/api/settings/audit?q=${encodeURIComponent(ref)}&size=100`)).data.rows.some((r) => r.reference === ref || r.reference.startsWith(ref + ' '));

check('owner signs in', (await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })).status === 200);
await call('POST', '/api/erase', { action: 'exit' });

// ── Locked outside the mode ──
const cust = await call('POST', '/api/customers', { name: `Erase Customer ${tag}` });
const pay1 = await call('POST', '/api/payments', { kind: 'CUSTOMER_PAYMENT', partyId: cust.data.id, date: today, amount: '100', currency: 'USD', vault: 'USD' });
check('setup: customer + $100 payment', cust.status === 200 && pay1.status === 200, [cust, pay1]);
const off = await call('DELETE', `/api/erase/txns/${pay1.data.id}`);
check('erase without the mode → 403 erase.off', off.status === 403 && off.data.code === 'erase.off', off);
const offA = await call('POST', '/api/erase/audit', { ids: [1] });
check('audit erase without the mode → 403', offA.status === 403, offA);
const normalDel = await call('DELETE', `/api/customers/${cust.data.id}`);
check('normal delete of a customer with transactions is still refused', normalDel.status === 409, normalDel);

// ── Entering ──
const bad = await call('POST', '/api/erase', { action: 'enter', pin: '0000' });
check('wrong PIN → 403 erase.pinWrong', bad.status === 403 && bad.data.code === 'erase.pinWrong', bad);
const on = await call('POST', '/api/erase', { action: 'enter', pin: PIN });
check(`PIN ${PIN} enters the mode for 10 minutes`, on.status === 200 && Math.abs(new Date(on.data.until) - Date.now() - 600000) < 15000, on);
check('status shows the mode on', !!(await call('GET', '/api/erase')).data.until);

// ── One transaction ──
const c0 = await cash();
check('payment is in the audit log', await auditHas(pay1.data.number));
const e1 = await call('DELETE', `/api/erase/txns/${pay1.data.id}`);
check('erase the payment', e1.status === 200 && e1.data.number === pay1.data.number, e1);
check('vault −100 (as if it never happened)', (await cash()) === c0 - 100, { c0, now: await cash() });
check('transaction is gone (404)', (await call('GET', `/api/txns/${pay1.data.id}`)).status === 404);
check('its audit lines are gone', !(await auditHas(pay1.data.number)));
const cc = (await call('GET', `/api/customers/${cust.data.id}`)).data.cards;
check('customer balance back to 0', Number(cc.balance) === 0, cc);

// ── Stock: a purchase whose stock was sold can't be erased first ──
const ben = await call('POST', '/api/beneficiaries', { name: `Erase Supplier ${tag}` });
const types = (await call('GET', '/api/lookup/types')).data;
const pur = await call('POST', '/api/purchases', {
  date: today, beneficiaryId: ben.data.id, newProduct: { name: `Erase bar ${tag}`, sku: `E-${tag}`, typeId: types[0].id },
  state: 'RAW', kg: '100', unitPrice: '2', currency: 'USD', vault: 'USD', cashPaid: '0',
});
const prod = (await call('GET', `/api/lookup/products?q=E-${tag}`)).data[0];
const sale = await call('POST', '/api/sales', {
  date: today, customerId: cust.data.id, currency: 'USD', vault: 'USD', cashPaid: '30', lines: [{ productId: prod.id, state: 'RAW', kg: '40', unitPrice: '3' }],
});
check('setup: purchase 100 kg, sale 40 kg with $30 cash', pur.status === 200 && sale.status === 200, [pur, sale]);
const blocked = await call('DELETE', `/api/erase/txns/${pur.data.id}`);
check('erasing the purchase first is blocked (stock would go negative)', blocked.status === 409 && String(blocked.data.code).startsWith('block.stock'), blocked);
check('…and nothing was erased', (await call('GET', `/api/txns/${pur.data.id}`)).status === 200);

// ── Whole customer ──
const c1 = await cash();
const pay2 = await call('POST', '/api/payments', { kind: 'CUSTOMER_PAYMENT', partyId: cust.data.id, date: today, amount: '50', currency: 'USD', vault: 'USD' });
const ec = await call('DELETE', `/api/erase/customers/${cust.data.id}`);
check('erase the customer account with its sale + payment', ec.status === 200 && ec.data.count === 2, ec);
check('vault back: the sale’s $30 and the $50 payment are gone', (await cash()) === c1 - 30, { c1, now: await cash() });
check('customer is gone', (await call('GET', `/api/customers/${cust.data.id}`)).status === 404);
check('sale and payment are gone', (await call('GET', `/api/txns/${sale.data.id}`)).status === 404 && (await call('GET', `/api/txns/${pay2.data.id}`)).status === 404);
check('customer audit lines are gone', !(await auditHas(`Erase Customer ${tag}`)));
const p1 = (await call('GET', `/api/lookup/products?ids=${prod.id}`)).data[0];
check('the 40 kg sold are back in stock (100 kg RAW)', Number(p1.rawKg) === 100, p1);
const ep = await call('DELETE', `/api/erase/txns/${pur.data.id}`);
check('now the purchase can be erased', ep.status === 200, ep);
const benC = (await call('GET', `/api/beneficiaries/${ben.data.id}`)).data.cards;
check('supplier balance back to 0', Number(benC.balance) === 0, benC);

// ── Voided transactions ──
const dep = await call('POST', '/api/vault/ops', { kind: 'VAULT_DEPOSIT', vault: 'USD', amount: '25', date: today, label: `Erase test ${tag}` });
await call('DELETE', `/api/txns/${dep.data.id}`);
const v = (await call('GET', '/api/erase')).data.voided;
check('voided count includes the deleted deposit', v >= 1, v);
const c2 = await cash();
const ev = await call('DELETE', '/api/erase/voided');
check('erase all voided', ev.status === 200 && ev.data.count === v, ev);
check('vault unchanged by erasing voided ones', (await cash()) === c2);
check('voided count is now 0', (await call('GET', '/api/erase')).data.voided === 0);
check('deleted deposit is gone', (await call('GET', `/api/txns/${dep.data.id}`)).status === 404);

// ── Audit lines ──
const rows = (await call('GET', '/api/settings/audit?size=25')).data.rows;
const ids = rows.slice(0, 2).map((r) => r.id);
const ea = await call('POST', '/api/erase/audit', { ids });
check('erase 2 audit lines', ea.status === 200 && ea.data.count === 2, ea);
const after = (await call('GET', '/api/settings/audit?size=25')).data.rows.map((r) => r.id);
check('they are gone', !after.includes(ids[0]) && !after.includes(ids[1]), after.slice(0, 4));

// ── PIN change ──
check('change PIN to 4321', (await call('PUT', '/api/erase/pin', { pin: '4321' })).status === 200);
check('PIN must be 4–8 digits', (await call('PUT', '/api/erase/pin', { pin: '12' })).status === 422);
await call('POST', '/api/erase', { action: 'exit' });
check('old PIN no longer works', (await call('POST', '/api/erase', { action: 'enter', pin: PIN })).status === 403);
check('new PIN works', (await call('POST', '/api/erase', { action: 'enter', pin: '4321' })).status === 200);
check('PIN set back', (await call('PUT', '/api/erase/pin', { pin: PIN })).status === 200);

// ── Leaving ──
await call('POST', '/api/erase', { action: 'exit' });
check('after exit the mode is off', (await call('GET', '/api/erase')).data.until === null);
const late = await call('DELETE', `/api/erase/txns/x`);
check('erase after exit → 403', late.status === 403, late);
// clean up the test supplier (no transactions left) the normal way
check('test supplier removed', (await call('DELETE', `/api/beneficiaries/${ben.data.id}`)).status === 200);

console.log(`\n${fail ? 'ERASE FLOWS FAILED' : 'ERASE FLOWS ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
