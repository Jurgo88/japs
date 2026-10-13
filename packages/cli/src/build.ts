import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BuildPortfolioResult } from "@japs/core";
import type { Portfolio } from "@japs/schema";

/**
 * Downloads screenshots next to portfolio.json and writes it. A screenshot that fails to
 * download is dropped from the portfolio, so it never points at a missing file.
 */
export async function writePortfolio(
  outDir: string,
  result: BuildPortfolioResult,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ portfolio: Portfolio; warnings: string[] }> {
  const warnings = [...result.warnings];
  const failed = new Set<string>();

  await Promise.all(
    result.screenshots.map(async ({ url, path }) => {
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const target = join(outDir, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, new Uint8Array(await res.arrayBuffer()));
      } catch (err) {
        failed.add(path);
        warnings.push(`${path}: download failed (${err instanceof Error ? err.message : String(err)})`);
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
