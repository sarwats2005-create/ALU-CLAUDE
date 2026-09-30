'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, History, Pencil } from 'lucide-react';
import type { vaultHistory, vaultOverview } from '@/lib/server/q/dashboard';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { fmtDate, localTodayIso } from '@/lib/dates';
import { D, Dec, convert, fmtMoney, fmtRate, parseDec, roundMoney, type Cur } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, Field, Input, PageHeader, Segmented, Select, Skeleton, Textarea } from '@/components/ui';
import { DataTable, Pager, SearchBox, useListState, type Column } from '@/components/DataTable';
import { DateInput, DateRange } from '@/components/DateInput';
import { Dialog, EditingBanner } from '@/components/Dialog';
import { LineChart, compactMoney } from '@/components/charts';
import { useTxnPanel } from '@/components/TxnPanel';
import { useToast } from '@/components/Toast';
import { RateEditDialog, RateLogDialog } from '@/components/RateDialogs';

type Overview = Awaited<ReturnType<typeof vaultOverview>>;
type VHist = Awaited<ReturnType<typeof vaultHistory>>;
type HRow = VHist['rows'][number];
type OpKind = 'VAULT_DEPOSIT' | 'VAULT_WITHDRAWAL' | 'VAULT_TRANSFER';

export function VaultView({ editOp }: { editOp: TxnDetail | null }) {
  const { t, rate, canDo } = useApp();
  const router = useRouter();
  const panel = useTxnPanel();
  const { data } = useRemote<Overview>('/api/vault', { keepPrevious: true });
  const L = useListState('id', 'desc', { vault: '', kind: '', from: '', to: '' });
  const hist = useRemote<VHist>(`/api/vault/history${L.query}`, { keepPrevious: true });
  const [op, setOp] = useState<{ kind: OpKind; edit?: TxnDetail } | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    if (editOp) setOp({ kind: editOp.kind as OpKind, edit: editOp });
  }, [editOp]);

  const cols: Column<HRow>[] = [
    { key: 'date', label: t('common.date'), sortable: true, render: (r) => <span className="num text-muted">{fmtDate(r.date)}</span> },
    { key: 'number', label: t('common.number'), render: (r) => <span className="num font-semibold text-brand-ink">{r.number}</span> },
    {
      key: 'kind',
      label: t('common.type'),
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1.5 text-ink">
          {t(`kind.${r.kind}` as 'kind.SALE')}
          {r.isReversal ? <Badge tone="warning">{t('status.reversal')}</Badge> : null}
          {r.deleted && !r.isReversal ? <Badge tone="danger">{t('status.deleted')}</Badge> : null}
        </span>
      ),
    },
    { key: 'party', label: t('common.details'), render: (r) => <span className="bidi block max-w-[220px] truncate text-muted">{r.party || r.label || '—'}</span> },
    { key: 'vault', label: t('common.vault'), render: (r) => <span className="text-muted">{t(`vault.${r.vault}`)}</span> },
    { key: 'amount', label: t('common.amount'), sortable: true, align: 'end', render: (r) => <span className={cx('num font-semibold', r.direction === 'IN' ? 'text-success-ink' : 'text-danger-ink')}>{r.direction === 'IN' ? '+' : '−'}{fmtMoney(r.amount, r.vault)}</span> },
    { key: 'after', label: t('common.balanceAfter'), align: 'end', render: (r) => <span className={cx('num', D(r.balanceAfter).isNegative() ? 'text-danger-ink' : 'text-ink')}>{fmtMoney(r.balanceAfter, r.vault)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={t('vault.title')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOp({ kind: 'VAULT_DEPOSIT' })} icon={<ArrowDownLeft className="h-4 w-4" aria-hidden="true" />}>
              {t('vault.deposit')}
            </Button>
            <Button variant="secondary" onClick={() => setOp({ kind: 'VAULT_WITHDRAWAL' })} icon={<ArrowUpRight className="h-4 w-4" aria-hidden="true" />}>
              {t('vault.withdraw')}
            </Button>
            <Button onClick={() => setOp({ kind: 'VAULT_TRANSFER' })} icon={<ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}>
              {t('vault.transferShort')}
            </Button>
          </>
        }
      />

      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="text-body text-muted">
          {t('common.rate')}: <span className="num font-bold text-ink">{t('vault.rateLine', { rate: fmtRate(rate) })}</span>
        </p>
        <div className="flex gap-1">
          <Button variant="quiet" size="sm" onClick={() => setLogOpen(true)} icon={<History className="h-4 w-4" aria-hidden="true" />}>
            {t('vault.rateHistory')}
          </Button>
          {canDo('canEditExchangeRate') ? (
            <Button variant="ghost" size="sm" onClick={() => setRateOpen(true)} icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
              {t('vault.editRate')}
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        {data ? data.vaults.map((v) => <VaultCard key={v.vault} v={v} onOpen={(id) => panel.open(id)} />) : [0, 1].map((i) => <Skeleton key={i} className="h-[420px] w-full" />)}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 pb-4 pt-5">
          <h2 className="text-title font-semibold text-ink">{t('vault.history')}</h2>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchBox value={L.q} onChange={L.setQ} placeholder={t('common.searchPlaceholder')} className="lg:w-60" />
            <Select aria-label={t('common.vault')} value={L.filters.vault} onChange={(e) => L.setFilter('vault', e.target.value)} className="lg:w-44">
              <option value="">{t('common.vault')}: {t('common.all')}</option>
              <option value="USD">{t('vault.USD')}</option>
              <option value="IQD">{t('vault.IQD')}</option>
            </Select>
            <Select aria-label={t('common.type')} value={L.filters.kind} onChange={(e) => L.setFilter('kind', e.target.value)} className="lg:w-52">
              <option value="">{t('common.type')}: {t('common.all')}</option>
              {(['SALE', 'PURCHASE', 'CUSTOMER_PAYMENT', 'CUSTOMER_REFUND', 'BENEFICIARY_PAYMENT', 'BENEFICIARY_REFUND', 'VAULT_DEPOSIT', 'VAULT_WITHDRAWAL', 'VAULT_TRANSFER'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`kind.${k}`)}
                </option>
              ))}
            </Select>
            <DateRange idPrefix="vh" from={L.filters.from} to={L.filters.to} onFrom={(v) => L.setFilter('from', v)} onTo={(v) => L.setFilter('to', v)} />
          </div>
        </div>
        <DataTable
          rows={hist.data?.rows}
          columns={cols}
          sort={L.sort}
          dir={L.dir}
          onSort={L.onSort}
          loading={hist.loading}
          onRowClick={(r) => panel.open(r.txnId)}
          minWidth={900}
          caption={t('vault.history')}
          empty={<p className="text-body text-muted">{L.hasFilters ? t('common.noResults') : t('vault.historyEmpty')}</p>}
          mobile={(r) => (
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="num text-meta font-semibold text-brand-ink">{r.number}</span>
                  {r.isReversal ? <Badge tone="warning">{t('status.reversal')}</Badge> : null}
                </span>
                <span className="block text-meta text-ink">{t(`kind.${r.kind}` as 'kind.SALE')}</span>
                <span className="bidi block truncate text-caption text-muted">
                  <span className="num">{fmtDate(r.date)}</span> · {r.party || r.label || t(`vault.${r.vault}`)}
                </span>
              </span>
              <span className="shrink-0 text-end">
                <span className={cx('num block text-body font-semibold', r.direction === 'IN' ? 'text-success-ink' : 'text-danger-ink')}>
                  {r.direction === 'IN' ? '+' : '−'}
                  {fmtMoney(r.amount, r.vault)}
                </span>
                <span className="num block text-caption text-muted">= {fmtMoney(r.balanceAfter, r.vault)}</span>
              </span>
            </span>
          )}
        />
        {hist.data ? <Pager total={hist.data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} /> : null}
      </Card>

      {op ? (
        <VaultOpDialog
          kind={op.kind}
          edit={op.edit}
          balances={data?.vaults.map((v) => ({ vault: v.vault as Cur, balance: v.balance })) ?? []}
          onClose={() => {
            setOp(null);
            if (editOp) router.replace('/vault');
          }}
        />
      ) : null}
      <RateEditDialog open={rateOpen} onClose={() => setRateOpen(false)} />
      <RateLogDialog open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}

function VaultCard({ v, onOpen }: { v: Overview['vaults'][number]; onOpen: (txnId: string) => void }) {
  const { t } = useApp();
  const cur = v.vault as Cur;
  const neg = D(v.balance).isNegative();
  const series = v.series.map((p) => ({ key: p.date, label: fmtDate(p.date).slice(0, 5), sub: fmtDate(p.date), value: Number(p.value) }));
  return (
    <Card className={cx('flex min-w-0 flex-col', neg && 'border-danger/30')}>
      <div className="flex items-start justify-between gap-4 p-5 pb-3">
        <div className="min-w-0">
          <h2 className="text-body font-semibold text-muted">{t(`vault.${cur}`)}</h2>
          <p className={cx('fig mt-1.5 text-[34px] font-bold leading-none md:text-[40px]', neg ? 'text-danger-ink' : 'text-ink')}>{fmtMoney(v.balance, cur)}</p>
          {neg ? <p className="mt-1.5 text-meta font-semibold text-danger-ink">{t('vault.deficit', { x: fmtMoney(D(v.balance).abs(), cur) })}</p> : null}
          {v.usdEquivalent ? <p className="num mt-1.5 text-meta text-muted">{t('vault.equivalent', { x: fmtMoney(v.usdEquivalent) })}</p> : null}
        </div>
        <dl className="shrink-0 text-end text-meta">
          <div>
            <dt className="text-caption text-muted">{t('vault.totalIn')}</dt>
            <dd className="num font-semibold text-success-ink">+{fmtMoney(v.totalIn, cur)}</dd>
          </div>
          <div className="mt-1.5">
            <dt className="text-caption text-muted">{t('vault.totalOut')}</dt>
            <dd className="num font-semibold text-danger-ink">−{fmtMoney(v.totalOut, cur)}</dd>
          </div>
        </dl>
      </div>
      <div className="px-5">
        <p className="mb-1 text-caption text-muted">{t('vault.last30')}</p>
        <LineChart data={series} fmtValue={(x) => fmtMoney(x, cur)} fmtAxis={(x) => compactMoney(x, cur)} ariaLabel={`${t(`vault.${cur}`)} — ${t('vault.last30')}`} seriesLabel={t('common.balance')} allowNegative height={150} />
      </div>
      <div className="mt-2 border-t border-line-soft">
        <p className="px-5 pb-1 pt-3 text-caption font-semibold text-muted">{t('vault.lastMovements')}</p>
        {v.last.length ? (
          <ul>
            {v.last.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onOpen(m.txnId)} className="flex w-full items-center justify-between gap-3 px-5 py-2 text-start text-meta hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="num font-semibold text-brand-ink">{m.number}</span>
                    {m.isReversal ? <Badge tone="warning" className="ms-1.5">{t('status.reversal')}</Badge> : null}
                    <span className="bidi block truncate text-caption text-muted">
                      {t(`kind.${m.kind}` as 'kind.SALE')}
                      {m.party || m.label ? ` · ${m.party || m.label}` : ''}
                    </span>
                  </span>
                  <span className={cx('num shrink-0 font-semibold', m.direction === 'IN' ? 'text-success-ink' : 'text-danger-ink')}>
                    {m.direction === 'IN' ? '+' : '−'}
                    {fmtMoney(m.amount, cur)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-4 text-meta text-muted">{t('vault.noMovements')}</p>
        )}
      </div>
    </Card>
  );
}

const OP_TITLE = { VAULT_DEPOSIT: 'vault.depositTitle', VAULT_WITHDRAWAL: 'vault.withdrawTitle', VAULT_TRANSFER: 'vault.transferTitle' } as const;
const OP_SUBMIT = { VAULT_DEPOSIT: 'vault.deposit', VAULT_WITHDRAWAL: 'vault.withdraw', VAULT_TRANSFER: 'vault.transferShort' } as const;

function VaultOpDialog({ kind, edit, balances, onClose }: { kind: OpKind; edit?: TxnDetail; balances: { vault: Cur; balance: string }[]; onClose: () => void }) {
  const { t, rate: liveRate, bump } = useApp();
  const toast = useToast();
  const [vault, setVault] = useState<Cur>((edit?.vault as Cur) ?? 'USD');
  const [toVault, setToVault] = useState<Cur>((edit?.toVault as Cur) ?? 'IQD');
  const [amount, setAmount] = useState(edit ? D(edit.total).toString() : '');
  const [opRate, setOpRate] = useState(edit ? D(edit.rate).toString() : liveRate);
  const [date, setDate] = useState(edit?.date ?? localTodayIso());
  const [label, setLabel] = useState(edit?.label ?? '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isT = kind === 'VAULT_TRANSFER';

  const amt = roundMoney(parseDec(amount) ?? new Dec(0), vault);
  const r = parseDec(opRate);
  const converted = isT && r && r.gt(0) && amt.gt(0) ? roundMoney(convert(amt, vault, toVault, r), toVault) : null;
  const bal = balances.find((b) => b.vault === vault);
  const after = bal && amt.gt(0) && kind !== 'VAULT_DEPOSIT' ? D(bal.balance).plus(edit ? D(edit.vaultAmount) : 0).minus(amt) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    const a = parseDec(amount);
    if (!amount) er.amount = t('v.required');
    else if (!a || !a.gt(0)) er.amount = t('v.positive');
    if (isT && vault === toVault) er.toVault = t('v.sameVault');
    if (isT && (!r || !r.gt(0))) er.rate = t('v.rate');
    if (!date) er.date = t('v.date');
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const res = await api<{ id: string; number: string }>(edit ? `/api/vault/ops/${edit.id}` : '/api/vault/ops', {
      method: edit ? 'PUT' : 'POST',
      body: { kind, vault, toVault: isT ? toVault : undefined, amount, rate: isT ? opRate : undefined, date, label, notes },
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(edit ? t('toast.updated') : t('toast.vaultRecorded', { number: res.data.number }));
    bump();
    onClose();
  }

  const vaultOpts = [
    { value: 'USD' as Cur, label: t('vault.USD') },
    { value: 'IQD' as Cur, label: t('vault.IQD') },
  ];
  return (
    <Dialog
      open
      onClose={onClose}
      title={t(OP_TITLE[kind])}
      banner={edit ? <EditingBanner text={t('vault.editing', { number: edit.number })} /> : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="vop-form" busy={busy}>
            {edit ? t('common.saveChanges') : t(OP_SUBMIT[kind])}
          </Button>
        </>
      }
    >
      <form id="vop-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className={cx('grid grid-cols-1 gap-4', isT && 'sm:grid-cols-2')}>
          <Field label={isT ? t('vault.fromVault') : t('common.vault')} htmlFor="vop-vault">
            <Segmented<Cur>
              label={isT ? t('vault.fromVault') : t('common.vault')}
              value={vault}
              onChange={(v) => {
                setVault(v);
                if (isT) setToVault(v === 'USD' ? 'IQD' : 'USD');
              }}
              options={vaultOpts}
              className="w-full"
            />
          </Field>
          {isT ? (
            <Field label={t('vault.toVault')} htmlFor="vop-to" error={errors.toVault}>
              <Segmented<Cur>
                label={t('vault.toVault')}
                value={toVault}
                onChange={(v) => {
                  setToVault(v);
                  setVault(v === 'USD' ? 'IQD' : 'USD');
                }}
                options={vaultOpts}
                className="w-full"
              />
            </Field>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('common.amount')} htmlFor="vop-amount" error={errors.amount} required>
            <div className="relative">
              <Input id="vop-amount" numeric value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} className="pe-14" data-autofocus />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-meta font-semibold text-muted">{vault}</span>
            </div>
          </Field>
          <Field label={t('common.date')} htmlFor="vop-date" error={errors.date} required>
            <DateInput id="vop-date" value={date} onChange={setDate} invalid={!!errors.date} />
          </Field>
        </div>
        {isT ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('vault.rateForOp')} htmlFor="vop-rate" error={errors.rate} required>
              <div className="flex items-center gap-2">
                <span className="num shrink-0 text-meta text-muted">1 USD =</span>
                <Input id="vop-rate" numeric value={opRate} onChange={(e) => setOpRate(e.target.value)} invalid={!!errors.rate} />
              </div>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink">{t('vault.converted')}</span>
              <span className="num flex h-11 items-center justify-end rounded-ctl bg-success-tint px-3 text-body font-bold text-success-ink md:h-10">{converted ? `+${fmtMoney(converted, toVault)}` : '—'}</span>
            </div>
          </div>
        ) : (
          <Field label={kind === 'VAULT_DEPOSIT' ? t('vault.sourceLabel') : t('vault.reasonLabel')} htmlFor="vop-label" optionalLabel={t('common.optional')}>
            <Input id="vop-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'VAULT_DEPOSIT' ? t('vault.sourcePh') : t('vault.reasonPh')} maxLength={120} />
          </Field>
        )}
        {after ? (
          <p className={cx('rounded-ctl px-3 py-2 text-meta', after.isNegative() ? 'bg-danger-tint font-semibold text-danger-ink' : 'bg-tint text-ink')}>
            {t(`vault.${vault}`)} → <span className="num font-semibold">{fmtMoney(after, vault)}</span>
          </p>
        ) : null}
        <Field label={t('common.notes')} htmlFor="vop-notes" optionalLabel={t('common.optional')}>
          <Textarea id="vop-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
        </Field>
      </form>
    </Dialog>
  );
}
