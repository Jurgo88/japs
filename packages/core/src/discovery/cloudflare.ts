import { z } from "zod";
import type { DeployContext } from "@japs/schema";
import type { SiteInput } from "./types.ts";

/**
 * Cloudflare Pages as a second source of sites (ADR 0012). Read-only: accounts and their
 * Pages projects. A project connected to GitHub names its repo directly, which pairs like
 * Netlify's repo_url (ADR 0003); direct-upload projects pair by homepage or a manual link.
 */

const API = "https://api.cloudflare.com/client/v4";

/** Site ids get a prefix, so project keys ("site:cf:<id>") never collide with Netlify ids. */
export const CLOUDFLARE_SITE_PREFIX = "cf:";

/** Discovery ids of the sites JAPS publishes the portfolio to, from publish.json. */
export function portfolioSiteIds(state: { netlify?: { siteId: string } | null; cloudflare?: { projectId: string } | null } | null): string[] {
  return [state?.netlify?.siteId, state?.cloudflare ? `${CLOUDFLARE_SITE_PREFIX}${state.cloudflare.projectId}` : undefined].filter(
    (id): id is string => Boolean(id),
  );
}

const Envelope = z.object({
  success: z.boolean(),
  // Some endpoints (e.g. /workers/domains) send errors: null on success.
  errors: z
    .array(z.object({ code: z.number().optional(), message: z.string() }))
    .nullish()
    .transform((e) => e ?? []),
  result: z.unknown(),
  result_info: z.object({ page: z.number().optional(), total_pages: z.number().optional() }).partial().nullish(),
});

const RawAccount = z.object({ id: z.string(), name: z.string() });

const RawDeployment = z.object({
  id: z.string(),
  url: z.string().nullish(),
  environment: z.string().nullish(),
  created_on: z.string().nullish(),
  deployment_trigger: z
    .object({
      metadata: z.object({ branch: z.string().nullish(), commit_hash: z.string().nullish() }).partial().nullish(),
    })
    .partial()
    .nullish(),
  latest_stage: z.object({ status: z.string().nullish() }).partial().nullish(),
});
type RawDeployment = z.infer<typeof RawDeployment>;

const RawPagesProject = z.object({
  id: z.string(),
  name: z.string(),
  subdomain: z.string().nullish(),
  domains: z.array(z.string()).nullish(),
  source: z
    .object({
      type: z.string(),
      config: z.object({ owner: z.string().nullish(), repo_name: z.string().nullish() }).partial().nullish(),
    })
    .nullish(),
  framework: z.string().nullish(),
  canonical_deployment: RawDeployment.nullish(),
  latest_deployment: RawDeployment.nullish(),
});
export type RawPagesProject = z.infer<typeof RawPagesProject>;

const isPagesDev = (domain: string) => domain.endsWith(".pages.dev");

/** A Pages project as a site. Only GitHub sources name a repo JAPS can pair with. */
export function toPagesSiteInput(raw: RawPagesProject): SiteInput {
  const subdomain = raw.subdomain || `${raw.name}.pages.dev`;
  const customDomain = raw.domains?.find((d) => !isPagesDev(d)) ?? null;
  const github = raw.source?.type === "github" && raw.source.config?.owner && raw.source.config.repo_name ? raw.source.config : null;
  const repoUrl = github ? `https://github.com/${github.owner}/${github.repo_name}` : null;

  // The production deployment that is live; a project with only previews counts as preview-only.
  const live = raw.canonical_deployment ?? null;
  const deployment: RawDeployment | null = live ?? raw.latest_deployment ?? null;
  const succeeded = !deployment?.latest_stage?.status || deployment.latest_stage.status === "success";
  const context: DeployContext = !deployment ? "unknown" : live ? "production" : "deploy-preview";
  const hash = deployment?.deployment_trigger?.metadata?.commit_hash;

  return {
    id: `${CLOUDFLARE_SITE_PREFIX}${raw.id}`,
    provider: "cloudflare",
    name: raw.name,
    url: `https://${subdomain}`,
    customDomain,
    repoUrl,
    deploy:
      deployment && succeeded
        ? {
            id: deployment.id,
            commitUrl: repoUrl && hash ? `${repoUrl}/commit/${hash}` : null,
            reviewUrl: null,
            framework: raw.framework || null,
            screenshotUrl: null,
            context,
            publishedAt: deployment.created_on ?? null,
            committer: null,
          }
        : null,
  };
}

// --- Workers with a public address (ADR 0012): custom domains, zone routes, workers.dev ---

/** Worker site ids: "cf:worker:<script name>", apart from Pages ids. */
export const WORKER_SITE_PREFIX = `${CLOUDFLARE_SITE_PREFIX}worker:`;

const RawWorkerScript = z.object({
  id: z.string(),
  modified_on: z.string().nullish(),
  deployment_id: z.string().nullish(),
  routes: z.array(z.object({ pattern: z.string() }).passthrough()).nullish(),
});
export type RawWorkerScript = z.infer<typeof RawWorkerScript>;

const RawWorkerDomain = z.object({
  hostname: z.string(),
  service: z.string(),
  enabled: z.boolean().nullish(),
  environment: z.string().nullish(),
});
export type RawWorkerDomain = z.infer<typeof RawWorkerDomain>;

/** "shop.example.com/*" -> "shop.example.com"; wildcard hosts aren't one address. */
function routeHost(pattern: string): string | null {
  const host = pattern.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  return host && !host.includes("*") ? host : null;
}

/**
 * A Worker as a site, when it has an address people can open: a custom domain, a zone route
 * or workers.dev. Without one it's a backend, not a project to show. Workers name no repo
 * here (Workers Builds isn't read yet), so they pair by the repo's homepage or a manual link.
 */
export function toWorkerSiteInput(script: RawWorkerScript, customHosts: string[], workersDev: string | null): SiteInput | null {
  const hosts = [...customHosts, ...(script.routes ?? []).flatMap((r) => routeHost(r.pattern) ?? [])];
  const customDomain = hosts[0] ?? null;
  const url = customDomain ? `https://${customDomain}` : workersDev ? `https://${workersDev}` : null;
  if (!url) return null;
  return {
    id: `${WORKER_SITE_PREFIX}${script.id}`,
    provider: "cloudflare",
    name: script.id,
    url,
    customDomain,
    repoUrl: null,
    deploy: {
      id: script.deployment_id ?? script.id,
      commitUrl: null,
      reviewUrl: null,
      framework: null,
      screenshotUrl: null,
      context: "production",
      publishedAt: script.modified_on ?? null,
      committer: null,
    },
  };
}

/** At most this many per-script workers.dev checks, to stay within the cloud's request budget. */
const MAX_WORKERS_DEV_CHECKS = 20;

export interface CloudflareClientOptions {
  token: string;
  fetch?: typeof fetch;
}

export class CloudflareClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly fetchFn: typeof fetch;

  constructor(options: CloudflareClientOptions) {
    this.token = options.token;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    // Called as a plain function: Workers throw "Illegal invocation" when fetch runs as a method of another object.
    const fetchFn = options.fetch ?? globalThis.fetch;
    this.fetchImpl = (input, init) => fetchFn(input, init);
  }

  async send(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<z.infer<typeof Envelope>> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const envelope = Envelope.safeParse(await res.json().catch(() => null));
    if (!res.ok || !envelope.success || !envelope.data.success) {
      const detail = envelope.success ? envelope.data.errors.map((e) => e.message).join("; ") : "";
      throw new Error(`Cloudflare ${method} ${path.split("?")[0]} failed: ${res.status} ${detail}`.trim());
    }
    return envelope.data;
  }

  /** The same client with another bearer token (Pages upload tokens). */
  withToken(token: string): CloudflareClient {
    return new CloudflareClient({ token, fetch: this.fetchFn });
  }

  async get(path: string): Promise<unknown> {
    return (await this.send("GET", path)).result;
  }

  /** Every page of a list endpoint. */
  private async list(path: string, perPage: number): Promise<unknown[]> {
    const items: unknown[] = [];
    for (let page = 1; ; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const data = await this.send("GET", `${path}${sep}page=${page}&per_page=${perPage}`);
      const result = Array.isArray(data.result) ? data.result : [];
      items.push(...result);
      const total = data.result_info?.total_pages;
      if (!result.length || (total !== undefined ? page >= total : result.length < perPage)) return items;
    }
  }

  /** Accounts the token (or OAuth grant) may read. */
  async listAccounts(): Promise<{ id: string; name: string }[]> {
    return z.array(RawAccount).parse(await this.list("/accounts", 50));
  }

  async listPagesProjects(accountId: string): Promise<RawPagesProject[]> {
    return z.array(RawPagesProject).parse(await this.list(`/accounts/${accountId}/pages/projects`, 10));
  }

  /**
   * Workers with a public address. Without Workers permission (a Pages-only token, or an older
   * OAuth grant) there are simply none, not an error.
   */
  async listWorkerSiteInputs(accountId: string): Promise<SiteInput[]> {
    let scripts: RawWorkerScript[];
    try {
      scripts = z.array(RawWorkerScript).parse(await this.get(`/accounts/${accountId}/workers/scripts`));
    } catch (err) {
      if (err instanceof Error && /failed: (401|403|404)\b/.test(err.message)) return [];
      throw err;
    }
    if (!scripts.length) return [];
    const domains = z
      .array(RawWorkerDomain)
      .parse((await this.get(`/accounts/${accountId}/workers/domains`).catch(() => [])) ?? [])
      .filter((d) => d.enabled !== false && (d.environment ?? "production") === "production");
    const subdomain = await this.get(`/accounts/${accountId}/workers/subdomain`)
      .then((r) => z.object({ subdomain: z.string() }).parse(r).subdomain)
      .catch(() => null);

    const hostsOf = (name: string) => domains.filter((d) => d.service === name).map((d) => d.hostname);
    // workers.dev only matters for Workers without a custom address; it's one request each.
    const devChecks = subdomain ? scripts.filter((s) => !hostsOf(s.id).length && !s.routes?.length).slice(0, MAX_WORKERS_DEV_CHECKS) : [];
    const onWorkersDev = new Set<string>();
    await Promise.all(
      devChecks.map(async (s) => {
        const result = await this.get(`/accounts/${accountId}/workers/scripts/${encodeURIComponent(s.id)}/subdomain`).catch(() => null);
        if (z.object({ enabled: z.boolean() }).safeParse(result).data?.enabled) onWorkersDev.add(s.id);
      }),
    );
    return scripts.flatMap(
      (s) => toWorkerSiteInput(s, hostsOf(s.id), onWorkersDev.has(s.id) ? `${s.id}.${subdomain}.workers.dev` : null) ?? [],
    );
  }

  /** Pages projects and public Workers of every account, as sites. */
  async listSiteInputs(): Promise<SiteInput[]> {
    const accounts = await this.listAccounts();
    const perAccount = await Promise.all(
      accounts.map(async (a) => [...(await this.listPagesProjects(a.id)).map(toPagesSiteInput), ...(await this.listWorkerSiteInputs(a.id))]),
    );
    return perAccount.flat();
  }
}
