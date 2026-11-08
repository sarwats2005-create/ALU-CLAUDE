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
export type AboutIcon = 'core' | 'money' | 'pos' | 'purchase' | 'processing' | 'customers' | 'beneficiaries' | 'vault' | 'expenses' | 'employees' | 'invoices' | 'reports' | 'alerts' | 'access' | 'backup' | 'erase';

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
      ['Every document type has its own number series (INV, PUR, RCV, PAY, VLT, PRC, EXP, SAL, STR). Numbers are never reused, even after a delete.', 'هەر جۆرە بەڵگەیەک زنجیرە ژمارەی خۆی هەیە (INV، PUR، RCV، PAY، VLT، PRC، EXP، SAL، STR). ژمارەکان هەرگیز دووبارە بەکارنایەنەوە، تەنانەت دوای سڕینەوەش.'],
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
      ['The factory can have **several inventories** (warehouses or stores). Products are shared; the kg and the cost are kept per inventory. Every purchase, sale, processing run and rent payment says which inventory it uses; the main inventory is the default.', 'کارگە دەتوانێت **چەند کۆگایەکی** هەبێت (کۆگا یان دوکان). بەرهەمەکان هاوبەشن؛ کیلۆ و تێچوو بۆ هەر کۆگایەک جیا هەڵدەگیرێن. هەر کڕین، فرۆشتن، پرۆسێس و دانی کرێیەک دیاری دەکات کام کۆگا بەکاردێنێت؛ کۆگای سەرەکی بنەڕەتە.'],
      ['You can only sell or process the kg that are in **that** inventory, not the total of all inventories.', 'تەنها ئەو کیلۆیە دەفرۆشیت یان پرۆسێس دەکەیت کە لە **هەمان** کۆگادایە، نەک کۆی هەموو کۆگاکان.'],
      ['**Transfer stock (STR)** moves kg from one inventory to another at their average cost. No money moves and the total kg stays the same.', '**گواستنەوەی کاڵا (STR)** کیلۆ لە کۆگایەکەوە بۆ کۆگایەکی تر دەگوازێتەوە بە تێکڕای تێچووەکەیان. هیچ پارەیەک ناجووڵێت و کۆی کیلۆ وەک خۆی دەمێنێتەوە.'],
      ['An inventory can have a **monthly rent**. When it is due, **Pay rent** saves it as an expense (EXP) from the vault you pick. The next due date moves forward one month only when the rent was paid in full; if the vault was short, the rest stays as an unpaid due and the date does not move.', 'کۆگایەک دەتوانێت **کرێی مانگانە**ی هەبێت. کاتێک کاتی هات، **دانی کرێ** وەک خەرجی (EXP) لەو قاسەیەی هەڵیدەبژێریت تۆمار دەکرێت. وادەی داهاتوو تەنها کاتێک یەک مانگ دەچێتە پێشەوە کە کرێکە بە تەواوی درابێت؛ ئەگەر قاسە کەم بوو، ماوەکەی وەک قەرزی نەدراو دەمێنێتەوە و وادەکە ناجووڵێت.'],
      ['The main inventory cannot be deleted. Another inventory can be deleted only when it is empty and no document uses it.', 'کۆگای سەرەکی ناسڕدرێتەوە. کۆگایەکی تر تەنها کاتێک دەسڕدرێتەوە کە بەتاڵ بێت و هیچ بەڵگەیەک بەکاری نەهێنابێت.'],
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
      ['**Vault → Unpaid dues** also lists the **beneficiary dues**: every beneficiary the factory still owes, largest first. **Pay** there records a normal beneficiary payment from your vault (short vault → warning, then an unpaid due).', '**قاسە ← قەرزە نەدراوەکان** **قەرزی دابینکەران**یش پیشان دەدات: هەموو ئەو دابینکەرانەی کارگە هێشتا قەرزاریانە، گەورەترین یەکەم. **بدە** لەوێ پارەدانێکی ئاسایی بۆ دابینکەر لە قاسەکەتەوە تۆمار دەکات (قاسەی کەم ← ئاگادارکردنەوە، پاشان قەرزی نەدراو).'],
      ['The vault card shows cash now, unpaid dues, and what is left (cash − dues).', 'کارتی قاسە کاشی ئێستا، قەرزی نەدراو و پاشماوە (کاش − قەرز) پیشان دەدات.'],
      ['Every staff user has their own **personal vault** (USD + IQD). **Everything** they record — sales, purchases, payments, refunds, expenses, rent, withdrawals — moves their vault, never the main vault. A staff user never sees the main factory vault.', 'هەر کارمەندێک **قاسەی کەسی**ی خۆی هەیە (دۆلار + دینار). **هەموو** ئەوەی تۆماری دەکات — فرۆشتن، کڕین، پارەدان، گەڕاندنەوە، خەرجی، کرێ، ڕاکێشان — قاسەکەی خۆی دەجووڵێنێت، هەرگیز قاسەی سەرەکی نا. کارمەند هەرگیز قاسەی سەرەکی کارگە نابینێت.'],
      ['Only the owner puts money into a staff vault: **Give money** moves cash from the main vault into it, **Take back** moves it back. Both are strict — they only move cash that is really there — and are kept as VLT documents that can\'t be deleted (record the opposite move instead). Staff can\'t deposit into their own vault.', 'تەنها خاوەن پارە دەخاتە قاسەی کارمەند: **پارەدان** کاش لە قاسەی سەرەکییەوە دەخاتە ناوی، **وەرگرتنەوە** دەیگەڕێنێتەوە. هەردووکیان توندن — تەنها ئەو کاشە دەجووڵێنن کە بەڕاستی هەیە — و وەک بەڵگەی VLT هەڵدەگیرێن کە ناسڕدرێنەوە (لە جیاتی ئەوە جووڵەی پێچەوانە تۆمار بکە). کارمەند ناتوانێت پارە بخاتە قاسەکەی خۆی.'],
      ['Editing a document never moves it to another vault: a staff sale stays in that staff vault even when the owner edits it.', 'دەستکاریکردنی بەڵگەیەک هەرگیز نایباتە قاسەیەکی تر: فرۆشتنی کارمەندێک لە قاسەی ئەو کارمەندەدا دەمێنێتەوە تەنانەت ئەگەر خاوەن دەستکاری بکات.'],
      ['The owner\'s vault page also shows the **money position**: what customers owe, what the factory owes suppliers, unpaid vault dues and cash with staff. It turns red when the factory is short — unpaid dues, a vault below zero, or more owed to suppliers than the cash held.', 'پەڕەی قاسەی خاوەن **دۆخی پارە**ش پیشان دەدات: قەرزی کڕیاران، قەرزی کارگە بۆ دابینکەران، قەرزی نەدراوی قاسە و کاشی لای کارمەندان. سوور دەبێت کاتێک کارگە پارەی کەمە — قەرزی نەدراو، قاسەیەک لە ژێر سفر، یان قەرزی دابینکەران زیاتر لە کاشی بەردەست.'],
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
      ['An expense keeps its **date and time** (the time is optional; it starts at the current time and is saved exactly as entered, in local time). Recurring rules use a start date only.', 'خەرجی **ڕێکەوت و کات**ی خۆی هەڵدەگرێت (کات ئارەزوومەندانەیە؛ بە کاتی ئێستا دەست پێدەکات و وەک خۆی بە کاتی ناوخۆیی پاشەکەوت دەکرێت). یاسای دووبارەبووەوە تەنها ڕێکەوتی دەستپێکی هەیە.'],
      ['Short vault → warning, then an unpaid due for the rest.', 'قاسەی کەم ← ئاگادارکردنەوە، پاشان قەرزی نەدراو بۆ ماوەکەی.'],
      ['**Recurring** expenses post themselves daily, weekly or monthly, and can skip chosen days. If the vault doesn\'t have the money the run is not posted and shows as **Due** (it does not create debt).', 'خەرجی **دووبارەبووەوە** خۆی ڕۆژانە، هەفتانە یان مانگانە تۆمار دەکات، و دەتوانێت ڕۆژانی دیاریکراو تێپەڕێنێت. ئەگەر قاسە پارەی نەبێت تۆمار ناکرێت و وەک **Due** پیشان دەدرێت (قەرز دروست ناکات).'],
      ['Expense PIN: **{expPin}**. When set, a new expense or recurring rule needs it ({pinMin}–{pinMax} digits; locked {pinLock} min after {pinTries} wrong tries).', 'PINی خەرجی: **{expPin}**. ئەگەر دانرابێت، خەرجی نوێ یان یاسای دووبارەبووەوە پێویستی پێیەتی ({pinMin}–{pinMax} ژمارە؛ دوای {pinTries} هەڵە بۆ {pinLock} خولەک قفڵ دەبێت).'],
      ['A category that is used by expenses cannot be deleted.', 'پۆلێک کە خەرجی تێدا تۆمار کرابێت ناسڕدرێتەوە.'],
      ['A staff user pays expenses from their own vault. The owner sees factory expenses and staff expenses on separate tabs.', 'کارمەند خەرجی لە قاسەی خۆیەوە دەدات. خاوەن خەرجی کارگە و خەرجی کارمەندان لە دوو تابی جیادا دەبینێت.'],
    ],
  },
  {
    id: 'employees',
    icon: 'employees',
    pages: ['employees'],
    title: ['Employees & salaries — SAL', 'کارمەندان و مووچە — SAL'],
    summary: ['Who is on the payroll, how salaries are paid, and what happens when the vault is short.', 'کێ لە لیستی مووچەدایە، مووچە چۆن دەدرێت، و کاتێک قاسە کەمە چی ڕوودەدات.'],
    rules: [
      ['Salaries are always recorded in **USD**. Paying from the IQD vault takes the dinar equivalent at the current rate. No PIN is needed.', 'مووچە هەمیشە بە **دۆلار** تۆمار دەکرێت. دان لە قاسەی دینار بەرامبەرەکەی بە دینار بە نرخی ئێستا دەردەهێنێت. PIN پێویست نییە.'],
      ['A **monthly** employee is paid **automatically** once a month from the **USD vault** (when the Employees page opens, a new monthly employee is added, or the daily job runs). A month is never paid twice; an automatic salary you delete is not created again.', 'کارمەندی **مانگانە** مانگی جارێک **خۆکار** لە **قاسەی دۆلار** مووچەی دەدرێت (کاتێک پەڕەی کارمەندان دەکرێتەوە، کارمەندێکی مانگانەی نوێ زیاد دەکرێت، یان کاری ڕۆژانە کار دەکات). هیچ مانگێک دووجار نادرێت؛ مووچەیەکی خۆکار کە بیسڕیتەوە دووبارە دروست ناکرێتەوە.'],
      ['When the vault does not have the full salary, what is there is paid and the rest is kept as an **unpaid salary** (an unpaid vault due). It is never skipped. Pay it from the Employees page or Vault → Unpaid dues.', 'کاتێک قاسە هەموو مووچەکەی تێدا نییە، ئەوەی هەیە دەدرێت و ماوەکەی وەک **مووچەی نەدراو** (قەرزی نەدراوی قاسە) دەمێنێتەوە. هەرگیز تێناپەڕێنرێت. لە پەڕەی کارمەندان یان قاسە ← قەرزە نەدراوەکان بیدە.'],
      ['A **daily** worker is paid by hand: days worked × daily rate. Half days are allowed; never more days than the month has.', 'کرێکاری **ڕۆژانە** بە دەست مووچەی دەدرێت: ڕۆژانی کار × نرخی ڕۆژانە. نیوە ڕۆژ ڕێگەپێدراوە؛ هەرگیز زیاتر لە ڕۆژەکانی مانگ نا.'],
      ['A monthly employee can also be paid by hand for a chosen month, unless that month is already paid.', 'کارمەندی مانگانەش دەتوانرێت بە دەست بۆ مانگێکی دیاریکراو مووچەی بدرێت، مەگەر ئەو مانگە پێشتر درابێت.'],
      ['Deleting a salary payment puts the money back into the vault. A salary is not edited: delete it and pay again.', 'سڕینەوەی پارەدانی مووچە پارەکە دەگەڕێنێتەوە بۆ قاسە. مووچە دەستکاری ناکرێت: بیسڕەوە و دووبارە بیدە.'],
      ['Deleting an employee keeps their salary history. To stop paying someone but keep them on the list, mark them **inactive**.', 'سڕینەوەی کارمەند مێژووی مووچەکانی دەهێڵێتەوە. بۆ ڕاگرتنی مووچەی کەسێک بەڵام هێشتنەوەی لە لیستەکە، **ناچالاک**ی بکە.'],
      ['A staff user with access to this page pays salaries from their own vault.', 'کارمەندێک کە دەستی بەم پەڕەیە دەگات مووچە لە قاسەی خۆیەوە دەدات.'],
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
      ['**Total sales** = every sale, paid or not (what customers still owe is already inside it).', '**کۆی فرۆشتن** = هەموو فرۆشتنەکان، دراو بێت یان نا (ئەوەی کڕیاران هێشتا قەرزدارن پێشتر لەناویدایە).'],
      ['**Total cost** = cost of the aluminium sold + expenses + salaries. **Profit** = total sales − total cost. Example: sales $10,000 − aluminium $7,000 − salaries $1,500 − electricity $500 = **$1,000**.', '**کۆی تێچوو** = تێچووی ئەلەمنیۆمی فرۆشراو + خەرجی + مووچە. **قازانج** = کۆی فرۆشتن − کۆی تێچوو. نموونە: فرۆشتن ١٠،٠٠٠ دۆلار − ئەلەمنیۆم ٧،٠٠٠ − مووچە ١،٥٠٠ − کارەبا ٥٠٠ = **١،٠٠٠ دۆلار**.'],
      ['Scrap lost in processing is already inside the cost of the aluminium sold (processing moves the whole raw cost onto the finished kg). It is shown for information only and never subtracted twice.', 'ئەو پاشماوەیەی لە پرۆسێسدا لەدەست دەچێت پێشتر لەناو تێچووی ئەلەمنیۆمی فرۆشراودایە (پرۆسێس هەموو تێچووی خاو دەخاتە سەر کیلۆی ئامادە). تەنها بۆ زانیاری پیشان دەدرێت و هەرگیز دووجار کەم ناکرێتەوە.'],
      ['**You owe** = what the factory owes beneficiaries + unpaid vault dues (unpaid salaries included). **Stock value** = aluminium in stock at what it cost to buy, never at its sale price.', '**قەرزی تۆ** = ئەوەی کارگە قەرزاری دابینکەرانە + قەرزی نەدراوی قاسە (مووچەی نەدراویش). **بەهای کۆگا** = ئەلەمنیۆمی ناو کۆگا بە نرخی کڕین، هەرگیز بە نرخی فرۆشتن نا.'],
      ['**Factory worth** = cash in all vaults (yours + staff) + what customers owe + stock value − what you owe. Buying aluminium does not change it (cash becomes stock); paying expenses or salaries lowers it.', '**بەهای کارگە** = کاشی هەموو قاسەکان (هی خۆت + کارمەندان) + قەرزی کڕیاران + بەهای کۆگا − قەرزی تۆ. کڕینی ئەلەمنیۆم نایگۆڕێت (کاش دەبێتە کۆگا)؛ دانی خەرجی یان مووچە کەمی دەکاتەوە.'],
      ['Profit, cost of goods, factory worth and the P&L report are **owner only**. A staff user\'s dashboard shows only their vault, their sales and their recent documents.', 'قازانج، تێچووی کاڵا، بەهای کارگە و ڕاپۆرتی قازانج و زیان **تەنها بۆ خاوەنن**. داشبۆردی کارمەند تەنها قاسەکەی، فرۆشتنەکانی و دوایین بەڵگەکانی پیشان دەدات.'],
      ['The profit & loss report shows, per month: sales, cost of the aluminium sold, gross profit, expenses, salaries and **net profit**. Its cash flow counts the money that really left the vaults for expenses and salaries.', 'ڕاپۆرتی قازانج و زیان بۆ هەر مانگێک پیشان دەدات: فرۆشتن، تێچووی ئەلەمنیۆمی فرۆشراو، قازانجی گشتی، خەرجی، مووچە و **قازانجی پوخت**. ڕەوتی پارەکەی ئەو پارەیە دەژمێرێت کە بەڕاستی بۆ خەرجی و مووچە لە قاسەکان دەرچووە.'],
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
      ['On every page a staff user sees **only the documents they recorded**. For Invoices, Customers, Suppliers, Expenses, Reports and the transaction list the owner can switch on **“Also see everyone\'s activity”** per user (off by default). Movements of the main vault or of another staff vault are never shown to staff.', 'لە هەموو پەڕەیەکدا کارمەند **تەنها ئەو بەڵگانە دەبینێت کە خۆی تۆماری کردوون**. بۆ پسوولەکان، کڕیاران، دابینکەران، خەرجییەکان، ڕاپۆرتەکان و لیستی مامەڵەکان خاوەن دەتوانێت بۆ هەر بەکارهێنەرێک **«چالاکیی هەمووان ببینە»** چالاک بکات (بە شێوەی بنەڕەت کوژاوەیە). جووڵەکانی قاسەی سەرەکی یان قاسەی کارمەندێکی تر هەرگیز بە کارمەند پیشان نادرێن.'],
      ['A staff user can change or delete **only their own documents**, and only ones that moved their own vault. Everything else is the owner\'s.', 'کارمەند تەنها دەتوانێت **بەڵگەکانی خۆی** بگۆڕێت یان بسڕێتەوە، و تەنها ئەوانەی قاسەکەی خۆیان جووڵاندووە. هەموو شتێکی تر هی خاوەنە.'],
      ['Every document a staff user records, changes or deletes **notifies the owner** with the user\'s name. The notice stays until the owner presses **“I get it”**.', 'هەر بەڵگەیەک کە کارمەندێک تۆماری دەکات، دەیگۆڕێت یان دەیسڕێتەوە **خاوەن ئاگادار دەکاتەوە** بە ناوی بەکارهێنەرەکەوە. ئاگادارکردنەوەکە دەمێنێتەوە تا خاوەن **«تێگەیشتم»** دادەگرێت.'],
      ['The owner can **archive** a staff user (they can\'t sign in; their records stay; the cash in their vault goes back to the main vault as a VLT document; their recurring expenses pause) and **restore** them later. Archiving waits until their vault has no unpaid dues. A user who never recorded anything can be **deleted** for good.', 'خاوەن دەتوانێت کارمەندێک **ئەرشیف** بکات (ناتوانێت بچێتە ژوورەوە؛ تۆمارەکانی دەمێنن؛ کاشی ناو قاسەکەی وەک بەڵگەی VLT دەگەڕێتەوە بۆ قاسەی سەرەکی؛ خەرجییە دووبارەبووەکانی ڕادەگیرێن) و دواتر **بیگەڕێنێتەوە**. ئەرشیفکردن چاوەڕێ دەکات تا قاسەکەی قەرزی نەدراوی نەمێنێت. بەکارهێنەرێک کە هیچی تۆمار نەکردبێت دەتوانرێت بە یەکجاری **بسڕدرێتەوە**.'],
      ['While a staff user is archived their vault is closed: their documents and recurring expenses can\'t be changed or resumed until the owner restores them.', 'تا کاتێک کارمەندێک ئەرشیف کراوە قاسەکەی داخراوە: بەڵگەکانی و خەرجییە دووبارەبووەکانی ناگۆڕدرێن و دەست پێناکەنەوە تا خاوەن دەیگەڕێنێتەوە.'],
      ['Unpaid dues are paid only from the vault they belong to, by its holder: staff pay their own, the owner pays the main vault\'s.', 'قەرزی نەدراو تەنها لەو قاسەیەوە دەدرێت کە هی ئەوە، لەلایەن خاوەنەکەیەوە: کارمەند هی خۆی دەدات، خاوەن هی قاسەی سەرەکی.'],
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
    version: '2.3',
    date: '2026-11-09',
    items: [
      { type: 'added', text: ['Expenses record a time as well as a date. The expense form puts the amount first, with its currency (which is also the vault that pays) beside it.', 'خەرجی کاتیش وەک ڕێکەوت تۆمار دەکات. فۆرمی خەرجی بڕی پارە یەکەم دادەنێت، و دراوەکەی (کە هەمان ئەو قاسەیەیە کە دەیدات) لە تەنیشتیەتی.'] },
    ],
  },
  {
    version: '2.2',
    date: '2026-11-09',
    items: [
      { type: 'added', text: ['Employees page: monthly employees are paid automatically from the USD vault, daily workers by days worked. Salaries are in USD (SAL documents); a short vault leaves an unpaid salary.', 'پەڕەی کارمەندان: کارمەندی مانگانە خۆکار لە قاسەی دۆلار مووچەی دەدرێت، کرێکاری ڕۆژانە بەپێی ڕۆژانی کار. مووچە بە دۆلارە (بەڵگەی SAL)؛ قاسەی کەم مووچەی نەدراو دەهێڵێتەوە.'] },
      { type: 'changed', text: ['Profit now subtracts expenses and salaries: profit = total sales − (aluminium sold + expenses + salaries). The P&L report shows them per month.', 'قازانج ئێستا خەرجی و مووچە کەم دەکاتەوە: قازانج = کۆی فرۆشتن − (ئەلەمنیۆمی فرۆشراو + خەرجی + مووچە). ڕاپۆرتی قازانج و زیان بۆ هەر مانگێک پیشانیان دەدات.'] },
      { type: 'added', text: ['Dashboard: total sales, total cost, profit, factory worth (stock counted at cost), what you owe and stock value.', 'داشبۆرد: کۆی فرۆشتن، کۆی تێچوو، قازانج، بەهای کارگە (کۆگا بە نرخی کڕین)، قەرزی تۆ و بەهای کۆگا.'] },
      { type: 'removed', text: ['Net position, profit on paper and cash profit on the dashboard (replaced by factory worth and profit).', 'دۆخی پوخت، قازانج لەسەر کاغەز و قازانجی کاش لە داشبۆرد (لە جیاتیان بەهای کارگە و قازانج).'] },
      { type: 'changed', text: ['P&L cash flow now counts cash paid for expenses and salaries.', 'ڕەوتی پارەی ڕاپۆرتی قازانج و زیان ئێستا پارەی دراو بۆ خەرجی و مووچە دەژمێرێت.'] },
    ],
  },
  {
    version: '2.1',
    date: '2026-11-08',
    items: [
      { type: 'added', text: ['Vault → Unpaid dues now lists beneficiary dues (what the factory owes each beneficiary), with Pay.', 'قاسە ← قەرزە نەدراوەکان ئێستا قەرزی دابینکەرانیش پیشان دەدات (ئەوەی کارگە قەرزاری هەر دابینکەرێکە)، لەگەڵ «بدە».'] },
    ],
  },
  {
    version: '2.0',
    date: '2026-11-08',
    items: [
      { type: 'changed', text: ['Every staff user now has their own vault, and everything they record moves that vault — never the main vault.', 'هەر کارمەندێک ئێستا قاسەی خۆی هەیە، و هەموو ئەوەی تۆماری دەکات ئەو قاسەیە دەجووڵێنێت — هەرگیز قاسەی سەرەکی نا.'] },
      { type: 'added', text: ['Owner: give money to a staff vault and take it back (Vault → Staff vaults).', 'خاوەن: پارەدان بە قاسەی کارمەند و وەرگرتنەوەی (قاسە → قاسەی کارمەندان).'] },
      { type: 'changed', text: ['Staff see only their own documents unless the owner switches on “Also see everyone’s activity” for a page.', 'کارمەند تەنها بەڵگەکانی خۆی دەبینێت مەگەر خاوەن «چالاکیی هەمووان ببینە» بۆ پەڕەیەک چالاک بکات.'] },
      { type: 'added', text: ['Staff activity notifications for the owner, cleared with “I get it”.', 'ئاگادارکردنەوەی چالاکیی کارمەندان بۆ خاوەن، بە «تێگەیشتم» لادەچن.'] },
      { type: 'added', text: ['Archive, restore and delete staff users.', 'ئەرشیفکردن، گەڕاندنەوە و سڕینەوەی کارمەندان.'] },
      { type: 'added', text: ['Money position on the dashboard and vault: what you owe, what you are owed, unpaid dues, and profit on paper vs cash profit.', 'دۆخی پارە لە داشبۆرد و قاسە: قەرزی تۆ، قەرزی خەڵک لات، قەرزی نەدراو، و قازانج لەسەر کاغەز بەرامبەر قازانجی کاش.'] },
      { type: 'changed', text: ['Staff get their own dashboard; profit and the P&L report are owner only.', 'کارمەند داشبۆردی تایبەتی خۆی هەیە؛ قازانج و ڕاپۆرتی قازانج و زیان تەنها بۆ خاوەنن.'] },
    ],
  },
  {
    version: '1.9',
    date: '2026-11-06',
    items: [
      { type: 'added', text: ['Several inventories: stock is kept per inventory, and every purchase, sale and processing run picks one.', 'چەند کۆگایەک: کاڵا بۆ هەر کۆگایەک جیا هەڵدەگیرێت، و هەر کڕین، فرۆشتن و پرۆسێسێک یەکێکیان هەڵدەبژێرێت.'] },
      { type: 'added', text: ['Transfer stock between inventories (STR), at average cost, with no money moving.', 'گواستنەوەی کاڵا لە نێوان کۆگاکان (STR)، بە تێکڕای تێچوو، بەبێ جووڵەی پارە.'] },
      { type: 'added', text: ['Monthly rent per inventory, paid as an expense from a vault.', 'کرێی مانگانە بۆ هەر کۆگایەک، وەک خەرجی لە قاسەیەک دەدرێت.'] },
      { type: 'added', text: ['Personal staff vaults, funded by the owner from the main vault.', 'قاسەی کەسی کارمەندان، کە خاوەن لە قاسەی سەرەکییەوە پارەی تێدەکات.'] },
      { type: 'added', text: ['Expenses can be limited to a staff user\'s own records.', 'خەرجییەکان دەتوانرێن سنووردار بکرێن بۆ تەنها تۆمارەکانی خۆی کارمەند.'] },
    ],
  },
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
