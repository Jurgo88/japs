/**
 * Positions on the canvas, in world pixels. The intro frame and sticky notes sit top-left; project
 * frame groups follow in a loose grid with a deterministic jitter, so the board looks hand-arranged
 * but every build lays it out the same way.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
}

const COLS = 3;
const CELL_W = 1180;
const CELL_H = 720;
const TOP = 760;

/** A small, stable pseudo-random offset from an index. */
const jitter = (i: number, salt: number, range: number) => (((i * 7919 + salt * 104729) % 1000) / 1000 - 0.5) * range;

export const ABOUT: Box = { x: 0, y: 0, w: 800 };

export const STICKIES: (Box & { tilt: number; color: string })[] = [
  { x: 880, y: 30, w: 240, tilt: -3, color: "#fff3a3" },
  { x: 1160, y: 150, w: 240, tilt: 2.5, color: "#ffd6e7" },
  { x: 900, y: 330, w: 240, tilt: 1.5, color: "#d4f5dd" },
];

/** A frame group per project: desktop width varies a little; the mobile frame sits beside it. */
export function projectBoxes(count: number): Box[] {
  return Array.from({ length: count }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      x: Math.round(col * CELL_W + jitter(i, 1, 120)),
      y: Math.round(TOP + row * CELL_H + jitter(i, 2, 110) + (col === 1 ? 60 : 0)),
      w: Math.round(780 + jitter(i, 3, 160)),
    };
  });
}

/** Bounds of the whole board, for fitting and the minimap. */
export function boardSize(count: number): { w: number; h: number } {
  const rows = Math.max(1, Math.ceil(count / COLS));
  return { w: COLS * CELL_W + 200, h: TOP + rows * CELL_H + 200 };
}
