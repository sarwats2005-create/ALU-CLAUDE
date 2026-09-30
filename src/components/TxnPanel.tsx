'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Printer, Trash2, FileDown } from 'lucide-react';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { downloadFile, printDocument } from '@/lib/client/print';
import { conversionText } from '@/lib/conversion';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { D, fmtCost, fmtKg, fmtMoney, fmtPct, fmtPrice, fmtRate } from '@/lib/money';
import { KIND_PAGE, editHref, type Kind } from '@/lib/kinds';
import { cx } from '@/lib/cx';
import { Dialog } from './Dialog';
import { Badge, Button, Skeleton } from './ui';
import { useToast } from './Toast';

type Ctx = { open: (id: string) => void };
const PanelCtx = createContext<Ctx>({ open: () => {} });
export const useTxnPanel = () => useContext(PanelCtx);

export function TxnPanelProvider({ children }: { children: ReactNode }) {
  const { t, can, bump } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<TxnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<'delete' | 'print' | 'pdf' | null>(null);

  const open = useCallback(async (txnId: string) => {
    setId(txnId);
    setData(null);
    setError(null);
    const res = await api<TxnDetail>(`/api/txns/${txnId}`);
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, []);

  const close = () => {
    setId(null);
    setConfirm(false);
  };

  const kind = data?.kind as Kind | undefined;
  const mayEdit = !!kind && can(KIND_PAGE[kind]) && !data?.deletedAt;
  const partyId = data?.customer?.id ?? data?.beneficiary?.id ?? null;

  async function doDelete() {
    if (!data) return;
    setBusy('delete');
    const res = await api(`/api/txns/${data.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error || t('err.delete'));
      setConfirm(false);
      return;
    }
    toast.success(t('toast.deleted'));
    window.dispatchEvent(new CustomEvent('alu:txn-deleted', { detail: { id: data.id } }));
    close();
    bump();
    router.refresh();
  }

  async function doPrint() {
    if (!data) return;
    setBusy('print');
    const r = await printDocument(`/api/docs/txn/${data.id}?format=html`);
    setBusy(null);
    if (!r.ok) toast.error(r.error || t('err.generic'));
  }

  async function doPdf() {
    if (!data) return;
    setBusy('pdf');
    const r = await downloadFile(`/api/docs/txn/${data.id}?format=pdf`, `${data.number}.pdf`);
    setBusy(null);
    if (!r.ok) toast.error(r.error || t('err.pdf'));
  }

  return (
    <PanelCtx.Provider value={{ open }}>
      {children}
      <Dialog
        open={!!id && !confirm}
        onClose={close}
        size="lg"
        title={data ? `${t(`kind.${data.kind}` as 'kind.SALE')} ${data.number}` : t('detail.title')}
        description={data ? fmtDate(data.date) : undefined}
        footer={
          data ? (
            <>
              {mayEdit ? (
                <Button variant="quiet" className="md:me-auto text-danger-ink hover:text-danger-ink" onClick={() => setConfirm(true)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
                  {t('common.delete')}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={close}>
                {t('common.close')}
              </Button>
              <Button variant="secondary" onClick={doPdf} busy={busy === 'pdf'} icon={<FileDown className="h-4 w-4" aria-hidden="true" />}>
                {t('common.downloadPdf')}
              </Button>
              <Button variant="secondary" onClick={doPrint} busy={busy === 'print'} icon={<Printer className="h-4 w-4" aria-hidden="true" />}>
                {t('common.print')}
              </Button>
              {mayEdit ? (
                <Button
                  onClick={() => {
                    close();
                    router.push(editHref(kind!, data.id, partyId));
                  }}
                  icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                >
                  {t('common.edit')}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        {error ? <p className="text-body text-danger-ink">{error}</p> : data ? <TxnBody d={data} /> : <PanelSkeleton />}
      </Dialog>

      <Dialog
        open={confirm && !!data}
        onClose={() => setConfirm(false)}
        size="lg"
        title={data ? t('detail.deleteTitle', { number: data.number }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={doDelete} busy={busy === 'delete'} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              {t('detail.deleteConfirm')}
            </Button>
          </>
        }
      >
        {data ? (
          <div className="flex flex-col gap-4">
            <div role="alert" className="rounded-ctl border border-danger/30 bg-danger-tint px-4 py-3 text-body text-danger-ink">
              <p className="font-semibold">{t('detail.deleteWarn', { kind: t(`kind.${data.kind}` as 'kind.SALE'), number: data.number })}</p>
              <p className="mt-1 text-meta">{t('detail.deleteEffects')}</p>
            </div>
            <TxnBody d={data} />
          </div>
        ) : null}
      </Dialog>
    </PanelCtx.Provider>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className={cx('text-end text-body text-ink', strong && 'font-bold')}>{children}</dd>
    </div>
  );
}

export function TxnBody({ d }: { d: TxnDetail }) {
  const { t, lang } = useApp();
  const cur = d.currency as 'USD' | 'IQD';
  const party = d.customer ?? d.beneficiary;
  const kind = d.kind as Kind;
  const isLines = kind === 'SALE' || kind === 'PURCHASE';
  const conv =
    d.vault && d.vault !== cur && D(d.cashPaid).gt(0)
      ? conversionText(d.cashPaid, cur, d.vault as 'USD' | 'IQD', d.rate, kind === 'SALE' || kind === 'CUSTOMER_PAYMENT' || kind === 'BENEFICIARY_REFUND' ? 'in' : 'out', lang)
      : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {d.deletedAt ? <Badge tone="danger">{t('status.deleted')}</Badge> : <Badge tone="brand">{t('status.recorded')}</Badge>}
        {d.isDemo ? <Badge tone="brand">{t('app.demo')}</Badge> : null}
      </div>

      {party ? (
        <div className="rounded-ctl bg-tint px-4 py-3">
          <p className="text-caption text-muted">{d.customer ? t('pos.customer') : t('nav.beneficiaries')}</p>
          <p className="bidi text-lead font-semibold text-ink">{party.name}</p>
          {party.phone ? (
            <p className="num text-meta text-muted" dir="ltr">
              {party.phone}
            </p>
          ) : null}
          {party.address ? <p className="bidi text-meta text-muted">{party.address}</p> : null}
        </div>
      ) : null}

      {isLines ? (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[520px] text-meta">
            <thead>
              <tr className="border-b border-line text-caption text-muted">
                <th scope="col" className="py-2 text-start font-semibold">{t('common.product')}</th>
                <th scope="col" className="py-2 text-start font-semibold">{t('common.stockState')}</th>
                <th scope="col" className="py-2 text-end font-semibold">{t('common.kg')}</th>
                <th scope="col" className="py-2 text-end font-semibold">{t('common.unitPriceShort')}</th>
                <th scope="col" className="py-2 text-end font-semibold">{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.id} className="border-b border-line-soft last:border-0">
                  <td className="py-2.5">
                    <span className="bidi block font-medium text-ink">{l.productName}</span>
                    <span className="num mt-0.5 inline-block rounded bg-tint px-1.5 text-caption font-semibold text-brand-ink">{l.sku}</span>
                  </td>
                  <td className="py-2.5 text-muted">{t(`state.${l.state}` as 'state.RAW')}</td>
                  <td className="num py-2.5 text-end">{fmtKg(l.kg)}</td>
                  <td className="num py-2.5 text-end">{fmtPrice(l.unitPrice, cur)}</td>
                  <td className="num py-2.5 text-end font-semibold">{fmtMoney(l.lineTotal, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {kind === 'PROCESSING' && d.product ? (
        <dl className="divide-y divide-line-soft">
          <Row label={t('common.product')}>
            <span className="bidi">{d.product.name}</span> <span className="num text-muted">({d.product.sku})</span>
          </Row>
          <Row label={t('detail.inputKg')}>
            <span className="num">{fmtKg(d.inputKg)}</span>
          </Row>
          <Row label={t('detail.method')}>{d.lossMethod === 'PERCENT' ? t('prc.byPercent') : t('prc.byKg')}</Row>
          <Row label={t('detail.lossKg')}>
            <span className="num">
              {fmtKg(d.lossKg)} ({fmtPct(d.lossPercent)})
            </span>
          </Row>
          <Row label={t('detail.outputKg')} strong>
            <span className="num">{fmtKg(d.outputKg)}</span>
          </Row>
          <Row label={t('inv.cost')}>
            <span className="num">{fmtMoney(d.cogsUsd)}</span>
          </Row>
          <Row label={t('inv.avgCostFinished')}>
            <span className="num">{D(d.outputKg).gt(0) ? fmtCost(D(d.cogsUsd).div(D(d.outputKg))) : '—'}</span>
          </Row>
        </dl>
      ) : null}

      {kind !== 'PROCESSING' ? (
        <dl className="divide-y divide-line-soft">
          <Row label={t('common.total')} strong>
            <span className="num">{fmtMoney(d.total, cur)}</span>
          </Row>
          {isLines ? (
            <Row label={t('common.cashPaid')}>
              <span className="num">{fmtMoney(d.cashPaid, cur)}</span>
            </Row>
          ) : null}
          <Row label={t('common.currency')}>{t(`cur.${cur}` as 'cur.USD')}</Row>
          {d.vault ? (
            <Row label={kind === 'VAULT_TRANSFER' ? t('vault.fromVault') : t('common.vault')}>
              {t(`vault.${d.vault}` as 'vault.USD')} <span className="num text-muted">({fmtMoney(d.vaultAmount, d.vault as 'USD' | 'IQD')})</span>
            </Row>
          ) : null}
          {kind === 'VAULT_TRANSFER' && d.toVault ? (
            <Row label={t('vault.toVault')}>
              {t(`vault.${d.toVault}` as 'vault.USD')} <span className="num text-muted">({fmtMoney(d.toAmount, d.toVault as 'USD' | 'IQD')})</span>
            </Row>
          ) : null}
          {conv ? (
            <div className="py-2">
              <p className="num rounded-ctl bg-tint px-3 py-2 text-meta text-ink">{conv}</p>
            </div>
          ) : null}
          <Row label={t('detail.rateSnapshot')}>
            <span className="num">1 USD = {fmtRate(d.rate)} IQD</span>
          </Row>
          {cur === 'IQD' ? (
            <Row label={t('common.usdEquivalent')}>
              <span className="num">{fmtMoney(d.totalUsd)}</span>
            </Row>
          ) : null}
          {kind === 'SALE' ? (
            <>
              <Row label={t('detail.cogs')}>
                <span className="num">{fmtMoney(D(d.cogsUsd).toDecimalPlaces(2))}</span>
              </Row>
              <Row label={t('detail.profit')} strong>
                <span className={cx('num', D(d.totalUsd).minus(D(d.cogsUsd)).isNegative() ? 'text-danger-ink' : 'text-success-ink')}>
                  {fmtMoney(D(d.totalUsd).minus(D(d.cogsUsd)).toDecimalPlaces(2))}
                </span>
              </Row>
            </>
          ) : null}
          {d.label ? <Row label={kind === 'VAULT_WITHDRAWAL' ? t('common.reason') : t('common.source')}>{d.label}</Row> : null}
        </dl>
      ) : null}

      {d.notes ? (
        <div>
          <p className="text-caption text-muted">{t('common.notes')}</p>
          <p className="bidi mt-1 whitespace-pre-wrap text-body text-ink">{d.notes}</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-1 gap-2 rounded-ctl bg-surface-2 px-4 py-3 text-meta sm:grid-cols-2">
        <div>
          <dt className="text-caption text-muted">{t('common.createdAt')}</dt>
          <dd className="text-ink">
            <span className="num">{fmtDateTime(d.createdAt)}</span> {d.createdByName ? <span className="bidi">{t('common.by', { name: d.createdByName })}</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted">{t('common.updatedAt')}</dt>
          <dd className="text-ink">
            <span className="num">{fmtDateTime(d.updatedAt)}</span> {d.updatedByName ? <span className="bidi">{t('common.by', { name: d.updatedByName })}</span> : null}
          </dd>
        </div>
      </dl>
    </div>
  );
}
