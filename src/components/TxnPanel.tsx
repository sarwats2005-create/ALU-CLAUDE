'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Eraser, Pencil, Printer, Trash2, FileDown, Undo2 } from 'lucide-react';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { downloadFile, printDocument } from '@/lib/client/print';
import { conversionText } from '@/lib/conversion';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { convert, D, fmtCost, fmtKg, fmtMoney, fmtNum, fmtPct, fmtPrice, rateLine, roundMoney } from '@/lib/money';
import { KIND_PAGE, editHref, type Kind } from '@/lib/kinds';
import { cx } from '@/lib/cx';
import { isInvoiceKind, isLocked, remaining } from '@/lib/lock';
import { removeInvoiceFile } from '@/lib/client/invoice-folder';
import { docUrl, usePaper, type Paper } from '@/lib/client/paper';
import { Dialog } from './Dialog';
import { Badge, Button, Segmented, Skeleton } from './ui';
import { useToast } from './Toast';
import { useErase } from './EraseMode';
import { RevertProcessingDialog } from './RevertProcessing';

type OpenOpts = { confirmDelete?: boolean };
type Ctx = { open: (id: string, opts?: OpenOpts) => void };
const PanelCtx = createContext<Ctx>({ open: () => {} });
export const useTxnPanel = () => useContext(PanelCtx);

export function TxnPanelProvider({ children }: { children: ReactNode }) {
  const { t, can, bump } = useApp();
  const toast = useToast();
  const erase = useErase();
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<TxnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [revert, setRevert] = useState<string | null>(null);
  const [busy, setBusy] = useState<'delete' | 'print' | 'pdf' | null>(null);
  const [paper, setPaper] = usePaper();

  const open = useCallback(async (txnId: string, opts: OpenOpts = {}) => {
    setId(txnId);
    setData(null);
    setError(null);
    setConfirm(!!opts.confirmDelete);
    const res = await api<TxnDetail>(`/api/txns/${txnId}`);
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, []);

  const close = () => {
    setId(null);
    setConfirm(false);
  };

  const kind = data?.kind as Kind | undefined;
  // Sale and purchase invoices lock 24 hours after creation (the server refuses changes after that too).
  const mayEdit = !!kind && can(KIND_PAGE[kind]) && !data?.deletedAt && !isLocked(kind, data!.createdAt);
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
    if (isInvoiceKind(data.kind)) void removeInvoiceFile(data.id, data.number);
    window.dispatchEvent(new CustomEvent('alu:txn-deleted', { detail: { id: data.id } }));
    close();
    bump();
    router.refresh();
  }

  async function doPrint() {
    if (!data) return;
    setBusy('print');
    const r = await printDocument(docUrl(data.id, 'html', paper));
    setBusy(null);
    if (!r.ok) toast.error(r.error || t('err.generic'));
  }

  async function doPdf() {
    if (!data) return;
    setBusy('pdf');
    const r = await downloadFile(docUrl(data.id, 'pdf', paper), `${data.number}.pdf`);
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
              {erase.active ? (
                <Button
                  variant="danger"
                  className="md:me-auto"
                  onClick={async () => {
                    const d = data;
                    if (await erase.eraseTxn(d.id, d.number)) {
                      if (isInvoiceKind(d.kind)) void removeInvoiceFile(d.id, d.number);
                      close();
                    }
                  }}
                  icon={<Eraser className="h-4 w-4" aria-hidden="true" />}
                >
                  {t('erase.txn')}
                </Button>
              ) : null}
              {mayEdit && !erase.active && kind !== 'PROCESSING' ? (
                <Button variant="quiet" className="md:me-auto text-danger-ink hover:text-danger-ink" onClick={() => setConfirm(true)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
                  {t('common.delete')}
                </Button>
              ) : null}
              {/* A processing run is undone by reverting it to raw (master PIN), not by deleting it. */}
              {mayEdit && !erase.active && kind === 'PROCESSING' ? (
                <Button variant="quiet" className="md:me-auto" onClick={() => (setRevert(data.id), close())} icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}>
                  {t('prc.revert')}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={close}>
                {t('common.close')}
              </Button>
              <Segmented<Paper>
                label={t('invc.paper')}
                size="sm"
                value={paper}
                onChange={setPaper}
                options={[
                  { value: 'A5', label: 'A5' },
                  { value: 'A4', label: 'A4' },
                ]}
              />
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
            <div role="alert" className="rounded-ctl bg-danger-tint px-4 py-3 text-body text-danger-ink">
              <p className="font-semibold">{t('detail.deleteWarn', { kind: t(`kind.${data.kind}` as 'kind.SALE'), number: data.number })}</p>
              <p className="mt-1 text-meta">{t('detail.deleteEffects')}</p>
            </div>
            <TxnBody d={data} />
          </div>
        ) : null}
      </Dialog>
      <RevertProcessingDialog txnId={revert} onClose={() => setRevert(null)} onDone={() => router.refresh()} />
    </PanelCtx.Provider>
  );
}

/** Edit-window note for invoices: time left to edit/delete, or locked. */
export function LockNote({ kind, createdAt }: { kind: string; createdAt: string }) {
  const { t } = useApp();
  if (!isInvoiceKind(kind)) return null;
  const left = remaining(kind, createdAt);
  if (!left) return <span className="text-meta text-muted">{t('invc.lockNote')}</span>;
  const time = left.h ? t('invc.hm', { h: left.h, m: left.m }) : t('invc.m', { m: left.m });
  return <span className="text-meta text-muted">{t('invc.openNote', { time })}</span>;
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

/** Sale / purchase: what was paid in each currency (each to its own vault), the total paid and what is left. */
function PaidRows({ d }: { d: TxnDetail }) {
  const { t } = useApp();
  const cur = d.currency as 'USD' | 'IQD';
  const usd = D(d.paidUsd);
  const iqd = D(d.paidIqd);
  const owed = D(d.total).minus(D(d.cashPaid));
  const worth = (amount: ReturnType<typeof D>, from: 'USD' | 'IQD') =>
    from !== cur && amount.gt(0) ? (
      <span className="block text-caption text-muted">= {fmtMoney(roundMoney(convert(amount, from, cur, D(d.rate)), cur), cur)}</span>
    ) : null;
  // Only a split payment needs a line per currency; a one-currency payment shows the vault it went to.
  const split = (usd.gt(0) && iqd.gt(0)) || (cur === 'USD' ? iqd.gt(0) : usd.gt(0));
  if (!split)
    return (
      <>
        <Row label={t('pay.totalPaid')}>
          <span className="num">{fmtMoney(d.cashPaid, cur)}</span>
          {usd.gt(0) || iqd.gt(0) ? <span className="block text-caption text-muted">{t(`vault.${cur}` as 'vault.USD')}</span> : null}
        </Row>
        {owed.gt(0) ? (
          <Row label={t('pay.remaining')}>
            <span className="num font-semibold text-danger-ink">{fmtMoney(owed, cur)}</span>
          </Row>
        ) : null}
      </>
    );
  return (
    <>
      {usd.gt(0) ? (
        <Row label={`${t('pay.inUsd')} → ${t('vault.USD')}`}>
          <span className="num">{fmtMoney(usd)}</span>
          {worth(usd, 'USD')}
        </Row>
      ) : null}
      {iqd.gt(0) ? (
        <Row label={`${t('pay.inIqd')} → ${t('vault.IQD')}`}>
          <span className="num">{fmtMoney(iqd, 'IQD')}</span>
          {worth(iqd, 'IQD')}
        </Row>
      ) : null}
      <Row label={t('pay.totalPaid')}>
        <span className="num">{fmtMoney(d.cashPaid, cur)}</span>
      </Row>
      {owed.gt(0) ? (
        <Row label={t('pay.remaining')}>
          <span className="num font-semibold text-danger-ink">{fmtMoney(owed, cur)}</span>
          {cur === 'USD' ? <span className="block text-caption text-muted">= {fmtMoney(roundMoney(convert(owed, 'USD', 'IQD', D(d.rate)), 'IQD'), 'IQD')}</span> : null}
        </Row>
      ) : null}
    </>
  );
}

export function TxnBody({ d }: { d: TxnDetail }) {
  const { t, lang } = useApp();
  const cur = d.currency as 'USD' | 'IQD';
  const party = d.customer ?? d.beneficiary;
  const kind = d.kind as Kind;
  const isLines = kind === 'SALE' || kind === 'PURCHASE';
  const conv =
    !isLines && d.vault && d.vault !== cur && D(d.cashPaid).gt(0)
      ? conversionText(d.cashPaid, cur, d.vault as 'USD' | 'IQD', d.rate, kind === 'CUSTOMER_PAYMENT' || kind === 'BENEFICIARY_REFUND' ? 'in' : 'out', lang)
      : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {d.deletedAt ? <Badge tone={d.label === 'reverted' ? 'warning' : 'danger'}>{t(d.label === 'reverted' ? 'status.reverted' : 'status.deleted')}</Badge> : <Badge tone="brand">{t('status.recorded')}</Badge>}
        {d.isDemo ? <Badge tone="brand">{t('app.demo')}</Badge> : null}
        {!d.deletedAt ? <LockNote kind={kind} createdAt={d.createdAt} /> : null}
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
          {isLines ? <PaidRows d={d} /> : null}
          <Row label={t('common.currency')}>{t(`cur.${cur}` as 'cur.USD')}</Row>
          {d.vault && !isLines ? (
            <Row label={kind === 'VAULT_TRANSFER' ? t('vault.fromVault') : t('common.vault')}>
              {t(`vault.${d.vault}` as 'vault.USD')} <span className="num text-muted">({fmtMoney(d.vaultAmount, d.vault as 'USD' | 'IQD')})</span>
            </Row>
          ) : null}
          {d.openDues.map((due) => (
            <Row key={due.vault} label={t('due.unpaidFromVault')}>
              <a href="/vault/dues" className="num font-semibold text-danger-ink hover:underline">
                {fmtMoney(due.remaining, due.vault)}
              </a>
            </Row>
          ))}
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
            <span className="num">{rateLine(d.rate)}</span>
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
          {d.label ? <Row label={kind === 'VAULT_WITHDRAWAL' ? t('common.reason') : kind === 'EXPENSE' ? t('exp.category') : t('common.source')}>{d.label}</Row> : null}
          {kind === 'EXPENSE' && d.unitPrice && d.quantity ? (
            <Row label={t('exp.details')}>
              <span className="num">{t('exp.unitLine', { qty: fmtNum(d.quantity, D(d.quantity).isInteger() ? 0 : 2), unit: d.unitName, price: fmtPrice(d.unitPrice, cur) })}</span>
            </Row>
          ) : null}
          {kind === 'EXPENSE' && d.recurringId ? <Row label={t('exp.source')}>{t('exp.src.recurring')}</Row> : null}
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
