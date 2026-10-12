import { z } from "zod";
import type { RepoInput } from "./types.ts";

const API = "https://api.github.com";

const RawRepo = z.object({
  full_name: z.string(),
  html_url: z.string(),
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

  /** All repositories the token's user owns or collaborates on (paginated). */
  async listRepoInputs(): Promise<RepoInput[]> {
    const all: RepoInput[] = [];
    for (let page = 1; ; page++) {
      const res = await this.fetchImpl(
        `${API}/user/repos?affiliation=owner,collaborator&per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );
      if (!res.ok) throw new Error(`GitHub /user/repos failed: ${res.status} ${res.statusText}`);
      const batch = z.array(RawRepo).parse(await res.json());
      all.push(...batch.map(toRepoInput));
      if (batch.length < 100) return all;
    }
  }
}
