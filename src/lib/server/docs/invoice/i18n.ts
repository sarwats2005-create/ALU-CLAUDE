import type { Lang } from '@/lib/i18n';

// Wording of the invoice design (English + Kurdish Sorani). App-wide words (vault names, stock states,
// "Previous balance" …) come from the app dictionary instead, so they stay identical to the screens.
export interface InvoiceDict {
  dir: 'ltr' | 'rtl';
  htmlLang: string;
  tagline: string;
  invoice: string;
  purchaseInvoice: string;
  issueDate: string;
  currency: string;
  exchangeRate: string;
  billTo: string;
  supplier: string;
  product: string;
  description: string;
  qty: string;
  unitPrice: string;
  rowTotal: string;
  totalWeight: string;
  notes: string;
  defaultNote: string;
  authorized: string;
  received: string;
  delivered: string;
  thanks: string;
  page: string;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;
  balanceToPay: string;
  overpaid: string;
  paidInFull: string;
  iqdEquivalent: string;
  usdEquivalent: string;
  rateNote: string;
  statusPaid: string;
  statusPartly: string;
  statusDue: string;
  deleted: string;
}

export const INVOICE_DICT: Record<Lang, InvoiceDict> = {
  en: {
    dir: 'ltr',
    htmlLang: 'en',
    tagline: 'Build, Trust, Quality over Quantity',
    invoice: 'Invoice',
    purchaseInvoice: 'Purchase invoice',
    issueDate: 'Issue date',
    currency: 'Currency',
    exchangeRate: 'Exchange rate',
    billTo: 'Bill to',
    supplier: 'Supplier',
    product: 'Product',
    description: 'Description',
    qty: 'Qty',
    unitPrice: 'Unit price',
    rowTotal: 'Total',
    totalWeight: 'Total weight',
    notes: 'Notes',
    defaultNote: 'Goods are weighed in front of the customer. Please quote the invoice number with every payment.',
    authorized: 'Authorized by Alu Factory',
    received: 'Received by customer',
    delivered: 'Delivered by supplier',
    thanks: 'Thank you for your business.',
    page: 'Page',
    grandTotal: 'Total',
    amountPaid: 'Amount paid',
    balanceDue: 'Balance due',
    balanceToPay: 'Still to pay',
    overpaid: 'Overpaid',
    paidInFull: 'Paid in full · Cash',
    iqdEquivalent: 'IQD equivalent',
    usdEquivalent: 'USD equivalent',
    rateNote: 'At the rate on the issue date',
    statusPaid: 'Paid · Cash',
    statusPartly: 'Partly paid',
    statusDue: 'Due',
    deleted: 'DELETED',
  },
  ku: {
    dir: 'rtl',
    htmlLang: 'ckb',
    tagline: 'بنیاتنان، متمانە، کوالیتی لە پێش چەندایەتی',
    invoice: 'پسوولە',
    purchaseInvoice: 'پسوولەی کڕین',
    issueDate: 'بەرواری دەرکردن',
    currency: 'دراو',
    exchangeRate: 'نرخی گۆڕینەوە',
    billTo: 'پسوولە بۆ',
    supplier: 'دابینکەر',
    product: 'کاڵا',
    description: 'وەسف',
    qty: 'بڕ',
    unitPrice: 'نرخی یەکە',
    rowTotal: 'کۆ',
    totalWeight: 'کۆی کێش',
    notes: 'تێبینی',
    defaultNote: 'کاڵاکە لە بەردەم کڕیار دەکێشرێت. تکایە ژمارەی پسوولە لەگەڵ هەر پارەدانێک بنووسە.',
    authorized: 'ئیمزای کارگە',
    received: 'ئیمزای وەرگر',
    delivered: 'ئیمزای دابینکەر',
    thanks: 'سوپاس بۆ مامەڵەکەت.',
    page: 'لاپەڕە',
    grandTotal: 'کۆی گشتی',
    amountPaid: 'بڕی پارەدراو',
    balanceDue: 'بڕی ماوە',
    balanceToPay: 'ماوە بۆ دان',
    overpaid: 'زیادە دراو',
    paidInFull: 'بە تەواوی پارەدراوە · کاش',
    iqdEquivalent: 'بەرامبەر بە دینار',
    usdEquivalent: 'بەرامبەر بە دۆلار',
    rateNote: 'بە نرخی بەرواری دەرکردن',
    statusPaid: 'پارەدراو · کاش',
    statusPartly: 'بەشێک پارەدراوە',
    statusDue: 'قەرز',
    deleted: 'سڕاوەتەوە',
  },
};
