'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { t as translate, type DictKey, type Lang, type Params } from '@/lib/i18n';
import { canAction, canPage, type Action, type Page } from '@/lib/permissions';

export type ClientUser = { id: string; name: string; email: string; isOwner: boolean; permissions: string[] };

type Ctx = {
  user: ClientUser;
  lang: Lang;
  rate: string;
  setRate: (r: string) => void;
  company: string;
  t: (key: DictKey, params?: Params) => string;
  can: (p: Page) => boolean;
  canDo: (a: Action) => boolean;
  /** Bumped after any create/edit/delete so dashboards, lists and charts refresh. */
  dataVersion: number;
  bump: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ user, lang, rate: initialRate, company, children }: { user: ClientUser; lang: Lang; rate: string; company: string; children: ReactNode }) {
  const [rate, setRate] = useState(initialRate);
  const [dataVersion, setDataVersion] = useState(0);
  const bump = useCallback(() => setDataVersion((v) => v + 1), []);
  const value = useMemo<Ctx>(
    () => ({
      user,
      lang,
      rate,
      setRate,
      company,
      t: (key, params) => translate(key, lang, params),
      can: (p) => canPage(user, p),
      canDo: (a) => canAction(user, a),
      dataVersion,
      bump,
    }),
    [user, lang, rate, company, dataVersion, bump],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

/** Translation hook usable inside and outside the signed-in shell (falls back to the document language). */
export function useT() {
  const c = useContext(AppCtx);
  const lang: Lang = c?.lang ?? (typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'ku' : 'en');
  return { t: (key: DictKey, params?: Params) => translate(key, lang, params), lang };
}
