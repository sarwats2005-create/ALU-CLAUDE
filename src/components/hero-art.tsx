// "Elegant redesign" hero artwork: one small isometric scene per page, all standing on the same glowing
// platform so the banners read as one family. Pure decoration — aria-hidden, no data.
import type { ReactNode } from 'react';
import { boxFaces, type V3 } from '@/components/illustrations';

const C = Math.cos(Math.PI / 6);
const S = 17;
const xy = ([x, y, z]: V3): [number, number] => [120 + (x - y) * C * S, 40 + (x + y) * 0.5 * S - z * S];
const P = (v: V3) => xy(v).map((n) => n.toFixed(1)).join(',');
const pts = (vs: V3[]) => vs.map(P).join(' ');
const ring = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

type Colors = [top: string, left: string, right: string];

function Prism({ at, size, c }: { at: V3; size: V3; c: Colors }) {
  const f = boxFaces(P, at, size);
  return (
    <g strokeLinejoin="round">
      <polygon points={f.left} fill={c[1]} />
      <polygon points={f.right} fill={c[2]} />
      <polygon points={f.top} fill={c[0]} />
    </g>
  );
}

/** Upright cylinder (coins, chimney). Only the half facing the viewer is drawn for the side. */
function Cylinder({ at: [cx, cy, z], r, h, top, side, stroke }: { at: V3; r: number; h: number; top: string; side: string; stroke?: string }) {
  const at = (a: number, zz: number): V3 => [cx + r * Math.cos(a), cy + r * Math.sin(a), zz];
  const a0 = -Math.PI / 4;
  const front = ring(16).map((t) => a0 + t * Math.PI);
  const sidePts = [...front.map((a) => at(a, z)), ...[...front].reverse().map((a) => at(a, z + h))];
  const topPts = ring(28).map((t) => at(t * Math.PI * 2, z + h));
  return (
    <g>
      <polygon points={pts(sidePts)} fill={side} />
      <polygon points={pts(topPts)} fill={top} stroke={stroke} strokeWidth={stroke ? 0.7 : 0} />
    </g>
  );
}

/** Flat disc on a vertical face. `plane` 'x' = the right face (x fixed), 'y' = the left face (y fixed). */
function FaceDisc({ plane, fixed, u, v, r, fill, stroke }: { plane: 'x' | 'y'; fixed: number; u: number; v: number; r: number; fill: string; stroke?: string }) {
  const p = ring(24).map((t): V3 => {
    const a = t * Math.PI * 2;
    return plane === 'x' ? [fixed, u + r * Math.cos(a), v + r * Math.sin(a)] : [u + r * Math.cos(a), fixed, v + r * Math.sin(a)];
  });
  return <polygon points={pts(p)} fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} />;
}

/** Quad on a plane: x = fixed spans (y, z); y = fixed spans (x, z); z = fixed spans (x, y). */
function FaceQuad({ plane, fixed, a, b, fill }: { plane: 'x' | 'y' | 'z'; fixed: number; a: [number, number]; b: [number, number]; fill: string }) {
  const q: V3[] =
    plane === 'x'
      ? [[fixed, a[0], b[0]], [fixed, a[1], b[0]], [fixed, a[1], b[1]], [fixed, a[0], b[1]]]
      : plane === 'y'
        ? [[a[0], fixed, b[0]], [a[1], fixed, b[0]], [a[1], fixed, b[1]], [a[0], fixed, b[1]]]
        : [[a[0], b[0], fixed], [a[1], b[0], fixed], [a[1], b[1], fixed], [a[0], b[1], fixed]];
  return <polygon points={pts(q)} fill={fill} />;
}

function Stage({ children, className }: { children: ReactNode; className?: string }) {
  const slab = boxFaces(P, [0, 0, -0.7], [6.4, 6.4, 0.7]);
  return (
    <svg viewBox="0 0 240 210" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="120" cy="178" rx="104" ry="24" fill="#60a5fa" opacity="0.28" />
      <g strokeLinejoin="round">
        <polygon points={slab.left} fill="#c3d2ea" />
        <polygon points={slab.right} fill="#dbe5f4" />
        <polygon points={slab.top} fill="#f8fbff" />
      </g>
      {children}
    </svg>
  );
}

type Art = { className?: string };
const BLUE: Colors = ['#4f8fe6', '#1b5db1', '#2f6fd0'];
const WHITE: Colors = ['#ffffff', '#dbe4f0', '#c3d0e4'];
const STEEL: Colors = ['#94a3b8', '#475569', '#64748b'];

/** Delivery truck — suppliers / purchases. */
export function HeroTruck({ className }: Art) {
  return (
    <Stage className={className}>
      <Prism at={[0.5, 1.8, 0.35]} size={[5.3, 2.0, 0.25]} c={['#475569', '#1f2937', '#334155']} />
      <Prism at={[0.5, 1.8, 0.6]} size={[3.7, 2.0, 2.3]} c={WHITE} />
      <FaceQuad plane="y" fixed={3.8} a={[0.5, 4.2]} b={[1.0, 1.35]} fill="#2f6fd0" />
      <Prism at={[4.3, 1.9, 0.6]} size={[1.5, 1.8, 1.6]} c={BLUE} />
      <FaceQuad plane="x" fixed={5.8} a={[2.1, 3.5]} b={[1.45, 2.0]} fill="#bfdbfe" />
      <FaceQuad plane="y" fixed={3.7} a={[4.5, 5.3]} b={[1.45, 2.0]} fill="#bfdbfe" />
      {[1.3, 3.3, 5.0].map((x) => (
        <g key={x}>
          <FaceDisc plane="y" fixed={3.81} u={x} v={0.45} r={0.45} fill="#1f2937" />
          <FaceDisc plane="y" fixed={3.82} u={x} v={0.45} r={0.18} fill="#9ca3af" />
        </g>
      ))}
    </Stage>
  );
}

/** Two people — customers. */
export function HeroPeople({ className }: Art) {
  const bust = (cx: number, cy: number, body: string, head: string) => (
    <g>
      <path d={`M${cx - 32} ${cy + 54} Q${cx - 32} ${cy + 20} ${cx} ${cy + 20} Q${cx + 32} ${cy + 20} ${cx + 32} ${cy + 54} Z`} fill={body} />
      <circle cx={cx} cy={cy} r="17" fill={head} />
    </g>
  );
  return (
    <Stage className={className}>
      {bust(142, 50, '#93c5fd', '#bfdbfe')}
      {bust(104, 66, '#2f6fd0', '#4f8fe6')}
      <circle cx="170" cy="112" r="15" fill="#22c55e" />
      <path d="M163 112 l5 5 l9 -10" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Stage>
  );
}

/** Cash register with a receipt — point of sale. */
export function HeroRegister({ className }: Art) {
  const keys: V3[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) keys.push([2.5 + i * 0.75, 2.2 + j * 0.75, 1.3]);
  return (
    <Stage className={className}>
      <Prism at={[1.0, 1.2, 0]} size={[4.0, 3.4, 1.3]} c={['#e2e8f0', '#475569', '#64748b']} />
      <FaceQuad plane="y" fixed={4.61} a={[1.6, 4.4]} b={[0.3, 0.8]} fill="#334155" />
      <Prism at={[1.2, 1.5, 1.3]} size={[0.45, 2.6, 1.9]} c={['#334155', '#0f172a', '#1e293b']} />
      <FaceQuad plane="x" fixed={1.66} a={[1.7, 3.9]} b={[1.55, 3.0]} fill="#60a5fa" />
      <FaceQuad plane="x" fixed={1.67} a={[1.9, 3.0]} b={[2.5, 2.75]} fill="#dbeafe" />
      <Prism at={[2.6, 1.3, 1.3]} size={[1.4, 0.08, 1.5]} c={['#ffffff', '#f8fafc', '#e2e8f0']} />
      {[2.45, 2.2, 1.95, 1.7].map((z) => (
        <FaceQuad key={z} plane="y" fixed={1.39} a={[2.8, z === 2.45 ? 3.4 : 3.8]} b={[z, z + 0.07]} fill="#94a3b8" />
      ))}
      {keys.map((k, i) => (
        <Prism key={i} at={k} size={[0.52, 0.52, 0.16]} c={i === 8 ? BLUE : ['#ffffff', '#cbd5e1', '#e2e8f0']} />
      ))}
    </Stage>
  );
}

/** Stacked documents with a tick — invoices. */
export function HeroDocs({ className }: Art) {
  const [cx, cy] = xy([4.0, 4.9, 0.38]);
  return (
    <Stage className={className}>
      <Prism at={[1.2, 0.8, 0]} size={[4.0, 4.6, 0.12]} c={WHITE} />
      <Prism at={[0.8, 1.1, 0.12]} size={[4.0, 4.6, 0.12]} c={['#f8fafc', '#cbd5e1', '#dbe4f0']} />
      <Prism at={[1.0, 1.3, 0.24]} size={[4.0, 4.6, 0.12]} c={WHITE} />
      <FaceQuad plane="z" fixed={0.37} a={[1.5, 3.2]} b={[1.7, 2.1]} fill="#1b5db1" />
      {[2.6, 3.1, 3.6, 4.1].map((y, i) => (
        <FaceQuad key={y} plane="z" fixed={0.37} a={[1.5, i === 3 ? 3.0 : 4.4]} b={[y, y + 0.2]} fill="#bfdbfe" />
      ))}
      <ellipse cx={cx} cy={cy} rx="15" ry="9" fill="#22c55e" />
      <path d={`M${cx - 6} ${cy} l4 3 l8 -6`} fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <Prism at={[1.3, 5.3, 0.36]} size={[3.0, 0.22, 0.22]} c={['#4f8fe6', '#1b5db1', '#0f172a']} />
    </Stage>
  );
}

/** Stacks of gold coins — expenses, dues. */
export function HeroCoins({ className }: Art) {
  const stacks: [number, number, number][] = [
    [2.2, 2.0, 6],
    [4.4, 2.3, 4],
    [2.3, 4.4, 3],
    [4.6, 4.6, 1],
  ];
  return (
    <Stage className={className}>
      {stacks.map(([x, y, n]) =>
        Array.from({ length: n }, (_, i) => <Cylinder key={`${x}-${i}`} at={[x, y, i * 0.34]} r={0.95} h={0.34} top="#fde68a" side="#e0a526" stroke="#c88a12" />),
      )}
    </Stage>
  );
}

/** Steel safe with a dial — vault. */
export function HeroSafe({ className }: Art) {
  const [dx, dy] = xy([5.04, 3.1, 1.85]);
  return (
    <Stage className={className}>
      <Prism at={[1.2, 4.5, 0]} size={[0.4, 0.4, 0.25]} c={STEEL} />
      <Prism at={[4.5, 4.5, 0]} size={[0.4, 0.4, 0.25]} c={STEEL} />
      <Prism at={[4.5, 1.2, 0]} size={[0.4, 0.4, 0.25]} c={STEEL} />
      <Prism at={[1.0, 1.0, 0.25]} size={[4.0, 4.0, 3.2]} c={STEEL} />
      <FaceQuad plane="x" fixed={5.01} a={[1.4, 4.6]} b={[0.6, 3.05]} fill="#7c8ba1" />
      <FaceQuad plane="x" fixed={5.02} a={[1.55, 1.75]} b={[1.0, 2.6]} fill="#334155" />
      <FaceDisc plane="x" fixed={5.03} u={3.1} v={1.85} r={0.75} fill="#e2e8f0" stroke="#334155" />
      <FaceDisc plane="x" fixed={5.04} u={3.1} v={1.85} r={0.28} fill="#475569" />
      {[0, 120, 240].map((a) => (
        <line key={a} x1={dx} y1={dy} x2={dx + 11 * Math.cos((a * Math.PI) / 180)} y2={dy + 11 * Math.sin((a * Math.PI) / 180)} stroke="#334155" strokeWidth="2" strokeLinecap="round" />
      ))}
      {[0, 1, 2].map((i) => (
        <Cylinder key={i} at={[2.4, 5.6, i * 0.3]} r={0.55} h={0.3} top="#fde68a" side="#e0a526" stroke="#c88a12" />
      ))}
    </Stage>
  );
}

/** Rising bars — reports. */
export function HeroChart({ className }: Art) {
  const bars: [number, number, Colors][] = [
    [0.7, 1.4, ['#bfdbfe', '#60a5fa', '#93c5fd']],
    [2.0, 2.3, ['#93c5fd', '#3b82f6', '#60a5fa']],
    [3.3, 1.8, ['#93c5fd', '#3b82f6', '#60a5fa']],
    [4.6, 3.1, BLUE],
  ];
  const tops = bars.map(([x, h]) => xy([x + 0.5, 3.0, h + 0.55]));
  return (
    <Stage className={className}>
      {bars.map(([x, h, c]) => (
        <Prism key={x} at={[x, 2.4, 0]} size={[1.0, 1.2, h]} c={c} />
      ))}
      <polyline points={tops.map((p) => p.join(',')).join(' ')} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {tops.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#ffffff" stroke="#22c55e" strokeWidth="2.5" />
      ))}
    </Stage>
  );
}

/** Clock with a turning arrow — history. */
export function HeroClock({ className }: Art) {
  const cx = 120;
  const cy = 80;
  const ticks = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);
  return (
    <Stage className={className}>
      <ellipse cx={cx} cy="128" rx="40" ry="10" fill="#1b5db1" opacity="0.18" />
      <circle cx={cx} cy={cy} r="52" fill="#2f6fd0" />
      <circle cx={cx} cy={cy} r="44" fill="#ffffff" />
      {ticks.map((a, i) => (
        <line key={i} x1={cx + 36 * Math.cos(a)} y1={cy + 36 * Math.sin(a)} x2={cx + 40 * Math.cos(a)} y2={cy + 40 * Math.sin(a)} stroke="#94a3b8" strokeWidth={i % 3 ? 1.5 : 3} strokeLinecap="round" />
      ))}
      <line x1={cx} y1={cy} x2={cx - 16} y2={cy - 14} stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + 20} y2={cy - 22} stroke="#1b5db1" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill="#0f172a" />
      <path d={`M${cx - 62} ${cy + 18} A64 64 0 0 1 ${cx - 40} ${cy - 50}`} fill="none" stroke="#93c5fd" strokeWidth="6" strokeLinecap="round" />
      <path d={`M${cx - 50} ${cy - 54} l12 2 l-4 11`} fill="none" stroke="#93c5fd" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </Stage>
  );
}

function gear(cx: number, cy: number, r: number, depth: number, teeth: number) {
  const step = (Math.PI * 2) / teeth;
  const p: string[] = [];
  const profile: [number, number][] = [
    [r, -0.27],
    [r + depth, -0.15],
    [r + depth, 0.15],
    [r, 0.27],
  ];
  for (let k = 0; k < teeth; k++)
    for (const [rr, da] of profile) p.push(`${(cx + rr * Math.cos((k + da) * step)).toFixed(1)},${(cy + rr * Math.sin((k + da) * step)).toFixed(1)}`);
  return p.join(' ');
}

/** Interlocking gears — settings. */
export function HeroGears({ className }: Art) {
  return (
    <Stage className={className}>
      <polygon points={gear(106, 88, 38, 10, 10)} fill="#2f6fd0" />
      <circle cx="106" cy="88" r="16" fill="#dbeafe" />
      <circle cx="106" cy="88" r="7" fill="#1b5db1" />
      <polygon points={gear(160, 58, 22, 7, 8)} fill="#93c5fd" />
      <circle cx="160" cy="58" r="8" fill="#eff6ff" />
    </Stage>
  );
}

/** A stack of books — how the app works. */
export function HeroBooks({ className }: Art) {
  const book = (at: V3, size: V3, top: string, spine: string) => (
    <g>
      <Prism at={at} size={size} c={[top, spine, '#f1f5f9']} />
      <FaceQuad plane="x" fixed={at[0] + size[0] + 0.01} a={[at[1] + 0.15, at[1] + size[1] - 0.15]} b={[at[2] + size[2] * 0.45, at[2] + size[2] * 0.55]} fill="#cbd5e1" />
    </g>
  );
  return (
    <Stage className={className}>
      {book([0.8, 1.2, 0], [4.6, 3.4, 0.75], '#3b82f6', '#1b5db1')}
      {book([1.1, 1.4, 0.75], [4.0, 3.0, 0.65], '#fbbf24', '#d97706')}
      {book([0.9, 1.5, 1.4], [4.2, 2.8, 0.6], '#34d399', '#059669')}
    </Stage>
  );
}

/** Factory hall with a chimney — dashboard. */
export function HeroFactory({ className }: Art) {
  const [sx, sy] = xy([4.9, 1.9, 3.6]);
  return (
    <Stage className={className}>
      <Cylinder at={[4.9, 1.9, 0]} r={0.42} h={3.6} top="#64748b" side="#475569" />
      <circle cx={sx + 6} cy={sy - 10} r="8" fill="#ffffff" opacity="0.75" />
      <circle cx={sx + 16} cy={sy - 22} r="10" fill="#ffffff" opacity="0.55" />
      <circle cx={sx + 30} cy={sy - 30} r="12" fill="#ffffff" opacity="0.35" />
      <Prism at={[0.6, 1.6, 0]} size={[3.4, 3.8, 2.0]} c={['#64748b', '#dbe4f0', '#c3d0e4']} />
      {[0.9, 1.8, 2.7].map((x) => (
        <FaceQuad key={x} plane="y" fixed={5.41} a={[x, x + 0.6]} b={[0.8, 1.5]} fill="#93c5fd" />
      ))}
      <FaceQuad plane="x" fixed={4.01} a={[2.6, 4.4]} b={[0, 1.3]} fill="#475569" />
      <Prism at={[4.3, 3.3, 0]} size={[1.6, 2.0, 1.2]} c={BLUE} />
    </Stage>
  );
}
