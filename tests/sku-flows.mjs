// Automatic product codes (SKU) — end-to-end against a running server.
//   BASE=http://localhost:3000 OWNER_EMAIL=... OWNER_PASSWORD=... node tests/sku-flows.mjs
const BASE = process.env.BASE ?? 'http://localhost:3000';
const EMAIL = process.env.OWNER_EMAIL ?? 'owner@alu.test';
const PASSWORD = process.env.OWNER_PASSWORD ?? 'password123';
const tag = Date.now().toString(36).toUpperCase();
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
const num = (sku) => Number(String(sku).replace(/^ALU-/, ''));

check('owner signs in', (await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })).status === 200);
let typeId = (await call('GET', '/api/lookup/types')).data[0]?.id;
if (!typeId) typeId = (await call('POST', '/api/types', { name: `Sku type ${tag}` })).data.id;

const preview = (await call('GET', '/api/products/next-sku')).data?.sku;
check('next-code preview has the ALU-00000 format', /^ALU-\d{5}$/.test(preview ?? ''), preview);
const a = await call('POST', '/api/products', { name: `Sku A ${tag}`, typeId, sku: 'HACK-1' });
const b = await call('POST', '/api/products', { name: `Sku B ${tag}`, typeId });
check('products are created without typing a code', a.status === 200 && b.status === 200, [a, b]);
check('the preview was the code actually given', a.data.sku === preview, [preview, a.data.sku]);
check('a code typed by the client is ignored', a.data.sku !== 'HACK-1', a.data);
check('codes are sequential', num(b.data.sku) === num(a.data.sku) + 1, [a.data.sku, b.data.sku]);

const ed = await call('PUT', `/api/products/${a.data.id}`, { name: `Sku A2 ${tag}`, typeId, sku: 'CHANGED' });
const all = (await call('GET', '/api/products')).data;
check('editing keeps the code', ed.status === 200 && all.find((p) => p.id === a.data.id)?.sku === a.data.sku, ed);

await call('DELETE', `/api/products/${b.data.id}`);
const c = await call('POST', '/api/products', { name: `Sku C ${tag}`, typeId });
check('a deleted product’s code is never given again', c.data.sku !== b.data.sku && num(c.data.sku) > num(b.data.sku), [b.data.sku, c.data.sku]);

const ben = (await call('POST', '/api/beneficiaries', { name: `Sku Supplier ${tag}` })).data;
const pur = await call('POST', '/api/purchases', {
  date: new Date().toISOString().slice(0, 10),
  beneficiaryId: ben.id,
  newProduct: { name: `Sku D ${tag}`, typeId },
  state: 'RAW',
  kg: '1',
  unitPrice: '1',
  currency: 'USD',
  vault: 'USD',
  cashPaid: '0',
});
const d = (await call('GET', `/api/lookup/products?q=${encodeURIComponent(`Sku D ${tag}`)}`)).data[0];
check('a product created during a purchase gets the next code too', pur.status === 200 && num(d?.sku) === num(c.data.sku) + 1, [pur.status, d?.sku]);
const codes = (await call('GET', '/api/products')).data.map((p) => p.sku);
check('every product code is unique', new Set(codes).size === codes.length);

await call('DELETE', `/api/products/${c.data.id}`);
console.log(`\n${fail ? 'SKU FLOWS FAILED' : 'SKU FLOWS ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
