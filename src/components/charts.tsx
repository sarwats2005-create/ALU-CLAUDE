'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/client/app-context';
import { Segmented } from './ui';

// Chart conventions (see dataviz method): thin marks (bars ≤ 24px, 4px rounded data-end, square at the
// baseline; 2px lines; ≥8px end-dots with a 2px surface ring), solid hairline grid, text in ink tokens
// (never the series colour), hover + keyboard tooltips that never gate a value (table view twin).

export type Point = { key: string; label: string; value: number; sub?: string };

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function useRtl() {
  const [rtl, setRtl] = useState(false);
  useEffect(() => setRtl(document.documentElement.dir === 'rtl'), []);
  return rtl;
}

/** Clean axis ticks (1, 2, 5 × 10^k) covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) {
    if (min === 0) return [0, 1];
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** "$0", "$500", "$1.5K", "$2M" — axis ticks only (values elsewhere are exact). */
export function compactMoney(v: number, cur: 'USD' | 'IQD' = 'USD') {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  const s = a >= 1e9 ? `${+(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${+(a / 1e3).toFixed(1)}K` : a.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return cur === 'USD' ? `${sign}$${s}` : `${sign}${s}`;
}

function barPath(x: number, w: number, yFrom: number, yTo: number) {
  // Rounded corners only at the data end (yTo); square at the baseline (yFrom).
  const h = Math.abs(yTo - yFrom);
  const r = Math.min(4, h, w / 2);
  const up = yTo < yFrom;
  const x1 = x + w;
  if (h < 0.5) return '';
  return up
    ? `M${x},${yFrom} L${x},${yTo + r} Q${x},${yTo} ${x + r},${yTo} L${x1 - r},${yTo} Q${x1},${yTo} ${x1},${yTo + r} L${x1},${yFrom} Z`
    : `M${x},${yFrom} L${x},${yTo - r} Q${x},${yTo} ${x + r},${yTo} L${x1 - r},${yTo} Q${x1},${yTo} ${x1},${yTo - r} L${x1},${yFrom} Z`;
}

function Tooltip({ x, y, value, label, color, width }: { x: number; y: number; value: string; label: string; color: string; width: number }) {
  const w = 168;
  const left = Math.max(4, Math.min(width - w - 4, x - w / 2));
  return (
    <div role="presentation" className="pointer-events-none absolute z-10 rounded-ctl border border-line bg-surface px-3 py-2 shadow-pop" style={{ left, top: Math.max(0, y - 64), width: w }}>
      <p className="fig text-body font-bold text-ink">{value}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
        <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} aria-hidden="true" />
        <span className="bidi truncate">{label}</span>
      </p>
    </div>
  );
}

// ─── Signed columns (profit / loss by month) ───────────────────────────────────────────────────────
export function SignedBarChart({
  data,
  fmtValue,
  fmtAxis = (v) => compactMoney(v),
  height = 240,
  ariaLabel,
  posLabel,
  negLabel,
}: {
  data: Point[];
  fmtValue: (v: number) => string;
  fmtAxis?: (v: number) => string;
  height?: number;
  ariaLabel: string;
  posLabel: string;
  negLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const rtl = useRtl();
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => d.value);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const axisW = 52;
  const m = { top: 14, bottom: 28 };
  const plotW = Math.max(0, width - axisW - 4);
  const plotH = height - m.top - m.bottom;
  const y = (v: number) => m.top + ((yMax - v) / (yMax - yMin || 1)) * plotH;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(4, Math.min(24, band * 0.56));
  const xAt = (i: number) => {
    const idx = rtl ? data.length - 1 - i : i;
    return (rtl ? 4 : axisW) + band * idx + band / 2;
  };
  const every = Math.max(1, Math.ceil((data.length * 44) / Math.max(plotW, 1)));
  const last = data.length - 1;
  const extreme = values.reduce((best, v, i) => (Math.abs(v) > Math.abs(values[best] ?? 0) ? i : best), 0);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={rtl ? 4 : axisW} x2={rtl ? width - axisW : width - 4} y1={y(tk)} y2={y(tk)} stroke={tk === 0 ? 'var(--line)' : 'var(--chart-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={rtl ? width - axisW + 8 : axisW - 8} y={y(tk)} dy="0.32em" textAnchor={rtl ? 'start' : 'end'} className="num fill-muted text-[11px]">
                {fmtAxis(tk)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx0 = xAt(i);
            const isPos = d.value >= 0;
            const path = barPath(cx0 - barW / 2, barW, y(0), y(d.value));
            const dim = hover !== null && hover !== i;
            const showLabel = (i === last || i === extreme) && d.value !== 0;
            return (
              <g key={d.key} opacity={dim ? 0.55 : 1}>
                {path ? <path d={path} fill={isPos ? 'var(--chart-pos)' : 'var(--chart-neg)'} /> : null}
                {showLabel ? (
                  <text x={cx0} y={isPos ? y(d.value) - 6 : y(d.value) + 14} textAnchor="middle" className="num fill-ink text-[11px] font-semibold">
                    {fmtAxis(d.value)}
                  </text>
                ) : null}
                {i % every === 0 || i === last ? (
                  <text x={cx0} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
                    {d.label}
                  </text>
                ) : null}
                <rect
                  x={cx0 - band / 2}
                  y={m.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.sub ?? d.label}: ${fmtValue(d.value)} (${isPos ? posLabel : negLabel})`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none focus-visible:stroke-[var(--focus)] focus-visible:[stroke-width:2]"
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      {hover !== null && data[hover] && width > 0 ? (
        <Tooltip
          x={xAt(hover)}
          y={y(Math.max(0, data[hover].value))}
          value={fmtValue(data[hover].value)}
          label={`${data[hover].sub ?? data[hover].label}, ${data[hover].value >= 0 ? posLabel : negLabel}`}
          color={data[hover].value >= 0 ? 'var(--chart-pos)' : 'var(--chart-neg)'}
          width={width}
        />
      ) : null}
    </div>
  );
}

// ─── Line with area wash (trend over time) ─────────────────────────────────────────────────────────
export function LineChart({
  data,
  fmtValue,
  fmtAxis = (v) => compactMoney(v),
  height = 220,
  ariaLabel,
  seriesLabel,
  allowNegative,
}: {
  data: Point[];
  fmtValue: (v: number) => string;
  fmtAxis?: (v: number) => string;
  height?: number;
  ariaLabel: string;
  seriesLabel: string;
  allowNegative?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const rtl = useRtl();
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => d.value);
  const ticks = niceTicks(allowNegative ? Math.min(0, ...values) : 0, Math.max(0, ...values), 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const axisW = 52;
  const m = { top: 14, bottom: 28 };
  const plotW = Math.max(0, width - axisW - 12);
  const plotH = height - m.top - m.bottom;
  const y = (v: number) => m.top + ((yMax - v) / (yMax - yMin || 1)) * plotH;
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;
  const xAt = (i: number) => {
    const idx = rtl ? data.length - 1 - i : i;
    return (rtl ? 12 : axisW) + (data.length > 1 ? step * idx : plotW / 2);
  };
  const pts = data.map((d, i) => [xAt(i), y(d.value)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${y(Math.max(yMin, 0))} L${pts[0][0]},${y(Math.max(yMin, 0))} Z` : '';
  const every = Math.max(1, Math.ceil((data.length * 44) / Math.max(plotW, 1)));
  const last = data.length - 1;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - box.left;
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const dd = Math.abs(p[0] - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && data.length ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className="block overflow-visible outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] rounded-ctl"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const dir = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
              setHover((h) => Math.max(0, Math.min(last, (h ?? last) + dir)));
            }
          }}
          onFocus={() => setHover(last)}
          onBlur={() => setHover(null)}
        >
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={rtl ? 12 : axisW} x2={rtl ? width - axisW : width - 12} y1={y(tk)} y2={y(tk)} stroke={tk === 0 ? 'var(--line)' : 'var(--chart-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={rtl ? width - axisW + 8 : axisW - 8} y={y(tk)} dy="0.32em" textAnchor={rtl ? 'start' : 'end'} className="num fill-muted text-[11px]">
                {fmtAxis(tk)}
              </text>
            </g>
          ))}
          <path d={area} fill="var(--chart-series)" fillOpacity={0.1} />
          <path d={line} fill="none" stroke="var(--chart-series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) =>
            (i % every === 0 && last - i >= every * 0.6) || i === last ? (
              <text key={d.key} x={xAt(i)} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
                {d.label}
              </text>
            ) : null,
          )}
          {hover !== null ? <line x1={pts[hover][0]} x2={pts[hover][0]} y1={m.top} y2={m.top + plotH} stroke="var(--muted)" strokeOpacity={0.5} strokeWidth={1} /> : null}
          {/* End dot + direct label on the latest value */}
          {pts.length ? (
            <>
              <circle cx={pts[last][0]} cy={pts[last][1]} r={4} fill="var(--chart-series)" stroke="var(--surface)" strokeWidth={2} />
              <text x={pts[last][0]} y={pts[last][1] - 10} textAnchor={rtl ? 'start' : 'end'} className="num fill-ink text-[11px] font-semibold">
                {fmtAxis(data[last].value)}
              </text>
            </>
          ) : null}
          {hover !== null && hover !== last ? <circle cx={pts[hover][0]} cy={pts[hover][1]} r={4} fill="var(--chart-series)" stroke="var(--surface)" strokeWidth={2} /> : null}
          <rect x={0} y={m.top} width={width} height={plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      ) : null}
      {hover !== null && data[hover] && width > 0 ? (
        <Tooltip x={pts[hover][0]} y={pts[hover][1]} value={fmtValue(data[hover].value)} label={`${data[hover].sub ?? data[hover].label}, ${seriesLabel}`} color="var(--chart-series)" width={width} />
      ) : null}
    </div>
  );
}

// ─── Horizontal bars (ranked lists) ────────────────────────────────────────────────────────────────
export function HBarList({ items, fmtValue, href, ariaLabel }: { items: Point[]; fmtValue: (v: number) => string; href?: (key: string) => string; ariaLabel: string }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <ol aria-label={ariaLabel} className="flex flex-col gap-3.5">
      {items.map((it) => {
        const pct = max > 0 ? Math.max(1.5, (it.value / max) * 100) : 0;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="bidi min-w-0 truncate text-meta font-medium text-ink">{it.label}</span>
              <span className="num shrink-0 text-meta font-semibold text-ink">{fmtValue(it.value)}</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-e-[4px]" aria-hidden="true">
              <div className="h-full rounded-e-[4px]" style={{ width: `${pct}%`, background: 'var(--chart-series)' }} />
            </div>
            {it.sub ? <p className="mt-1 text-caption text-muted">{it.sub}</p> : null}
          </>
        );
        return (
          <li key={it.key}>
            {href ? (
              <Link href={href(it.key)} className="block rounded-ctl outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Card with a chart / table view toggle ─────────────────────────────────────────────────────────
export function ChartCard({
  title,
  subtitle,
  table,
  children,
  className,
  empty,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  table?: { head: string[]; rows: (string | ReactNode)[][]; numericCols?: number[] };
  children: ReactNode;
  className?: string;
  empty?: boolean;
  action?: ReactNode;
}) {
  const { t } = useT();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={cx('subline-host flex min-w-0 flex-col rounded-card border border-line-soft bg-surface p-5 shadow-card', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-body font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="subline mt-0.5 text-caption text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {table && !empty ? (
            <Segmented
              label={t('chart.view')}
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'chart', label: t('chart.viewChart') },
                { value: 'table', label: t('chart.viewTable') },
              ]}
            />
          ) : null}
        </div>
      </div>
      {empty ? (
        <p className="flex flex-1 items-center justify-center py-10 text-center text-meta text-muted">{t('chart.empty')}</p>
      ) : view === 'chart' || !table ? (
        children
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-meta">
            <thead>
              <tr className="border-b border-line">
                {table.head.map((h, i) => (
                  <th key={i} scope="col" className={cx('py-2 font-semibold text-muted', table.numericCols?.includes(i) ? 'text-end' : 'text-start')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line-soft last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className={cx('py-2', table.numericCols?.includes(ci) ? 'num text-end' : 'bidi text-start text-ink')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Month key (YYYY-MM) → short localized label, with the year for January and the first point. */
export function useMonthLabel() {
  const { t } = useT();
  return useMemo(
    () => (key: string, first = false) => {
      const [y, m] = key.split('-');
      const name = t(`month.${Number(m)}` as 'month.1');
      return first || m === '01' ? `${name} ${y.slice(2)}` : name;
    },
    [t],
  );
}
