'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, FileSpreadsheet, Pause, Pencil, Play, RotateCw, Trash2 } from 'lucide-react';
import type { TxnDetail } from '@/lib/server/q/history';
import type { ExpenseRow, ExpenseStats } from '@/lib/server/q/expenses';
import type { RuleRow } from '@/lib/server/expenses';
import { useApp } from '@/lib/client/app-context';
import { api, qs, type ApiResult } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { downloadFile } from '@/lib/client/print';
import { fmtDate } from '@/lib/dates';
import { D, fmtMoney, fmtNum, fmtPrice, type Cur } from '@/lib/money';
import type { DictKey } from '@/lib/i18n';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { DataTable, Pager, SearchBox, useListState, type Column } from '@/components/DataTable';
import { DateRange } from '@/components/DateInput';
import { Dialog } from '@/components/Dialog';
import { useTxnPanel } from '@/components/TxnPanel';
import { useToast } from '@/components/Toast';
import { useMoneyGuard } from '@/components/MoneyGuard';
import { ExpenseForm, type Category, type ExpensePayload, type VaultMode } from './ExpenseForm';
import { skipSummary } from './SkipDays';

type Overview = { posted: number; stats: ExpenseStats; rules: RuleRow[]; categories: Category[]; config: { vaultMode: VaultMode; pinRequired: boolean } };
type Pending = { payload: ExpensePayload; resolve: (r: { ok: boolean; fieldErrors?: Record<string, string> }) => void };

export function ExpensesView({ editId }: { editId: string | null }) {
  const { t, bump } = useApp();
  const toast = useToast();
  const guard = useMoneyGuard();
  const router = useRouter();
  const panel = useTxnPanel();
  const ov = useRemote<Overview>('/api/expenses/overview', { keepPrevious: true });
  const L = useListState('date', 'desc', { category: '', from: '', to: '' });
  const list = useRemote<{ total: number; rows: ExpenseRow[] }>(`/api/expenses${L.query}`, { keepPrevious: true });
  const [editing, setEditing] = useState<TxnDetail | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const [delRule, setDelRule] = useState<RuleRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const announced = useRef(0);

  // Recurring expenses posted while loading the page: tell the user once and refresh the list.
  useEffect(() => {
    const n = ov.data?.posted ?? 0;
    if (n > 0 && announced.current !== n) {
      announced.current = n;
      toast.success(t('exp.autoPosted', { n }));
      list.reload();
    }
  }, [ov.data?.posted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Edit link from elsewhere (/expenses?edit=…).
  useEffect(() => {
    if (editId) void startEdit(editId);
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startEdit(id: string) {
    const res = await api<TxnDetail>(`/api/txns/${id}`);
    if (!res.ok || res.data.kind !== 'EXPENSE' || res.data.deletedAt) return toast.error(res.ok ? t('err.notFound') : res.error);
    setEditing(res.data);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function cancelEdit() {
    setEditing(null);
    if (editId) router.replace('/expenses');
  }

  async function save(p: ExpensePayload, pin?: string): Promise<ApiResult<unknown>> {
    const res = editing
      ? await guard.send<{ id: string; number: string }>(`/api/expenses/${editing.id}`, { method: 'PUT', body: p })
      : await guard.send<{ id?: string; number?: string }>('/api/expenses', { method: 'POST', body: { ...p, pin } });
    if (!res.ok) {
      if (res.code === 'vault.shortCancelled') return res;
      // A wrong PIN is shown inside the PIN dialog; everything else as a toast.
      if (res.code !== 'exp.pinWrong' && res.code !== 'exp.pinLocked') toast.error(res.error);
      return res;
    }
    if (editing) {
      toast.success(t('exp.updated'));
      cancelEdit();
    } else toast.success(p.recurring ? t('exp.ruleCreated') : t('exp.recorded', { number: res.data.number ?? '' }));
    bump();
    return res;
  }

  /** New expenses and rules go through the PIN dialog when a PIN is set; edits never do. */
  function onSubmit(p: ExpensePayload): Promise<{ ok: boolean; fieldErrors?: Record<string, string> }> {
    if (editing || !ov.data?.config.pinRequired) {
      return save(p).then((r) => ({ ok: r.ok, fieldErrors: r.ok ? undefined : r.fieldErrors }));
    }
    return new Promise((resolve) => setPending({ payload: p, resolve }));
  }

  async function removeExpense() {
    if (!deleting) return;
    setBusy('delete');
    const res = await api(`/api/txns/${deleting.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    if (editing?.id === deleting.id) cancelEdit();
    setDeleting(null);
    toast.success(t('exp.deleted'));
    bump();
  }

  async function ruleAction(r: RuleRow, action: 'toggle' | 'retry' | 'delete') {
    setBusy(`${action}:${r.id}`);
    const res =
      action === 'toggle'
        ? await api<{ state: string }>(`/api/expenses/rules/${r.id}`, { method: 'PUT' })
        : action === 'retry'
          ? await api<{ posted: number }>('/api/expenses/rules/run', { method: 'POST' })
          : await api(`/api/expenses/rules/${r.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    if (action === 'delete') {
      setDelRule(null);
      toast.success(t('exp.ruleDeleted'));
    } else if (action === 'retry') toast.success(t('exp.retried', { n: (res.data as { posted: number }).posted }));
    else toast.success((res.data as { state: string }).state === 'PAUSED' ? t('exp.rulePaused') : t('exp.ruleResumed'));
    bump();
  }

  async function exportCsv() {
    setBusy('csv');
    const r = await downloadFile(`/api/expenses${qs({ q: L.q, ...L.filters, format: 'csv' })}`, 'expenses.csv');
    setBusy(null);
    if (r.ok) toast.success(t('toast.exported'));
    else toast.error(r.error || t('err.generic'));
  }

  async function copyRows() {
    setBusy('copy');
    const res = await api<{ rows: ExpenseRow[] }>(`/api/expenses${qs({ q: L.q, ...L.filters, all: '1' })}`);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    const head = [t('common.date'), t('common.number'), t('exp.category'), t('common.amount'), t('common.currency'), t('common.vault'), t('common.notes')];
    const lines = res.data.rows.map((r) => [fmtDate(r.date), r.number, r.category, D(r.amount).toString(), r.currency, t(`vault.${r.vault}`), r.note.replace(/\s+/g, ' ')].join('\t'));
    try {
      await navigator.clipboard.writeText([head.join('\t'), ...lines].join('\n'));
      toast.success(t('exp.copied', { n: lines.length }));
    } catch {
      toast.error(t('err.generic'));
    }
  }

  const s = ov.data?.stats;
  const cats = ov.data?.categories ?? [];

  const details = (r: ExpenseRow) =>
    r.unitPrice && r.quantity ? t('exp.unitLine', { qty: fmtNum(r.quantity, D(r.quantity).isInteger() ? 0 : 2), unit: r.unitName, price: fmtPrice(r.unitPrice, r.currency) }) : r.note;

  const actions = (r: ExpenseRow) => {
    const btn = 'inline-flex h-9 w-9 items-center justify-center rounded-ctl text-muted transition-colors hover:bg-tint hover:text-ink';
    return (
      <span className="flex items-center justify-end gap-0.5">
        <button type="button" className={btn} onClick={() => panel.open(r.id)} aria-label={t('invc.viewN', { number: r.number })} title={t('common.view')}>
          <Eye className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} onClick={() => startEdit(r.id)} aria-label={t('invc.editN', { number: r.number })} title={t('common.edit')}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={cx(btn, 'hover:bg-danger-tint hover:text-danger-ink')} onClick={() => setDeleting(r)} aria-label={t('invc.deleteN', { number: r.number })} title={t('common.delete')}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </span>
    );
  };

  const cols: Column<ExpenseRow>[] = [
    { key: 'date', label: t('common.date'), sortable: true, render: (r) => <span className="num whitespace-nowrap text-muted">{fmtDate(r.date)}</span> },
    {
      key: 'category',
      label: t('exp.category'),
      render: (r) => (
        <span className="block whitespace-nowrap">
          <span className="bidi block font-semibold text-ink">{r.category}</span>
          <span className="num block text-caption text-muted">{r.number}</span>
        </span>
      ),
    },
    { key: 'details', label: t('exp.details'), render: (r) => <span className="bidi block max-w-[260px] truncate text-muted">{details(r) || '—'}</span> },
    { key: 'vault', label: t('common.vault'), render: (r) => <span className="whitespace-nowrap text-muted">{t(`vault.${r.vault}`)}</span> },
    { key: 'amount', label: t('common.amount'), align: 'end', render: (r) => <span className="num whitespace-nowrap font-semibold text-danger-ink">−{fmtMoney(r.amount, r.currency)}</span> },
    { key: 'source', label: t('exp.source'), render: (r) => <Badge tone={r.source === 'recurring' ? 'brand' : 'neutral'}>{t(`exp.src.${r.source}` as DictKey)}</Badge> },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, align: 'end', className: 'sticky end-0 bg-surface', render: actions },
  ];

  return (
    <div>
      <PageHeader
        title={t('exp.title')}
        subtitle={t('exp.subtitle')}
        actions={
          <>
            <Button variant="secondary" busy={busy === 'copy'} onClick={copyRows} icon={<Copy className="h-4 w-4" aria-hidden="true" />}>
              {t('exp.copy')}
            </Button>
            <Button variant="secondary" busy={busy === 'csv'} onClick={exportCsv} icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}>
              {t('common.exportCsv')}
            </Button>
          </>
        }
      />

      {/* Totals across every recorded expense */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {!s ? (
          [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[104px] w-full rounded-card" />)
        ) : (
          <>
            <Stat label={t('exp.statUsd')} value={fmtMoney(s.usdTotal, 'USD')} />
            <Stat label={t('exp.statIqd')} value={fmtMoney(s.iqdTotal, 'IQD')} />
            <Stat label={t('exp.statOverall')} value={fmtMoney(s.overallUsd, 'USD')} sub={t('exp.statOverallHint')} strong />
            <Stat label={t('exp.statCount')} value={fmtNum(s.count, 0)} />
            <Stat label={t('exp.statLargest')} value={s.largest ? fmtMoney(s.largest.amount, s.largest.currency as Cur) : '—'} sub={s.largest ? `${s.largest.category} · ${s.largest.number}` : undefined} />
            <Stat
              label={t('exp.statTop')}
              value={s.topCategory?.name ?? '—'}
              sub={s.topCategory ? t('exp.statTopHint', { n: s.topCategory.count, amount: fmtMoney(s.topCategory.totalUsd, 'USD') }) : undefined}
              text
            />
          </>
        )}
      </div>

      <div ref={formRef} className="scroll-mt-4">
        {ov.data ? (
          <ExpenseForm categories={cats} vaultMode={ov.data.config.vaultMode} editing={editing} onCancelEdit={cancelEdit} onSubmit={onSubmit} />
        ) : (
          <Skeleton className="mb-5 h-72 w-full rounded-card" />
        )}
      </div>

      {ov.data?.rules.length ? <RulesCard rules={ov.data.rules} busy={busy} onAction={ruleAction} onDelete={setDelRule} /> : null}

      <Card className="overflow-hidden" aria-labelledby="exp-list-title">
        <h2 id="exp-list-title" className="px-5 pt-5 text-title font-semibold text-ink">
          {t('exp.listTitle')}
        </h2>
        <div className="flex flex-col gap-2 px-5 pb-4 pt-4 xl:flex-row xl:flex-wrap xl:items-center">
          <SearchBox value={L.q} onChange={L.setQ} placeholder={t('exp.searchPh')} className="xl:w-80" />
          <Select aria-label={t('exp.category')} value={L.filters.category} onChange={(e) => L.setFilter('category', e.target.value)} className="xl:w-56">
            <option value="">{t('exp.allCategories')}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <DateRange idPrefix="exp" from={L.filters.from} to={L.filters.to} onFrom={(v) => L.setFilter('from', v)} onTo={(v) => L.setFilter('to', v)} />
          {L.hasFilters ? (
            <Button variant="quiet" size="sm" onClick={L.clearFilters}>
              {t('common.clearFilters')}
            </Button>
          ) : null}
        </div>
        <DataTable
          rows={list.data?.rows}
          columns={cols}
          sort={L.sort}
          dir={L.dir}
          onSort={L.onSort}
          loading={list.loading}
          minWidth={820}
          caption={t('exp.listTitle')}
          rowClassName={(r) => (editing?.id === r.id ? 'bg-warning-tint/50' : undefined)}
          empty={<p className="text-body text-muted">{L.hasFilters ? t('common.noResults') : t('exp.empty')}</p>}
          mobile={(r) => (
            <span className="flex flex-col gap-1.5">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="bidi block truncate font-semibold text-ink">{r.category}</span>
                  <span className="num block text-caption text-muted">
                    {fmtDate(r.date)} · {r.number}
                  </span>
                  {details(r) ? <span className="bidi block truncate text-caption text-muted">{details(r)}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num font-semibold text-danger-ink">−{fmtMoney(r.amount, r.currency)}</span>
                  <Badge tone={r.source === 'recurring' ? 'brand' : 'neutral'}>{t(`exp.src.${r.source}` as DictKey)}</Badge>
                </span>
              </span>
              {actions(r)}
            </span>
          )}
        />
        {list.data ? <Pager total={list.data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} /> : null}
      </Card>

      <PinDialog pending={pending} onClose={() => (pending?.resolve({ ok: false }), setPending(null))} onSave={save} onDone={() => setPending(null)} />

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title={deleting ? t('exp.deleteTitle', { number: deleting.number }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" busy={busy === 'delete'} onClick={removeExpense} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              {t('detail.deleteConfirm')}
            </Button>
          </>
        }
      >
        {deleting ? (
          <p className="text-body text-ink">
            {t('exp.deleteBody', { amount: fmtMoney(deleting.amount, deleting.currency), vault: t(`vault.${deleting.vault}`), number: deleting.number })}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={!!delRule}
        onClose={() => setDelRule(null)}
        size="sm"
        title={t('exp.deleteRule')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDelRule(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" busy={busy === `delete:${delRule?.id}`} onClick={() => delRule && ruleAction(delRule, 'delete')} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              {t('exp.deleteRule')}
            </Button>
          </>
        }
      >
        {delRule ? <p className="text-body text-ink">{t('exp.deleteRuleBody', { category: delRule.category })}</p> : null}
      </Dialog>
    </div>
  );
}

function Stat({ label, value, sub, strong, text }: { label: string; value: string; sub?: string; strong?: boolean; text?: boolean }) {
  return (
    <div className={cx('min-w-0 rounded-card border bg-surface p-4 shadow-card', strong ? 'border-brand/40' : 'border-line-soft')}>
      <p className="text-meta font-medium text-muted">{label}</p>
      <p className={cx('mt-1.5 break-words font-bold leading-tight text-ink', text ? 'bidi text-lead md:text-title' : 'num text-lead md:text-heading', strong && 'text-brand-ink')}>{value}</p>
      {sub ? <p className="bidi mt-1.5 truncate text-caption text-muted">{sub}</p> : null}
    </div>
  );
}

function RulesCard({
  rules,
  busy,
  onAction,
  onDelete,
}: {
  rules: RuleRow[];
  busy: string | null;
  onAction: (r: RuleRow, a: 'toggle' | 'retry') => void;
  onDelete: (r: RuleRow) => void;
}) {
  const { t } = useApp();
  const tt = (k: string, p?: Record<string, string | number>) => t(k as DictKey, p);
  const state = (r: RuleRow) =>
    r.dueFlag ? (
      <Badge tone="warning">{t('exp.due', { reason: r.dueReason.startsWith('insufficient:') ? t('exp.dueInsufficient', { vault: t(`vault.${r.dueReason.slice(13)}` as DictKey) }) : r.dueReason })}</Badge>
    ) : (
      <Badge tone={r.state === 'ACTIVE' ? 'success' : r.state === 'SCHEDULED' ? 'brand' : 'neutral'}>{t(`exp.state.${r.state}` as DictKey)}</Badge>
    );
  const btns = (r: RuleRow) => (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {r.dueFlag ? (
        <Button size="sm" variant="secondary" busy={busy === `retry:${r.id}`} onClick={() => onAction(r, 'retry')} icon={<RotateCw className="h-4 w-4" aria-hidden="true" />}>
          {t('exp.retry')}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="quiet"
        busy={busy === `toggle:${r.id}`}
        onClick={() => onAction(r, 'toggle')}
        icon={r.state === 'PAUSED' ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
      >
        {r.state === 'PAUSED' ? t('exp.resume') : t('exp.pause')}
      </Button>
      <Button size="sm" variant="quiet" className="hover:text-danger-ink" onClick={() => onDelete(r)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
        {t('common.delete')}
      </Button>
    </span>
  );
  return (
    <Card className="mb-5 overflow-hidden" aria-labelledby="exp-rules-title">
      <h2 id="exp-rules-title" className="px-5 pb-3 pt-5 text-title font-semibold text-ink">
        {t('exp.rulesTitle')}
      </h2>
      <div className="scroll-thin hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-meta">
          <thead>
            <tr className="border-y border-line-soft bg-surface-2 text-caption text-muted">
              <th scope="col" className="py-2.5 ps-5 pe-3 text-start font-semibold">{t('exp.category')}</th>
              <th scope="col" className="px-3 py-2.5 text-end font-semibold">{t('common.amount')}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('exp.frequency')}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('exp.nextRun')}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.vault')}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.status')}</th>
              <th scope="col" className="py-2.5 ps-3 pe-5 text-end font-semibold"><span className="sr-only">{t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const skips = skipSummary(r, tt);
              return (
                <tr key={r.id} className="border-b border-line-soft last:border-0">
                  <td className="py-3 ps-5 pe-3">
                    <span className="bidi block font-semibold text-ink">{r.category}</span>
                    {r.note ? <span className="bidi block max-w-[220px] truncate text-caption text-muted">{r.note}</span> : null}
                  </td>
                  <td className="num px-3 py-3 text-end font-semibold text-ink">{fmtMoney(r.amount, r.vault)}</td>
                  <td className="px-3 py-3">
                    <span className="block text-ink">{t(`exp.freq.${r.frequency}` as DictKey)}</span>
                    {skips ? <Badge tone="warning" className="mt-1 whitespace-normal">{skips}</Badge> : null}
                  </td>
                  <td className="num px-3 py-3 text-muted">{r.state === 'PAUSED' ? '—' : fmtDate(r.nextRun)}</td>
                  <td className="px-3 py-3 text-muted">{t(`vault.${r.vault}` as DictKey)}</td>
                  <td className="px-3 py-3">{state(r)}</td>
                  <td className="py-3 ps-3 pe-5">{btns(r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden">
        {rules.map((r) => {
          const skips = skipSummary(r, tt);
          return (
            <li key={r.id} className="flex flex-col gap-2 border-t border-line-soft px-4 py-3.5">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="bidi block font-semibold text-ink">{r.category}</span>
                  <span className="block text-caption text-muted">
                    {t(`exp.freq.${r.frequency}` as DictKey)}
                    {t('exp.listSep')}
                    {t(`vault.${r.vault}` as DictKey)}
                  </span>
                  {r.state !== 'PAUSED' ? (
                    <span className="block text-caption text-muted">
                      {t('exp.nextRun')}: <span className="num">{fmtDate(r.nextRun)}</span>
                    </span>
                  ) : null}
                </span>
                <span className="num shrink-0 font-semibold text-ink">{fmtMoney(r.amount, r.vault)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {state(r)}
                {skips ? <Badge tone="warning">{skips}</Badge> : null}
              </span>
              {btns(r)}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** PIN check before a new expense or rule is saved. A wrong PIN keeps the dialog open. */
function PinDialog({
  pending,
  onClose,
  onSave,
  onDone,
}: {
  pending: Pending | null;
  onClose: () => void;
  onSave: (p: ExpensePayload, pin: string) => Promise<ApiResult<unknown>>;
  onDone: () => void;
}) {
  const { t } = useApp();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (pending) {
      setPin('');
      setErr(undefined);
    }
  }, [pending]);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;
    if (!pin) return setErr(t('v.required'));
    setBusy(true);
    const res = await onSave(pending.payload, pin);
    setBusy(false);
    if (res.ok) {
      pending.resolve({ ok: true });
      onDone();
      return;
    }
    if (res.code === 'exp.pinWrong' || res.code === 'exp.pinLocked') {
      setErr(res.error);
      setPin('');
      return;
    }
    pending.resolve({ ok: false, fieldErrors: res.fieldErrors });
    onDone();
  }

  return (
    <Dialog
      open={!!pending}
      onClose={onClose}
      size="sm"
      title={t('exp.pinTitle')}
      description={t('exp.pinHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="exp-pin-form" busy={busy}>
            {t('exp.confirm')}
          </Button>
        </>
      }
    >
      <form id="exp-pin-form" onSubmit={confirm} noValidate>
        <Field label={t('exp.pin')} htmlFor="exp-pin" error={err} required>
          <Input id="exp-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} invalid={!!err} data-autofocus className="num tracking-[0.4em]" />
        </Field>
      </form>
    </Dialog>
  );
}
