import { z } from "zod";
import type { PackageFacts, Repo, RepoFacts } from "@japs/schema";
import type { GitHubClient } from "../discovery/github.ts";
import { parsePackageJson, parsePnpmWorkspace } from "./package-json.ts";
import { summarizeReadme } from "./readme.ts";
import { errorMessage } from "./util.ts";

const RAW = "application/vnd.github.raw+json";
const MAX_WORKSPACE_PACKAGES = 10;

const RawCommit = z.object({
  commit: z.object({
    author: z.object({ date: z.string() }).nullish(),
    committer: z.object({ date: z.string() }).nullish(),
  }),
});
const commitDate = (c: z.infer<typeof RawCommit>) => c.commit.author?.date ?? c.commit.committer?.date ?? null;

/** Page number of rel="last" in a GitHub Link header, or null when there is one page. */
export function lastPageFromLink(link: string | null): number | null {
  const match = link ? /[?&]page=(\d+)>;\s*rel="last"/.exec(link) : null;
  return match?.[1] ? Number(match[1]) : null;
}

/** Facts for a repo the token can't see: identity only. */
export function inaccessibleRepoFacts(id: RepoFacts["id"]): RepoFacts {
  return {
    id,
    accessible: false,
    private: true,
    pushedAt: null,
    description: null,
    topics: [],
    primaryLanguage: null,
    languages: {},
    commits: null,
    pullRequests: null,
    readme: null,
    packages: [],
  };
}

/**
 * GitHub facts for one repo: ~6–8 requests (languages, 2× commits, PRs, README, package.json,
 * workspaces). Each part fails independently into a warning, so one 404 doesn't lose the rest.
 */
export async function fetchRepoFacts(gh: GitHubClient, repo: Repo, warn: (msg: string) => void): Promise<RepoFacts> {
  const base = `/repos/${repo.fullName}`;
  const part = async <T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      warn(`${repo.id}: ${label}: ${errorMessage(err)}`);
      return fallback;
    }
  };

  /** Text of a file, or null when it doesn't exist. */
  const file = async (path: string): Promise<string | null> => {
    const res = await gh.request(`${base}/contents/${path}`, RAW);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  };

  /** Total count of a list endpoint via `per_page=1` + Link header; 409 = empty repo. */
  const countAndFirst = async (path: string): Promise<{ count: number; first: unknown } | null> => {
    const res = await gh.request(`${base}/${path}${path.includes("?") ? "&" : "?"}per_page=1`);
    if (res.status === 409) return null;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const items = z.array(z.unknown()).parse(await res.json());
    return { count: lastPageFromLink(res.headers.get("link")) ?? items.length, first: items[0] };
  };

  const [languages, commits, pullRequests, readme, packages] = await Promise.all([
    part("languages", {}, async () => {
      const bytes = z.record(z.string(), z.number()).parse(await gh.get(`${base}/languages`));
      const total = Object.values(bytes).reduce((a, b) => a + b, 0);
      if (!total) return {};
      return Object.fromEntries(
        Object.entries(bytes)
          .sort(([, a], [, b]) => b - a)
          .map(([lang, n]) => [lang, Math.round((n / total) * 1000) / 10]),
      );
    }),
    part("commits", null, async () => {
      const newest = await countAndFirst("commits");
      if (!newest) return { count: 0, first: null, last: null };
      const last = newest.first ? commitDate(RawCommit.parse(newest.first)) : null;
      let first = last;
      if (newest.count > 1) {
        const oldest = z.array(RawCommit).parse(await gh.get(`${base}/commits?per_page=1&page=${newest.count}`));
        first = oldest[0] ? commitDate(oldest[0]) : null;
      }
      return { count: newest.count, first, last };
    }),
    part("pull requests", null, async () => (await countAndFirst("pulls?state=all"))?.count ?? 0),
    part("readme", null, async () => {
      const res = await gh.request(`${base}/readme`, RAW);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return summarizeReadme(await res.text());
    }),
    part("package.json", [] as PackageFacts[], () => fetchPackages(gh, base, file, warn, repo.id)),
  ]);

  return {
    id: repo.id,
    accessible: true,
    private: repo.private,
    pushedAt: repo.pushedAt,
    description: repo.description,
    topics: repo.topics,
    primaryLanguage: repo.language,
    languages,
    commits,
    pullRequests,
    readme,
    packages,
  };
}

/** Root package.json plus workspace packages (npm/yarn `workspaces` or pnpm-workspace.yaml). */
async function fetchPackages(
  gh: GitHubClient,
  base: string,
  file: (path: string) => Promise<string | null>,
  warn: (msg: string) => void,
  repoId: string,
): Promise<PackageFacts[]> {
  const rootText = await file("package.json");
  if (rootText === null) return [];
  const root = parsePackageJson(rootText, "");

  const pnpm = root.workspaces.length ? null : await file("pnpm-workspace.yaml");
  const patterns = root.workspaces.length ? root.workspaces : pnpm ? parsePnpmWorkspace(pnpm) : [];

  const dirs: string[] = [];
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) continue;
    const clean = pattern.replace(/^\.\//, "").replace(/\/+$/, "");
    if (!clean.endsWith("/*")) {
      dirs.push(clean);
      continue;
    }
    const parent = clean.slice(0, -2);
    const listing = await gh.request(`${base}/contents/${parent}`);
    if (!listing.ok) continue;
    const entries = z.array(z.object({ type: z.string(), path: z.string() })).parse(await listing.json());
    dirs.push(...entries.filter((e) => e.type === "dir").map((e) => e.path));
  }

  const packages: PackageFacts[] = [root.facts];
  for (const dir of [...new Set(dirs)].slice(0, MAX_WORKSPACE_PACKAGES)) {
    const path = `${dir}/package.json`;
    try {
      const text = await file(path);
      if (text !== null) packages.push(parsePackageJson(text, path).facts);
    } catch (err) {
      warn(`${repoId}: ${path}: ${errorMessage(err)}`);
    }
  }
  return packages;
}
