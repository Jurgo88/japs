import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Anonymized sample shipped with the kit, so every theme runs without an account. */
export const SAMPLE_DIR = fileURLToPath(new URL("../sample", import.meta.url));

/** The bits of Vite's dev server the reload plugin touches (the kit doesn't depend on Vite). */
interface DevServer {
  watcher: { add(path: string): void; on(event: "change", listener: (path: string) => void): void };
  environments: Record<string, { name: string; hot: { send(event: string, data: unknown): void } }>;
  ws: { send(payload: { type: "full-reload" }): void };
}

/**
 * Directory with portfolio.json and its screenshots (output of `japs build`).
 * JAPS_PORTFOLIO_DIR overrides; otherwise the repo's out/, or the sample when that's missing.
 */
export function resolvePortfolioDir(themeDir: string, env: NodeJS.ProcessEnv = process.env): string {
  // Relative to where the command was run: pnpm --filter switches cwd but keeps INIT_CWD.
  if (env.JAPS_PORTFOLIO_DIR) return resolve(env.INIT_CWD ?? process.cwd(), env.JAPS_PORTFOLIO_DIR);
  const out = resolve(themeDir, "../../out");
  if (existsSync(resolve(out, "portfolio.json"))) return out;
  console.warn("[japs] out/portfolio.json not found — using the sample portfolio. Run `pnpm japs build` for yours.");
  return SAMPLE_DIR;
}

/** In `astro dev`, reload the browser when `japs build` (or the editor) rewrites portfolio.json. */
function reloadOnPortfolioChange(dir: string) {
  const file = resolve(dir, "portfolio.json");
  return {
    name: "japs-portfolio-reload",
    configureServer(server: DevServer) {
      server.watcher.add(file);
      server.watcher.on("change", (changed) => {
        if (resolve(changed) !== file) return;
        // getStaticPaths() results are cached in dev; a new project would 404 until restart.
        // Astro clears that cache on its (internal) content-changed event, as for content collections.
        for (const environment of Object.values(server.environments)) {
          if (environment.name !== "client") environment.hot.send("astro:content-changed", {});
        }
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}

/**
 * Astro config for a JAPS theme. Spread it into defineConfig():
 *   export default defineConfig({ ...japsAstroConfig(import.meta.url) });
 * Screenshots are served straight from the portfolio directory: no copying, no hotlinks.
 */
export function japsAstroConfig(configUrl: string) {
  const dir = resolvePortfolioDir(dirname(fileURLToPath(configUrl)));
  process.env.JAPS_PORTFOLIO_DIR = dir;
  return {
    publicDir: dir,
    site: process.env.JAPS_SITE_URL,
    vite: { plugins: [reloadOnPortfolioChange(dir)] },
  };
}
