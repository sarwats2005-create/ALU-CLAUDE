'use client';
import { useEffect, useRef } from 'react';

/*
 * A 40 × 40 slotted aluminum profile drawn in oblique projection: the bare, freshly cut end face sits in
 * front and the anodized bar runs back to the top-right, off the edge of the page. On load the bar is
 * extruded out of the face once (SVG <animate>, so it also plays before JavaScript loads); visitors who
 * prefer reduced motion get the finished bar immediately.
 */

type P = [number, number];
const S = 40; // profile size (mm)
const rot = ([x, y]: P): P => [S - y, x]; // 90° clockwise about the centre (screen coordinates)

// Top side, left corner → right corner: slot lip, T-shaped undercut, then back out.
const TOP: P[] = [
  [15.9, 0],
  [15.9, 3],
  [10.5, 3],
  [10.5, 6],
  [14, 12.5],
  [26, 12.5],
  [29.5, 6],
  [29.5, 3],
  [24.1, 3],
  [24.1, 0],
  [40, 0],
];
function outline(): P[] {
  const pts: P[] = [[0, 0]];
  let side = TOP;
  for (let i = 0; i < 4; i++) {
    pts.push(...side);
    side = side.map(rot);
  }
  return pts;
}
const n = (v: number) => +v.toFixed(2);
const poly = (pts: P[]) => 'M' + pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L') + 'Z';
const circle = (cx: number, cy: number, r: number) => `M${n(cx - r)} ${cy}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0Z`;

const FACE =
  poly(outline().slice(0, -1)) +
  circle(20, 20, 4.2) +
  [
    [5.4, 5.4],
    [34.6, 5.4],
    [34.6, 34.6],
    [5.4, 34.6],
  ]
    .map(([x, y]) => circle(x, y, 2.1))
    .join('');

// Extrusion vector (profile units): long enough to leave the canvas at any width.
const A = (20 * Math.PI) / 180;
const L = 190;
const V: P = [L * Math.cos(A), -L * Math.sin(A)];
const sweep = (a: P, b: P) => poly([a, b, [b[0] + V[0], b[1] + V[1]], [a[0] + V[0], a[1] + V[1]]]);

const TOP_FACE = sweep([0, 0], [S, 0]);
const SIDE_FACE = sweep([S, 0], [S, S]);
const TOP_SLOT = sweep([15.9, 0], [24.1, 0]);
const SIDE_SLOT = sweep([S, 15.9], [S, 24.1]);
// Brushed grain along the length of the bar.
const GRAIN_TOP = [2.5, 6, 9.5, 13, 27, 30.5, 34, 37.5].map((x) => `M${x} 0l${n(V[0])} ${n(V[1])}`).join('');
const GRAIN_SIDE = [3, 7, 11, 28, 32, 36.5].map((y) => `M${S} ${y}l${n(V[0])} ${n(V[1])}`).join('');

const SCALE = 4.2;
const ORIGIN: P = [36, 176];
const DEG = -(A * 180) / Math.PI;

export function Extrusion({ label }: { label: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (svg && matchMedia('(prefers-reduced-motion: reduce)').matches) svg.setCurrentTime(10);
  }, []);
  return (
    <svg ref={ref} className="lp-extrusion" viewBox="0 0 640 380" role="img" aria-label={label} preserveAspectRatio="xMinYMax meet">
      <defs>
        {/* Flat poster colours: no gradients. White top, dark side, Amber cut face. */}
        {/* The reveal: a strip aligned with the bar that grows away from the cut face. */}
        <clipPath id="lp-reveal" clipPathUnits="userSpaceOnUse">
          <rect x="0" y="-60" width="1" height="120" transform={`rotate(${DEG})`}>
            <animate attributeName="width" from="1" to={L + 60} begin="0.35s" dur="1.5s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 0.8 0.3 1" />
          </rect>
        </clipPath>
      </defs>
      <g transform={`translate(${ORIGIN[0]} ${ORIGIN[1]}) scale(${SCALE})`}>
        <g clipPath="url(#lp-reveal)">
          <path d={SIDE_FACE} fill="#111827" />
          <path d={SIDE_SLOT} fill="#374151" />
          <path d={GRAIN_SIDE} stroke="#FFFFFF" strokeOpacity="0.06" strokeWidth="0.18" fill="none" />
          <path d={TOP_FACE} fill="#FFFFFF" />
          <path d={TOP_SLOT} fill="#E5E7EB" />
          <path d={GRAIN_TOP} stroke="#111827" strokeOpacity="0.05" strokeWidth="0.18" fill="none" />
        </g>
        {/* Openings in the cut face look into the dark inside of the bar. */}
        <rect x="0.4" y="0.4" width={S - 0.8} height={S - 0.8} fill="#111827" />
        <path d={FACE} fill="#F59E0B" fillRule="evenodd" />
      </g>
    </svg>
  );
}
