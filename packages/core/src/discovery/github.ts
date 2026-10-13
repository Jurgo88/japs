import { z } from "zod";
import type { RepoInput } from "./types.ts";

const API = "https://api.github.com";

const RawRepo = z.object({
  full_name: z.string(),
  html_url: z.string(),
  owner: z.object({ type: z.string() }),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean().default(false),
  homepage: z.string().nullish(),
  language: z.string().nullish(),
  topics: z.array(z.string()).default([]),
  description: z.string().nullish(),
  pushed_at: z.string().nullish(),
});
type RawRepo = z.infer<typeof RawRepo>;

export function toRepoInput(raw: RawRepo): RepoInput {
  return {
    fullName: raw.full_name,
    url: raw.html_url,
    ownerType: raw.owner.type === "Organization" ? "organization" : "user",
    private: raw.private,
    fork: raw.fork,
    archived: raw.archived,
    homepage: raw.homepage || null,
    language: raw.language ?? null,
    topics: raw.topics,
    description: raw.description ?? null,
    pushedAt: raw.pushed_at ?? null,
  };
}

export interface GitHubClientOptions {
  token: string;
  fetch?: typeof fetch;
}

export class GitHubClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubClientOptions) {
    this.token = options.token;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  private async get(path: string): Promise<unknown> {
    const res = await this.fetchImpl(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) throw new Error(`GitHub ${path.split("?")[0]} failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /** Login of the token's user. */
  async getLogin(): Promise<string> {
    return z.object({ login: z.string() }).parse(await this.get("/user")).login;
  }

  /**
   * All repositories the token's user owns or collaborates on (paginated).
   * With `includeOrgRepos`, also repos of organizations the user belongs to.
   */
  async listRepoInputs(options: { includeOrgRepos?: boolean } = {}): Promise<RepoInput[]> {
    const affiliation = options.includeOrgRepos ? "owner,collaborator,organization_member" : "owner,collaborator";
    const all: RepoInput[] = [];
    for (let page = 1; ; page++) {
      const raw = await this.get(`/user/repos?affiliation=${affiliation}&per_page=100&page=${page}`);
      const batch = z.array(RawRepo).parse(raw);
      all.push(...batch.map(toRepoInput));
      if (batch.length < 100) return all;
    }
  }
}
