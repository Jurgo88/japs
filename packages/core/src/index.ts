export { discover, type DiscoverOptions } from "./discovery/discover.ts";
export { buildProjects, resolveSiteRepo, toRepo, toSite } from "./discovery/pair.ts";
export { NetlifyClient, toSiteInput, toDeployInput } from "./discovery/netlify.ts";
export { GitHubClient, toRepoInput } from "./discovery/github.ts";
export {
  repoIdFromGitHubUrl,
  normalizeDomain,
  isRandomNetlifyName,
  slugify,
} from "./discovery/normalize.ts";
export type { SiteInput, RepoInput, DeployInput, PairingOptions } from "./discovery/types.ts";
