'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { t as tr, type Lang } from '@/lib/i18n';
import { api } from '@/lib/client/api';
import { Logo } from '@/components/Logo';
import { Button, Field, Input, Segmented } from '@/components/ui';

export function LoginForm({ lang, needsSetup, expired }: { lang: Lang; needsSetup: boolean; expired: boolean }) {
  const router = useRouter();
  const t = (k: Parameters<typeof tr>[0]) => tr(k, lang);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(expired ? t('auth.sessionExpired') : null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [switching, setSwitching] = useState(false);

  async function switchLang(next: Lang) {
    if (next === lang) return;
    setSwitching(true);
    await api('/api/auth/lang', { method: 'PUT', body: { lang: next } });
    router.refresh();
    setSwitching(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const res = await api<{ redirect: string }>(needsSetup ? '/api/auth/setup' : '/api/auth/login', {
      method: 'POST',
      body: needsSetup ? { name, email, password } : { email, password },
    });
    if (res.ok) {
      window.location.href = res.data.redirect || '/dashboard';
      return;
    }
    setBusy(false);
    setError(res.error);
    setFieldErrors(res.fieldErrors ?? {});
  }

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-brand px-4 py-16">
      {/* Blue poster background with large, low-opacity shapes (decoration only). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <span className="absolute -end-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-white/[0.08]" />
        <span className="absolute -bottom-24 -start-24 h-72 w-72 rotate-45 bg-white/[0.07]" />
        <span className="absolute bottom-16 end-[12%] h-40 w-40 rounded-full border-[28px] border-white/[0.08]" />
      </div>
      <div className="absolute right-4 top-4 z-10" dir="ltr">
        <Segmented<Lang>
          label={t('nav.language')}
          size="sm"
          value={lang}
          onChange={switchLang}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'ku', label: <span lang="ckb">کوردی</span> },
          ]}
        />
      </div>

      <div className="w-full max-w-[400px]" aria-busy={switching || undefined}>
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={76} />
          <p className="mt-4 text-large font-extrabold tracking-[0.04em] text-white" dir="ltr">
            ALU FACTORY
          </p>
          <p className="mt-1 text-body font-medium text-white">{t('app.tagline')}</p>
        </div>

        <form onSubmit={submit} noValidate className="rounded-card bg-surface p-6 md:p-7">
          <h1 className="text-heading font-extrabold text-ink">{needsSetup ? t('auth.setupTitle') : t('auth.title')}</h1>
          {needsSetup ? <p className="mt-1.5 text-meta text-muted">{t('auth.setupBody')}</p> : null}

          {error ? (
            <div role="alert" className="mt-4 rounded-ctl bg-danger-tint px-3 py-2.5 text-meta font-medium text-danger-ink">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-4">
            {needsSetup ? (
              <Field label={t('common.fullName')} htmlFor="name" error={fieldErrors.name} required>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" invalid={!!fieldErrors.name} required />
              </Field>
            ) : null}
            <Field label={t('common.email')} htmlFor="email" error={fieldErrors.email} required>
              <Input
                id="email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete={needsSetup ? 'email' : 'username'}
                invalid={!!fieldErrors.email}
                required
                autoFocus
              />
            </Field>
            <Field label={t('common.password')} htmlFor="password" error={fieldErrors.password} hint={needsSetup ? t('auth.passwordMin') : undefined} required>
              <Input
                id="password"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                invalid={!!fieldErrors.password}
                required
              />
            </Field>
          </div>

          <Button type="submit" block size="lg" busy={busy} className="mt-6">
            {busy ? t('auth.signingIn') : needsSetup ? t('auth.createOwner') : t('auth.signIn')}
          </Button>
        </form>
      </div>
    </main>
  );
}
