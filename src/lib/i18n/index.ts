import { dict, type DictKey } from './dict';

export type Lang = 'en' | 'ku';
export type { DictKey };
export const LANGS: Lang[] = ['en', 'ku'];
export const isRtl = (lang: Lang) => lang === 'ku';
export const dirOf = (lang: Lang) => (isRtl(lang) ? 'rtl' : 'ltr');

export type Params = Record<string, string | number>;

/** t(key, lang, params) — the single translation entry point for UI, API messages and documents. */
export function t(key: DictKey, lang: Lang, params?: Params): string {
  const entry = dict[key];
  let s: string = entry ? entry[lang === 'ku' ? 1 : 0] : String(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      // "@@some.key" params are themselves translated (e.g. the verb inside a blocked-delete message).
      const val = typeof v === 'string' && v.startsWith('@@') && hasKey(v.slice(2)) ? t(v.slice(2) as DictKey, lang) : String(v);
      s = s.split(`{${k}}`).join(val);
    }
  }
  return s;
}

export function hasKey(key: string): key is DictKey {
  return Object.prototype.hasOwnProperty.call(dict, key);
}

export function parseLang(v: unknown): Lang {
  return v === 'ku' ? 'ku' : 'en';
}
