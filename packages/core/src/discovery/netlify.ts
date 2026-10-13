import { z } from "zod";
import type { DeployContext } from "@japs/schema";
import type { DeployInput, SiteInput } from "./types.ts";

const API = "https://api.netlify.com/api/v1";

/** Only the fields we use. Netlify returns much more; unknown keys are stripped. */
const RawDeploy = z.object({
  id: z.string(),
  commit_url: z.string().nullish(),
  review_url: z.string().nullish(),
  framework: z.string().nullish(),
  screenshot_url: z.string().nullish(),
  context: z.string().nullish(),
  published_at: z.string().nullish(),
  committer: z.string().nullish(),
});
type RawDeploy = z.infer<typeof RawDeploy>;

const RawSite = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  ssl_url: z.string().nullish(),
  custom_domain: z.string().nullish(),
  build_settings: z.object({ repo_url: z.string().nullish() }).partial().nullish(),
  published_deploy: RawDeploy.nullish(),
});
type RawSite = z.infer<typeof RawSite>;

function toContext(value: string | null | undefined): DeployContext {
  switch (value) {
    case "production":
    case "deploy-preview":
    case "branch-deploy":
      return value;
    default:
      return "unknown";
  }
}

export function toDeployInput(raw: RawDeploy): DeployInput {
  return {
    id: raw.id,
    commitUrl: raw.commit_url ?? null,
    reviewUrl: raw.review_url ?? null,
    framework: raw.framework ?? null,
    screenshotUrl: raw.screenshot_url ?? null,
    context: toContext(raw.context),
    publishedAt: raw.published_at ?? null,
    committer: raw.committer || null,
  };
}

export function toSiteInput(raw: RawSite, deploy: RawDeploy | null): SiteInput {
  return {
    id: raw.id,
    name: raw.name,
    url: raw.ssl_url || raw.url,
    customDomain: raw.custom_domain ?? null,
    repoUrl: raw.build_settings?.repo_url ?? null,
    deploy: deploy ? toDeployInput(deploy) : null,
  };
}

export interface NetlifyClientOptions {
  token: string;
  fetch?: typeof fetch;
}

export class NetlifyClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NetlifyClientOptions) {
    this.token = options.token;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async get(path: string): Promise<unknown> {
    const res = await this.fetchImpl(`${API}${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Netlify ${path} failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async listSites(): Promise<RawSite[]> {
    const all: RawSite[] = [];
    for (let page = 1; ; page++) {
      const batch = z.array(RawSite).parse(await this.get(`/sites?filter=all&per_page=100&page=${page}`));
      all.push(...batch);
      if (batch.length < 100) return all;
    }
  }

  async getDeploy(deployId: string): Promise<RawDeploy | null> {
    try {
      return RawDeploy.parse(await this.get(`/deploys/${deployId}`));
    } catch {
      return null;
    }
  }

  /**
   * Sites with their current deploy. `published_deploy` embedded in /sites usually carries
   * commit_url; fetch the full deploy only when it doesn't and the site has no repo_url.
   */
  async listSiteInputs(): Promise<SiteInput[]> {
    const sites = await this.listSites();
    return Promise.all(
      sites.map(async (site) => {
        let deploy = site.published_deploy ?? null;
        const needsFullDeploy = deploy && !deploy.commit_url && !site.build_settings?.repo_url;
        if (deploy && needsFullDeploy) deploy = (await this.getDeploy(deploy.id)) ?? deploy;
        return toSiteInput(site, deploy);
      }),
    );
  }
}
