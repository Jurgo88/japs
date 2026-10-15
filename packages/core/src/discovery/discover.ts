import type { ProjectsFile } from "@japs/schema";
import { CloudflareClient } from "./cloudflare.ts";
import { GitHubClient } from "./github.ts";
import { NetlifyClient } from "./netlify.ts";
import { buildProjects } from "./pair.ts";
import type { PairingOptions } from "./types.ts";

export interface DiscoverOptions extends PairingOptions {
  /** At least one of netlifyToken and cloudflareToken. */
  netlifyToken?: string;
  /** Cloudflare Pages projects as sites (ADR 0012): an API token or OAuth access token. */
  cloudflareToken?: string;
  /** Optional: without it, only Netlify sites are discovered (repos inferred from deploys). */
  githubToken?: string;
  /** Also list repos of GitHub organizations the user belongs to. */
  includeOrgRepos?: boolean;
  fetch?: typeof fetch;
}

/** Full discovery: fetch from every connected provider, then pair. See docs/spec/discovery.md. */
export async function discover(options: DiscoverOptions): Promise<ProjectsFile> {
  if (!options.netlifyToken && !options.cloudflareToken) throw new Error("Connect Netlify or Cloudflare to discover sites.");
  const netlify = options.netlifyToken ? new NetlifyClient({ token: options.netlifyToken, fetch: options.fetch }) : null;
  const cloudflare = options.cloudflareToken ? new CloudflareClient({ token: options.cloudflareToken, fetch: options.fetch }) : null;
  const github = options.githubToken
    ? new GitHubClient({ token: options.githubToken, fetch: options.fetch })
    : null;

  const [netlifySites, cloudflareSites, repos, accountLogin] = await Promise.all([
    netlify ? netlify.listSiteInputs() : Promise.resolve([]),
    cloudflare ? cloudflare.listSiteInputs() : Promise.resolve([]),
    github ? github.listRepoInputs({ includeOrgRepos: options.includeOrgRepos }) : Promise.resolve([]),
    github ? github.getLogin() : Promise.resolve(null),
  ]);

  return buildProjects([...netlifySites, ...cloudflareSites], repos, { ...options, accountLogin });
}
