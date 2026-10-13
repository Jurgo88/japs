// @ts-check
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Directory with portfolio.json and its screenshots (output of `japs build`).
 * JAPS_PORTFOLIO_DIR overrides; otherwise the repo's out/, or the bundled sample when that's missing.
 */
function portfolioDir() {
  // Relative to where the command was run: pnpm --filter switches cwd but keeps INIT_CWD.
  if (process.env.JAPS_PORTFOLIO_DIR) {
    return resolve(process.env.INIT_CWD ?? process.cwd(), process.env.JAPS_PORTFOLIO_DIR);
  }
  const out = resolve(here, "../../out");
  if (existsSync(resolve(out, "portfolio.json"))) return out;
  console.warn("[japs] out/portfolio.json not found — using the sample portfolio. Run `pnpm japs build` for yours.");
  return resolve(here, "sample");
}

const dir = portfolioDir();
process.env.JAPS_PORTFOLIO_DIR = dir;

export default defineConfig({
  // Screenshots are served straight from the portfolio directory: no copying, no hotlinks.
  publicDir: dir,
  site: process.env.JAPS_SITE_URL,
});
