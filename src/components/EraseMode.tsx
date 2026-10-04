'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Eraser, KeyRound, LogOut, ShieldAlert } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { Dialog } from './Dialog';
import { Button, Field, Input } from './ui';
import { useToast } from './Toast';

// Owner-only ERASE MODE. Hidden: Ctrl+Alt+R opens the PIN prompt (nothing happens for anyone else).
// The server keeps the mode on this browser session for 10 minutes; reloading the page turns it off.
// While it's on, a red frame + bar show it, and these appear: "Erase permanently" on transactions,
// "Erase account" on customers, and select/erase on audit-log lines.

type Ctx = {
  active: boolean;
  eraseTxn: (id: string, number: string) => Promise<boolean>;
  eraseCustomer: (id: string, name: string) => Promise<boolean>;
  eraseAudit: (ids: number[]) => Promise<boolean>;
};
const EraseCtx = createContext<Ctx>({ active: false, eraseTxn: async () => false, eraseCustomer: async () => false, eraseAudit: async () => false });
export const useErase = () => useContext(EraseCtx);

type Ask = { title: string; body: string; resolve: (ok: boolean) => void };

export function EraseProvider({ children }: { children: ReactNode }) {
  const { t, user, bump, dataVersion } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pinOpen, setPinOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [voided, setVoided] = useState(0);
  const active = until !== null && until > now;

  // A reload (or first load) always starts with erase mode off.
  useEffect(() => {
    if (user.isOwner) void api('/api/erase', { method: 'POST', body: { action: 'exit' }, quiet: true });
  }, [user.isOwner]);

  // Ctrl+Alt+R — owner only. e.code so it works on every keyboard layout.
  useEffect(() => {
    if (!user.isOwner) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && e.code === 'KeyR') {
        e.preventDefault();
        if (!active) setPinOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user.isOwner, active]);

  // Countdown; when it runs out the server has already stopped accepting erases.
  const wasActive = useRef(false);
  useEffect(() => {
    if (until === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  useEffect(() => {
    if (wasActive.current && !active) {
      setUntil(null);
      toast.success(t('erase.ended'));
    }
    wasActive.current = active;
  }, [active, t, toast]);

  // Voided-transaction count for the bar.
  useEffect(() => {
    if (!active) return;
    void api<{ voided: number }>('/api/erase').then((r) => r.ok && setVoided(r.data.voided));
  }, [active, dataVersion]);

  const confirm = useCallback((title: string, body: string) => new Promise<boolean>((resolve) => setAsk({ title, body, resolve })), []);

  const run = useCallback(
    async <T,>(path: string, method: 'DELETE' | 'POST', body: unknown, done: (d: T) => string) => {
      setBusy(true);
      const r = await api<T>(path, { method, body });
      setBusy(false);
      setAsk(null);
      if (!r.ok) {
        toast.error(r.error);
        if (r.code === 'erase.off') setUntil(null);
        return false;
      }
      toast.success(done(r.data));
      bump();
      router.refresh();
      return true;
    },
    [bump, router, toast],
  );

  const eraseTxn = useCallback(
    async (id: string, number: string) => {
      if (!(await confirm(t('erase.txnTitle', { number }), t('erase.txnBody', { number })))) return false;
      const ok = await run<{ number: string }>(`/api/erase/txns/${id}`, 'DELETE', undefined, (d) => t('erase.txnDone', { number: d.number }));
      if (ok) window.dispatchEvent(new CustomEvent('alu:txn-deleted', { detail: { id } }));
      return ok;
    },
    [confirm, run, t],
  );
  const eraseCustomer = useCallback(
    async (id: string, name: string) => {
      if (!(await confirm(t('erase.custTitle', { name }), t('erase.custBody')))) return false;
      return run<{ name: string; count: number }>(`/api/erase/customers/${id}`, 'DELETE', undefined, (d) => t('erase.custDone', { name: d.name, n: d.count }));
    },
    [confirm, run, t],
  );
  const eraseAudit = useCallback(
    async (ids: number[]) => {
      if (!ids.length || !(await confirm(t('erase.auditTitle', { n: ids.length }), t('erase.auditBody')))) return false;
      return run<{ count: number }>('/api/erase/audit', 'POST', { ids }, (d) => t('erase.auditDone', { n: d.count }));
    },
    [confirm, run, t],
  );
  async function eraseVoided() {
    if (!(await confirm(t('erase.voidedTitle'), t('erase.voidedBody', { n: voided })))) return;
    await run<{ count: number }>('/api/erase/voided', 'DELETE', undefined, (d) => t('erase.voidedDone', { n: d.count }));
  }
  async function exit() {
    await api('/api/erase', { method: 'POST', body: { action: 'exit' } });
    setUntil(null);
    wasActive.current = false;
    bump();
  }

  const left = active ? Math.max(0, Math.ceil((until! - now) / 1000)) : 0;
  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return (
    <EraseCtx.Provider value={{ active, eraseTxn, eraseCustomer, eraseAudit }}>
      {children}

      {active ? (
        <>
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[45] border-4 border-danger" />
          <div
            role="status"
            className="fixed inset-x-4 top-[64px] z-[46] mx-auto flex max-w-max flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-card bg-danger px-4 py-2 text-meta font-semibold text-white shadow-pop md:top-auto md:bottom-6"
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('erase.bar')}
            </span>
            <span className="num rounded-full bg-white/20 px-2 py-0.5">{t('erase.left', { time })}</span>
            {voided > 0 ? (
              <button type="button" onClick={eraseVoided} className="inline-flex items-center gap-1 rounded-ctl px-2 py-1 hover:bg-white/15">
                <Eraser className="h-4 w-4" aria-hidden="true" />
                {t('erase.voided', { n: voided })}
              </button>
            ) : null}
            <button type="button" onClick={() => setChangeOpen(true)} className="inline-flex items-center gap-1 rounded-ctl px-2 py-1 hover:bg-white/15">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {t('erase.changePin')}
            </button>
            <button type="button" onClick={exit} className="inline-flex items-center gap-1 rounded-ctl bg-white px-2.5 py-1 text-danger-ink hover:bg-white/90">
              <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              {t('erase.exit')}
            </button>
          </div>
        </>
      ) : null}

      {user.isOwner ? (
        <>
          <PinDialog
            open={pinOpen}
            title={t('erase.enterTitle')}
            hint={t('erase.enterHint')}
            label={t('erase.pin')}
            submit={t('erase.enter')}
            onClose={() => setPinOpen(false)}
            onSubmit={async (pin) => {
              const r = await api<{ until: string }>('/api/erase', { method: 'POST', body: { action: 'enter', pin } });
              if (!r.ok) return r.error;
              setNow(Date.now());
              setUntil(new Date(r.data.until).getTime());
              setPinOpen(false);
              bump();
              return null;
            }}
          />
          <PinDialog
            open={changeOpen}
            title={t('erase.changePin')}
            label={t('erase.newPin')}
            submit={t('common.save')}
            onClose={() => setChangeOpen(false)}
            onSubmit={async (pin) => {
              const r = await api('/api/erase/pin', { method: 'PUT', body: { pin } });
              if (!r.ok) return r.fieldErrors?.pin ?? r.error;
              setChangeOpen(false);
              toast.success(t('erase.pinSaved'));
              return null;
            }}
          />
        </>
      ) : null}

      <Dialog
        open={!!ask}
        onClose={() => !busy && ask?.resolve(false)}
        size="sm"
        title={ask?.title ?? ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => ask?.resolve(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => ask?.resolve(true)} busy={busy} icon={<Eraser className="h-4 w-4" aria-hidden="true" />}>
              {t('erase.confirm')}
            </Button>
          </>
        }
      >
        <p className="rounded-ctl border border-danger/30 bg-danger-tint px-4 py-3 text-body text-danger-ink">{ask?.body}</p>
      </Dialog>
    </EraseCtx.Provider>
  );
}

function PinDialog({
  open,
  title,
  hint,
  label,
  submit,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  hint?: string;
  label: string;
  submit: string;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<string | null>;
}) {
  const { t } = useApp();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPin('');
      setErr(null);
    }
  }, [open]);
  async function go(e: FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    const error = await onSubmit(pin);
    setBusy(false);
    if (error) {
      setErr(error);
      setPin('');
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={hint}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="erase-pin-form" variant="danger" busy={busy}>
            {submit}
          </Button>
        </>
      }
    >
      <form id="erase-pin-form" onSubmit={go} noValidate>
        <Field label={label} htmlFor="erase-pin" error={err ?? undefined}>
          <Input
            id="erase-pin"
            data-autofocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            invalid={!!err}
            className="num tracking-[0.4em]"
          />
        </Field>
      </form>
    </Dialog>
  );
}
