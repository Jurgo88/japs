import type { ProjectsFile } from "@japs/schema";
import { GitHubClient } from "./github.ts";
import { NetlifyClient } from "./netlify.ts";
import { buildProjects } from "./pair.ts";
import type { PairingOptions } from "./types.ts";

export interface DiscoverOptions extends PairingOptions {
  netlifyToken: string;
  /** Optional: without it, only Netlify sites are discovered (repos inferred from deploys). */
  githubToken?: string;
  /** Also list repos of GitHub organizations the user belongs to. */
  includeOrgRepos?: boolean;
  fetch?: typeof fetch;
}

/** Full discovery: fetch from both providers, then pair. See docs/spec/discovery.md. */
export async function discover(options: DiscoverOptions): Promise<ProjectsFile> {
  const netlify = new NetlifyClient({ token: options.netlifyToken, fetch: options.fetch });
  const github = options.githubToken
    ? new GitHubClient({ token: options.githubToken, fetch: options.fetch })
    : null;

  const [sites, repos, accountLogin] = await Promise.all([
    netlify.listSiteInputs(),
    github ? github.listRepoInputs({ includeOrgRepos: options.includeOrgRepos }) : Promise.resolve([]),
    github ? github.getLogin() : Promise.resolve(null),
  ]);

  return buildProjects(sites, repos, { ...options, accountLogin });
}
