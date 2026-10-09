export type Corner = "tl" | "tr" | "bl" | "br";

/** Factory / workshop line icons used for the random corner pattern (24×24 grid) */
const FACTORY: Record<string, string> = {
  gear: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="6.6"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  factory: '<path d="M3 21V11l6 3v-3l6 3V5h4v16zM3 21h16M8 17h2M13 17h2"/>',
  nut: '<path d="M12 2.5l8 4.5v10l-8 4.5-8-4.5V7z"/><circle cx="12" cy="12" r="3.2"/>',
  beam: '<path d="M5 4h14M5 20h14M12 4v16"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  bolt: '<path d="M8 3h8v4H8zM10 7v14M14 7v14M10 11h4M10 15h4M10 19h4"/>',
  hammer: '<path d="M14 4l6 6-3 3-6-6zM11 9l-7.5 7.5a2.1 2.1 0 0 0 3 3L14 12"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><rect x="8.5" y="8.5" width="7" height="7"/>',
  tube: '<path d="M5 8h13a4 4 0 0 1 0 8H5a4 4 0 0 1 0-8z"/><ellipse cx="5" cy="12" rx="2" ry="4"/>',
  ruler: '<path d="M3 15L15 3l6 6L9 21z"/><path d="M7 11l2 2M10 8l2 2M13 5l2 2"/>',
};

/** Icons for the company details (header, top right) and the customer card */
const COMPANY: Record<string, string> = {
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.7 2.9 4 6 4 9.5s-1.3 6.6-4 9.5c-2.7-2.9-4-6-4-9.5s1.3-6.6 4-9.5z"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14.5 10h4M14.5 14h3"/>',
};

const FACTORY_IDS = Object.keys(FACTORY);
const symbols = (set: Record<string, string>): string =>
  Object.entries(set)
    .map(([id, body]) => `<symbol id="alu-${id}" viewBox="0 0 24 24">${body}</symbol>`)
    .join("");

/** Hidden sprite, included once inside every rendered invoice */
export const SPRITE = `<svg class="inv__sprite" width="0" height="0" aria-hidden="true"><defs>${symbols(FACTORY)}${symbols(COMPANY)}</defs></svg>`;

export const iconRef = (id: string, cls = "inv__ci"): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#alu-${id}"/></svg>`;

/* ---------- seeded randomness: same invoice number → same pattern on every reprint ---------- */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 7–10 icons per corner on a loose 4×4 grid (42px steps), each with its own size (18–46px),
 * rotation (±60°), mirroring and opacity (9–20%). Returns SVG markup per corner.
 */
export function scatterIcons(seed: string): Record<Corner, string> {
  const rnd = mulberry32(hashSeed(seed));
  const out = { tl: "", tr: "", bl: "", br: "" } as Record<Corner, string>;
  (Object.keys(out) as Corner[]).forEach((corner) => {
    const slots = Array.from({ length: 16 }, (_, i) => i).sort(() => rnd() - 0.5);
    const count = 7 + Math.floor(rnd() * 4);
    let prev = -1;
    let html = "";
    for (const q of slots.slice(0, count)) {
      let pick = Math.floor(rnd() * FACTORY_IDS.length);
      if (pick === prev) pick = (pick + 1) % FACTORY_IDS.length;
      prev = pick;
      const size = 18 + rnd() * 28;
      const x = (q % 4) * 42 + rnd() * 20 - 4;
      const y = Math.floor(q / 4) * 42 + rnd() * 20 - 4;
      const rot = rnd() * 120 - 60;
      const flip = rnd() < 0.5 ? -1 : 1;
      const opacity = 0.09 + rnd() * 0.11;
      html +=
        `<svg class="inv__ico" viewBox="0 0 24 24" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;` +
        `width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;opacity:${opacity.toFixed(2)};` +
        `transform:rotate(${rot.toFixed(0)}deg) scaleX(${flip})"><use href="#alu-${FACTORY_IDS[pick]}"/></svg>`;
    }
    out[corner] = html;
  });
  return out;
}
