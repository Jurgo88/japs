import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildPortfolioResult } from "@japs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writePortfolio } from "./build.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "japs-build-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const t = (text: string) => ({ en: text });
const project = (slug: string) => ({
  slug,
  title: t(slug),
  summary: t("s"),
  description: t("d"),
  role: t("r"),
  period: { from: null, to: null },
  tags: [],
  links: { live: null, repo: null },
  client: { isClient: false, anonymized: false, label: null },
  screenshots: [{ viewport: "desktop" as const, src: `screenshots/${slug}-desktop.webp`, alt: t(slug) }],
  featured: false,
});

const result: BuildPortfolioResult = {
  portfolio: {
    version: 1,
    generatedAt: "2026-10-13T10:00:00.000Z",
    locales: ["en"],
    defaultLocale: "en",
    profile: { name: "Jane", headline: t("h"), bio: t("b"), location: null, links: [] },
    projects: [project("ok"), project("broken")],
  },
  screenshots: [
    { path: "screenshots/ok-desktop.webp", source: { url: "https://cdn.example/ok.webp" } },
    { path: "screenshots/broken-desktop.webp", source: { url: "https://cdn.example/broken.webp" } },
  ],
  warnings: ["from core"],
};

const fakeFetch = (async (input: string | URL | Request) =>
  String(input).includes("broken")
    ? new Response("gone", { status: 404, statusText: "Not Found" })
    : new Response(new Uint8Array([1, 2, 3]))) as typeof fetch;

describe("writePortfolio", () => {
  it("downloads screenshots, drops failed ones, and writes portfolio.json", async () => {
    const out = join(dir, "out");
    const { portfolio, warnings } = await writePortfolio(out, result, { fetch: fakeFetch });

    expect([...(await readFile(join(out, "screenshots/ok-desktop.webp")))]).toEqual([1, 2, 3]);
    expect(portfolio.projects.map((p) => p.screenshots.length)).toEqual([1, 0]);
    expect(warnings).toEqual(["from core", "screenshots/broken-desktop.webp: download failed (404 Not Found)"]);
    expect(JSON.parse(await readFile(join(out, "portfolio.json"), "utf8"))).toEqual(portfolio);
  });

  it("copies own screenshots and removes stale ones from earlier builds", async () => {
    const out = join(dir, "out");
    const shots = join(dir, "shots");
    await mkdir(join(out, "screenshots"), { recursive: true });
    await writeFile(join(out, "screenshots", "old-project-desktop.webp"), "stale");
    await mkdir(shots, { recursive: true });
    await writeFile(join(shots, "ok-desktop.jpg"), "jpeg");

    const own: BuildPortfolioResult = {
      ...result,
      portfolio: { ...result.portfolio, projects: [project("ok")] },
      screenshots: [{ path: "screenshots/ok-desktop.webp", source: { file: "ok-desktop.jpg" } }],
    };
    await writePortfolio(out, own, { screenshotsDir: shots, fetch: fakeFetch });

    expect(await readdir(join(out, "screenshots"))).toEqual(["ok-desktop.webp"]);
    expect(await readFile(join(out, "screenshots/ok-desktop.webp"), "utf8")).toBe("jpeg");
  });
});
