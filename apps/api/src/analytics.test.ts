import { describe, expect, it } from "vitest";
import { ANALYTICS_DAYS, buildReport, parseHit } from "./analytics.ts";

const headers = { origin: "https://jane.example.dev", userAgent: "Mozilla/5.0" };
const body = (r = "", p = "/") => JSON.stringify({ k: "key", p, r });

describe("parseHit", () => {
  it("keeps only the path, without query or fragment", () => {
    expect(parseHit(body("", "/a/?token=secret#top"), headers)?.page).toBe("/a/");
  });

  it("tells arrivals from moves within the portfolio", () => {
    expect(parseHit(body(), headers)).toMatchObject({ visit: true, referrer: null });
    expect(parseHit(body("www.jane.example.dev"), headers)).toMatchObject({ visit: false, referrer: null });
    expect(parseHit(body("news.ycombinator.com"), headers)).toMatchObject({ visit: true, referrer: "news.ycombinator.com" });
  });

  it("keeps a valid country only", () => {
    expect(parseHit(body(), { ...headers, country: "SK" })?.country).toBe("SK");
    expect(parseHit(body(), { ...headers, country: "T1X" })?.country).toBeNull();
  });

  it("refuses bots, missing headers and malformed bodies", () => {
    expect(parseHit(body(), { ...headers, userAgent: "curl/8.0" })).toBeNull();
    expect(parseHit(body(), { origin: headers.origin })).toBeNull();
    expect(parseHit(body(), { userAgent: headers.userAgent })).toBeNull();
    expect(parseHit("not json", headers)).toBeNull();
    expect(parseHit(body("", "x".repeat(5000)), headers)).toBeNull();
  });
});

describe("buildReport", () => {
  const now = new Date("2026-11-01T10:00:00Z");

  it("fills days without visits and adds up the totals", () => {
    const report = buildReport(
      [
        { day: "2026-11-01", dimension: "views", value: "", count: 3 },
        { day: "2026-10-31", dimension: "views", value: "", count: 2 },
        { day: "2026-11-01", dimension: "visits", value: "", count: 1 },
      ],
      now,
    );
    expect(report.days).toHaveLength(ANALYTICS_DAYS);
    expect(report.days.at(-1)).toEqual({ day: "2026-11-01", views: 3, visits: 1 });
    expect(report.totals).toEqual({ views: 5, visits: 1 });
  });

  it("adds a value up across days and ranks the top ones", () => {
    const report = buildReport(
      [
        { day: "2026-10-31", dimension: "page", value: "/a/", count: 1 },
        { day: "2026-11-01", dimension: "page", value: "/a/", count: 1 },
        { day: "2026-11-01", dimension: "page", value: "/", count: 5 },
      ],
      now,
    );
    expect(report.pages).toEqual([{ value: "/", count: 5 }, { value: "/a/", count: 2 }]);
  });
});
