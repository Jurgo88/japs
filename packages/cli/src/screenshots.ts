import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScreenshotTarget } from "@japs/core";
import { ScreenshotsManifest, type ScreenshotRecord, type Viewport } from "@japs/schema";

/** Own captures live outside out/ so `japs build` can be rerun without re-shooting. */
export const SCREENSHOTS_DIR = "screenshots";
const MANIFEST = "manifest.json";

const VIEWPORTS: Record<Viewport, { width: number; height: number; deviceScaleFactor: number; isMobile: boolean }> = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
};

/**
 * Hides cookie and consent banners and scrollbars before the shot. Matching by id/class/aria
 * names covers the common consent tools without clicking anything on the user's site.
 */
const HIDE_CSS = `
  :is([id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i],
    [id*="gdpr" i], [class*="gdpr" i], [aria-label*="cookie" i], [aria-label*="consent" i],
    #onetrust-consent-sdk, #CybotCookiebotDialog, .cc-window, .cky-consent-container,
    #usercentrics-root, .fc-consent-root, #didomi-host, .klaro):not(html):not(body) { display: none !important; }
  html, body { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; }
`;
// Sites often lock scrolling or blur the page while a banner is open (e.g. <body class="cookie-open">);
// nothing here hides <html> or <body> themselves.

export async function loadManifest(dir: string): Promise<ScreenshotsManifest | null> {
  const path = join(dir, MANIFEST);
  if (!existsSync(path)) return null;
  const parsed = ScreenshotsManifest.safeParse(JSON.parse(await readFile(path, "utf8")));
  return parsed.success ? parsed.data : null;
}

export class PlaywrightMissingError extends Error {}

type Browser = Awaited<ReturnType<typeof import("playwright")["chromium"]["launch"]>>;

/** Loads Playwright only for this command, with a fix-it message when Chromium isn't installed. */
async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright");
  try {
    return await chromium.launch();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|playwright install/i.test(message)) {
      throw new PlaywrightMissingError("Chromium for Playwright is not installed. Run: pnpm --filter @japs/cli exec playwright install chromium");
    }
    throw err;
  }
}

async function capture(browser: Browser, target: ScreenshotTarget, viewport: Viewport, file: string): Promise<void> {
  const { width, height, deviceScaleFactor, isMobile } = VIEWPORTS[viewport];
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, isMobile, hasTouch: isMobile });
  try {
    const page = await context.newPage();
    // SPAs keep sockets open; fall back to "load" when the network never goes idle.
    try {
      await page.goto(target.url, { waitUntil: "networkidle", timeout: 30_000 });
    } catch {
      await page.goto(target.url, { waitUntil: "load", timeout: 30_000 });
    }
    await page.addStyleTag({ content: HIDE_CSS });
    // Let intro animations (GSAP, fade-ins) settle.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: file, type: "jpeg", quality: 82 });
  } finally {
    await context.close();
  }
}

export interface CaptureResult {
  manifest: ScreenshotsManifest;
  taken: number;
  warnings: string[];
}

/**
 * Captures desktop and mobile shots of each target into `dir` and updates the manifest.
 * Shots of projects not captured this run are kept, so `--project` refreshes one at a time.
 */
export async function captureScreenshots(
  targets: ScreenshotTarget[],
  dir: string,
  options: { concurrency?: number; now?: () => Date; onProgress?: (done: number, total: number, key: string) => void } = {},
): Promise<CaptureResult> {
  await mkdir(dir, { recursive: true });
  const previous = (await loadManifest(dir))?.shots ?? [];
  const warnings: string[] = [];
  const fresh: ScreenshotRecord[] = [];
  const now = options.now ?? (() => new Date());

  const jobs = targets.flatMap((target) => (["desktop", "mobile"] as const).map((viewport) => ({ target, viewport })));
  const browser = await launch();
  let done = 0;
  try {
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const { target, viewport } = jobs[next++]!;
        const file = `${target.slug}-${viewport}.jpg`;
        try {
          await capture(browser, target, viewport, join(dir, file));
          fresh.push({ key: target.key, viewport, file, url: target.url, takenAt: now().toISOString() });
        } catch (err) {
          warnings.push(`${target.key} (${viewport}): ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
        }
        options.onProgress?.(++done, jobs.length, `${target.key} ${viewport}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 3, jobs.length) }, worker));
  } finally {
    await browser.close();
  }

  const replaced = new Set(fresh.map((s) => `${s.key}|${s.viewport}`));
  const order = (s: ScreenshotRecord) => `${s.key}|${s.viewport}`;
  const manifest: ScreenshotsManifest = {
    version: 1,
    shots: [...previous.filter((s) => !replaced.has(order(s))), ...fresh].sort((a, b) => order(a).localeCompare(order(b))),
  };
  await writeFile(join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, taken: fresh.length, warnings };
}
