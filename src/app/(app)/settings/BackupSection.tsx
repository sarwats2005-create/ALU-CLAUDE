'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, CalendarClock, Database, Eraser, FileDown, FileSpreadsheet, FolderCheck, FolderOpen, History, RotateCcw, Save, ShieldAlert, Upload } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { api, qs } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { downloadFile } from '@/lib/client/print';
import { fmtDateTime } from '@/lib/dates';
import { cx } from '@/lib/cx';
import type { DictKey } from '@/lib/i18n';
import { BACKUP_EVENT, backupFolderState, chooseBackupFolder, saveBackupNow, stopWeeklyBackup, type BackupFolderState } from '@/lib/client/backup-folder';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import { Dialog } from '@/components/Dialog';
import { SummaryCell, SummaryStrip } from '@/components/Summary';
import { useToast } from '@/components/Toast';
import { useErase } from '@/components/EraseMode';

type Counts = Record<string, number>;
type Snap = { id: string; kind: string; createdAt: string; createdByName: string; sizeBytes: number; counts: Counts };
type Source = { kind: 'file'; name: string; file: { exportedAt: string; counts: Counts } & Record<string, unknown> } | { kind: 'snapshot'; snap: Snap };

const KIND_LABEL: Record<string, DictKey> = { daily: 'bk.kDaily', 'before-restore': 'bk.kBeforeRestore', 'before-reset': 'bk.kBeforeReset', manual: 'bk.kManual' };
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const WEEK = 7 * 24 * 3600 * 1000;

/** Settings → Data: backups, weekly folder copy, restore points, restore from a file, start fresh. Owner only. */
export function BackupSection() {
  const { t } = useApp();
  const toast = useToast();
  const snaps = useRemote<{ rows: Snap[] }>('/api/settings/backup/snapshots');
  const erase = useErase();
  const [folder, setFolder] = useState<BackupFolderState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [restore, setRestore] = useState<Source | null>(null);
  const [fresh, setFresh] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () => void backupFolderState().then(setFolder);
    load();
    window.addEventListener(BACKUP_EVENT, load);
    return () => window.removeEventListener(BACKUP_EVENT, load);
  }, []);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch {
      toast.error(t('bk.folderFailed'));
    } finally {
      setBusy(null);
    }
  }
  const dl = (format: 'json' | 'xlsx') =>
    run(format, async () => {
      const r = await downloadFile(`/api/settings/export${qs({ format })}`, `alu-factory.${format}`);
      if (r.ok) toast.success(t('toast.exported'));
      else toast.error(r.error || t('err.generic'));
    });

  async function pickFile(f: File | undefined) {
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (parsed?.app !== 'ALU FACTORY' || typeof parsed?.exportedAt !== 'string') return toast.error(t('bk.notBackup'));
      if (parsed.format !== 2) return toast.error(t('bk.oldFormat'));
      setRestore({ kind: 'file', name: f.name, file: parsed });
    } catch {
      toast.error(t('bk.notBackup'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const rows = snaps.data?.rows ?? [];
  const lastSnap = rows[0];
  // Space the restore points take in the database (compressed copies; the oldest are removed automatically).
  const totalBytes = rows.reduce((n, r) => n + r.sizeBytes, 0);
  const nextWeekly = folder?.name ? (folder.last ? new Date(new Date(folder.last).getTime() + WEEK) : new Date()) : null;
  const needsAccess = !!folder?.name && folder.permission !== 'granted';

  return (
    <div className="flex flex-col gap-5">
      {/* At a glance: is my data safe? */}
      <SummaryStrip cols={3}>
        <SummaryCell
          icon={folder?.last ? <FolderCheck className="h-[18px] w-[18px]" aria-hidden="true" /> : <FolderOpen className="h-[18px] w-[18px]" aria-hidden="true" />}
          label={t('bk.lastFolder')}
          value={<span className="text-title md:text-heading">{folder?.last ? fmtDateTime(folder.last) : t('bk.never')}</span>}
          sub={folder?.lastFile ?? (folder?.name ? folder.name : t('bk.noFolder'))}
          alert={!folder?.name || needsAccess}
        />
        <SummaryCell
          icon={<CalendarClock className="h-[18px] w-[18px]" aria-hidden="true" />}
          label={t('bk.nextWeekly')}
          value={<span className="text-title md:text-heading">{nextWeekly ? fmtDateTime(nextWeekly.toISOString()) : '—'}</span>}
          sub={nextWeekly ? t('bk.whenOpen') : t('bk.chooseFirst')}
        />
        <SummaryCell
          icon={<History className="h-[18px] w-[18px]" aria-hidden="true" />}
          label={t('bk.points')}
          value={<span className="text-title md:text-heading">{String(rows.length)}</span>}
          sub={lastSnap ? t('bk.pointsSize', { size: size(totalBytes), date: fmtDateTime(lastSnap.createdAt) }) : t('bk.firstToday')}
        />
      </SummaryStrip>

      {/* 1. Weekly copy on this computer */}
      <Block icon={<FolderOpen className="h-5 w-5" aria-hidden="true" />} title={t('bk.weeklyTitle')} hint={t('bk.weeklyHint')}>
        {!folder?.supported ? (
          <p className="rounded-ctl bg-warning-tint px-4 py-3 text-meta text-warning-ink">{t('bk.unsupported')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className={cx('rounded-ctl px-4 py-3 text-meta', needsAccess ? 'bg-warning-tint text-warning-ink' : folder.name ? 'bg-success-tint text-success-ink' : 'bg-tint text-ink')}>
              {needsAccess ? t('bk.needsAccess', { name: folder.name! }) : folder.name ? t('bk.folderOn', { name: folder.name }) : t('bk.folderNone')}
            </p>
            <div className="flex flex-wrap gap-2">
              {needsAccess ? (
                <Button busy={busy === 'save'} onClick={() => run('save', async () => toast.success(t('bk.saved', { file: await saveBackupNow() })))} icon={<FolderCheck className="h-4 w-4" aria-hidden="true" />}>
                  {t('bk.allow')}
                </Button>
              ) : null}
              <Button
                variant={folder.name ? 'secondary' : 'primary'}
                busy={busy === 'choose'}
                onClick={() =>
                  run('choose', async () => {
                    const file = await chooseBackupFolder();
                    if (file) toast.success(t('bk.saved', { file }));
                  })
                }
                icon={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
              >
                {folder.name ? t('bk.changeFolder') : t('bk.chooseFolder')}
              </Button>
              {folder.name && !needsAccess ? (
                <Button variant="secondary" busy={busy === 'save'} onClick={() => run('save', async () => toast.success(t('bk.saved', { file: await saveBackupNow() })))} icon={<Save className="h-4 w-4" aria-hidden="true" />}>
                  {t('bk.saveNow')}
                </Button>
              ) : null}
              {folder.name ? (
                <Button variant="quiet" onClick={() => run('stop', async () => stopWeeklyBackup())}>
                  {t('bk.stop')}
                </Button>
              ) : null}
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
          <span className="me-1 text-meta text-muted">{t('bk.downloadNow')}</span>
          <Button variant="secondary" size="sm" busy={busy === 'json'} onClick={() => dl('json')} icon={<FileDown className="h-4 w-4" aria-hidden="true" />}>
            {t('set.exportJson')}
          </Button>
          <Button variant="secondary" size="sm" busy={busy === 'xlsx'} onClick={() => dl('xlsx')} icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}>
            {t('set.exportExcel')}
          </Button>
        </div>
      </Block>

      {/* 2. Restore */}
      <Block
        icon={<RotateCcw className="h-5 w-5" aria-hidden="true" />}
        title={t('bk.restoreTitle')}
        hint={t('bk.restoreHint')}
        action={
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} onChange={(e) => void pickFile(e.target.files?.[0])} />
            <Button onClick={() => fileRef.current?.click()} icon={<Upload className="h-4 w-4" aria-hidden="true" />}>
              {t('bk.fromFile')}
            </Button>
          </>
        }
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-body font-semibold text-ink">
            {t('bk.pointsTitle')}
            {rows.length ? <span className="num ms-2 text-caption font-normal text-muted">{t('bk.pointsTotal', { n: rows.length, size: size(totalBytes) })}</span> : null}
          </h3>
          <span className="flex flex-wrap gap-1">
            {/* Erase mode only: remove restore points from the database for good. */}
            {erase.active && rows.length ? (
              <Button variant="danger" size="sm" onClick={() => void erase.eraseSnapshots().then((ok) => ok && snaps.reload())} icon={<Eraser className="h-4 w-4" aria-hidden="true" />}>
                {t('erase.snapsAll')}
              </Button>
            ) : null}
            <Button
            variant="quiet"
            size="sm"
            busy={busy === 'snap'}
            onClick={() =>
              run('snap', async () => {
                const r = await api('/api/settings/backup/snapshots', { method: 'POST' });
                if (!r.ok) return toast.error(r.error);
                toast.success(t('bk.pointSaved'));
                snaps.reload();
              })
            }
            icon={<Database className="h-4 w-4" aria-hidden="true" />}
          >
            {t('bk.saveSnap')}
            </Button>
          </span>
        </div>
        {!rows.length ? (
          <p className="rounded-ctl bg-surface-2 px-4 py-6 text-center text-meta text-muted">{t('bk.noPoints')}</p>
        ) : (
          <ul className="divide-y divide-line-soft rounded-ctl border border-line-soft">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="num text-body font-semibold text-ink">{fmtDateTime(s.createdAt)}</span>
                    {s.kind === 'daily' ? <span className="text-caption text-muted">{t(KIND_LABEL[s.kind])}</span> : <Badge tone={s.kind === 'manual' ? 'brand' : 'warning'}>{t(KIND_LABEL[s.kind] ?? 'bk.kManual')}</Badge>}
                  </span>
                  <span className="mt-0.5 block text-caption text-muted">{t('bk.countsLine', { txn: s.counts.txn ?? 0, cust: s.counts.customer ?? 0, prod: s.counts.product ?? 0, size: size(s.sizeBytes) })}</span>
                </span>
                <span className="flex gap-1">
                  <Button variant="quiet" size="sm" onClick={() => void downloadFile(`/api/settings/backup/snapshots/${s.id}`, `alu-factory-backup.json`)} icon={<FileDown className="h-4 w-4" aria-hidden="true" />}>
                    {t('bk.download')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setRestore({ kind: 'snapshot', snap: s })} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
                    {t('bk.restore')}
                  </Button>
                  {erase.active ? (
                    <button
                      type="button"
                      onClick={() => void erase.eraseSnapshots(s.id).then((ok) => ok && snaps.reload())}
                      aria-label={t('erase.snap')}
                      title={t('erase.snap')}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-ctl text-danger-ink transition-colors hover:bg-danger-tint"
                    >
                      <Eraser className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-caption text-muted">{t('bk.pointsNote')}</p>
      </Block>

      {/* 3. Danger zone — last on the page, red only here (Von Restorff). */}
      <Card className="border-danger/40 p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-title font-semibold text-ink">{t('bk.freshTitle')}</h2>
              <p className="mt-1 max-w-2xl text-meta text-muted">{t('bk.freshHint')}</p>
            </div>
          </div>
          <Button variant="danger" onClick={() => setFresh(true)} className="shrink-0" icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}>
            {t('bk.freshBtn')}
          </Button>
        </div>
      </Card>

      {restore ? <RestoreDialog source={restore} onClose={() => setRestore(null)} /> : null}
      <FreshDialog open={fresh} onClose={() => setFresh(false)} />
    </div>
  );
}

function Block({ icon, title, hint, action, children }: { icon: ReactNode; title: string; hint: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5 md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint text-brand-ink">{icon}</span>
          <div>
            <h2 className="text-title font-semibold text-ink">{title}</h2>
            <p className="mt-1 max-w-2xl text-meta text-muted">{hint}</p>
          </div>
        </div>
        {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

const SHOWN = ['txn', 'customer', 'beneficiary', 'product', 'expenseCategory', 'user'] as const;
const SHOWN_LABEL: Record<(typeof SHOWN)[number], DictKey> = {
  txn: 'bk.cTxn',
  customer: 'nav.customers',
  beneficiary: 'nav.beneficiaries',
  product: 'set.products',
  expenseCategory: 'bk.cCategories',
  user: 'bk.cUsers',
};

function PinField({ pin, setPin, error }: { pin: string; setPin: (v: string) => void; error?: string | null }) {
  const { t } = useApp();
  return (
    <Field label={t('bk.masterPin')} htmlFor="bk-pin" error={error ?? undefined} required>
      <Input
        id="bk-pin"
        data-autofocus
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        invalid={!!error}
        className="num tracking-[0.4em]"
      />
    </Field>
  );
}

function RestoreDialog({ source, onClose }: { source: Source; onClose: () => void }) {
  const { t } = useApp();
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = source.kind === 'file' ? source.file.counts : source.snap.counts;
  const when = source.kind === 'file' ? source.file.exportedAt : source.snap.createdAt;

  async function go(e: FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    const r = await api<{ exportedAt: string }>('/api/settings/backup/restore', {
      method: 'POST',
      body: source.kind === 'file' ? { pin, file: source.file } : { pin, snapshotId: source.snap.id },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      setPin('');
      return;
    }
    toast.success(t('bk.restored', { date: fmtDateTime(r.data.exportedAt) }));
    window.setTimeout(() => (window.location.href = '/dashboard'), 900);
  }

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      size="md"
      title={t('bk.confirmTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="bk-restore" variant="danger" busy={busy} disabled={!pin} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
            {t('bk.restoreNow')}
          </Button>
        </>
      }
    >
      <form id="bk-restore" onSubmit={go} noValidate className="flex flex-col gap-4">
        <div className="rounded-ctl border border-line-soft bg-surface-2 px-4 py-3">
          <p className="text-caption text-muted">{source.kind === 'file' ? source.name : t(KIND_LABEL[source.snap.kind] ?? 'bk.kManual')}</p>
          <p className="mt-0.5 text-body font-semibold text-ink">{t('bk.takenAt', { date: fmtDateTime(when) })}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {SHOWN.map((k) => (
              <div key={k} className="flex items-baseline justify-between gap-2 text-meta">
                <dt className="text-muted">{t(SHOWN_LABEL[k])}</dt>
                <dd className="num font-semibold text-ink">{counts[k] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p role="alert" className="rounded-ctl border border-danger/30 bg-danger-tint px-4 py-3 text-meta text-danger-ink">
          {t('bk.confirmBody')}
        </p>
        <PinField pin={pin} setPin={setPin} error={err} />
      </form>
    </Dialog>
  );
}

function FreshDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp();
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPin('');
      setSure(false);
      setErr(null);
    }
  }, [open]);

  async function go(e: FormEvent) {
    e.preventDefault();
    if (!pin || !sure) return;
    setBusy(true);
    const r = await api('/api/settings/backup/reset', { method: 'POST', body: { pin } });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      setPin('');
      return;
    }
    toast.success(t('bk.freshDone'));
    window.setTimeout(() => (window.location.href = '/dashboard'), 900);
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      size="md"
      title={t('bk.freshTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="bk-fresh" variant="danger" busy={busy} disabled={!pin || !sure} icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}>
            {t('bk.freshBtn')}
          </Button>
        </>
      }
    >
      <form id="bk-fresh" onSubmit={go} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-ctl border border-danger/30 bg-danger-tint px-4 py-3">
            <p className="text-meta font-semibold text-danger-ink">{t('bk.cleared')}</p>
            <p className="mt-1 text-caption text-danger-ink">{t('bk.clearedList')}</p>
          </div>
          <div className="rounded-ctl border border-success/30 bg-success-tint px-4 py-3">
            <p className="text-meta font-semibold text-success-ink">{t('bk.kept')}</p>
            <p className="mt-1 text-caption text-success-ink">{t('bk.keptList')}</p>
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-meta text-ink">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--danger)]" />
          {t('bk.understand')}
        </label>
        <PinField pin={pin} setPin={setPin} error={err} />
      </form>
    </Dialog>
  );
}
