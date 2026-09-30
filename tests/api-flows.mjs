// End-to-end business-rule checks against a running ALU FACTORY server (real HTTP API, real database).
//   BASE=http://localhost:3000 OWNER_EMAIL=... OWNER_PASSWORD=... node tests/api-flows.mjs
// Creates its own uniquely named records, so it is safe to run repeatedly on a development database.
// Never run it against production data.
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

function client() {
  let cookie = '';
  return async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const kv = c.split(';')[0];
      const k = kv.split('=')[0];
      cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; ');
    }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
}

const owner = client();
const login = await owner('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
check('owner can sign in', login.status === 200, login);

const rate = Number((await owner('GET', '/api/settings')).data.exchangeRate);
const cust = await owner('POST', '/api/customers', { name: `Test Customer ${tag}`, phone: '+964 750 000 0001' });
const ben = await owner('POST', '/api/beneficiaries', { name: `Test Supplier ${tag}` });
check('create customer + beneficiary', cust.status === 200 && ben.status === 200, [cust, ben]);
const dup = await owner('POST', '/api/customers', { name: `  test   customer ${tag.toLowerCase()} ` });
check('duplicate customer name (case/space-insensitive) is refused', dup.status === 422, dup);

const types = (await owner('GET', '/api/lookup/types')).data;
const pur = await owner('POST', '/api/purchases', {
  date: today,
  beneficiaryId: ben.data.id,
  newProduct: { name: `Test bar ${tag}`, sku: `T-${tag}`, typeId: types[0].id },
  state: 'RAW',
  kg: '1000',
  unitPrice: '2',
  currency: 'USD',
  vault: 'USD',
  cashPaid: '500',
});
check('purchase recorded with PUR number', pur.status === 200 && /^PUR-\d{5}$/.test(pur.data.number), pur);
const benAfter = (await owner('GET', `/api/beneficiaries/${ben.data.id}`)).data;
check('purchase: factory owes beneficiary 1,500.00 (2,000 − 500 cash)', benAfter.cards.balance === '1500', benAfter.cards);

const prod = (await owner('GET', `/api/lookup/products?q=T-${tag}`)).data[0];
check('purchase created product with 1,000 kg RAW', prod && Number(prod.rawKg) === 1000, prod);

const prc = await owner('POST', '/api/processing', { productId: prod.id, date: today, inputKg: '400', method: 'PERCENT', lossPercent: '5' });
const after = (await owner('GET', `/api/lookup/products?ids=${prod.id}`)).data[0];
check('processing 400 kg at 5% → 380 kg FINISHED, 600 kg RAW left', prc.status === 200 && Number(after.finishedKg) === 380 && Number(after.rawKg) === 600, after);
const prcBad = await owner('POST', '/api/processing', { productId: prod.id, date: today, inputKg: '601', method: 'KG', lossKg: '1' });
check('cannot process more raw than available', prcBad.status === 422, prcBad);

const over = await owner('POST', '/api/sales', {
  date: today,
  customerId: cust.data.id,
  currency: 'USD',
  vault: 'USD',
  cashPaid: '0',
  lines: [{ productId: prod.id, state: 'FINISHED', kg: '380.001', unitPrice: '3' }],
});
check('selling more than stock is blocked (negative stock prevented)', over.status === 422 && !!over.data.fieldErrors?.['lines.0.kg'], over);

const sale = await owner('POST', '/api/sales', {
  date: today,
  customerId: cust.data.id,
  currency: 'USD',
  vault: 'USD',
  cashPaid: '140',
  clientTotal: '999999',
  lines: [{ productId: prod.id, state: 'FINISHED', kg: '380', unitPrice: '3' }],
});
check('sale recorded with INV number', sale.status === 200 && /^INV-\d{5}$/.test(sale.data.number), sale);
const saleD = (await owner('GET', `/api/txns/${sale.data.id}`)).data;
check('server total wins over a wrong client total (380 × 3 = 1,140)', saleD.total === '1140', saleD.total);
check('COGS carries the processing loss (cost 2 × 400 / 380 per kg → 800.00)', Number(saleD.cogsUsd).toFixed(2) === '800.00', saleD.cogsUsd);
let c1 = (await owner('GET', `/api/customers/${cust.data.id}`)).data.cards;
check('customer owes factory 1,000.00 after partial cash', c1.balance === '1000', c1);

const iqd = String(1000 * rate);
const payment = await owner('POST', '/api/payments', { kind: 'CUSTOMER_PAYMENT', partyId: cust.data.id, date: today, amount: iqd, currency: 'IQD', vault: 'IQD' });
c1 = (await owner('GET', `/api/customers/${cust.data.id}`)).data.cards;
check(`IQD payment of ${iqd} settles a $1,000 balance at the current rate`, payment.status === 200 && c1.balance === '0', [payment, c1]);
const refund = await owner('POST', '/api/payments', { kind: 'CUSTOMER_REFUND', partyId: cust.data.id, date: today, amount: '10', currency: 'USD', vault: 'USD' });
check('refund without customer credit is refused', refund.status === 422, refund);

const del = await owner('DELETE', `/api/txns/${sale.data.id}`);
const back = (await owner('GET', `/api/lookup/products?ids=${prod.id}`)).data[0];
c1 = (await owner('GET', `/api/customers/${cust.data.id}`)).data.cards;
check('deleting the sale returns 380 kg to stock', del.status === 200 && Number(back.finishedKg) === 380, back);
check('deleting the sale leaves the payment as customer credit (−1,000)', c1.balance === '-1000', c1);
const sale2 = await owner('POST', '/api/sales', {
  date: today,
  customerId: cust.data.id,
  currency: 'USD',
  vault: 'USD',
  cashPaid: '0',
  lines: [{ productId: prod.id, state: 'FINISHED', kg: '10', unitPrice: '3' }],
});
const n1 = Number(sale.data.number.slice(4));
const n2 = Number(sale2.data.number.slice(4));
check('invoice numbers are never reused after a delete', n2 > n1, [sale.data.number, sale2.data.number]);
const gone = await owner('GET', `/api/txns/${sale.data.id}`);
check('deleted invoice is kept as a tombstone (still viewable, marked deleted)', gone.status === 200 && !!gone.data.deletedAt, gone.data?.deletedAt);

const edit = await owner('PUT', `/api/sales/${sale2.data.id}`, {
  date: today,
  customerId: cust.data.id,
  currency: 'USD',
  vault: 'USD',
  cashPaid: '0',
  lines: [{ productId: prod.id, state: 'FINISHED', kg: '380', unitPrice: '3' }],
});
check('editing an invoice can use its own quantity again (10 → 380 kg)', edit.status === 200 && edit.data.number === sale2.data.number, edit);

const vbefore = (await owner('GET', '/api/vault')).data.vaults;
const tr = await owner('POST', '/api/vault/ops', { kind: 'VAULT_TRANSFER', date: today, vault: 'USD', toVault: 'IQD', amount: '100', rate: '1500' });
const vafter = (await owner('GET', '/api/vault')).data.vaults;
const dUsd = Number(vafter[0].balance) - Number(vbefore[0].balance);
const dIqd = Number(vafter[1].balance) - Number(vbefore[1].balance);
check('vault exchange $100 at 1,500 → −$100 USD, +150,000 IQD', tr.status === 200 && dUsd === -100 && dIqd === 150000, { dUsd, dIqd });

const doc = await owner('GET', `/api/docs/txn/${sale2.data.id}?format=html`);
check('invoice document renders (HTML)', doc.status === 200 && String(doc.data).includes(sale2.data.number), doc.status);
const rep = await owner('GET', `/api/reports/pl`);
check('P&L report returns summary + table', rep.status === 200 && rep.data.summary.length > 0 && rep.data.tables.length > 0, rep.status);

// ─── Permissions (403 matrix) ────────────────────────────────────────────────────────────────────
const uEmail = `clerk-${tag.toLowerCase()}@alu.test`;
const mk = await owner('POST', '/api/users', { name: `Clerk ${tag}`, email: uEmail, password: 'clerkpass1', permissions: ['page:customers'] });
check('owner creates a customers-only user', mk.status === 200, mk);
const clerk = client();
const cl = await clerk('POST', '/api/auth/login', { email: uEmail, password: 'clerkpass1' });
check('customers-only user can sign in', cl.status === 200, cl);
const matrix = [
  ['GET', '/api/customers', 200],
  ['GET', '/api/vault', 403],
  ['GET', '/api/inventory', 403],
  ['GET', '/api/reports/pl', 403],
  ['GET', '/api/users', 403],
  ['GET', '/api/settings/audit', 403],
  ['POST', '/api/sales', 403],
  ['POST', '/api/vault/ops', 403],
  ['PUT', '/api/settings', 403],
];
for (const [m, p, want] of matrix) {
  const r = await clerk(m, p, m === 'GET' ? undefined : {});
  check(`clerk ${m} ${p} → ${want}`, r.status === want, r.status);
}
const del2 = await clerk('DELETE', `/api/txns/${sale2.data.id}`);
check('clerk cannot delete an invoice (POS permission required)', del2.status === 403, del2.status);
const anon = await client()('GET', '/api/customers');
check('signed-out request → 401', anon.status === 401, anon.status);

console.log(`\n${fail ? 'FLOWS FAILED' : 'FLOWS ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
