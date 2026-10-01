'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Database, FileDown, FileSpreadsheet, History, Languages, Pencil, Plus, ScrollText, Shapes, Siren, Trash2, Truck, Upload, Users, Package, ArrowLeftRight } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { api, qs } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { downloadFile } from '@/lib/client/print';
import { fmtDateTime } from '@/lib/dates';
import { fmtKg, rateLine } from '@/lib/money';
import { ACTIONS, PAGES, actionKey, pageKey } from '@/lib/permissions';
import type { DictKey, Lang } from '@/lib/i18n';
import { hasKey } from '@/lib/i18n';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, Field, Input, PageHeader, Segmented, Select, Skeleton, Textarea, Toggle } from '@/components/ui';
import { Dialog } from '@/components/Dialog';
import { DateRange } from '@/components/DateInput';
import { Pager, SearchBox, useListState } from '@/components/DataTable';
import { RateEditDialog, RateLogList } from '@/components/RateDialogs';
import { useToast } from '@/components/Toast';

type Section = 'company' | 'rate' | 'types' | 'products' | 'alerts' | 'language' | 'users' | 'audit' | 'data';
const SECTIONS: { id: Section; label: DictKey; icon: typeof Building2; owner?: boolean }[] = [
  { id: 'company', label: 'set.company', icon: Building2, owner: true },
  { id: 'rate', label: 'set.rate', icon: ArrowLeftRight },
  { id: 'types', label: 'set.types', icon: Shapes },
  { id: 'products', label: 'set.products', icon: Package },
  { id: 'alerts', label: 'set.alerts', icon: Siren },
  { id: 'language', label: 'set.language', icon: Languages },
  { id: 'users', label: 'set.users', icon: Users, owner: true },
  { id: 'audit', label: 'set.audit', icon: ScrollText, owner: true },
  { id: 'data', label: 'set.export', icon: Database, owner: true },
];

export function SettingsView({ initial }: { initial: string }) {
  const { t, user } = useApp();
  const router = useRouter();
  const allowed = SECTIONS.filter((s) => !s.owner || user.isOwner);
  const [sec, setSec] = useState<Section>(allowed.some((s) => s.id === initial) ? (initial as Section) : allowed[0].id);
  const go = (s: Section) => {
    setSec(s);
    router.replace(`/settings?section=${s}`, { scroll: false });
  };
  return (
    <div>
      <PageHeader title={t('set.title')} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:hidden">
          <Select aria-label={t('set.section')} value={sec} onChange={(e) => go(e.target.value as Section)}>
            {allowed.map((s) => (
              <option key={s.id} value={s.id}>
                {t(s.label)}
              </option>
            ))}
          </Select>
        </div>
        <nav aria-label={t('set.section')} className="hidden lg:block">
          <ul className="flex flex-col gap-0.5">
            {allowed.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    aria-current={sec === s.id ? 'page' : undefined}
                    className={cx('flex h-10 w-full items-center gap-3 rounded-ctl px-3 text-start text-body font-medium transition-colors', sec === s.id ? 'bg-tint text-brand-ink' : 'text-muted hover:bg-surface hover:text-ink')}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t(s.label)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Card className="mt-4 p-4">
            <p className="flex items-center gap-2 text-meta font-semibold text-ink">
              <Truck className="h-4 w-4 text-brand-ink" aria-hidden="true" />
              {t('set.beneficiariesShortcut')}
            </p>
            <p className="mt-1 text-caption text-muted">{t('set.beneficiariesShortcutHint')}</p>
            <Link href="/beneficiaries" className="mt-2 inline-block text-meta font-semibold text-brand-ink hover:underline">
              {t('set.openBeneficiaries')}
            </Link>
          </Card>
        </nav>
        <div className="min-w-0">
          {sec === 'company' && user.isOwner ? <CompanySection /> : null}
          {sec === 'rate' ? <RateSection /> : null}
          {sec === 'types' ? <TypesSection /> : null}
          {sec === 'products' ? <ProductsSection /> : null}
          {sec === 'alerts' ? <AlertsSection /> : null}
          {sec === 'language' ? <LanguageSection /> : null}
          {sec === 'users' && user.isOwner ? <UsersSection /> : null}
          {sec === 'audit' && user.isOwner ? <AuditSection /> : null}
          {sec === 'data' && user.isOwner ? <DataSection /> : null}
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children, action, owner }: { title: string; hint?: string; children: ReactNode; action?: ReactNode; owner?: boolean }) {
  const { t } = useApp();
  return (
    <Card className="p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-title font-semibold text-ink">
            {title}
            {owner ? <Badge>{t('set.ownerOnly')}</Badge> : null}
          </h2>
          {hint ? <p className="mt-0.5 max-w-2xl text-meta text-muted">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

// ─── Company ───────────────────────────────────────────────────────────────────────────────────────
type Company = { name: string; logo: string | null; address: string; phones: string; footerNote: string };

function CompanySection() {
  const { t } = useApp();
  const toast = useToast();
  const { data, setData } = useRemote<Company>('/api/settings/company');
  const [f, setF] = useState<Company | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setF(data), [data]);
  if (!f) return <Skeleton className="h-96 w-full" />;

  async function onLogo(fl?: File) {
    if (!fl) return;
    if (fl.size > 5 * 1024 * 1024) return setErrors({ logo: t('v.imageTooLarge') });
    const url = URL.createObjectURL(fl);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      setF((x) => (x ? { ...x, logo: c.toDataURL('image/png') } : x));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<Company>('/api/settings/company', { method: 'PUT', body: f });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      return toast.error(res.error);
    }
    setData(res.data);
    setErrors({});
    toast.success(t('toast.saved'));
  }

  return (
    <Section title={t('set.company')} hint={t('set.companyHint')} owner>
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.logo ?? '/app-icon.png'} alt="" className="h-16 w-16 rounded-[22%] border border-line-soft bg-surface object-contain" />
          <div>
            <p className="text-meta font-medium text-ink">{t('set.logo')}</p>
            {!f.logo ? <p className="text-caption text-muted">{t('set.logoDefault')}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => file.current?.click()} icon={<Upload className="h-4 w-4" aria-hidden="true" />}>
                {t('common.upload')}
              </Button>
              {f.logo ? (
                <Button size="sm" variant="quiet" onClick={() => setF({ ...f, logo: null })}>
                  {t('set.resetLogo')}
                </Button>
              ) : null}
            </div>
            {errors.logo ? <p role="alert" className="mt-1 text-meta text-danger-ink">{errors.logo}</p> : null}
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => onLogo(e.target.files?.[0])} />
          </div>
        </div>
        <Field label={t('set.companyName')} htmlFor="co-name" error={errors.name} required>
          <Input id="co-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t('common.address')} htmlFor="co-address" optionalLabel={t('common.optional')}>
            <Textarea id="co-address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} rows={2} maxLength={300} />
          </Field>
          <Field label={t('set.phones')} htmlFor="co-phones" optionalLabel={t('common.optional')}>
            <Input id="co-phones" dir="ltr" value={f.phones} onChange={(e) => setF({ ...f, phones: e.target.value })} maxLength={120} />
          </Field>
        </div>
        <Field label={t('set.footer')} htmlFor="co-footer" optionalLabel={t('common.optional')} hint={t('doc.thankYou')}>
          <Textarea id="co-footer" value={f.footerNote} onChange={(e) => setF({ ...f, footerNote: e.target.value })} rows={2} maxLength={300} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" busy={busy}>
            {t('common.saveChanges')}
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ─── Exchange rate ─────────────────────────────────────────────────────────────────────────────────
function RateSection() {
  const { t, rate, canDo } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <Section
      title={t('set.rate')}
      hint={t('vault.rateHint')}
      action={
        canDo('canEditExchangeRate') ? (
          <Button onClick={() => setOpen(true)} icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
            {t('vault.editRate')}
          </Button>
        ) : null
      }
    >
      <div className="mb-5 rounded-ctl bg-tint px-4 py-3">
        <p className="text-caption text-muted">{t('set.rateCurrent')}</p>
        <p className="num text-heading font-bold text-ink">{rateLine(rate)}</p>
      </div>
      <h3 className="mb-2 flex items-center gap-2 text-body font-semibold text-ink">
        <History className="h-4 w-4 text-muted" aria-hidden="true" />
        {t('set.rateLog')}
      </h3>
      <RateLogList />
      <RateEditDialog open={open} onClose={() => setOpen(false)} />
    </Section>
  );
}

// ─── Aluminum types ────────────────────────────────────────────────────────────────────────────────
type TypeRow = { id: string; name: string; isDemo: boolean; products: number };

function TypesSection() {
  const { t, bump } = useApp();
  const toast = useToast();
  const { data } = useRemote<TypeRow[]>('/api/lookup/types');
  const [edit, setEdit] = useState<{ id?: string; name: string } | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    const res = await api(edit.id ? `/api/types/${edit.id}` : '/api/types', { method: edit.id ? 'PUT' : 'POST', body: { name: edit.name } });
    setBusy(false);
    if (!res.ok) return setErr(res.fieldErrors?.name ?? res.error);
    toast.success(t('toast.saved'));
    setEdit(null);
    bump();
  }
  async function remove(r: TypeRow) {
    const res = await api(`/api/types/${r.id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error(res.error);
    toast.success(t('toast.saved'));
    bump();
  }

  return (
    <Section
      title={t('set.types')}
      hint={t('set.typesHint')}
      action={
        <Button onClick={() => (setErr(undefined), setEdit({ name: '' }))} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          {t('set.addType')}
        </Button>
      }
    >
      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <ul className="divide-y divide-line-soft rounded-ctl border border-line-soft">
          {data.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="bidi truncate font-semibold text-ink">{r.name}</span>
                {r.isDemo ? <Badge tone="brand">{t('app.demo')}</Badge> : null}
                <span className="text-caption text-muted">{t('set.typeInUse', { n: r.products })}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                <Button size="sm" variant="quiet" onClick={() => (setErr(undefined), setEdit({ id: r.id, name: r.name }))} icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
                  {t('common.rename')}
                </Button>
                <Button size="sm" variant="quiet" disabled={r.products > 0} onClick={() => remove(r)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />} className="hover:text-danger-ink">
                  {t('common.delete')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        size="sm"
        title={edit?.id ? t('common.rename') : t('set.addType')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="type-form" busy={busy}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="type-form" onSubmit={save} noValidate>
          <Field label={t('set.typeName')} htmlFor="type-name" error={err} required>
            <Input id="type-name" value={edit?.name ?? ''} onChange={(e) => setEdit((x) => (x ? { ...x, name: e.target.value } : x))} maxLength={60} invalid={!!err} />
          </Field>
        </form>
      </Dialog>
    </Section>
  );
}

// ─── Products ──────────────────────────────────────────────────────────────────────────────────────
type ProductRow = { id: string; name: string; sku: string; typeId: string; typeName: string; lowStockKg: string | null; isDemo: boolean; inUse: boolean };

function ProductsSection() {
  const { t, bump } = useApp();
  const toast = useToast();
  const { data } = useRemote<ProductRow[]>('/api/products');
  const types = useRemote<TypeRow[]>('/api/lookup/types');
  const alerts = useRemote<{ lowStockKg: string }>('/api/settings/alerts');
  const [edit, setEdit] = useState<{ id?: string; name: string; sku: string; typeId: string; lowStockKg: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    const res = await api(edit.id ? `/api/products/${edit.id}` : '/api/products', { method: edit.id ? 'PUT' : 'POST', body: { ...edit, lowStockKg: edit.lowStockKg || null } });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(t('toast.saved'));
    setEdit(null);
    bump();
  }
  async function remove(r: ProductRow) {
    const res = await api(`/api/products/${r.id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error(res.error);
    toast.success(t('toast.saved'));
    bump();
  }
  const list = (data ?? []).filter((p) => !q || `${p.name} ${p.sku} ${p.typeName}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()));

  return (
    <Section
      title={t('set.products')}
      action={
        <Button onClick={() => (setErrors({}), setEdit({ name: '', sku: '', typeId: '', lowStockKg: '' }))} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          {t('set.addProduct')}
        </Button>
      }
    >
      <SearchBox value={q} onChange={setQ} placeholder={t('inv.searchPh')} className="mb-3 md:w-72" />
      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : !data.length ? (
        <p className="py-8 text-center text-body text-muted">{t('set.productsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-ctl border border-line-soft">
          {list.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="bidi truncate font-semibold text-ink">{r.name}</span>
                  {r.isDemo ? <Badge tone="brand">{t('app.demo')}</Badge> : null}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption text-muted">
                  <span className="num rounded bg-tint px-1.5 font-semibold text-brand-ink">{r.sku}</span>
                  <span className="bidi">{r.typeName}</span>·
                  <span className="num">
                    {t('inv.low')}: {r.lowStockKg !== null ? fmtKg(r.lowStockKg) : t('set.productThresholdDefault', { kg: alerts.data ? fmtKg(alerts.data.lowStockKg) : '…' })}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => (setErrors({}), setEdit({ id: r.id, name: r.name, sku: r.sku, typeId: r.typeId, lowStockKg: r.lowStockKg ?? '' }))}
                  icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                >
                  {t('common.edit')}
                </Button>
                <Button size="sm" variant="quiet" disabled={r.inUse} onClick={() => remove(r)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />} className="hover:text-danger-ink">
                  {t('common.delete')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? t('set.editProduct') : t('set.addProduct')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="prod-form" busy={busy}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {edit ? (
          <form id="prod-form" onSubmit={save} noValidate className="flex flex-col gap-4">
            <Field label={t('pur.productName')} htmlFor="p-name" error={errors.name} required>
              <Input id="p-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={120} invalid={!!errors.name} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('common.sku')} htmlFor="p-sku" error={errors.sku} required>
                <Input id="p-sku" dir="ltr" value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value.toUpperCase() })} maxLength={60} invalid={!!errors.sku} className="num" />
              </Field>
              <Field label={t('common.aluminumType')} htmlFor="p-type" error={errors.typeId} required>
                <Select id="p-type" value={edit.typeId} onChange={(e) => setEdit({ ...edit, typeId: e.target.value })} invalid={!!errors.typeId}>
                  <option value="">{t('common.select')}</option>
                  {(types.data ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t('inv.threshold')} htmlFor="p-low" error={errors.lowStockKg} hint={t('inv.thresholdHint', { kg: alerts.data ? fmtKg(alerts.data.lowStockKg) : '…' })} optionalLabel={t('set.override')}>
              <Input id="p-low" numeric value={edit.lowStockKg} onChange={(e) => setEdit({ ...edit, lowStockKg: e.target.value })} invalid={!!errors.lowStockKg} />
            </Field>
          </form>
        ) : null}
      </Dialog>
    </Section>
  );
}

// ─── Alerts & thresholds ───────────────────────────────────────────────────────────────────────────
type AlertS = {
  lowStockKg: string;
  alertCustomerDue: boolean;
  customerDueUsd: string;
  alertBeneficiaryDue: boolean;
  beneficiaryDueUsd: string;
  alertLowStock: boolean;
  alertVault: boolean;
  vaultMinUsd: string;
  vaultMinIqd: string;
  alertOverdue: boolean;
  overdueDays: number;
};

function AlertsSection() {
  const { t, bump } = useApp();
  const toast = useToast();
  const { data } = useRemote<AlertS>('/api/settings/alerts');
  const [f, setF] = useState<AlertS | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(data), [data]);
  if (!f) return <Skeleton className="h-96 w-full" />;
  const set = <K extends keyof AlertS>(k: K, v: AlertS[K]) => setF({ ...f, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api('/api/settings/alerts', { method: 'PUT', body: f });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      return toast.error(res.error);
    }
    setErrors({});
    toast.success(t('toast.saved'));
    bump();
  }

  return (
    <div className="flex flex-col gap-5">
      <Section title={t('set.thresholds')}>
        <Field label={t('set.globalLow')} htmlFor="al-low" error={errors.lowStockKg} className="max-w-xs">
          <Input id="al-low" numeric value={f.lowStockKg} onChange={(e) => set('lowStockKg', e.target.value)} invalid={!!errors.lowStockKg} />
        </Field>
      </Section>
      <Section title={t('set.alerts')}>
        <form id="alerts-form" onSubmit={save} noValidate>
          <Row on={f.alertCustomerDue} onToggle={(v) => set('alertCustomerDue', v)} label={t('set.alertCustomerDue')}>
            <MoneyIn id="al-cd" value={f.customerDueUsd} onChange={(v) => set('customerDueUsd', v)} suffix="USD" error={errors.customerDueUsd} />
          </Row>
          <Row on={f.alertBeneficiaryDue} onToggle={(v) => set('alertBeneficiaryDue', v)} label={t('set.alertBeneficiaryDue')}>
            <MoneyIn id="al-bd" value={f.beneficiaryDueUsd} onChange={(v) => set('beneficiaryDueUsd', v)} suffix="USD" error={errors.beneficiaryDueUsd} />
          </Row>
          <Row on={f.alertLowStock} onToggle={(v) => set('alertLowStock', v)} label={t('set.alertLowStock')} />
          <Row on={f.alertVault} onToggle={(v) => set('alertVault', v)} label={t('set.alertVault')}>
            <MoneyIn id="al-vu" label={t('set.vaultMinUsd')} value={f.vaultMinUsd} onChange={(v) => set('vaultMinUsd', v)} suffix="USD" error={errors.vaultMinUsd} />
            <MoneyIn id="al-vi" label={t('set.vaultMinIqd')} value={f.vaultMinIqd} onChange={(v) => set('vaultMinIqd', v)} suffix="IQD" error={errors.vaultMinIqd} />
          </Row>
          <Row on={f.alertOverdue} onToggle={(v) => set('alertOverdue', v)} label={t('set.alertOverdue')}>
            <MoneyIn id="al-od" value={String(f.overdueDays)} onChange={(v) => set('overdueDays', Number(v) || 0)} suffix={t('common.days')} error={errors.overdueDays} />
          </Row>
        </form>
      </Section>
      <div className="flex justify-end">
        <Button type="submit" form="alerts-form" busy={busy}>
          {t('common.saveChanges')}
        </Button>
      </div>
    </div>
  );
}

function Row({ on, onToggle, label, children }: { on: boolean; onToggle: (v: boolean) => void; label: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line-soft py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex items-center gap-3 text-body font-medium text-ink">
        <Toggle checked={on} onChange={onToggle} label={label} />
        {label}
      </label>
      <div className={cx('flex flex-wrap items-center gap-3 sm:justify-end', !on && 'opacity-50')}>{children}</div>
    </div>
  );
}

function MoneyIn({ id, value, onChange, suffix, error, label }: { id: string; value: string; onChange: (v: string) => void; suffix: string; error?: string; label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={id} className="text-caption text-muted">
          {label}
        </label>
      ) : null}
      <div className="relative w-44">
        <Input id={id} numeric value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} className="pe-14" aria-label={label ?? suffix} />
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-caption font-semibold text-muted">{suffix}</span>
      </div>
      {error ? <p className="text-caption text-danger-ink">{error}</p> : null}
    </div>
  );
}

// ─── Language ──────────────────────────────────────────────────────────────────────────────────────
function LanguageSection() {
  const { t, lang } = useApp();
  const router = useRouter();
  return (
    <Section title={t('set.language')} hint={t('set.languageHint')}>
      <div dir="ltr" className="max-w-xs">
        <Segmented<Lang>
          label={t('set.language')}
          value={lang}
          onChange={async (l) => {
            await api('/api/auth/lang', { method: 'PUT', body: { lang: l } });
            router.refresh();
          }}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ku', label: <span lang="ckb">کوردی سۆرانی</span> },
          ]}
          className="w-full"
        />
      </div>
    </Section>
  );
}

// ─── Users & permissions ───────────────────────────────────────────────────────────────────────────
type UserRow = { id: string; name: string; email: string; isOwner: boolean; active: boolean; permissions: string[]; lastLoginAt: string | null };
type UserForm = { id?: string; name: string; email: string; password: string; active: boolean; permissions: string[]; isOwner?: boolean };
const NAV_LABEL: Record<(typeof PAGES)[number], DictKey> = {
  dashboard: 'nav.dashboard',
  customers: 'nav.customers',
  beneficiaries: 'nav.beneficiaries',
  inventory: 'nav.inventory',
  pos: 'nav.pos',
  invoices: 'nav.invoices',
  vault: 'nav.vault',
  reports: 'nav.reports',
  settings: 'nav.settings',
};

function UsersSection() {
  const { t, bump } = useApp();
  const toast = useToast();
  const { data } = useRemote<UserRow[]>('/api/users');
  const [f, setF] = useState<UserForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setBusy(true);
    const res = await api(f.id ? `/api/users/${f.id}` : '/api/users', { method: f.id ? 'PUT' : 'POST', body: f });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(t('toast.saved'));
    setF(null);
    bump();
  }
  const toggle = (key: string, on: boolean) => f && setF({ ...f, permissions: on ? [...new Set([...f.permissions, key])] : f.permissions.filter((p) => p !== key) });

  return (
    <Section
      owner
      title={t('set.users')}
      action={
        <Button onClick={() => (setErrors({}), setF({ name: '', email: '', password: '', active: true, permissions: [pageKey('dashboard')] }))} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          {t('set.addUser')}
        </Button>
      }
    >
      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <ul className="divide-y divide-line-soft rounded-ctl border border-line-soft">
            {data.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="bidi font-semibold text-ink">{u.name}</span>
                    {u.isOwner ? <Badge tone="brand">{t('common.owner')}</Badge> : null}
                    {!u.active ? <Badge tone="danger">{t('common.inactive')}</Badge> : null}
                  </span>
                  <span className="num block text-caption text-muted" dir="ltr">
                    {u.email}
                  </span>
                  <span className="block text-caption text-muted">
                    {u.isOwner ? t('set.allAccess') : t('set.pagesCount', { n: u.permissions.filter((p) => p.startsWith('page:')).length })} · {t('common.lastLogin')}:{' '}
                    <span className="num">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : t('common.never')}</span>
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => (setErrors({}), setF({ id: u.id, name: u.name, email: u.email, password: '', active: u.active, permissions: u.permissions, isOwner: u.isOwner }))}
                  icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                >
                  {t('common.edit')}
                </Button>
              </li>
            ))}
          </ul>
          {data.length === 1 ? <p className="mt-3 text-meta text-muted">{t('set.usersEmpty')}</p> : null}
        </>
      )}
      <Dialog
        open={!!f}
        onClose={() => setF(null)}
        size="lg"
        title={f?.id ? t('set.editUser') : t('set.addUser')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setF(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="user-form" busy={busy}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {f ? (
          <form id="user-form" onSubmit={save} noValidate className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('common.fullName')} htmlFor="u-name" error={errors.name} required>
                <Input id="u-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} invalid={!!errors.name} autoComplete="off" />
              </Field>
              <Field label={t('common.email')} htmlFor="u-email" error={errors.email} required>
                <Input id="u-email" type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} invalid={!!errors.email} autoComplete="off" />
              </Field>
            </div>
            <Field label={t('common.password')} htmlFor="u-pass" error={errors.password} required={!f.id} hint={f.id ? t('set.passwordKeep') : undefined}>
              <Input id="u-pass" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} invalid={!!errors.password} autoComplete="new-password" />
            </Field>
            {f.isOwner ? (
              <p className="rounded-ctl bg-tint px-4 py-3 text-meta text-ink">{t('block.ownerLocked')}</p>
            ) : (
              <>
                <label className="flex items-center gap-3 text-body font-medium text-ink">
                  <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={t('common.active')} />
                  {f.active ? t('common.active') : t('common.inactive')}
                  <span className="text-caption font-normal text-muted">{t('set.userInactive')}</span>
                </label>
                <fieldset>
                  <legend className="mb-2 text-meta font-semibold text-ink">{t('set.pageAccess')}</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PAGES.map((p) => (
                      <label key={p} className="flex items-center gap-3 rounded-ctl border border-line-soft px-3 py-2 text-body text-ink">
                        <Toggle checked={f.permissions.includes(pageKey(p))} onChange={(v) => toggle(pageKey(p), v)} label={t(NAV_LABEL[p])} />
                        {t(NAV_LABEL[p])}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-meta font-semibold text-ink">{t('set.actionPerms')}</legend>
                  {ACTIONS.map((a) => {
                    const k = `set.perm.${a}`;
                    return (
                      <label key={a} className="flex items-center gap-3 rounded-ctl border border-line-soft px-3 py-2 text-body text-ink">
                        <Toggle checked={f.permissions.includes(actionKey(a))} onChange={(v) => toggle(actionKey(a), v)} label={hasKey(k) ? t(k) : a} />
                        {hasKey(k) ? t(k) : a}
                      </label>
                    );
                  })}
                </fieldset>
              </>
            )}
          </form>
        ) : null}
      </Dialog>
    </Section>
  );
}

// ─── Audit log ─────────────────────────────────────────────────────────────────────────────────────
type AuditRow = { id: number; userName: string; action: string; module: string; reference: string; before: unknown; after: unknown; createdAt: string };

function AuditSection() {
  const { t } = useApp();
  const L = useListState('createdAt', 'desc', { module: '', action: '', from: '', to: '' });
  const { data, loading } = useRemote<{ total: number; modules: string[]; rows: AuditRow[] }>(`/api/settings/audit${L.query}`, { keepPrevious: true });
  const [open, setOpen] = useState<AuditRow | null>(null);
  const actionLabel = (a: string) => (hasKey(`audit.${a}`) ? t(`audit.${a}` as DictKey) : a);
  return (
    <Section owner title={t('set.audit')}>
      <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center">
        <SearchBox value={L.q} onChange={L.setQ} placeholder={t('common.searchPlaceholder')} className="xl:w-56" />
        <Select aria-label={t('common.module')} value={L.filters.module} onChange={(e) => L.setFilter('module', e.target.value)} className="xl:w-44">
          <option value="">{t('common.module')}: {t('common.all')}</option>
          {(data?.modules ?? []).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select aria-label={t('common.action')} value={L.filters.action} onChange={(e) => L.setFilter('action', e.target.value)} className="xl:w-44">
          <option value="">{t('common.action')}: {t('common.all')}</option>
          {['create', 'update', 'delete', 'login', 'login_failed', 'logout', 'permission', 'rate', 'export', 'settings', 'mismatch'].map((a) => (
            <option key={a} value={a}>
              {actionLabel(a)}
            </option>
          ))}
        </Select>
        <DateRange idPrefix="aud" from={L.filters.from} to={L.filters.to} onFrom={(v) => L.setFilter('from', v)} onTo={(v) => L.setFilter('to', v)} />
      </div>
      {!data ? (
        <Skeleton className="h-60 w-full" />
      ) : !data.rows.length ? (
        <p className="py-8 text-center text-body text-muted">{t('set.auditEmpty')}</p>
      ) : (
        <div className={cx('-mx-5 md:-mx-6', loading && 'opacity-60')}>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-meta">
              <thead>
                <tr className="border-y border-line-soft bg-surface-2 text-caption text-muted">
                  <th scope="col" className="py-2.5 ps-5 pe-3 text-start font-semibold md:ps-6">{t('common.timestamp')}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.user')}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.action')}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.module')}</th>
                  <th scope="col" className="py-2.5 ps-3 pe-5 text-start font-semibold md:pe-6">{t('common.reference')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => setOpen(r)} onKeyDown={(e) => e.key === 'Enter' && setOpen(r)} className="cursor-pointer border-b border-line-soft outline-none last:border-0 hover:bg-surface-2 focus-visible:bg-tint">
                    <td className="num py-2.5 ps-5 pe-3 text-muted md:ps-6">{fmtDateTime(r.createdAt)}</td>
                    <td className="bidi px-3 py-2.5 text-ink">{r.userName || '—'}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={r.action === 'delete' || r.action === 'login_failed' || r.action === 'mismatch' ? 'danger' : r.action === 'create' ? 'success' : 'neutral'}>{actionLabel(r.action)}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{r.module}</td>
                    <td className="bidi max-w-[280px] truncate py-2.5 ps-3 pe-5 text-ink md:pe-6">{r.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} />
        </div>
      )}
      <Dialog open={!!open} onClose={() => setOpen(null)} size="xl" title={open ? `${actionLabel(open.action)} · ${open.module}` : ''} description={open ? `${fmtDateTime(open.createdAt)} · ${open.userName}` : undefined}>
        {open ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(['before', 'after'] as const).map((k) => (
              <div key={k} className="min-w-0">
                <p className="mb-1 text-caption font-semibold text-muted">{t(k === 'before' ? 'common.before' : 'common.after')}</p>
                <pre dir="ltr" className="scroll-thin max-h-[50dvh] overflow-auto rounded-ctl bg-surface-2 p-3 text-caption text-ink">{open[k] ? JSON.stringify(open[k], null, 2) : '—'}</pre>
              </div>
            ))}
          </div>
        ) : null}
      </Dialog>
    </Section>
  );
}

// ─── Data export & demo ────────────────────────────────────────────────────────────────────────────
function DataSection() {
  const { t, bump } = useApp();
  const toast = useToast();
  const demo = useRemote<{ total: number }>('/api/settings/demo');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function dl(format: 'json' | 'xlsx') {
    setBusy(format);
    const r = await downloadFile(`/api/settings/export${qs({ format })}`, `alu-factory.${format}`);
    setBusy(null);
    if (r.ok) toast.success(t('toast.exported'));
    else toast.error(r.error || t('err.generic'));
  }
  async function removeDemo() {
    setBusy('demo');
    const r = await api('/api/settings/demo', { method: 'DELETE' });
    setBusy(null);
    setConfirm(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(t('toast.demoRemoved'));
    bump();
  }
  return (
    <div className="flex flex-col gap-5">
      <Section owner title={t('set.export')} hint={t('set.exportHint')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={busy === 'json'} onClick={() => dl('json')} icon={<FileDown className="h-4 w-4" aria-hidden="true" />}>
            {t('set.exportJson')}
          </Button>
          <Button variant="secondary" busy={busy === 'xlsx'} onClick={() => dl('xlsx')} icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}>
            {t('set.exportExcel')}
          </Button>
        </div>
        <p className="mt-3 text-caption text-muted">{t('set.backupNote')}</p>
      </Section>
      <Section title={t('set.demo')} hint={demo.data ? (demo.data.total ? t('set.demoHint', { n: demo.data.total }) : t('set.demoNone')) : undefined}>
        <Button variant="danger" disabled={!demo.data?.total} onClick={() => setConfirm(true)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
          {t('set.removeDemo')}
        </Button>
      </Section>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title={t('set.removeDemo')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" busy={busy === 'demo'} onClick={removeDemo}>
              {t('set.removeDemo')}
            </Button>
          </>
        }
      >
        <p className="text-body text-ink">{t('set.removeDemoConfirm')}</p>
      </Dialog>
    </div>
  );
}
