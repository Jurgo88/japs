import puppeteer from "@cloudflare/puppeteer";
import { SCREENSHOT_HIDE_CSS, SCREENSHOT_VIEWPORTS } from "@japs/core";
import type { Viewport } from "@japs/schema";
import { BrowserLimitError, type Capture, VIEWPORTS } from "./screenshots.ts";

/**
 * Browser Run capture (#33), the cloud twin of the CLI's Playwright capture: same viewports,
 * same banner hiding. Kept apart from screenshots.ts so tests never load Puppeteer.
 */
export function browserCapture(binding: Fetcher): Capture {
  return async (url) => {
    let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
    try {
      browser = await puppeteer.launch(binding);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/time limit exceeded/i.test(message)) throw new BrowserLimitError(message);
      throw err;
    }
    try {
      const images: Partial<Record<Viewport, Uint8Array>> = {};
      for (const viewport of VIEWPORTS) {
        const { width, height, deviceScaleFactor, isMobile } = SCREENSHOT_VIEWPORTS[viewport];
        // A page per viewport: going mobile reloads a loaded page, and a site that asks before
        // leaving would hold that reload until it times out.
        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor, isMobile, hasTouch: isMobile });
        // SPAs keep sockets open; fall back to "load" when the network never settles.
        try {
          await page.goto(url, { waitUntil: "networkidle2", timeout: 25_000 });
        } catch {
          await page.goto(url, { waitUntil: "load", timeout: 25_000 });
        }
        await page.addStyleTag({ content: SCREENSHOT_HIDE_CSS });
        // Let intro animations settle.
        await new Promise((resolve) => setTimeout(resolve, 1500));
        images[viewport] = (await page.screenshot({ type: "jpeg", quality: 82 })) as Uint8Array;
        await page.close();
      }
      return images;
    } finally {
      await browser.close();
    }
  };
}
