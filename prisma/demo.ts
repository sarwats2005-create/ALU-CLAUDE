// Demo data for trying the system: npm run db:demo
// Every record is flagged isDemo and shows a "Demo" badge; Settings → Demo data → Remove deletes them all
// without touching real records. Runs through the same service functions as the app, so every
// ledger, stock and vault effect is real and consistent.
import { prisma } from '@/lib/db';
import { addDaysIso, todayIso } from '@/lib/dates';
import { saveParty, saveType } from '@/lib/server/catalog';
import { savePayment, saveProcessing, savePurchase, saveSale, saveVaultOp } from '@/lib/server/txns';

const demo = { isDemo: true };

async function main() {
  const owner = await prisma.user.findFirst({ where: { isOwner: true } });
  if (!owner) throw new Error('Create the owner account first (open the app and sign up), then run the demo seed.');
  if (await prisma.txn.count({ where: { isDemo: true } })) {
    console.log('DEMO_EXISTS — remove demo data in Settings first to re-seed.');
    return;
  }
  const actor = { id: owner.id, name: owner.name };
  const today = todayIso();
  const d = (n: number) => addDaysIso(today, -n);

  const typeId = async (name: string) =>
    (await prisma.aluminumType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } }))?.id ?? (await saveType({ name }, actor, undefined, demo)).id;
  const t6063 = await typeId('6063');
  const t6061 = await typeId('6061');
  const tScrap = await typeId('Scrap');

  const ben = async (name: string, phone: string, address: string) => (await saveParty('beneficiary', { name, phone, address }, actor, undefined, demo)).id;
  const cus = async (name: string, phone: string, address: string) => (await saveParty('customer', { name, phone, address }, actor, undefined, demo)).id;

  const b1 = await ben('Zagros Metal Trading', '+964 750 111 2233', 'Industrial zone, Erbil');
  const b2 = await ben('Dohuk Scrap Collectors', '+964 751 444 5566', 'Dohuk');
  const b3 = await ben('Basra Alloy Imports', '+964 780 222 9090', 'Umm Qasr, Basra');
  const c1 = await cus('Hawler Windows & Doors', '+964 750 987 6543', '100m Road, Erbil');
  const c2 = await cus('Sulaimani Facade Systems', '+964 770 555 1212', 'Salim Street, Sulaymaniyah');
  const c3 = await cus('Kawa Construction', '+964 751 333 7788', 'Ankawa, Erbil');
  const c4 = await cus('Nishtiman Kitchens', '+964 750 246 8100', 'Bakhtiyari, Erbil');

  await saveVaultOp({ kind: 'VAULT_DEPOSIT', date: d(120), vault: 'USD', amount: '60000', label: 'Opening capital' }, actor, undefined, demo);
  await saveVaultOp({ kind: 'VAULT_DEPOSIT', date: d(120), vault: 'IQD', amount: '25000000', label: 'Opening capital' }, actor, undefined, demo);

  const pur = (date: string, beneficiaryId: string, np: { name: string; typeId: string } | string, state: 'RAW' | 'FINISHED', kg: string, unitPrice: string, cashPaid: string, currency = 'USD') =>
    savePurchase(
      {
        date,
        beneficiaryId,
        ...(typeof np === 'string' ? { productId: np } : { newProduct: np }),
        state,
        kg,
        unitPrice,
        currency,
        vault: currency,
        cashPaid,
      },
      actor,
      undefined,
      demo,
    );

  await pur(d(110), b1, { name: 'Window profile 6063-T5', typeId: t6063 }, 'RAW', '4200', '2.35', '9870');
  const p1 = (await prisma.product.findFirst({ where: { name: 'Window profile 6063-T5' } }))!.id;
  await pur(d(96), b3, { name: 'Structural bar 6061', typeId: t6061 }, 'RAW', '2600', '2.80', '5000');
  const p2 = (await prisma.product.findFirst({ where: { name: 'Structural bar 6061' } }))!.id;
  await pur(d(80), b2, { name: 'Mixed scrap', typeId: tScrap }, 'RAW', '5000', '2350', '11750000', 'IQD');
  const p3 = (await prisma.product.findFirst({ where: { name: 'Mixed scrap' } }))!.id;
  await pur(d(62), b1, { name: 'Sliding rail 6063', typeId: t6063 }, 'FINISHED', '900', '3.40', '3060');
  const p4 = (await prisma.product.findFirst({ where: { name: 'Sliding rail 6063' } }))!.id;
  await pur(d(40), b1, p1, 'RAW', '3000', '2.40', '4000');
  await pur(d(15), b3, p2, 'RAW', '1800', '2.75', '0');

  await saveProcessing({ productId: p1, date: d(100), inputKg: '2500', method: 'PERCENT', lossPercent: '4.5' }, actor, undefined, demo);
  await saveProcessing({ productId: p2, date: d(90), inputKg: '1500', method: 'KG', lossKg: '42' }, actor, undefined, demo);
  await saveProcessing({ productId: p3, date: d(70), inputKg: '3500', method: 'PERCENT', lossPercent: '9' }, actor, undefined, demo);
  await saveProcessing({ productId: p1, date: d(35), inputKg: '2400', method: 'PERCENT', lossPercent: '4' }, actor, undefined, demo);

  const sale = (date: string, customerId: string, lines: { productId: string; state: 'RAW' | 'FINISHED'; kg: string; unitPrice: string }[], cashPaid: string, currency = 'USD') =>
    saveSale({ date, customerId, currency, vault: currency, cashPaid, lines }, actor, undefined, demo);

  await sale(d(95), c1, [{ productId: p1, state: 'FINISHED', kg: '800', unitPrice: '3.40' }], '2720');
  await sale(d(86), c2, [{ productId: p2, state: 'FINISHED', kg: '600', unitPrice: '3.90' }, { productId: p1, state: 'FINISHED', kg: '300', unitPrice: '3.35' }], '2000');
  await sale(d(74), c3, [{ productId: p3, state: 'FINISHED', kg: '1200', unitPrice: '3650' }], '2500000', 'IQD');
  await sale(d(58), c1, [{ productId: p4, state: 'FINISHED', kg: '350', unitPrice: '4.30' }], '1505');
  await sale(d(47), c4, [{ productId: p1, state: 'FINISHED', kg: '520', unitPrice: '3.45' }], '0');
  await sale(d(31), c2, [{ productId: p2, state: 'FINISHED', kg: '700', unitPrice: '3.95' }], '1500');
  await sale(d(22), c1, [{ productId: p1, state: 'FINISHED', kg: '900', unitPrice: '3.50' }, { productId: p4, state: 'FINISHED', kg: '200', unitPrice: '4.25' }], '4000');
  await sale(d(12), c3, [{ productId: p3, state: 'FINISHED', kg: '900', unitPrice: '3700' }], '3330000', 'IQD');
  await sale(d(6), c4, [{ productId: p1, state: 'FINISHED', kg: '400', unitPrice: '3.55' }], '1420');
  await sale(d(2), c2, [{ productId: p2, state: 'RAW', kg: '500', unitPrice: '3.20' }], '800');

  await savePayment({ kind: 'CUSTOMER_PAYMENT', partyId: c2, date: d(40), amount: '1000', currency: 'USD', vault: 'USD' }, actor, undefined, demo);
  await savePayment({ kind: 'CUSTOMER_PAYMENT', partyId: c4, date: d(20), amount: '1400000', currency: 'IQD', vault: 'IQD' }, actor, undefined, demo);
  await savePayment({ kind: 'CUSTOMER_PAYMENT', partyId: c1, date: d(8), amount: '1500', currency: 'USD', vault: 'USD' }, actor, undefined, demo);
  await savePayment({ kind: 'BENEFICIARY_PAYMENT', partyId: b1, date: d(30), amount: '3000', currency: 'USD', vault: 'USD' }, actor, undefined, demo);
  await savePayment({ kind: 'BENEFICIARY_PAYMENT', partyId: b3, date: d(10), amount: '2000', currency: 'USD', vault: 'USD' }, actor, undefined, demo);

  await saveVaultOp({ kind: 'VAULT_WITHDRAWAL', date: d(28), vault: 'IQD', amount: '4500000', label: 'Salaries' }, actor, undefined, demo);
  await saveVaultOp({ kind: 'VAULT_WITHDRAWAL', date: d(14), vault: 'USD', amount: '1200', label: 'Machine maintenance' }, actor, undefined, demo);
  await saveVaultOp({ kind: 'VAULT_TRANSFER', date: d(9), vault: 'USD', toVault: 'IQD', amount: '3000' }, actor, undefined, demo);

  console.log('DEMO_OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
