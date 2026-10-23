/**
 * Column spans (of 12) for the project tiles: a wide pair, a row of three, the pair mirrored,
 * a row of three, and so on. The last row takes whatever is left and shares the width evenly;
 * a single leftover joins the row before it, so no tile ends up alone across the full width.
 * In a pair, the wide tile goes to the project that has a screenshot.
 */
const PATTERN = [
  [7, 5],
  [4, 4, 4],
  [5, 7],
  [4, 4, 4],
];
const EVEN: Record<number, number[]> = { 1: [12], 2: [6, 6], 3: [4, 4, 4], 4: [3, 3, 3, 3] };

export function projectSpans(hasShot: boolean[]): number[] {
  const count = hasShot.length;
  const rows: number[][] = [];
  let used = 0;
  for (let r = 0; used < count; r++) {
    const pattern = PATTERN[r % PATTERN.length]!;
    const left = count - used;
    const row = left >= pattern.length ? [...pattern] : [...EVEN[left]!];
    rows.push(row);
    used += row.length;
  }
  const last = rows[rows.length - 1]!;
  if (rows.length > 1 && last.length === 1) {
    rows.pop();
    const merged = rows.pop()!.length + 1;
    rows.push([...EVEN[merged]!]);
  }

  const spans: number[] = [];
  let i = 0;
  for (const row of rows) {
    if (row.length === 2 && row[0] !== row[1]) {
      const wideFirst = row[0]! > row[1]!;
      const [a, b] = [hasShot[i], hasShot[i + 1]];
      // Swap when the wide slot would get the project without a screenshot.
      if ((wideFirst && !a && b) || (!wideFirst && a && !b)) row.reverse();
    }
    spans.push(...row);
    i += row.length;
  }
  return spans;
}

/** Projects per year, oldest first, for the activity chart. */
export function projectsPerYear(projects: { period: { from: string | null; to: string | null } }[]): { year: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const p of projects) {
    const from = Number((p.period.from ?? p.period.to ?? "").slice(0, 4));
    const to = Number((p.period.to ?? p.period.from ?? "").slice(0, 4));
    if (!from || !to) continue;
    for (let y = from; y <= to; y++) counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  const years = [...counts.keys()].sort((a, b) => a - b);
  if (!years.length) return [];
  const out: { year: number; count: number }[] = [];
  for (let y = years[0]!; y <= years[years.length - 1]!; y++) out.push({ year: y, count: counts.get(y) ?? 0 });
  return out;
}
