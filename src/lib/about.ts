// ─── About page content: every rule of the app, in English and Kurdish (Sorani) ─────────────────────
// This file is what Settings → "How the app works" shows. It is checked against the code that enforces the
// rules: `npm run rules:check` fails when rule code changed after the last `npm run rules:sync`, so a rule
// change can't ship without this page being reviewed.
//
// HOW TO UPDATE
//   • A rule changed / was added / was removed → edit its line below AND add an entry at the TOP of
//     ABOUT_CHANGELOG (type 'added' | 'changed' | 'removed'), then `npm run rules:sync`.
//   • Numbers never go in the text by hand: write {placeholder} and the page fills it from src/shared/rules.ts or
//     from the live settings (exchange rate, alert limits…), so the page always shows what the app really does.
//   • **double stars** make words bold.
//
// Placeholders: {editHours} {eraseMin} {pinTries} {pinLock} {loginTries} {loginWindow} {dailyHours}
//   {keepDaily} {keepOther} {folderDays} {pinMin} {pinMax} {skuExample} {rate} {lowStock} {custDue} {benDue}
//   {overdueDays} {vaultMinUsd} {vaultMinIqd} {expVault} {expPin}

import type { Page } from './permissions';

export type L = readonly [en: string, ku: string];
export type AboutIcon = 'core' | 'money' | 'pos' | 'purchase' | 'processing' | 'customers' | 'beneficiaries' | 'vault' | 'expenses' | 'invoices' | 'reports' | 'alerts' | 'access' | 'backup' | 'erase';

export type AboutSection = {
  id: string;
  icon: AboutIcon;
  title: L;
  summary: L;
  /** Shown to users who can open any of these pages. Omit = everyone. */
  pages?: Page[];
  /** Only the owner sees this section. */
  ownerOnly?: boolean;
  rules: AboutRule[];
};

/** Live on/off settings a rule can depend on: when off, the page shows the rule greyed with "Off". */
export type AboutFlag = 'alertCustomerDue' | 'alertBeneficiaryDue' | 'alertOverdue' | 'alertLowStock' | 'alertVault';
export type AboutRule = L | { text: L; flag: AboutFlag };
export const ruleText = (r: AboutRule): L => ('flag' in r ? r.text : r);
export const ruleFlag = (r: AboutRule): AboutFlag | null => ('flag' in r ? r.flag : null);

export type ChangeType = 'added' | 'changed' | 'removed';
export type AboutChange = { version: string; date: string; items: { type: ChangeType; text: L }[] };

/** The five rules that explain most of the app (80/20). */
export const ABOUT_CORE: L[] = [
  [
    '**Every balance is a sum of lines.** Each transaction writes lines into three ledgers — vault (cash), partner (debt) and stock (kg + cost). Vault cash, what a customer owes and kg in stock are always added up from those lines, never stored as a separate number.',
    '**هەموو باڵانسێک کۆی دێڕەکانە.** هەر مامەڵەیەک دێڕ دەنووسێت لە سێ دەفتەردا — قاسە (کاش)، لایەنەکان (قەرز) و کۆگا (کیلۆ + تێچوو). کاشی قاسە، قەرزی کڕیار و کیلۆی کۆگا هەمیشە لەو دێڕانەوە کۆ دەکرێنەوە، هەرگیز وەک ژمارەیەکی جیا هەڵناگیرێن.',
  ],
  [
    '**Lines are never changed or deleted.** Editing = a reversing line + a new line. Deleting = a reversing line, and the document number stays as "deleted" and is never reused.',
    '**هیچ دێڕێک ناگۆڕدرێت و ناسڕدرێتەوە.** دەستکاری = دێڕی پێچەوانە + دێڕی نوێ. سڕینەوە = دێڕی پێچەوانە، و ژمارەی بەڵگەکە وەک «سڕاوە» دەمێنێتەوە و هەرگیز دووبارە بەکارنایەتەوە.',
  ],
  [
    '**Everything is counted in USD at the rate of that moment.** Each transaction keeps the exchange rate it was saved with; changing the rate never changes old transactions. Customer and supplier balances are always in USD.',
    '**هەموو شتێک بە دۆلار حیساب دەکرێت بە نرخی ئەو ساتە.** هەر مامەڵەیەک ئەو نرخەی گۆڕینەوە هەڵدەگرێت کە پێی تۆمار کراوە؛ گۆڕینی نرخ هەرگیز مامەڵە کۆنەکان ناگۆڕێت. باڵانسی کڕیار و دابینکەر هەمیشە بە دۆلارە.',
  ],
  [
    '**Cash and debt are separate.** Only the cash actually paid moves the vault; the unpaid rest becomes debt on the customer or supplier balance.',
    '**کاش و قەرز جیان.** تەنها ئەو کاشەی بەڕاستی دراوە قاسە دەجووڵێنێت؛ ئەوەی نەدراوە دەبێتە قەرز لەسەر باڵانسی کڕیار یان دابینکەر.',
  ],
  [
    '**Nothing goes below zero without telling you.** Stock can never go negative. When a vault is short, the app warns you; if you continue, it pays what is there and the rest is kept as an **unpaid due**.',
    '**هیچ شتێک بەبێ ئاگادارکردنەوەت ناچێتە ژێر سفر.** کۆگا هەرگیز ناچێتە ژێر سفر. کاتێک قاسە پارەی کەمە، ئەپەکە ئاگادارت دەکاتەوە؛ ئەگەر بەردەوام بیت، ئەوەی هەیە دەدرێت و ماوەکەی وەک **قەرزی نەدراو** دەمێنێتەوە.',
  ],
];

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    id: 'money',
    icon: 'money',
    title: ['Money, currency & numbers', 'پارە، دراو و ژمارەکان'],
    summary: ['How amounts, rates and document numbers work everywhere.', 'چۆن بڕی پارە، نرخ و ژمارەی بەڵگەکان لە هەموو شوێنێک کار دەکەن.'],
    rules: [
      ['Two vaults: **USD** and **IQD**. Each keeps its own currency.', 'دوو قاسە هەیە: **دۆلار** و **دینار**. هەریەکەیان دراوی خۆی دەپارێزێت.'],
      ['The exchange rate is written per 100 USD. Current rate: **{rate}**.', 'نرخی گۆڕینەوە بۆ ١٠٠ دۆلار دەنووسرێت. نرخی ئێستا: **{rate}**.'],
      ['A new rate applies only to transactions saved after it. Every rate change is logged with who changed it.', 'نرخی نوێ تەنها ئەو مامەڵانە دەگرێتەوە کە دوای ئەو تۆمار دەکرێن. هەر گۆڕینێکی نرخ تۆمار دەکرێت لەگەڵ ناوی ئەو کەسەی گۆڕیویەتی.'],
      ['Only the owner, or a user with the "edit exchange rate" permission, can change the rate.', 'تەنها خاوەن، یان بەکارهێنەرێک کە مۆڵەتی «گۆڕینی نرخی دراو»ی هەیە، دەتوانێت نرخەکە بگۆڕێت.'],
      ['IQD amounts are rounded to a whole dinar; USD to the cent; weight to 3 decimals (kg).', 'بڕی دینار بۆ دینارێکی تەواو خڕ دەکرێتەوە؛ دۆلار بۆ سەنت؛ کێش بۆ ٣ ژمارەی دوای فاریزە (کیلۆ).'],
      ['The server always calculates totals itself. If the screen shows a different total, the server total wins.', 'سێرڤەر هەمیشە خۆی کۆی گشتی حیساب دەکات. ئەگەر شاشەکە کۆیەکی جیاواز پیشان بدات، کۆی سێرڤەر ڕاستە.'],
      ['Every document type has its own number series (INV, PUR, RCV, PAY, VLT, PRC, EXP). Numbers are never reused, even after a delete.', 'هەر جۆرە بەڵگەیەک زنجیرە ژمارەی خۆی هەیە (INV، PUR، RCV، PAY، VLT، PRC، EXP). ژمارەکان هەرگیز دووبارە بەکارنایەنەوە، تەنانەت دوای سڕینەوەش.'],
      ['Every save, edit and delete is written to the audit log (who, when, before and after).', 'هەر تۆمارکردن، دەستکاری و سڕینەوەیەک لە تۆماری چاودێری دەنووسرێت (کێ، کەی، پێش و دوای).'],
    ],
  },
  {
    id: 'pos',
    icon: 'pos',
    pages: ['pos'],
    title: ['Selling (POS) — INV', 'فرۆشتن (POS) — INV'],
    summary: ['What one sale does to the vault, the customer and the stock.', 'یەک فرۆشتن چی دەکات بە قاسە، کڕیار و کۆگا.'],
    rules: [
      ['**Total** = kg × price per kg for each line.', '**کۆی گشتی** = کیلۆ × نرخی کیلۆ بۆ هەر دێڕێک.'],
      ['By default the payment is in the **invoice currency** and goes to that currency\'s vault.', 'بە شێوەی بنەڕەت پارەدان بە **دراوی پسوولەکە**یە و دەچێتە قاسەی ئەو دراوە.'],
      ['**Split USD + IQD** is a switch: turn it on and the customer can pay part in **USD** and part in **IQD** on the same invoice. USD goes to the USD vault, IQD to the IQD vault. The invoice lists each part only when the payment was split.', '**دابەشکردن دۆلار + دینار** سویچێکە: کە چالاکی بکەیت کڕیار دەتوانێت بەشێک بە **دۆلار** و بەشێک بە **دینار** لەسەر هەمان پسوولە بدات. دۆلار دەچێتە قاسەی دۆلار، دینار دەچێتە قاسەی دینار. پسوولەکە تەنها کاتێک هەر بەشێک پیشان دەدات کە پارەدان دابەش کرابێت.'],
      ['The IQD part counts at the invoice\'s rate. Example: invoice $200, $100 paid in USD, rate 100 USD = 157,500 IQD → the rest is 157,500 IQD. The invoice shows each part and what it is worth.', 'بەشی دینار بە نرخی پسوولەکە حیساب دەکرێت. نموونە: پسوولە ٢٠٠ دۆلار، ١٠٠ دۆلار بە دۆلار دراوە، نرخ ١٠٠ دۆلار = ١٥٧،٥٠٠ دینار ← ماوەکە ١٥٧،٥٠٠ دینارە. پسوولەکە هەر بەشێک و بەهاکەی پیشان دەدات.'],
      ['**Total − cash** becomes debt on the customer.', '**کۆی گشتی − کاش** دەبێتە قەرز لەسەر کڕیار.'],
      ['Stock goes down. You cannot sell more kg than is in stock.', 'کۆگا کەم دەبێتەوە. ناتوانیت زیاتر لەو کیلۆیەی لە کۆگادایە بفرۆشیت.'],
      ['**Cost of goods (COGS)** = kg × the average cost per kg at that moment. **Profit** = sale price − COGS.', '**تێچووی کاڵا (COGS)** = کیلۆ × تێکڕای تێچووی کیلۆ لەو ساتەدا. **قازانج** = نرخی فرۆشتن − تێچوو.'],
      ['The invoice can be edited or deleted for **{editHours} hours**, then it locks.', 'پسوولەکە بۆ ماوەی **{editHours} کاتژمێر** دەستکاری یان دەسڕدرێتەوە، پاشان قفڵ دەبێت.'],
    ],
  },
  {
    id: 'purchase',
    icon: 'purchase',
    pages: ['beneficiaries'],
    title: ['Buying from suppliers — PUR', 'کڕین لە دابینکەران — PUR'],
    summary: ['What a purchase does to stock cost, the vault and what you owe.', 'کڕین چی دەکات بە تێچووی کۆگا، قاسە و قەرزی کارگە.'],
    rules: [
      ['**Total** = kg × price. The goods enter stock as **raw** at their cost.', '**کۆی گشتی** = کیلۆ × نرخ. کاڵاکە وەک **خاو** بە تێچووی خۆی دەچێتە کۆگا.'],
      ['Each purchase updates the product\'s **average cost per kg**.', 'هەر کڕینێک **تێکڕای تێچووی کیلۆ**ی ئەو کاڵایە نوێ دەکاتەوە.'],
      ['**Cash paid** can be split: the USD part leaves the USD vault, the IQD part leaves the IQD vault (IQD counted at the invoice\'s rate). If a vault is short you are warned (unpaid due).', '**کاشی دراو** دەتوانرێت دابەش بکرێت: بەشی دۆلار لە قاسەی دۆلار و بەشی دینار لە قاسەی دینار دەردەچێت (دینار بە نرخی پسوولەکە). ئەگەر قاسەیەک کەم بێت ئاگادار دەکرێیتەوە (قەرزی نەدراو).'],
      ['**Total − cash paid** becomes what the factory owes the supplier.', '**کۆی گشتی − کاشی دراو** دەبێتە قەرزی کارگە بۆ دابینکەر.'],
      ['A purchase whose goods were already sold cannot be deleted (stock would go below zero). The app names the sales that block it.', 'کڕینێک کە کاڵاکەی فرۆشراوە ناسڕدرێتەوە (کۆگا دەچێتە ژێر سفر). ئەپەکە ئەو فرۆشتنانە ناو دەبات کە ڕێگرن.'],
      ['Purchase invoices lock after **{editHours} hours**, like sales.', 'پسوولەی کڕین دوای **{editHours} کاتژمێر** قفڵ دەبێت، وەک فرۆشتن.'],
    ],
  },
  {
    id: 'processing',
    icon: 'processing',
    pages: ['inventory'],
    title: ['Stock & processing — PRC', 'کۆگا و پرۆسێسکردن — PRC'],
    summary: ['How raw kg becomes finished kg, and what loss does to cost.', 'چۆن کیلۆی خاو دەبێتە ئامادە، و زیان چی دەکات بە تێچوو.'],
    rules: [
      ['Processing turns **raw kg** into **finished kg**, minus a loss given in % or in kg.', 'پرۆسێسکردن **کیلۆی خاو** دەکاتە **کیلۆی ئامادە**، کەمکردنەوەی زیانێک کە بە ٪ یان بە کیلۆ دەدرێت.'],
      ['No money moves. The whole raw cost moves onto the finished kg, so loss raises the cost per kg. Example: 400 kg at $2 with 5% loss → 380 kg at about $2.11.', 'هیچ پارەیەک ناجووڵێت. هەموو تێچووی خاوەکە دەچێتە سەر کیلۆ ئامادەکان، بۆیە زیان تێچووی کیلۆ بەرز دەکاتەوە. نموونە: ٤٠٠ کیلۆ بە ٢ دۆلار بە ٥٪ زیان ← ٣٨٠ کیلۆ بە نزیکەی ٢٫١١ دۆلار.'],
      ['You cannot process more raw kg than is in stock. Loss must be below 100% (or below the input kg).', 'ناتوانیت زیاتر لە کیلۆی خاوی کۆگا پرۆسێس بکەیت. زیان دەبێت کەمتر بێت لە ١٠٠٪ (یان لە کیلۆی هاتوو).'],
      ['**Revert to raw** undoes a processing run: the finished kg leave finished stock, the lost kg come back, and the full input returns to raw stock at its raw cost. It needs the **master PIN**, keeps the run\'s number (marked "Reverted"), and is refused if some finished kg were already sold or processed again. A processing run is never simply deleted.', '**گەڕاندنەوە بۆ خاو** پرۆسێسێک هەڵدەوەشێنێتەوە: کیلۆی ئامادە لە کۆگای ئامادە دەردەچێت، کیلۆی زیان دەگەڕێتەوە، و هەموو کیلۆی هاتوو بە تێچووی خاوی خۆی دەگەڕێتەوە بۆ کۆگای خاو. **PINی سەرەکی** پێویستە، ژمارەکەی دەمێنێت (وەک «گەڕێنراوە»)، و ئەگەر بەشێک لە کیلۆی ئامادە فرۆشرابێت یان دووبارە پرۆسێس کرابێت ڕەت دەکرێتەوە. پرۆسێس هەرگیز بە سادەیی ناسڕدرێتەوە.'],
      ['Every product gets its **code (SKU) automatically**: {skuExample}, then the next number. Codes are never typed, never changed and never given twice, even after a product is deleted.', 'هەر بەرهەمێک **کۆدەکەی (SKU) خۆکار** وەردەگرێت: {skuExample}، پاشان ژمارەی دواتر. کۆد نانووسرێت، ناگۆڕدرێت و هەرگیز دووجار نادرێت، تەنانەت دوای سڕینەوەی بەرهەمەکەش.'],
      ['Aluminum types are added by you (Settings, or "Add type" when buying). None are pre-added. A type that a product uses cannot be deleted.', 'جۆرەکانی ئەلەمنیۆم خۆت زیادیان دەکەیت (ڕێکخستنەکان، یان «زیادکردنی جۆر» لە کاتی کڕیندا). هیچیان پێشوەختە زیاد نەکراون. جۆرێک کە کاڵایەک بەکاری دەهێنێت ناسڕدرێتەوە.'],
      ['A product is **low** when its stock is at or below its own limit, or the general limit (**{lowStock}**); **out** at zero.', 'کاڵایەک **کەمە** کاتێک کۆگاکەی گەیشتە سنووری خۆی یان سنووری گشتی (**{lowStock}**) یان کەمتر؛ لە سفردا **نەماوە**.'],
    ],
  },
  {
    id: 'customers',
    icon: 'customers',
    pages: ['customers'],
    title: ['Customers — payments & refunds (RCV)', 'کڕیاران — پارەدان و گەڕاندنەوە (RCV)'],
    summary: ['How customer balances go up and down.', 'چۆن باڵانسی کڕیار زیاد و کەم دەبێت.'],
    rules: [
      ['**Customer payment**: money goes into the vault, the customer\'s debt goes down.', '**پارەدانی کڕیار**: پارە دەچێتە قاسە، قەرزی کڕیار کەم دەبێتەوە.'],
      ['A customer who paid more than they owe has **credit** (shown green).', 'کڕیارێک کە زیاتر لە قەرزەکەی داوە **باڵانسی سەوز**ی هەیە.'],
      ['**Refund**: money leaves the vault. Allowed only when the customer has credit, and never more than that credit.', '**گەڕاندنەوە**: پارە لە قاسە دەردەچێت. تەنها کاتێک ڕێگەپێدراوە کە کڕیار باڵانسی سەوزی هەبێت، و هەرگیز زیاتر لەو بڕە نا.'],
      ['The customer page shows balance, sales, cash received, profit and a statement with the running balance per day.', 'لاپەڕەی کڕیار باڵانس، فرۆشتن، کاشی وەرگیراو، قازانج و کەشف‌حسابێک بە باڵانسی ڕۆژ بە ڕۆژ پیشان دەدات.'],
      ['A customer with transactions cannot be deleted normally.', 'کڕیارێک کە مامەڵەی هەبێت بە ئاسایی ناسڕدرێتەوە.'],
    ],
  },
  {
    id: 'beneficiaries',
    icon: 'beneficiaries',
    pages: ['beneficiaries'],
    title: ['Suppliers — payments & refunds (PAY)', 'دابینکەران — پارەدان و گەڕاندنەوە (PAY)'],
    summary: ['Paying suppliers and getting money back from them.', 'پارەدان بە دابینکەر و وەرگرتنەوەی پارە لێیان.'],
    rules: [
      ['**Pay a supplier**: money leaves the vault, what the factory owes goes down. If the vault is short, an unpaid due is created (after you confirm).', '**پارەدان بە دابینکەر**: پارە لە قاسە دەردەچێت، قەرزی کارگە کەم دەبێتەوە. ئەگەر قاسە کەم بێت، قەرزی نەدراو دروست دەبێت (دوای ڕەزامەندیت).'],
      ['**Supplier refund**: money comes back into the vault. Allowed only when you paid the supplier in advance, and never more than that advance.', '**گەڕانەوەی پارە لە دابینکەر**: پارە دێتەوە ناو قاسە. تەنها کاتێک کە پێشەکی پارەت داوە، و هەرگیز زیاتر لەو پێشەکییە نا.'],
    ],
  },
  {
    id: 'vault',
    icon: 'vault',
    pages: ['vault'],
    title: ['Vault — deposits, withdrawals, exchange, dues (VLT)', 'قاسە — دانان، ڕاکێشان، گۆڕینەوە، قەرزەکان (VLT)'],
    summary: ['Cash in, cash out, moving between USD and IQD, and paying dues.', 'پارە هاتن، دەرچوون، گواستنەوە لە نێوان دۆلار و دینار، و دانی قەرزەکان.'],
    rules: [
      ['**Deposit**: money in. Right after, the list of unpaid dues opens so you can pay them.', '**دانان**: پارە دێتە ناوەوە. دوای ئەوە ڕاستەوخۆ لیستی قەرزە نەدراوەکان دەکرێتەوە بۆ ئەوەی بیاندەیت.'],
      ['**Withdrawal**: money out. If the vault is short you are warned and the rest becomes an unpaid due.', '**ڕاکێشان**: پارە دەردەچێت. ئەگەر قاسە بەس نەکات ئاگادار دەکرێیتەوە و ماوەکەی دەبێتە قەرزی نەدراو.'],
      ['**Exchange** between vaults uses its own rate. It is strict: it is refused when the money isn\'t there, because half an exchange would create fake cash.', '**گۆڕینەوە** لە نێوان قاسەکان نرخی تایبەتی خۆی هەیە. توندە: ئەگەر پارەکە نەبێت ڕەت دەکرێتەوە، چونکە نیوەی گۆڕینەوە پارەی ساختە دروست دەکات.'],
      ['**Unpaid dues** = the part a payment could not cover. Paying a due takes the money out now, on the original document; editing or deleting that document undoes the payment too.', '**قەرزی نەدراو** = ئەو بەشەی پارەدانێک نەیتوانی دابینی بکات. دانی قەرزێک ئێستا پارە دەردەهێنێت، لەسەر بەڵگە ڕەسەنەکە؛ دەستکاری یان سڕینەوەی ئەو بەڵگەیە پارەدانەکەش دەگەڕێنێتەوە.'],
      ['The vault card shows cash now, unpaid dues, and what is left (cash − dues).', 'کارتی قاسە کاشی ئێستا، قەرزی نەدراو و پاشماوە (کاش − قەرز) پیشان دەدات.'],
    ],
  },
  {
    id: 'expenses',
    icon: 'expenses',
    pages: ['expenses'],
    title: ['Expenses — EXP', 'خەرجییەکان — EXP'],
    summary: ['One-off and recurring expenses, and which vault pays.', 'خەرجی یەکجاری و دووبارەبووەوە، و کام قاسە دەیدات.'],
    rules: [
      ['An expense takes money **out of one vault**, in that vault\'s currency. Amount = a fixed amount, or unit price × quantity for categories with a unit.', 'خەرجی پارە لە **یەک قاسە** دەردەهێنێت، بە دراوی ئەو قاسەیە. بڕ = بڕێکی تەواو، یان نرخی یەکە × ژمارە بۆ ئەو پۆلانەی یەکەیان هەیە.'],
      ['Which vault pays: **{expVault}** (set in Settings).', 'کام قاسە دەیدات: **{expVault}** (لە ڕێکخستنەکان دیاری دەکرێت).'],
      ['Short vault → warning, then an unpaid due for the rest.', 'قاسەی کەم ← ئاگادارکردنەوە، پاشان قەرزی نەدراو بۆ ماوەکەی.'],
      ['**Recurring** expenses post themselves daily, weekly or monthly, and can skip chosen days. If the vault doesn\'t have the money the run is not posted and shows as **Due** (it does not create debt).', 'خەرجی **دووبارەبووەوە** خۆی ڕۆژانە، هەفتانە یان مانگانە تۆمار دەکات، و دەتوانێت ڕۆژانی دیاریکراو تێپەڕێنێت. ئەگەر قاسە پارەی نەبێت تۆمار ناکرێت و وەک **Due** پیشان دەدرێت (قەرز دروست ناکات).'],
      ['Expense PIN: **{expPin}**. When set, a new expense or recurring rule needs it ({pinMin}–{pinMax} digits; locked {pinLock} min after {pinTries} wrong tries).', 'PINی خەرجی: **{expPin}**. ئەگەر دانرابێت، خەرجی نوێ یان یاسای دووبارەبووەوە پێویستی پێیەتی ({pinMin}–{pinMax} ژمارە؛ دوای {pinTries} هەڵە بۆ {pinLock} خولەک قفڵ دەبێت).'],
      ['A category that is used by expenses cannot be deleted.', 'پۆلێک کە خەرجی تێدا تۆمار کرابێت ناسڕدرێتەوە.'],
    ],
  },
  {
    id: 'invoices',
    icon: 'invoices',
    pages: ['invoices', 'pos', 'beneficiaries'],
    title: ['Invoices & documents', 'پسوولە و بەڵگەکان'],
    summary: ['The edit window, the lock, and the PDF files.', 'ماوەی دەستکاری، قفڵ و فایلی PDF.'],
    rules: [
      ['Sales invoices and purchase invoices are listed separately.', 'پسوولەی فرۆشتن و پسوولەی کڕین بە جیا لیست دەکرێن.'],
      ['Sale and purchase invoices can be edited or deleted for **{editHours} hours** after they are created. After that they are locked for everyone, the owner included.', 'پسوولەی فرۆشتن و کڕین بۆ ماوەی **{editHours} کاتژمێر** دوای دروستکردن دەستکاری یان دەسڕدرێنەوە. دوای ئەوە بۆ هەمووان قفڵ دەبن، خاوەنیش.'],
      ['Payments, vault operations, processing and expenses do not lock.', 'پارەدان، کارەکانی قاسە، پرۆسێسکردن و خەرجییەکان قفڵ نابن.'],
      ['PDFs can be printed on **A4 or A5**. The paper you choose is remembered on this device.', 'PDF دەتوانرێت لەسەر **A4 یان A5** چاپ بکرێت. ئەو کاغەزەی هەڵیدەبژێریت لەسەر ئەم ئامێرە لەبیر دەکرێت.'],
      ['Each invoice can be saved automatically as a PDF named by its number into a folder you choose on this computer (Chrome / Edge).', 'هەر پسوولەیەک دەتوانرێت خۆکار وەک PDF بە ناوی ژمارەکەی لە فۆڵدەرێکی ئەم کۆمپیوتەرە پاشەکەوت بکرێت (Chrome / Edge).'],
    ],
  },
  {
    id: 'reports',
    icon: 'reports',
    pages: ['reports', 'dashboard'],
    title: ['Dashboard & reports', 'داشبۆرد و ڕاپۆرتەکان'],
    summary: ['Where the figures come from.', 'ژمارەکان لە کوێوە دێن.'],
    rules: [
      ['No figure is stored separately: everything is read live from the ledgers.', 'هیچ ژمارەیەک جیا هەڵناگیرێت: هەمووی ڕاستەوخۆ لە دەفتەرەکانەوە دەخوێندرێتەوە.'],
      ['**Gross profit** = sales revenue − cost of goods sold.', '**قازانجی گشتی** = داهاتی فرۆشتن − تێچووی کاڵای فرۆشراو.'],
      ['Expenses are shown on their own; they are not yet subtracted in the profit report.', 'خەرجییەکان بە جیا پیشان دەدرێن؛ هێشتا لە ڕاپۆرتی قازانجدا کەم ناکرێنەوە.'],
    ],
  },
  {
    id: 'alerts',
    icon: 'alerts',
    title: ['Alerts', 'ئاگادارکردنەوەکان'],
    summary: ['When the bell lights up (the owner sets the limits in Settings).', 'کەی زەنگەکە ڕووناک دەبێت (خاوەن سنوورەکان لە ڕێکخستنەکان دادەنێت).'],
    rules: [
      { flag: 'alertCustomerDue', text: ['A customer owes more than **{custDue}**.', 'کڕیارێک زیاتر لە **{custDue}** قەرزدارە.'] },
      { flag: 'alertBeneficiaryDue', text: ['The factory owes a supplier more than **{benDue}**.', 'کارگە زیاتر لە **{benDue}** قەرزداری دابینکەرێکە.'] },
      { flag: 'alertOverdue', text: ['A customer\'s oldest unpaid sale is older than **{overdueDays} days**.', 'کۆنترین فرۆشتنی نەدراوی کڕیارێک لە **{overdueDays} ڕۆژ** کۆنترە.'] },
      { flag: 'alertLowStock', text: ['A product is low or out of stock.', 'کاڵایەک کەمە یان نەماوە.'] },
      { flag: 'alertVault', text: ['A vault is below its minimum (USD {vaultMinUsd} · IQD {vaultMinIqd}), below zero, or has unpaid dues.', 'قاسەیەک لە کەمترین بڕی خۆی کەمترە (دۆلار {vaultMinUsd} · دینار {vaultMinIqd})، ژێر سفرە، یان قەرزی نەدراوی هەیە.'] },
      ['You only see alerts for pages you can open. An alert comes back when its numbers change.', 'تەنها ئاگادارکردنەوەی ئەو پەڕانە دەبینیت کە دەتوانیت بیانکەیتەوە. ئاگادارکردنەوە دەگەڕێتەوە کاتێک ژمارەکانی دەگۆڕێن.'],
    ],
  },
  {
    id: 'access',
    icon: 'access',
    title: ['Users, access & sign-in', 'بەکارهێنەران، مۆڵەت و چوونەژوورەوە'],
    summary: ['Who can open what.', 'کێ دەتوانێت چی بکاتەوە.'],
    rules: [
      ['The **owner** can do everything. Other users only open the pages the owner allowed.', '**خاوەن** دەتوانێت هەموو شتێک بکات. بەکارهێنەرانی تر تەنها ئەو پەڕانە دەکەنەوە کە خاوەن ڕێگەی داوە.'],
      ['Editing or deleting a transaction needs access to the page it belongs to (a sale → POS, a purchase → Suppliers, …).', 'دەستکاری یان سڕینەوەی مامەڵەیەک پێویستی بە مۆڵەتی ئەو پەڕەیە هەیە کە سەر بەوە (فرۆشتن ← POS، کڕین ← دابینکەران، …).'],
      ['Settings, users, backups and the audit log are owner only.', 'ڕێکخستنەکان، بەکارهێنەران، باکئەپ و تۆماری چاودێری تەنها بۆ خاوەنن.'],
      ['Sign-in pauses after **{loginTries} wrong passwords** in {loginWindow} minutes.', 'چوونەژوورەوە دوای **{loginTries} وشەی نهێنی هەڵە** لە {loginWindow} خولەکدا ڕادەگیرێت.'],
    ],
  },
  {
    id: 'backup',
    icon: 'backup',
    ownerOnly: true,
    title: ['Backup & restore', 'باکئەپ و گەڕاندنەوە'],
    summary: ['How your data is kept safe and brought back.', 'چۆن داتاکانت پارێزراو دەبن و دەگەڕێنرێنەوە.'],
    rules: [
      ['A backup file contains every table, read at one instant, with a checksum. A file that was edited or damaged is refused.', 'فایلی باکئەپ هەموو خشتەکان لە یەک ساتدا لەخۆ دەگرێت، لەگەڵ checksum. فایلێک کە دەستکاری کرابێت یان تێکچووبێت ڕەت دەکرێتەوە.'],
      ['An automatic **restore point** is saved in the database every day (when the last is older than {dailyHours} h). The newest {keepDaily} daily and {keepOther} other restore points are kept.', '**خاڵی گەڕاندنەوە** هەموو ڕۆژێک خۆکار لە داتابەیسدا پاشەکەوت دەکرێت (کاتێک دواینیان لە {dailyHours} کاتژمێر کۆنترە). نوێترین {keepDaily} ڕۆژانە و {keepOther} ی تر دەهێڵدرێنەوە.'],
      ['Restore points are compressed copies kept in the database. Their number is capped ({keepDaily} daily + {keepOther} others); the oldest are removed automatically, so they never grow without limit. Settings → Backup shows how much space they take.', 'خاڵەکانی گەڕاندنەوە کۆپیی پەستێنراون لە داتابەیسدا. ژمارەیان سنووردارە ({keepDaily} ڕۆژانە + {keepOther} ی تر)؛ کۆنترینەکان خۆکار لادەبرێن، بۆیە هەرگیز بێسنوور گەورە نابن. ڕێکخستنەکان ← باکئەپ پیشان دەدات چەند شوێن دەگرن.'],
      ['A backup file can also be saved every **{folderDays} days** into a folder on this computer, while the app is open.', 'فایلی باکئەپ دەتوانرێت هەموو **{folderDays} ڕۆژ** جارێک لە فۆڵدەرێکی ئەم کۆمپیوتەرە پاشەکەوت بکرێت، کاتێک ئەپەکە کراوەیە.'],
      ['**Restore** (from a file or a restore point) and **Start fresh** need the master PIN and a confirmation. Before either, the current data is saved as a restore point, so nothing is lost.', '**گەڕاندنەوە** (لە فایل یان خاڵی گەڕاندنەوە) و **دەستپێکردنەوە لە سفر** پێویستیان بە PINی سەرەکی و پشتڕاستکردنەوە هەیە. پێش هەردووکیان داتای ئێستا وەک خاڵی گەڕاندنەوە پاشەکەوت دەکرێت، بۆیە هیچ شتێک لەدەست ناچێت.'],
      ['A restore is all or nothing. You keep your own owner login; everyone else is signed out.', 'گەڕاندنەوە یان هەمووی دەبێت یان هیچ. چوونەژوورەوەی خاوەنی خۆت دەمێنێت؛ هەموو کەسانی تر دەردەکرێن.'],
      ['**Start fresh** leaves an empty app with only the owner login.', '**دەستپێکردنەوە لە سفر** ئەپێکی بەتاڵ دەهێڵێتەوە تەنها بە چوونەژوورەوەی خاوەن.'],
    ],
  },
  {
    id: 'erase',
    icon: 'erase',
    ownerOnly: true,
    title: ['Erase mode', 'دۆخی سڕینەوە'],
    summary: ['The only way to remove records completely.', 'تاکە ڕێگا بۆ لابردنی تەواوی تۆمارەکان.'],
    rules: [
      ['Owner only: **Ctrl + Alt + R** and the master PIN. It stays on for **{eraseMin} minutes** and turns off on reload.', 'تەنها خاوەن: **Ctrl + Alt + R** و PINی سەرەکی. بۆ **{eraseMin} خولەک** چالاک دەمێنێت و بە نوێکردنەوەی پەڕە دەکوژێتەوە.'],
      ['Erases transactions (after reversing their effects), customer accounts with all their transactions, a product\'s whole stock history (Inventory), restore points (Settings → Backup), audit lines and deleted (voided) documents.', 'مامەڵەکان (دوای گەڕاندنەوەی کاریگەرییەکانیان)، هەژماری کڕیار لەگەڵ هەموو مامەڵەکانی، هەموو مێژووی کۆگای بەرهەمێک (کۆگا)، خاڵەکانی گەڕاندنەوە (ڕێکخستنەکان ← باکئەپ)، دێڕی چاودێری و بەڵگە سڕاوەکان لادەبات.'],
      ['It leaves no trace, and it works on locked invoices too.', 'هیچ شوێنپێیەک ناهێڵێتەوە، و لەسەر پسوولە قفڵکراوەکانیش کار دەکات.'],
      ['The master PIN is changeable ({pinMin}–{pinMax} digits) and locks for {pinLock} minutes after {pinTries} wrong tries.', 'PINی سەرەکی دەگۆڕدرێت ({pinMin}–{pinMax} ژمارە) و دوای {pinTries} هەڵە بۆ {pinLock} خولەک قفڵ دەبێت.'],
    ],
  },
];

/** Newest first. Add an entry here whenever a rule is added, changed or removed. */
export const ABOUT_CHANGELOG: AboutChange[] = [
  {
    version: '1.8',
    date: '2026-10-05',
    items: [
      { type: 'added', text: ['Revert to raw: undo a processing run with the master PIN; the finished kg and the loss go back to raw stock.', 'گەڕاندنەوە بۆ خاو: پرۆسێسێک بە PINی سەرەکی هەڵبوەشێنەوە؛ کیلۆی ئامادە و زیانەکە دەگەڕێنەوە بۆ کۆگای خاو.'] },
      { type: 'changed', text: ['A processing run can no longer be deleted; it is reverted instead.', 'پرۆسێس ئیتر ناسڕدرێتەوە؛ لە جیاتی ئەوە دەگەڕێنرێتەوە.'] },
      { type: 'added', text: ['Erase mode: erase a product\'s stock history, and erase restore points from the database.', 'دۆخی سڕینەوە: سڕینەوەی مێژووی کۆگای بەرهەمێک، و سڕینەوەی خاڵەکانی گەڕاندنەوە لە داتابەیس.'] },
    ],
  },
  {
    version: '1.7',
    date: '2026-10-05',
    items: [
      { type: 'added', text: ['Product codes (SKU) are given automatically and in order (ALU-00001, ALU-00002, …); no more typing them.', 'کۆدی بەرهەم (SKU) خۆکار و بە ڕیز دەدرێت (ALU-00001، ALU-00002، …)؛ ئیتر پێویست بە نووسینیان نییە.'] },
      { type: 'changed', text: ['Split payment is now a switch. Off: the invoice currency is paid into its own vault. On: USD and IQD side by side.', 'پارەدانی دابەشکراو ئێستا سویچە. کوژاوە: دراوی پسوولەکە دەچێتە قاسەی خۆی. چالاک: دۆلار و دینار پێکەوە.'] },
    ],
  },
  {
    version: '1.6',
    date: '2026-10-04',
    items: [
      { type: 'added', text: ['Split payment: a sale or purchase can be paid partly in USD and partly in IQD; each part goes to its own vault, and the invoice shows both.', 'پارەدانی دابەشکراو: فرۆشتن یان کڕین دەتوانرێت بەشێکی بە دۆلار و بەشێکی بە دینار بدرێت؛ هەر بەشێک دەچێتە قاسەی خۆی، و پسوولەکە هەردووکیان پیشان دەدات.'] },
    ],
  },
  {
    version: '1.5',
    date: '2026-10-04',
    items: [
      { type: 'removed', text: ['The pre-added aluminum types (6061, 6063, Mixed, Scrap, Extrusion). You add your own types.', 'جۆرە پێشوەختە زیادکراوەکانی ئەلەمنیۆم (6061، 6063، Mixed، Scrap، Extrusion). جۆرەکانی خۆت زیاد دەکەیت.'] },
    ],
  },
  {
    version: '1.4',
    date: '2026-10-04',
    items: [
      { type: 'added', text: ['This page: every rule in one place, kept in step with the code.', 'ئەم پەڕەیە: هەموو یاساکان لە یەک شوێن، هاوکات لەگەڵ کۆدەکە.'] },
      { type: 'changed', text: ['Sales and purchase invoices are listed separately; PDFs on A4 or A5.', 'پسوولەی فرۆشتن و کڕین بە جیا لیست دەکرێن؛ PDF لەسەر A4 یان A5.'] },
      { type: 'added', text: ['Backup & restore: daily restore points, weekly folder backup, restore and start fresh with the master PIN.', 'باکئەپ و گەڕاندنەوە: خاڵی گەڕاندنەوەی ڕۆژانە، باکئەپی هەفتانە بۆ فۆڵدەر، گەڕاندنەوە و دەستپێکردنەوە بە PINی سەرەکی.'] },
    ],
  },
  {
    version: '1.3',
    date: '2026-10-04',
    items: [{ type: 'added', text: ['Erase mode for the owner (Ctrl + Alt + R + PIN).', 'دۆخی سڕینەوە بۆ خاوەن (Ctrl + Alt + R + PIN).'] }],
  },
  {
    version: '1.2',
    date: '2026-10-02',
    items: [
      { type: 'added', text: ['Unpaid vault dues: when a vault is short, pay what is there and keep the rest as a due.', 'قەرزی نەدراوی قاسە: کاتێک قاسە کەمە، ئەوەی هەیە بدە و ماوەکەی وەک قەرز بهێڵەوە.'] },
    ],
  },
  {
    version: '1.1',
    date: '2026-10-01',
    items: [{ type: 'added', text: ['Expenses, categories and recurring expenses.', 'خەرجی، پۆلەکان و خەرجی دووبارەبووەوە.'] }],
  },
  {
    version: '1.0',
    date: '2026-09-30',
    items: [{ type: 'added', text: ['First version: sales, purchases, processing, payments, vaults, reports.', 'یەکەم وەشان: فرۆشتن، کڕین، پرۆسێسکردن، پارەدان، قاسەکان، ڕاپۆرت.'] }],
  },
];

export const ABOUT_VERSION = ABOUT_CHANGELOG[0].version;
export const ABOUT_UPDATED = ABOUT_CHANGELOG[0].date;
