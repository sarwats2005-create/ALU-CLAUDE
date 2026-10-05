// Split payment (USD + IQD on one sale / purchase) — end-to-end against a running server.
//   BASE=http://localhost:3000 OWNER_EMAIL=... OWNER_PASSWORD=... node tests/split-flows.mjs
// Creates its own uniquely named records. Never run it against production data.
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${String(JSON.stringify(detail)).slice(0, 500)}`}`);
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
const vaults = async () => {
  const v = (await call('GET', '/api/vault')).data.vaults;
  return { USD: Number(v.find((x) => x.vault === 'USD')?.balance ?? v[0].balance), IQD: Number(v.find((x) => x.vault === 'IQD')?.balance ?? v[1].balance) };
};
const bal = async (kind, id) => Number((await call('GET', `/api/${kind}/${id}`)).data.cards.balance);
const near = (a, b) => Math.abs(a - b) < 0.005;

check('owner signs in', (await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })).status === 200);
await call('PUT', '/api/auth/lang', { lang: 'en' });
const R = Number((await call('GET', '/api/settings')).data.exchangeRate); // IQD per 1 USD
const iqdFor = (usd) => String(Math.round(usd * R));

const cust = (await call('POST', '/api/customers', { name: `Split Customer ${tag}` })).data;
const ben = (await call('POST', '/api/beneficiaries', { name: `Split Supplier ${tag}` })).data;
const types = (await call('GET', '/api/lookup/types')).data;
let typeId = types[0]?.id;
if (!typeId) typeId = (await call('POST', '/api/types', { name: `Split type ${tag}` })).data.id;

// Fill the IQD vault first so the purchase can pay its IQD part.
await call('POST', '/api/vault/ops', { kind: 'VAULT_DEPOSIT', vault: 'IQD', amount: iqdFor(1000), date: today, label: `split test ${tag}` });
await call('POST', '/api/vault/ops', { kind: 'VAULT_DEPOSIT', vault: 'USD', amount: '1000', date: today, label: `split test ${tag}` });

// 1. Purchase $400 (200 kg × $2), paid $100 + IQD worth $100 → owes supplier $200; each vault pays its part.
let v0 = await vaults();
const pur = await call('POST', '/api/purchases', {
  date: today,
  beneficiaryId: ben.id,
  newProduct: { name: `Split bar ${tag}`, typeId },
  state: 'FINISHED',
  kg: '200',
  unitPrice: '2',
  currency: 'USD',
  paidUsd: '100',
  paidIqd: iqdFor(100),
});
check('split purchase recorded', pur.status === 200, pur);
let v1 = await vaults();
check('purchase: USD vault −100', near(v1.USD - v0.USD, -100), [v0, v1]);
check(`purchase: IQD vault −${iqdFor(100)}`, near(v1.IQD - v0.IQD, -Number(iqdFor(100))), [v0, v1]);
check('purchase: factory owes supplier $200', near(await bal('beneficiaries', ben.id), 200));
const purD = (await call('GET', `/api/txns/${pur.data.id}`)).data;
check('purchase detail keeps both parts and total paid $200', purD.paidUsd === '100' && Number(purD.paidIqd) === Number(iqdFor(100)) && near(Number(purD.cashPaid), 200), purD);
const prod = (await call('GET', `/api/lookup/products?q=${encodeURIComponent(`Split bar ${tag}`)}`)).data[0];

// 2. The user's example: invoice $200, $100 in USD, the rest in IQD at the rate → fully paid, both vaults in.
v0 = await vaults();
const sale = await call('POST', '/api/sales', {
  date: today,
  customerId: cust.id,
  currency: 'USD',
  paidUsd: '100',
  paidIqd: iqdFor(100),
  lines: [{ productId: prod.id, state: 'FINISHED', kg: '50', unitPrice: '4' }],
});
check('split sale recorded', sale.status === 200, sale);
v1 = await vaults();
check('sale: USD vault +100', near(v1.USD - v0.USD, 100), [v0, v1]);
check(`sale: IQD vault +${iqdFor(100)}`, near(v1.IQD - v0.IQD, Number(iqdFor(100))), [v0, v1]);
check('sale: customer owes nothing (paid in full, no rounding cent left)', near(await bal('customers', cust.id), 0));
const saleD = (await call('GET', `/api/txns/${sale.data.id}`)).data;
check('sale detail: total paid = $200', saleD.cashPaid === '200' && saleD.cashPaidUsd === '200', saleD);

// 3. The invoice shows both parts clearly.
const doc = (await call('GET', `/api/docs/txn/${sale.data.id}?lang=en`)).data;
check('invoice lists "Paid in USD" and "Paid in IQD"', typeof doc === 'string' && doc.includes('Paid in USD') && doc.includes('Paid in IQD'), String(doc).slice(0, 200));
check('invoice states what the IQD is worth at the rate', String(doc).replace(/<[^>]+>/g, '').includes('= $100.00'));
const hist = (await call('GET', `/api/history?q=${sale.data.number}`)).data.rows?.[0];
check('history shows both vaults', hist?.vault === 'BOTH', hist);

// 4. Edit: now $50 USD + IQD worth $50 → customer owes $100; vaults move by the difference only.
v0 = await vaults();
const ed = await call('PUT', `/api/sales/${sale.data.id}`, {
  date: today,
  customerId: cust.id,
  currency: 'USD',
  paidUsd: '50',
  paidIqd: iqdFor(50),
  lines: [{ productId: prod.id, state: 'FINISHED', kg: '50', unitPrice: '4' }],
});
v1 = await vaults();
check('edit split sale', ed.status === 200, ed);
check('edit: USD vault −50, IQD vault −(worth $50)', near(v1.USD - v0.USD, -50) && near(v1.IQD - v0.IQD, -Number(iqdFor(50))), [v0, v1]);
check('edit: customer owes $100', near(await bal('customers', cust.id), 100));

// 5. Invoice in IQD worth $200, part paid in USD: $100 + the rest in IQD.
const iqdTotal = Math.round(20 * 10 * R); // 20 kg priced in IQD, worth $200
const restIqd = iqdTotal - Math.round(100 * R);
const s2 = await call('POST', '/api/sales', {
  date: today,
  customerId: cust.id,
  currency: 'IQD',
  paidUsd: '100',
  paidIqd: String(restIqd),
  lines: [{ productId: prod.id, state: 'FINISHED', kg: '20', unitPrice: String(iqdTotal / 20) }],
});
const s2D = (await call('GET', `/api/txns/${s2.data?.id}`)).data;
check('IQD invoice paid $100 + IQD rest is fully paid', s2.status === 200 && Number(s2D.cashPaid) === iqdTotal, [s2, s2D?.cashPaid, iqdTotal]);
check('customer balance unchanged by the fully paid IQD invoice ($100)', near(await bal('customers', cust.id), 100));

// 6. Old one-vault payload still works.
const legacy = await call('POST', '/api/sales', {
  date: today,
  customerId: cust.id,
  currency: 'USD',
  vault: 'IQD',
  cashPaid: '10',
  lines: [{ productId: prod.id, state: 'FINISHED', kg: '5', unitPrice: '2' }],
});
const lD = (await call('GET', `/api/txns/${legacy.data?.id}`)).data;
check('legacy payload (one vault) still works and records paidIqd', legacy.status === 200 && Number(lD.paidIqd) === Math.round(10 * R) && lD.paidUsd === '0', lD);

// 7. Delete returns every part to its vault.
v0 = await vaults();
await call('DELETE', `/api/txns/${sale.data.id}`);
v1 = await vaults();
check('delete: both vault parts reversed', near(v1.USD - v0.USD, -50) && near(v1.IQD - v0.IQD, -Number(iqdFor(50))), [v0, v1]);

// 8. Negative amounts are refused.
const neg = await call('POST', '/api/sales', { date: today, customerId: cust.id, currency: 'USD', paidUsd: '-5', paidIqd: '0', lines: [{ productId: prod.id, state: 'FINISHED', kg: '1', unitPrice: '1' }] });
check('negative USD part is refused', neg.status === 422, neg);

console.log(`\n${fail ? 'SPLIT FLOWS FAILED' : 'SPLIT FLOWS ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
