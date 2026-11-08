'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Camera, CircleDollarSign, Eye, HandCoins, IdCard, Pencil, Trash2, UserPlus, UserRound, Users, Wallet } from 'lucide-react';
import { HeroPeople } from '@/components/hero-art';
import type { EmployeeRow, EmployeesOverview, SalaryDueRow, SalaryRow } from '@/lib/server/employees';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { fmtDate, fmtMonth } from '@/lib/dates';
import { D, fmtMoney, fmtNum, parseDec, roundMoney } from '@/lib/money';
import { RULES, daysInMonth } from '@/lib/rules';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { DataTable, Pager, SearchBox, type Column } from '@/components/DataTable';
import { Dialog } from '@/components/Dialog';
import { Avatar, cropSquare } from '@/components/PartyForm';
import { useTxnPanel } from '@/components/TxnPanel';
import { useToast } from '@/components/Toast';
import { useMoneyGuard } from '@/components/MoneyGuard';
import { SummaryCell, SummaryStrip } from '@/components/Summary';

// Employees & salaries. Salaries are always in USD and need no PIN. Monthly employees are paid automatically each
// month (from the main USD vault); daily workers are paid by hand for the days they worked. A salary the vault
// couldn't cover stays as an unpaid salary until it is paid.

const avatarUrl = (e: EmployeeRow) => (e.hasAvatar ? `/api/employees/${e.id}/avatar?v=${e.avatarV}` : null);
const ACTION_BTN = 'inline-flex h-14 w-14 items-center justify-center rounded-ctl text-muted transition-colors hover:bg-tint hover:text-ink';

export function EmployeesView() {
  const { t, bump } = useApp();
  const toast = useToast();
  const panel = useTxnPanel();
  const ov = useRemote<EmployeesOverview>('/api/employees', { keepPrevious: true });
  const [editing, setEditing] = useState<EmployeeRow | 'new' | null>(null);
  const [paying, setPaying] = useState<EmployeeRow | null>(null);
  const [deleting, setDeleting] = useState<{ type: 'employee'; row: EmployeeRow } | { type: 'payment'; row: SalaryRow } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const announced = useRef(0);

  // Monthly salaries posted while the page loaded: say so once.
  useEffect(() => {
    const n = ov.data?.posted ?? 0;
    if (n > 0 && announced.current !== n) {
      announced.current = n;
      toast.success(t('emp.autoPosted', { n }));
      bump();
    }
  }, [ov.data?.posted]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeLabel = (e: EmployeeRow) => (e.salaryType === 'DAILY' ? t('emp.typeDaily') : t('emp.typeMonthly'));
  const rateLabel = (e: EmployeeRow) => `${fmtMoney(e.salaryUsd)} ${e.salaryType === 'DAILY' ? t('emp.perDay') : t('emp.perMonth')}`;

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase();
    const all = ov.data?.employees ?? [];
    if (!term) return all;
    return all.filter((e) => [e.name, e.phone, e.address, typeLabel(e)].join(' ').toLocaleLowerCase().includes(term));
  }, [ov.data?.employees, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const paged = filtered.slice((page - 1) * size, page * size);

  async function payDue(d: SalaryDueRow) {
    setBusy(`due:${d.id}`);
    const res = await api<{ paid: string }>(`/api/employees/dues/${d.id}`, { method: 'POST' });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(t('emp.duePaid', { name: d.name }));
    bump();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy('delete');
    const res =
      deleting.type === 'employee'
        ? await api(`/api/employees/${deleting.row.id}`, { method: 'DELETE' })
        : await api(`/api/txns/${deleting.row.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(deleting.type === 'employee' ? t('emp.deleted') : t('emp.paymentDeleted'));
    setDeleting(null);
    bump();
  }

  const s = ov.data?.stats;
  const dues = ov.data?.dues ?? [];

  const empActions = (e: EmployeeRow) => (
    <span className="flex items-center justify-end gap-0.5">
      {e.active ? (
        <button type="button" className={ACTION_BTN} onClick={() => setPaying(e)} aria-label={t('emp.payN', { name: e.name })} title={e.salaryType === 'DAILY' ? t('emp.payDays') : t('emp.payMonth')}>
          <HandCoins className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      <button type="button" className={ACTION_BTN} onClick={() => setEditing(e)} aria-label={t('emp.editN', { name: e.name })} title={t('common.edit')}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" className={cx(ACTION_BTN, 'hover:bg-danger-tint hover:text-danger-ink')} onClick={() => setDeleting({ type: 'employee', row: e })} aria-label={t('emp.deleteN', { name: e.name })} title={t('common.delete')}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </span>
  );

  const statusBadge = (e: EmployeeRow) => <Badge tone={e.active ? 'success' : 'neutral'}>{e.active ? t('common.active') : t('common.inactive')}</Badge>;

  const empCols: Column<EmployeeRow>[] = [
    {
      key: 'name',
      label: t('common.fullName'),
      render: (e) => (
        <span className="flex items-center gap-3">
          <Avatar name={e.name} src={avatarUrl(e)} size={36} />
          <span className="bidi font-semibold text-ink">{e.name}</span>
        </span>
      ),
    },
    { key: 'type', label: t('emp.type'), render: (e) => <span className="text-muted">{typeLabel(e)}</span> },
    { key: 'rate', label: t('emp.rate'), align: 'end', render: (e) => <span className="num whitespace-nowrap font-semibold text-ink">{rateLabel(e)}</span> },
    { key: 'phone', label: t('common.phone'), render: (e) => <span className="num text-muted" dir="ltr">{e.phone || '—'}</span> },
    { key: 'status', label: t('common.status'), render: statusBadge },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, align: 'end', render: empActions },
  ];

  const payStatus = (p: SalaryRow) =>
    p.status === 'due' ? <Badge tone="warning">{t('emp.statusDue', { x: fmtMoney(p.owed, p.vault) })}</Badge> : <Badge tone="success">{t('emp.statusPaid')}</Badge>;
  const payActions = (p: SalaryRow) => (
    <span className="flex items-center justify-end gap-0.5">
      <button type="button" className={ACTION_BTN} onClick={() => panel.open(p.id)} aria-label={t('invc.viewN', { number: p.number })} title={t('common.view')}>
        <Eye className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" className={cx(ACTION_BTN, 'hover:bg-danger-tint hover:text-danger-ink')} onClick={() => setDeleting({ type: 'payment', row: p })} aria-label={t('invc.deleteN', { number: p.number })} title={t('common.delete')}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </span>
  );
  const payCols: Column<SalaryRow>[] = [
    { key: 'date', label: t('common.date'), render: (p) => <span className="num whitespace-nowrap text-muted">{fmtDate(p.date)}</span> },
    {
      key: 'name',
      label: t('emp.employee'),
      render: (p) => (
        <span className="block whitespace-nowrap">
          <span className="bidi block font-semibold text-ink">{p.name}</span>
          <span className="num block text-caption text-muted">
            {p.number}
            {p.automatic ? ` · ${t('emp.automatic')}` : ''}
          </span>
        </span>
      ),
    },
    { key: 'period', label: t('emp.period'), render: (p) => <span className="num text-muted">{fmtMonth(p.period)}</span> },
    { key: 'days', label: t('emp.days'), align: 'end', render: (p) => <span className="num text-muted">{p.days ? fmtNum(p.days, D(p.days).isInteger() ? 0 : 1) : '—'}</span> },
    { key: 'amount', label: t('emp.amountUsd'), align: 'end', render: (p) => <span className="num whitespace-nowrap font-semibold text-ink">{fmtMoney(p.amountUsd)}</span> },
    {
      key: 'vault',
      label: t('common.vault'),
      render: (p) => (
        <span className="block whitespace-nowrap text-muted">
          {t(`vault.${p.vault}`)}
          {p.vault === 'IQD' ? <span className="num block text-caption">{fmtMoney(p.vaultAmount, 'IQD')}</span> : null}
        </span>
      ),
    },
    { key: 'status', label: t('common.status'), render: payStatus },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, align: 'end', render: payActions },
  ];

  return (
    <div>
      <PageHeader
        icon={<IdCard aria-hidden="true" />}
        art={<HeroPeople />}
        title={t('emp.title')}
        subtitle={t('emp.subtitle')}
        actions={
          <Button size="lg" className="elegant-hero-cta" onClick={() => setEditing('new')} icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}>
            {t('emp.add')}
          </Button>
        }
      />

      {!s ? (
        <Skeleton className="mb-5 h-[118px] w-full rounded-card" />
      ) : (
        <SummaryStrip className="mb-5">
          <SummaryCell icon={<Users className="h-[18px] w-[18px]" aria-hidden="true" />} label={t('emp.statActive')} value={<span className="num">{s.activeCount}</span>} />
          <SummaryCell icon={<Wallet className="h-[18px] w-[18px]" aria-hidden="true" />} label={t('emp.statPayroll')} value={fmtMoney(s.monthlyPayrollUsd)} sub={t('emp.statPayrollSub')} />
          <SummaryCell icon={<CircleDollarSign className="h-[18px] w-[18px]" aria-hidden="true" />} label={t('emp.statPaidMonth')} value={fmtMoney(s.paidThisMonthUsd)} sub={t('emp.paymentsN', { n: s.paidThisMonthCount })} />
          <SummaryCell
            icon={<AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" />}
            label={t('emp.statDue')}
            value={<span className="num">{s.duesCount}</span>}
            tone={s.duesCount > 0 ? 'danger' : undefined}
            alert={s.duesCount > 0}
            sub={s.duesCount > 0 ? t('emp.statDueSub') : t('dash.duesNone')}
          />
        </SummaryStrip>
      )}

      {dues.length ? (
        <Card className="mb-5 overflow-hidden" aria-labelledby="emp-dues-title">
          <div className="flex items-center gap-3 px-5 pb-3 pt-5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning-ink" aria-hidden="true" />
            <h2 id="emp-dues-title" className="text-title font-semibold text-ink">
              {t('emp.duesTitle')}
            </h2>
          </div>
          <p className="px-5 pb-3 text-meta text-muted">{t('emp.duesHint')}</p>
          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {dues.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="bidi block font-semibold text-ink">{d.name}</span>
                  <span className="num block text-caption text-muted">
                    {fmtMonth(d.period)} · {d.number} · {t('emp.salaryOf', { x: fmtMoney(d.totalUsd) })}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="num font-semibold text-danger-ink">{fmtMoney(d.remaining, d.vault)}</span>
                  <Button size="sm" busy={busy === `due:${d.id}`} onClick={() => payDue(d)} icon={<HandCoins className="h-4 w-4" aria-hidden="true" />}>
                    {t('emp.payNow')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mb-5 overflow-hidden" aria-labelledby="emp-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 id="emp-list-title" className="flex items-center gap-3 text-title font-semibold text-ink">
            <Users className="h-5 w-5 text-brand-ink" aria-hidden="true" />
            {t('emp.listTitle')}
          </h2>
        </div>
        <div className="px-5 pb-4 pt-4">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder={t('emp.searchPh')}
            className="xl:w-96"
          />
        </div>
        <DataTable
          rows={ov.data ? paged : undefined}
          columns={empCols}
          loading={ov.loading}
          minWidth={760}
          caption={t('emp.listTitle')}
          rowClassName={(e) => (e.active ? undefined : 'opacity-70')}
          empty={<p className="text-body text-muted">{q ? t('common.noResults') : t('emp.empty')}</p>}
          mobile={(e) => (
            <span className="flex flex-col gap-2">
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={e.name} src={avatarUrl(e)} size={40} />
                  <span className="min-w-0">
                    <span className="bidi block truncate font-semibold text-ink">{e.name}</span>
                    <span className="block text-caption text-muted">{typeLabel(e)}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num font-semibold text-ink">{rateLabel(e)}</span>
                  {statusBadge(e)}
                </span>
              </span>
              {empActions(e)}
            </span>
          )}
        />
        {ov.data && filtered.length > size ? <Pager total={filtered.length} page={page} size={size} onPage={setPage} onSize={(n) => (setSize(n), setPage(1))} /> : null}
      </Card>

      <Card className="overflow-hidden" aria-labelledby="emp-pay-title">
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <CircleDollarSign className="h-5 w-5 text-brand-ink" aria-hidden="true" />
          <h2 id="emp-pay-title" className="text-title font-semibold text-ink">
            {t('emp.historyTitle')}
          </h2>
        </div>
        <DataTable
          rows={ov.data?.payments}
          columns={payCols}
          loading={ov.loading}
          minWidth={900}
          caption={t('emp.historyTitle')}
          empty={<p className="text-body text-muted">{t('emp.historyEmpty')}</p>}
          mobile={(p) => (
            <span className="flex flex-col gap-1.5">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="bidi block truncate font-semibold text-ink">{p.name}</span>
                  <span className="num block text-caption text-muted">
                    {fmtDate(p.date)} · {fmtMonth(p.period)} · {p.number}
                  </span>
                  {p.days ? <span className="num block text-caption text-muted">{t('emp.daysN', { n: fmtNum(p.days, D(p.days).isInteger() ? 0 : 1) })}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num font-semibold text-ink">{fmtMoney(p.amountUsd)}</span>
                  {payStatus(p)}
                </span>
              </span>
              {payActions(p)}
            </span>
          )}
        />
      </Card>

      <EmployeeDialog editing={editing} onClose={() => setEditing(null)} />
      <PayDialog employee={paying} onClose={() => setPaying(null)} />

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title={deleting?.type === 'employee' ? t('emp.deleteEmployee') : t('emp.deletePayment')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" busy={busy === 'delete'} onClick={confirmDelete} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              {t('detail.deleteConfirm')}
            </Button>
          </>
        }
      >
        {deleting?.type === 'employee' ? (
          <p className="text-body text-ink">{t('emp.deleteEmployeeBody', { name: deleting.row.name })}</p>
        ) : deleting?.type === 'payment' ? (
          <p className="text-body text-ink">{t('emp.deletePaymentBody', { number: deleting.row.number, name: deleting.row.name, amount: fmtMoney(deleting.row.vaultAmount, deleting.row.vault), vault: t(`vault.${deleting.row.vault}`) })}</p>
        ) : null}
      </Dialog>
    </div>
  );
}

// ─── Add / edit an employee ────────────────────────────────────────────────────────────────────────
type Form = { name: string; salaryUsd: string; salaryType: 'MONTHLY' | 'DAILY'; phone: string; gender: string; address: string; active: boolean };
const EMPTY: Form = { name: '', salaryUsd: '', salaryType: 'MONTHLY', phone: '', gender: '', address: '', active: true };

function EmployeeDialog({ editing, onClose }: { editing: EmployeeRow | 'new' | null; onClose: () => void }) {
  const { t, bump } = useApp();
  const toast = useToast();
  const [f, setF] = useState<Form>(EMPTY);
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined); // undefined = unchanged
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const row = editing && editing !== 'new' ? editing : null;

  useEffect(() => {
    if (!editing) return;
    setF(row ? { name: row.name, salaryUsd: D(row.salaryUsd).toString(), salaryType: row.salaryType, phone: row.phone, gender: row.gender, address: row.address, active: row.active } : EMPTY);
    setAvatar(undefined);
    setPreview(row ? avatarUrl(row) : null);
    setErrors({});
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setErrors((e) => ({ ...e, avatar: t('v.imageTooLarge') }));
    try {
      const d = await cropSquare(file);
      setAvatar(d);
      setPreview(d);
      setErrors((e) => ({ ...e, avatar: '' }));
    } catch {
      setErrors((e) => ({ ...e, avatar: t('err.generic') }));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = t('v.required');
    const sal = parseDec(f.salaryUsd);
    if (!sal || !sal.gt(0)) errs.salaryUsd = t('v.positive');
    if (Object.keys(errs).length) return setErrors(errs);
    setBusy(true);
    const res = await api<{ id: string }>(row ? `/api/employees/${row.id}` : '/api/employees', {
      method: row ? 'PUT' : 'POST',
      body: { ...f, name: f.name.trim(), ...(avatar !== undefined ? { avatar } : {}) },
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(t('emp.saved'));
    bump();
    onClose();
  }

  const fid = 'emp-form';
  return (
    <Dialog
      open={!!editing}
      onClose={onClose}
      title={row ? t('emp.edit') : t('emp.add')}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={fid} busy={busy}>
            {row ? t('common.saveChanges') : t('emp.add')}
          </Button>
        </>
      }
    >
      <form id={fid} onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-tint text-brand-ink">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="absolute inset-0 m-auto h-9 w-9" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-meta font-medium text-ink">{t('cust.photo')}</p>
            <p className="text-caption text-muted">{t('cust.photoHint')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => file.current?.click()} icon={<Camera className="h-4 w-4" aria-hidden="true" />}>
                {preview ? t('common.change') : t('common.upload')}
              </Button>
              {preview ? (
                <Button size="sm" variant="quiet" onClick={() => (setAvatar(null), setPreview(null))} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
                  {t('cust.removePhoto')}
                </Button>
              ) : null}
            </div>
            {errors.avatar ? <p role="alert" className="mt-1 text-meta font-medium text-danger-ink">{errors.avatar}</p> : null}
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>
        <Field label={t('common.fullName')} htmlFor={`${fid}-name`} error={errors.name} required className="sm:col-span-2">
          <Input id={`${fid}-name`} value={f.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoComplete="off" maxLength={120} data-autofocus />
        </Field>
        <Field label={t('emp.type')} htmlFor={`${fid}-type`}>
          <Select id={`${fid}-type`} value={f.salaryType} onChange={(e) => set('salaryType', e.target.value as Form['salaryType'])}>
            <option value="MONTHLY">{t('emp.typeMonthlyLong')}</option>
            <option value="DAILY">{t('emp.typeDailyLong')}</option>
          </Select>
        </Field>
        <Field label={f.salaryType === 'DAILY' ? t('emp.dailyRate') : t('emp.monthlySalary')} htmlFor={`${fid}-salary`} error={errors.salaryUsd} required>
          <Input id={`${fid}-salary`} numeric value={f.salaryUsd} onChange={(e) => set('salaryUsd', e.target.value)} invalid={!!errors.salaryUsd} placeholder="0.00" />
        </Field>
        <Field label={t('common.phone')} htmlFor={`${fid}-phone`} optionalLabel={t('common.optional')}>
          <Input id={`${fid}-phone`} type="tel" dir="ltr" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+964 750 000 0000" autoComplete="off" maxLength={40} />
        </Field>
        <Field label={t('emp.gender')} htmlFor={`${fid}-gender`} optionalLabel={t('common.optional')}>
          <Select id={`${fid}-gender`} value={f.gender} onChange={(e) => set('gender', e.target.value)} placeholder="—">
            <option value="male">{t('emp.male')}</option>
            <option value="female">{t('emp.female')}</option>
          </Select>
        </Field>
        <Field label={t('common.address')} htmlFor={`${fid}-address`} optionalLabel={t('common.optional')} className="sm:col-span-2">
          <Textarea id={`${fid}-address`} value={f.address} onChange={(e) => set('address', e.target.value)} rows={2} maxLength={300} />
        </Field>
        <Field label={t('common.status')} htmlFor={`${fid}-status`}>
          <Select id={`${fid}-status`} value={f.active ? 'active' : 'inactive'} onChange={(e) => set('active', e.target.value === 'active')}>
            <option value="active">{t('common.active')}</option>
            <option value="inactive">{t('common.inactive')}</option>
          </Select>
        </Field>
        {f.salaryType === 'MONTHLY' ? <p className="self-end text-caption text-muted sm:col-span-1">{t('emp.monthlyHint')}</p> : null}
      </form>
    </Dialog>
  );
}

// ─── Pay a salary (daily: days worked; monthly: a month) ───────────────────────────────────────────
function PayDialog({ employee, onClose }: { employee: EmployeeRow | null; onClose: () => void }) {
  const { t, bump, rate } = useApp();
  const toast = useToast();
  const guard = useMoneyGuard();
  const [period, setPeriod] = useState('');
  const [days, setDays] = useState('');
  const [vault, setVault] = useState<'USD' | 'IQD'>('USD');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!employee) return;
    const now = new Date();
    setPeriod(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setDays('');
    setVault('USD');
    setErrors({});
  }, [employee]);

  const daily = employee?.salaryType === 'DAILY';
  const maxDays = daysInMonth(period);
  const d = parseDec(days);
  const amountUsd = employee ? (daily ? D(employee.salaryUsd).times(d ?? 0).toDecimalPlaces(2) : D(employee.salaryUsd)) : D(0);
  const vaultAmount = vault === 'USD' ? amountUsd : roundMoney(amountUsd.times(D(rate)), 'IQD');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!employee) return;
    const errs: Record<string, string> = {};
    if (!period) errs.period = t('v.required');
    if (daily) {
      if (!d || !d.gt(0)) errs.days = t('v.positive');
      else if (d.gt(maxDays)) errs.days = t('emp.tooManyDays', { max: maxDays });
      else if (!d.div(RULES.salaryDayStep).isInteger()) errs.days = t('emp.dayStep');
    }
    if (Object.keys(errs).length) return setErrors(errs);
    setBusy(true);
    const res = await guard.send<{ number: string }>('/api/employees/pay', { method: 'POST', body: { employeeId: employee.id, period, days: daily ? days : undefined, vault } });
    setBusy(false);
    if (!res.ok) {
      if (res.code === 'vault.shortCancelled') return;
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(t('emp.paid', { name: employee.name, number: res.data.number }));
    bump();
    onClose();
  }

  const fid = 'emp-pay';
  return (
    <Dialog
      open={!!employee}
      onClose={onClose}
      size="sm"
      title={employee ? (daily ? t('emp.payDays') : t('emp.payMonth')) : ''}
      description={employee?.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={fid} busy={busy} icon={<HandCoins className="h-4 w-4" aria-hidden="true" />}>
            {t('emp.confirmPay')}
          </Button>
        </>
      }
    >
      <form id={fid} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('emp.period')} htmlFor={`${fid}-period`} error={errors.period} required>
          <Input id={`${fid}-period`} type="month" dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} invalid={!!errors.period} />
        </Field>
        {daily ? (
          <Field label={t('emp.daysWorked')} htmlFor={`${fid}-days`} error={errors.days} hint={t('emp.maxDays', { n: maxDays })} required>
            <Input id={`${fid}-days`} numeric type="number" step={RULES.salaryDayStep} min={0} max={maxDays} value={days} onChange={(e) => setDays(e.target.value)} invalid={!!errors.days} data-autofocus />
          </Field>
        ) : null}
        <Field label={t('common.vault')} htmlFor={`${fid}-vault`} error={errors.vault}>
          <Select id={`${fid}-vault`} value={vault} onChange={(e) => setVault(e.target.value as 'USD' | 'IQD')}>
            <option value="USD">{t('vault.USD')}</option>
            <option value="IQD">{t('vault.IQD')}</option>
          </Select>
        </Field>
        <div className="rounded-ctl bg-tint px-4 py-3 text-body text-ink">
          <p>
            {t('emp.salaryLabel')} <strong className="num">{fmtMoney(amountUsd)}</strong>
            {daily && d && d.gt(0) ? <span className="num text-caption text-muted"> ({t('emp.daysLine', { days: fmtNum(d, d.isInteger() ? 0 : 1), rate: fmtMoney(employee?.salaryUsd ?? 0) })})</span> : null}
          </p>
          {vault === 'IQD' ? (
            <p className="mt-1">
              {t('emp.vaultDebit')} <strong className="num">{fmtMoney(vaultAmount, 'IQD')}</strong>
            </p>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
