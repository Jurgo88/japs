/**
 * Generative posters. Every project gets an artwork computed from its own data: the slug seeds a
 * random generator and picks the composition and palette, each technology adds a layer, and the
 * years set the rhythm. The same project always gives the same poster.
 */

export interface Shape {
  tag: "rect" | "circle" | "path" | "line";
  attrs: Record<string, string | number>;
}

export interface Poster {
  bg: string;
  ink: string;
  shapes: Shape[];
  composition: string;
}

export const W = 300;
export const H = 400;

const PALETTES: { bg: string; ink: string; colors: string[] }[] = [
  { bg: "#f1ebe0", ink: "#151515", colors: ["#e4402f", "#1f4fbf", "#f2b632", "#151515"] },
  { bg: "#151515", ink: "#f1ebe0", colors: ["#ff6b4a", "#5ad0c4", "#f6d34f", "#f1ebe0"] },
  { bg: "#e9e4f7", ink: "#1b1440", colors: ["#6a3cf0", "#ff6aa8", "#1b1440", "#ffd25a"] },
  { bg: "#0f2b26", ink: "#f2efe4", colors: ["#f2c14e", "#f78154", "#4d9078", "#f2efe4"] },
  { bg: "#f7d9c4", ink: "#2a1a12", colors: ["#c8442e", "#2a1a12", "#3b6e8f", "#f4f1e9"] },
  { bg: "#dfe8f1", ink: "#0d1b2a", colors: ["#0d1b2a", "#e63946", "#457b9d", "#f1c453"] },
];

/** FNV-1a hash of a string. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded PRNG. */
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

type Ctx = { rand: () => number; colors: string[]; bg: string; ink: string; layers: number; rhythm: number };
const pick = <T>(rand: () => number, list: T[]): T => list[Math.floor(rand() * list.length)]!;

/** Concentric rings around one or two centres. */
function orbits({ rand, colors, layers, rhythm }: Ctx): Shape[] {
  const out: Shape[] = [];
  const centres = [
    { x: 60 + rand() * 180, y: 80 + rand() * 160 },
    { x: 60 + rand() * 180, y: 120 + rand() * 160 },
  ].slice(0, layers > 3 ? 2 : 1);
  for (const c of centres) {
    const rings = 4 + rhythm + layers;
    for (let i = rings; i > 0; i--) {
      out.push({ tag: "circle", attrs: { cx: r1(c.x), cy: r1(c.y), r: r1(i * (14 + rand() * 6)), fill: i % 2 ? colors[i % colors.length]! : "none", stroke: colors[(i + 1) % colors.length]!, "stroke-width": 2 } });
    }
  }
  return out;
}

/** A grid of quarter circles turned by chance, like a Truchet tiling. */
function truchet({ rand, colors, layers }: Ctx): Shape[] {
  const out: Shape[] = [];
  const n = 4 + Math.min(3, layers);
  const s = W / n;
  for (let y = 0; y < Math.ceil(H / s); y++) {
    for (let x = 0; x < n; x++) {
      const px = x * s;
      const py = y * s;
      const turn = Math.floor(rand() * 4);
      const cx = px + (turn === 1 || turn === 2 ? s : 0);
      const cy = py + (turn >= 2 ? s : 0);
      const sx = cx === px ? 1 : -1;
      const sy = cy === py ? 1 : -1;
      out.push({ tag: "rect", attrs: { x: r1(px), y: r1(py), width: r1(s), height: r1(s), fill: colors[(x + y) % colors.length]! } });
      out.push({ tag: "path", attrs: { d: `M${r1(cx)} ${r1(cy)}h${r1(sx * s)}a${r1(s)} ${r1(s)} 0 0 ${sx === sy ? 1 : 0} ${r1(-sx * s)} ${r1(sy * s)}z`, fill: colors[(x + y + 1 + turn) % colors.length]! } });
    }
  }
  return out;
}

/** Diagonal bands of varying widths. */
function stripes({ rand, colors, layers, rhythm }: Ctx): Shape[] {
  const out: Shape[] = [];
  const angle = pick(rand, [-30, -18, 18, 30, 45]);
  const transform = `rotate(${angle} ${W / 2} ${H / 2})`;
  // More layers and years make the bands narrower and busier.
  const scale = 1 / (1 + (layers + rhythm) * 0.12);
  let pos = -H;
  for (let i = 0; pos < W + H; i++) {
    const w = (14 + rand() * 50) * scale;
    out.push({ tag: "rect", attrs: { x: r1(pos), y: -H, width: r1(w), height: H * 3, fill: colors[i % colors.length]!, transform } });
    pos += w + rand() * 18 * scale;
  }
  return out;
}

/** Bauhaus blocks: overlapping rectangles, a big circle and a bar. */
function blocks({ rand, colors, layers }: Ctx): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < 3 + layers; i++) {
    const w = 40 + rand() * 160;
    const h = 30 + rand() * 180;
    out.push({ tag: "rect", attrs: { x: r1(rand() * (W - w)), y: r1(rand() * (H - h)), width: r1(w), height: r1(h), fill: colors[i % colors.length]!, opacity: i ? 0.92 : 1 } });
  }
  out.push({ tag: "circle", attrs: { cx: r1(60 + rand() * 180), cy: r1(80 + rand() * 220), r: r1(40 + rand() * 60), fill: colors[layers % colors.length]!, style: "mix-blend-mode: multiply" } });
  out.push({ tag: "rect", attrs: { x: 0, y: r1(rand() * H), width: W, height: 10, fill: colors[(layers + 1) % colors.length]! } });
  return out;
}

/** Stacked sine waves. */
function waves({ rand, colors, layers, rhythm }: Ctx): Shape[] {
  const out: Shape[] = [];
  const count = 6 + layers + rhythm;
  for (let i = 0; i < count; i++) {
    const y0 = (H / (count + 1)) * (i + 1);
    const amp = 8 + rand() * 26;
    const freq = 1 + Math.floor(rand() * 3);
    const phase = rand() * Math.PI * 2;
    let d = `M0 ${r1(y0)}`;
    for (let x = 0; x <= W; x += 10) d += `L${x} ${r1(y0 + Math.sin((x / W) * Math.PI * 2 * freq + phase) * amp)}`;
    d += `L${W} ${H}L0 ${H}z`;
    out.push({ tag: "path", attrs: { d, fill: colors[i % colors.length]!, opacity: 0.9 } });
  }
  return out;
}

/** Rays from a point, alternating colours. */
function rays({ rand, colors, layers, rhythm }: Ctx): Shape[] {
  const out: Shape[] = [];
  const cx = rand() * W;
  const cy = rand() < 0.5 ? H + 20 : -20;
  const count = 10 + layers * 3 + rhythm * 2;
  const R = 900;
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 0.5) / count) * Math.PI * 2;
    out.push({
      tag: "path",
      attrs: { d: `M${r1(cx)} ${r1(cy)}L${r1(cx + Math.cos(a0) * R)} ${r1(cy + Math.sin(a0) * R)}L${r1(cx + Math.cos(a1) * R)} ${r1(cy + Math.sin(a1) * R)}z`, fill: colors[i % colors.length]! },
    });
  }
  out.push({ tag: "circle", attrs: { cx: r1(cx), cy: r1(cy), r: 70 + rhythm * 10, fill: colors[(layers + 2) % colors.length]! } });
  return out;
}

const COMPOSITIONS: Record<string, (c: Ctx) => Shape[]> = { orbits, truchet, stripes, blocks, waves, rays };
export const COMPOSITION_NAMES = Object.keys(COMPOSITIONS);

/** Halftone dots over part of the poster, for print texture. */
function halftone(rand: () => number, ink: string): Shape[] {
  const out: Shape[] = [];
  const x0 = rand() < 0.5 ? 0 : W / 2;
  for (let y = 6; y < H; y += 12) {
    for (let x = x0 + 6; x < x0 + W / 2; x += 12) {
      const r = ((y / H) * 3.2 + (x - x0) / W) * 0.9;
      if (r > 0.4) out.push({ tag: "circle", attrs: { cx: x, cy: y, r: r1(r), fill: ink, opacity: 0.18 } });
    }
  }
  return out;
}

export function poster(seedText: string, tags: string[], years: number): Poster {
  const seed = hash(seedText);
  const rand = rng(seed);
  const palette = PALETTES[seed % PALETTES.length]!;
  const composition = COMPOSITION_NAMES[(seed >>> 8) % COMPOSITION_NAMES.length]!;
  // Each technology nudges the order of the colours, so shared stacks look related.
  const shift = tags.reduce((acc, t) => acc + (hash(t) % 7), 0) % palette.colors.length;
  const colors = [...palette.colors.slice(shift), ...palette.colors.slice(0, shift)];
  const ctx: Ctx = { rand, colors, bg: palette.bg, ink: palette.ink, layers: Math.min(5, Math.max(1, tags.length)), rhythm: Math.min(4, Math.max(0, years)) };
  const shapes = [...COMPOSITIONS[composition]!(ctx), ...halftone(rand, palette.ink)];
  return { bg: palette.bg, ink: palette.ink, shapes, composition };
}
