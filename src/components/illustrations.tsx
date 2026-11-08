// Decorative SVG artwork for the Inventory page (hero boxes, warehouse tile, rent calendar, product thumbnails,
// KPI waves). Pure presentation: every piece is aria-hidden and carries no data.
import { useId } from 'react';
import { cx } from '@/lib/cx';

export type V3 = [number, number, number];

/** Isometric projection: x runs down-right, y down-left, z up. */
export function iso(ox: number, oy: number, s: number) {
  const C = Math.cos(Math.PI / 6);
  return ([x, y, z]: V3) => `${(ox + (x - y) * C * s).toFixed(1)},${(oy + (x + y) * 0.5 * s - z * s).toFixed(1)}`;
}

export type Faces = { top: string; left: string; right: string };

/** The three visible faces of an axis-aligned box. */
export function boxFaces(p: (v: V3) => string, [x, y, z]: V3, [w, d, h]: V3): Faces {
  const pts = (vs: V3[]) => vs.map(p).join(' ');
  return {
    top: pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]),
    right: pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]),
    left: pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]),
  };
}

function Carton({ p, at, size }: { p: (v: V3) => string; at: V3; size: V3 }) {
  const f = boxFaces(p, at, size);
  const [x, y, z] = at;
  const [w, d, h] = size;
  const t = 0.16;
  const tape = boxFaces(p, [x + w / 2 - t, y, z + h - 0.001], [t * 2, d, 0.001]).top;
  const tapeFront = (
    [
      [x + w / 2 - t, y + d, z + h],
      [x + w / 2 + t, y + d, z + h],
      [x + w / 2 + t, y + d, z + h - h * 0.32],
      [x + w / 2 - t, y + d, z + h - h * 0.32],
    ] as V3[]
  )
    .map(p)
    .join(' ');
  return (
    <g strokeLinejoin="round">
      <polygon points={f.left} fill="#c98a45" />
      <polygon points={f.right} fill="#dfa35e" />
      <polygon points={f.top} fill="#f0c48a" />
      <polygon points={tape} fill="#e2b273" />
      <polygon points={tapeFront} fill="#b97b3a" opacity="0.7" />
    </g>
  );
}

/** Stacked cartons on a glowing platform (hero banner). */
export function HeroBoxes({ className }: { className?: string }) {
  const p = iso(120, 40, 17);
  const slab = boxFaces(p, [0, 0, -0.7], [6.4, 6.4, 0.7]);
  return (
    <svg viewBox="0 0 240 210" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="120" cy="178" rx="104" ry="24" fill="#60a5fa" opacity="0.28" />
      <g strokeLinejoin="round">
        <polygon points={slab.left} fill="#c3d2ea" />
        <polygon points={slab.right} fill="#dbe5f4" />
        <polygon points={slab.top} fill="#f8fbff" />
      </g>
      <Carton p={p} at={[0.7, 0.7, 0]} size={[2.6, 2.6, 2.1]} />
      <Carton p={p} at={[1.1, 1.0, 2.1]} size={[2.1, 2.1, 1.7]} />
      <Carton p={p} at={[3.5, 1.0, 0]} size={[2.3, 2.3, 1.8]} />
      <Carton p={p} at={[1.0, 3.6, 0]} size={[2.1, 2.2, 1.5]} />
    </svg>
  );
}

/** Flat warehouse for the inventory info tile. */
export function WarehouseArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f8fe6" />
          <stop offset="1" stopColor="#2563c9" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f6fd0" />
          <stop offset="1" stopColor="#1b4f9e" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="90" rx="50" ry="6" fill="#1b5db1" opacity="0.12" />
      <rect x="20" y="40" width="80" height="48" rx="2" fill={`url(#${id}w)`} />
      <polygon points="12,45 60,16 108,45 104,49 60,23 16,49" fill={`url(#${id}r)`} strokeLinejoin="round" />
      <rect x="52" y="30" width="16" height="6" rx="1.5" fill="#bfdbfe" />
      <rect x="38" y="54" width="44" height="34" rx="1.5" fill="#e0ecff" />
      {[60, 66, 72, 78].map((y) => (
        <line key={y} x1="40" x2="80" y1={y} y2={y} stroke="#a9c6f0" strokeWidth="1.6" />
      ))}
      <rect x="24" y="72" width="16" height="16" rx="1.5" fill="#93c5fd" />
      <rect x="24" y="72" width="16" height="4" fill="#bfdbfe" />
      <rect x="80" y="76" width="16" height="12" rx="1.5" fill="#60a5fa" />
      <rect x="80" y="76" width="16" height="3.5" fill="#93c5fd" />
      <rect x="62" y="66" width="14" height="22" rx="1.5" fill="#3b82f6" />
      <rect x="62" y="66" width="14" height="4" fill="#60a5fa" />
    </svg>
  );
}

/** Tilted wall calendar for the rent panel. */
export function CalendarArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 130 120" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dbe8fb" />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5b9cf0" />
          <stop offset="1" stopColor="#2f6fd0" />
        </linearGradient>
      </defs>
      <g transform="rotate(-10 65 60)">
        <rect x="18" y="26" width="96" height="84" rx="10" fill="#1b5db1" opacity="0.12" transform="translate(5 6)" />
        <rect x="18" y="26" width="96" height="84" rx="10" fill={`url(#${id}b)`} stroke="#c7dbf7" />
        <path d="M18 36a10 10 0 0 1 10-10h76a10 10 0 0 1 10 10v12H18z" fill={`url(#${id}h)`} />
        {[38, 66, 94].map((x) => (
          <rect key={x} x={x - 3} y="16" width="6" height="18" rx="3" fill="#6b9fe0" stroke="#ffffff" strokeWidth="1.5" />
        ))}
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((c) => (
            <rect
              key={`${r}${c}`}
              x={28 + c * 20}
              y={56 + r * 17}
              width="14"
              height="11"
              rx="2.5"
              fill={r === 1 && c === 2 ? '#2f6fd0' : '#9cc0f2'}
              opacity={r === 1 && c === 2 ? 1 : 0.75}
            />
          )),
        )}
      </g>
    </svg>
  );
}

// ─── Product thumbnails ───────────────────────────────────────────────────────────────────────────

function Metal({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f6f8fb" />
        <stop offset="1" stopColor="#c9d0da" />
      </linearGradient>
      <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8a94a3" />
        <stop offset="0.5" stopColor="#c3cad5" />
        <stop offset="1" stopColor="#7d8796" />
      </linearGradient>
      <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dfe4eb" />
        <stop offset="1" stopColor="#9aa4b2" />
      </linearGradient>
      <radialGradient id={`${id}c`} cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.6" stopColor="#cfd6df" />
        <stop offset="1" stopColor="#8d97a6" />
      </radialGradient>
      <radialGradient id={`${id}h`} cx="0.6" cy="0.6" r="0.8">
        <stop offset="0" stopColor="#5d6775" />
        <stop offset="1" stopColor="#2c333d" />
      </radialGradient>
    </defs>
  );
}

/** Extruded square profile with slots on its end. */
function ProfileArt({ id }: { id: string }) {
  const p = iso(46, 30, 12);
  const f = boxFaces(p, [0, 0, 0], [6.2, 1.9, 1.9]);
  const end = (vs: V3[]) => vs.map(p).join(' ');
  const X = 6.2;
  return (
    <>
      <Metal id={id} />
      <ellipse cx="62" cy="96" rx="46" ry="6" fill="#0f172a" opacity="0.1" />
      <polygon points={f.left} fill={`url(#${id}l)`} />
      <polygon points={f.top} fill={`url(#${id}t)`} />
      <polygon points={f.right} fill={`url(#${id}r)`} />
      {/* hollow core + T-slots on the end face */}
      <polygon points={end([[X, 0.45, 0.45], [X, 1.45, 0.45], [X, 1.45, 1.45], [X, 0.45, 1.45]])} fill={`url(#${id}h)`} />
      <polygon points={end([[X, 0.75, 1.9], [X, 1.15, 1.9], [X, 1.15, 1.6], [X, 0.75, 1.6]])} fill="#4b5563" />
      <polygon points={end([[X, 0.75, 0], [X, 1.15, 0], [X, 1.15, 0.3], [X, 0.75, 0.3]])} fill="#4b5563" />
      <polygon points={end([[X, 0, 0.75], [X, 0.3, 0.75], [X, 0.3, 1.15], [X, 0, 1.15]])} fill="#4b5563" />
      <polygon points={end([[X, 1.6, 0.75], [X, 1.9, 0.75], [X, 1.9, 1.15], [X, 1.6, 1.15]])} fill="#4b5563" />
      {/* long slot running along the top */}
      <polygon points={end([[0, 0.8, 1.9], [X, 0.8, 1.9], [X, 1.1, 1.9], [0, 1.1, 1.9]])} fill="#8b95a4" opacity="0.8" />
    </>
  );
}

/** A bundle of round tubes seen from the end. */
function TubesArt({ id }: { id: string }) {
  const r = 11;
  const rows = [
    { y: 46, xs: [32, 55, 78] },
    { y: 66, xs: [21, 44, 67, 90] },
    { y: 86, xs: [32, 55, 78] },
  ];
  const all = rows.flatMap((row) => row.xs.map((x) => ({ x, y: row.y })));
  return (
    <>
      <Metal id={id} />
      <ellipse cx="60" cy="102" rx="44" ry="5" fill="#0f172a" opacity="0.1" />
      {all.map((c, i) => (
        <line key={`b${i}`} x1={c.x} y1={c.y} x2={c.x + 18} y2={c.y - 26} stroke="#a5aebb" strokeWidth={r * 2} strokeLinecap="round" />
      ))}
      {all.map((c, i) => (
        <g key={`e${i}`}>
          <circle cx={c.x} cy={c.y} r={r} fill={`url(#${id}c)`} stroke="#8a94a3" strokeWidth="0.8" />
          <circle cx={c.x} cy={c.y} r={r * 0.62} fill={`url(#${id}h)`} />
        </g>
      ))}
    </>
  );
}

/** A small stack of flat sheets. */
function SheetsArt({ id }: { id: string }) {
  const p = iso(58, 36, 11);
  const sheets = [0, 0.5, 1, 1.5, 2].map((z, i) => boxFaces(p, [i % 2 ? 0.25 : 0, 0, z], [4.6, 3.8, 0.38]));
  return (
    <>
      <Metal id={id} />
      <ellipse cx="60" cy="98" rx="46" ry="6" fill="#0f172a" opacity="0.1" />
      {sheets.map((f, i) => (
        <g key={i}>
          <polygon points={f.left} fill={`url(#${id}l)`} />
          <polygon points={f.right} fill={`url(#${id}r)`} />
          <polygon points={f.top} fill={`url(#${id}t)`} />
        </g>
      ))}
    </>
  );
}

const PRODUCT_ART = [ProfileArt, TubesArt, SheetsArt];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Stable decorative thumbnail for a product (picked from a seed such as its SKU, not from real product data). */
export function ProductArt({ seed, className }: { seed: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const Art = PRODUCT_ART[hash(seed) % PRODUCT_ART.length];
  return (
    <svg viewBox="0 0 120 110" className={className} aria-hidden="true" focusable="false">
      <Art id={id} />
    </svg>
  );
}

// ─── KPI wave ──────────────────────────────────────────────────────────────────────────────────

/** Soft decorative wave in the corner of a KPI card (not a chart: it carries no data). */
export function KpiWave({ color = 'currentColor', className }: { color?: string; className?: string }) {
  const line = 'M0 62 C16 62 24 46 38 48 S58 66 74 52 S98 10 120 14';
  return (
    <svg viewBox="0 0 120 80" preserveAspectRatio="none" className={cx('pointer-events-none', className)} aria-hidden="true" focusable="false">
      <path d={`${line} L120 80 L0 80 Z`} style={{ fill: color, fillOpacity: 0.12 }} />
      <path d={line} fill="none" style={{ stroke: color }} strokeWidth="2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
