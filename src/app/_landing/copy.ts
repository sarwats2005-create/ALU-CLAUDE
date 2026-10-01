import type { Lang } from '@/lib/i18n';

// Public landing page copy. Kept apart from the app dictionary because only visitors see it.
const en = {
  signIn: 'Staff sign in',
  signInShort: 'Sign in',
  headline: 'Aluminum by the kilo, straight from the factory floor.',
  lead: 'Raw aluminum and finished products, weighed in front of you and invoiced on the spot. Pay in US dollars or Iraqi dinars.',
  call: 'Call the factory',
  directions: 'Get directions',
  extrusionLabel: 'An aluminum profile being extruded',
  sellTitle: 'What we sell',
  rawTitle: 'Raw aluminum',
  rawText: 'Bought in bulk and stocked by type, ready to weigh out in any quantity you need.',
  finishedTitle: 'Finished products',
  finishedText: 'Processed in our own factory and sold by weight, the same way as raw stock.',
  typesTitle: 'Types we carry',
  stepsTitle: 'How buying works',
  steps: [
    ['Tell us the type and weight', 'Ask for a type by name, or describe what you are making and we will point you to the right one.'],
    ['We weigh it in front of you', 'Every sale is by the kilogram, so you pay for exactly what you take.'],
    ['Pay your way', 'Cash in dollars or dinars. Regular customers can pay part now and keep the rest on account.'],
    ['Take your invoice', 'Every order gets a numbered, printed invoice, in English or Kurdish.'],
  ] as [string, string][],
  visitTitle: 'Visit or call',
  address: 'Address',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  openMap: 'Open in Maps',
  rights: 'All rights reserved.',
};

const ku: typeof en = {
  signIn: 'چوونەژوورەوەی کارمەندان',
  signInShort: 'چوونەژوورەوە',
  headline: 'ئەلەمنیۆم بە کیلۆ، ڕاستەوخۆ لە کارگەوە.',
  lead: 'ئەلەمنیۆمی خاو و بەرهەمی ئامادە، لەبەردەمتدا دەکێشرێت و یەکسەر پسوولەت بۆ دەبڕدرێت. بە دۆلاری ئەمریکی یان دیناری عێراقی پارە بدە.',
  call: 'پەیوەندی بە کارگەوە بکە',
  directions: 'ڕێگای گەیشتن',
  extrusionLabel: 'پرۆفایلێکی ئەلەمنیۆم لە کاتی دەرهێنان',
  sellTitle: 'ئەوەی دەیفرۆشین',
  rawTitle: 'ئەلەمنیۆمی خاو',
  rawText: 'بە بڕی زۆر دەکڕدرێت و بەپێی جۆر هەڵدەگیرێت، ئامادەیە بۆ کێشان بە هەر بڕێک کە پێویستت بێت.',
  finishedTitle: 'بەرهەمی ئامادە',
  finishedText: 'لە کارگەی خۆماندا ئامادە دەکرێن و وەک کاڵای خاو بە کێش دەفرۆشرێن.',
  typesTitle: 'ئەو جۆرانەی هەمانە',
  stepsTitle: 'چۆن دەکڕیت',
  steps: [
    ['جۆر و کێشەکەمان پێ بڵێ', 'ناوی جۆرەکە بڵێ، یان باسی ئەوە بکە کە دروستی دەکەیت و ئێمە جۆری گونجاوت پێ دەڵێین.'],
    ['لەبەردەمتدا دەیکێشین', 'هەموو فرۆشتنێک بە کیلۆگرامە، بۆیە تەنها پارەی ئەوە دەدەیت کە دەیبەیت.'],
    ['بە شێوازی خۆت پارە بدە', 'کاش بە دۆلار یان دینار. کڕیارە بەردەوامەکان دەتوانن بەشێکی ئێستا بدەن و ئەوەی ماوە لەسەر حسابیان بمێنێتەوە.'],
    ['پسوولەکەت وەربگرە', 'هەموو داواکارییەک پسوولەیەکی ژمارەدار و چاپکراوی هەیە، بە ئینگلیزی یان کوردی.'],
  ],
  visitTitle: 'سەردانمان بکە یان پەیوەندیمان پێوە بکە',
  address: 'ناونیشان',
  phone: 'تەلەفۆن',
  whatsapp: 'واتسئاپ',
  openMap: 'لە نەخشەدا بیکەرەوە',
  rights: 'هەموو مافەکان پارێزراون.',
};

export type LandingCopy = typeof en;
export const landingCopy = (lang: Lang): LandingCopy => (lang === 'ku' ? ku : en);
