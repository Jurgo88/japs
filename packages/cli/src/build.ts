import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BuildPortfolioResult } from "@japs/core";
import type { Portfolio } from "@japs/schema";

/**
 * Places screenshots next to portfolio.json (copied from the screenshots directory or
 * downloaded from Netlify) and writes it. A screenshot that can't be placed is dropped from
 * the portfolio, so it never points at a missing file.
 */
export async function writePortfolio(
  outDir: string,
  result: BuildPortfolioResult,
  options: { screenshotsDir?: string; fetch?: typeof fetch } = {},
): Promise<{ portfolio: Portfolio; warnings: string[] }> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const warnings = [...result.warnings];
  const failed = new Set<string>();

  // Start clean: a renamed project or a switch from .webp to .jpg must not leave orphans.
  await rm(join(outDir, "screenshots"), { recursive: true, force: true });

  await Promise.all(
    result.screenshots.map(async ({ path, source }) => {
      const target = join(outDir, path);
      try {
        await mkdir(dirname(target), { recursive: true });
        if ("file" in source) {
          if (!options.screenshotsDir) throw new Error("no screenshots directory given");
          await copyFile(join(options.screenshotsDir, source.file), target);
        } else {
          const res = await fetchImpl(source.url, { signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          await writeFile(target, new Uint8Array(await res.arrayBuffer()));
        }
      } catch (err) {
        failed.add(path);
        const verb = "file" in source ? "copy" : "download";
        warnings.push(`${path}: ${verb} failed (${err instanceof Error ? err.message : String(err)})`);
      }
    }),
  );

  const portfolio: Portfolio = {
    ...result.portfolio,
    projects: result.portfolio.projects.map((p) => ({
      ...p,
      screenshots: p.screenshots.filter((s) => !failed.has(s.src)),
    })),
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "portfolio.json"), `${JSON.stringify(portfolio, null, 2)}\n`, "utf8");
  return { portfolio, warnings };
}
