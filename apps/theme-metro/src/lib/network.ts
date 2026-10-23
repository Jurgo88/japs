import type { Portfolio, PortfolioProject } from "@japs/schema";
import { tagCounts } from "@japs/theme-kit";

/** Metro line colours, in order of the most used technology. */
const COLORS = ["#e1251b", "#0b6fbd", "#00a14b", "#f6b500", "#9b4f96", "#f47c20"];
const OTHER_COLOR = "#9aa0a6";
const MAX_LINES = COLORS.length;

export interface Line {
  index: number;
  /** The technology, or null for the grey line that serves everything else. */
  tag: string | null;
  color: string;
}

export interface Station {
  project: PortfolioProject;
  /** Indexes into `lines`, ascending. */
  lines: number[];
}

export interface Network {
  lines: Line[];
  /** In journey order: oldest work first. */
  stations: Station[];
}

const startOf = (p: PortfolioProject) => p.period.from ?? p.period.to ?? "9999";

/**
 * Lines are the most used technologies (used by at least two projects); stations are projects in
 * chronological order. A project no coloured line serves sits on a grey "other" line, so every
 * project is on the map.
 */
export function buildNetwork(portfolio: Portfolio): Network {
  const lines: Line[] = tagCounts(portfolio)
    .filter((t) => t.count >= 2)
    .slice(0, MAX_LINES)
    .map((t, index) => ({ index, tag: t.tag, color: COLORS[index]! }));

  const ordered = [...portfolio.projects].sort((a, b) => startOf(a).localeCompare(startOf(b)));
  const stations: Station[] = ordered.map((project) => ({
    project,
    lines: lines.filter((l) => l.tag && project.tags.includes(l.tag)).map((l) => l.index),
  }));

  if (stations.some((s) => s.lines.length === 0)) {
    const other: Line = { index: lines.length, tag: null, color: OTHER_COLOR };
    lines.push(other);
    for (const s of stations) if (s.lines.length === 0) s.lines.push(other.index);
  }
  return { lines, stations };
}

/** The station before and after `slug` on each line serving it. */
export function lineNeighbours(network: Network, slug: string) {
  return network.lines
    .map((line) => {
      const onLine = network.stations.filter((s) => s.lines.includes(line.index));
      const i = onLine.findIndex((s) => s.project.slug === slug);
      if (i < 0) return null;
      return { line, previous: onLine[i - 1]?.project ?? null, next: onLine[i + 1]?.project ?? null };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
