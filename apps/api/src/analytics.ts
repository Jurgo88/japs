import { z } from "zod";
import type { AnalyticsRow } from "./db.ts";

/**
 * Visit statistics for published portfolios (ADR 0015). A small script in the built theme sends
 * one hit per page view. Only daily counters are stored; nothing identifies a visitor.
 */

/** Days of counters kept and shown. */
export const ANALYTICS_DAYS = 30;
/** Largest hit body. A hit is a key, a path and a host name. */
export const MAX_HIT_BYTES = 2048;
/** Hits are public, so one forged flood must not grow the table without bound. */
export const MAX_ANALYTICS_ROWS_PER_DAY = 500;

const TOP = 10;
const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python|node-fetch/i;
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

const HitBody = z.object({
  k: z.string().min(1).max(64),
  p: z.string().startsWith("/").max(300),
  r: z.string().max(253).default(""),
});

export interface Hit {
  key: string;
  page: string;
  /** Host of the page the visitor came from; null when direct or from the portfolio itself. */
  referrer: string | null;
  /** The visitor arrived from elsewhere, as opposed to moving within the portfolio. */
  visit: boolean;
  country: string | null;
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

function hostOf(url: string | undefined): string | null {
  try {
    return url ? bareHost(new URL(url).hostname) : null;
  } catch {
    return null;
  }
}

/** The hit in a request body, or null for anything that shouldn't count. */
export function parseHit(body: string, headers: { origin?: string; userAgent?: string; country?: string }): Hit | null {
  if (body.length > MAX_HIT_BYTES || !headers.userAgent || BOTS.test(headers.userAgent)) return null;
  const site = hostOf(headers.origin);
  if (!site) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = HitBody.safeParse(json);
  if (!parsed.success) return null;

  const from = bareHost(parsed.data.r);
  const external = from !== "" && HOST.test(from) && from !== site;
  const country = headers.country?.toUpperCase() ?? "";
  return {
    key: parsed.data.k,
    page: parsed.data.p.split(/[?#]/)[0]!,
    referrer: external ? from : null,
    visit: external || from === "",
    country: /^[A-Z]{2}$/.test(country) ? country : null,
  };
}

export const dayOf = (date: Date) => date.toISOString().slice(0, 10);
export const firstDay = (now: Date) => dayOf(new Date(now.getTime() - (ANALYTICS_DAYS - 1) * 86_400_000));

export interface AnalyticsReport {
  totals: { views: number; visits: number };
  /** Every day of the period, oldest first, days without visits included. */
  days: { day: string; views: number; visits: number }[];
  pages: { value: string; count: number }[];
  referrers: { value: string; count: number }[];
  countries: { value: string; count: number }[];
}

export function buildReport(rows: AnalyticsRow[], now: Date): AnalyticsReport {
  const days = Array.from({ length: ANALYTICS_DAYS }, (_, i) => ({
    day: dayOf(new Date(now.getTime() - (ANALYTICS_DAYS - 1 - i) * 86_400_000)),
    views: 0,
    visits: 0,
  }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  const top = { page: new Map<string, number>(), referrer: new Map<string, number>(), country: new Map<string, number>() };

  for (const row of rows) {
    if (row.dimension === "views" || row.dimension === "visits") {
      const day = byDay.get(row.day);
      if (day) day[row.dimension] += row.count;
    } else {
      top[row.dimension].set(row.value, (top[row.dimension].get(row.value) ?? 0) + row.count);
    }
  }
  const ranked = (counts: Map<string, number>) =>
    [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, TOP);

  return {
    totals: { views: days.reduce((n, d) => n + d.views, 0), visits: days.reduce((n, d) => n + d.visits, 0) },
    days,
    pages: ranked(top.page),
    referrers: ranked(top.referrer),
    countries: ranked(top.country),
  };
}
