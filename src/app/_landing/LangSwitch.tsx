'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/i18n';

export function LangSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function pick(next: Lang) {
    if (next === lang || busy) return;
    setBusy(true);
    await fetch('/api/auth/lang', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: next }) });
    router.refresh();
    setBusy(false);
  }
  return (
    <div className="lp-lang" dir="ltr" role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === 'en'} onClick={() => pick('en')} lang="en" aria-label="English">
        <span className="lp-long">English</span>
        <span className="lp-short">EN</span>
      </button>
      <button type="button" aria-pressed={lang === 'ku'} onClick={() => pick('ku')} lang="ckb">
        کوردی
      </button>
    </div>
  );
}
