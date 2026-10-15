import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, extname, join, normalize, sep } from "node:path";
import { AnalysisFile, JapsConfig, ProjectsFile, PublishState } from "@japs/schema";
import { starterConfig } from "./config.ts";
import { publishWorkspace } from "./publish.ts";
import { loadManifest } from "./screenshots.ts";
import { analyzeWorkspace, buildWorkspace, factsWorkspace, readOptional, type Workspace, WorkspaceError } from "./workspace.ts";

/**
 * Local server behind `japs edit` (ADR 0007): the built dashboard plus a small JSON API over
 * the workspace files. Loopback only; writes need the per-session token embedded in the page.
 */

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const MAX_BODY = 1_000_000;

export interface EditorServerOptions {
  /** Directory with the built dashboard (index.html + assets). */
  dashboardDir: string;
  /** Tokens and LLM settings for generating texts. Default: process.env. */
  env?: NodeJS.ProcessEnv;
  /** Fixed for tests; random per run otherwise. */
  token?: string;
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new WorkspaceError("Request body too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** The config as written on disk (no defaults filled in), or a starter when there is none. */
async function rawConfig(ws: Workspace): Promise<{ exists: boolean; config: unknown }> {
  if (!existsSync(ws.config)) return { exists: false, config: starterConfig(["en"]) };
  return { exists: true, config: JSON.parse(await readFile(ws.config, "utf8")) };
}

export function createEditorServer(ws: Workspace, options: EditorServerOptions): { server: Server; token: string } {
  const token = options.token ?? randomBytes(24).toString("hex");

  const server = createServer(async (req, res) => {
    try {
      // DNS rebinding: a page on evil.example resolving to 127.0.0.1 still sends its own Host.
      const host = (req.headers.host ?? "").replace(/:\d+$/, "");
      if (host !== "127.0.0.1" && host !== "localhost") return send(res, 403, { error: "Forbidden host" });

      const url = new URL(req.url ?? "/", "http://localhost");
      const path = decodeURIComponent(url.pathname);
      const isWrite = req.method === "PUT" || req.method === "POST";
      if (isWrite && req.headers["x-japs-token"] !== token) return send(res, 403, { error: "Missing or wrong token" });

      if (path === "/api/state" && req.method === "GET") {
        const { exists, config } = await rawConfig(ws);
        return send(res, 200, {
          configExists: exists,
          config,
          projects: await readOptional(ws.projects, ProjectsFile),
          analysis: await readOptional(ws.analysis, AnalysisFile).catch(() => null),
          screenshots: await loadManifest(ws.screenshots),
          built: existsSync(join(ws.out, "portfolio.json")),
        });
      }

      if (path === "/api/config" && req.method === "PUT") {
        const body = await readBody(req);
        const parsed = JapsConfig.safeParse(body);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
          return send(res, 400, { error: "Invalid config", issues });
        }
        // Write what the editor sent (minimal, ADR 0007), not the parsed form with defaults.
        await writeFile(ws.config, `${JSON.stringify(body, null, 2)}\n`, "utf8");
        return send(res, 200, { ok: true });
      }

      if (path === "/api/build" && req.method === "POST") {
        const { portfolio, warnings } = await buildWorkspace(ws);
        const screenshots = portfolio.projects.reduce((n, p) => n + p.screenshots.length, 0);
        return send(res, 200, { projects: portfolio.projects.length, screenshots, warnings });
      }

      // Publish (#34): the same as `japs publish`, finished within the request.
      if (path === "/api/publish" && req.method === "POST") {
        const body = (await readBody(req)) as { draft?: unknown };
        const draft = body.draft === true;
        const { site, deploy } = await publishWorkspace(ws, { env: options.env ?? process.env, draft });
        return send(res, 200, {
          publish: { id: deploy.deployId, status: "live", draft, siteUrl: site.url, url: deploy.url || site.url, message: null, createdAt: new Date().toISOString() },
        });
      }

      if (path === "/api/publish/latest" && req.method === "GET") {
        const state = await readOptional(ws.publish, PublishState).catch(() => null);
        const last = state?.lastDeploy;
        return send(res, 200, {
          publish: last && state ? { id: last.id, status: "live", draft: last.draft, siteUrl: state.url, url: last.url, message: null, createdAt: last.at } : null,
        });
      }

      // Facts + LLM texts for one project. Costs a cent or two, so only on an explicit click.
      if (path === "/api/generate" && req.method === "POST") {
        const body = (await readBody(req)) as { key?: unknown };
        if (typeof body.key !== "string") throw new WorkspaceError('Expected { "key": "<project key>" }');
        const keys = [body.key];
        const facts = await factsWorkspace(ws, { env: options.env ?? process.env, keys });
        const analysis = await analyzeWorkspace(ws, { env: options.env ?? process.env, keys });
        const entry = analysis.file.projects.find((p) => p.key === body.key);
        return send(res, 200, {
          generated: analysis.generated,
          usage: analysis.usage,
          dropped: entry?.dropped ?? [],
          // Both runs covered only this project, so their warnings are about it.
          warnings: [...facts.file.warnings, ...analysis.file.warnings],
          model: `${analysis.provider} / ${analysis.model}`,
        });
      }

      if (path.startsWith("/api/screenshots/") && req.method === "GET") {
        const file = join(ws.screenshots, basename(path));
        if (!existsSync(file)) return send(res, 404, { error: "Not found" });
        return send(res, 200, await readFile(file), TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
      }

      if (path.startsWith("/api/")) return send(res, 404, { error: "Not found" });
      if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

      // Static dashboard; unknown paths fall back to index.html (client-side routing).
      const relative = normalize(path).replace(/^([/\\])+/, "");
      const target = join(options.dashboardDir, relative);
      const inside = target.startsWith(options.dashboardDir + sep) || target === options.dashboardDir;
      const isFile = inside && relative !== "" && existsSync(target) && extname(target) !== "";
      if (isFile) return send(res, 200, await readFile(target), TYPES[extname(target).toLowerCase()] ?? "application/octet-stream");

      const index = join(options.dashboardDir, "index.html");
      if (!existsSync(index)) return send(res, 500, "Dashboard is not built. Run: pnpm --filter @japs/dashboard build", "text/plain");
      const html = (await readFile(index, "utf8")).replace("</head>", `<meta name="japs-token" content="${token}" />\n</head>`);
      return send(res, 200, html, TYPES[".html"]);
    } catch (err) {
      const status = err instanceof WorkspaceError || err instanceof SyntaxError ? 400 : 500;
      return send(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  return { server, token };
}
