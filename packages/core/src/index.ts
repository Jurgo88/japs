export { discover, type DiscoverOptions } from "./discovery/discover.ts";
export { CLOUDFLARE_SITE_PREFIX, CloudflareClient, type RawPagesProject, toPagesSiteInput } from "./discovery/cloudflare.ts";
export { buildProjects, projectKey, resolveSiteRepo, toRepo, toSite } from "./discovery/pair.ts";
export { NetlifyClient, toSiteInput, toDeployInput } from "./discovery/netlify.ts";
export { GitHubClient, toRepoInput } from "./discovery/github.ts";
export {
  repoIdFromGitHubUrl,
  normalizeDomain,
  isRandomNetlifyName,
  slugify,
} from "./discovery/normalize.ts";
export type { SiteInput, RepoInput, DeployInput, PairingOptions } from "./discovery/types.ts";
export { extractFacts, type ExtractFactsOptions, type ExtractFactsResult } from "./facts/extract.ts";
export { deriveTech, techForDependency, DEPENDENCY_TECH } from "./facts/tech.ts";
export { parseHtmlMeta } from "./facts/live.ts";
export { summarizeReadme } from "./facts/readme.ts";
export { analyzeProjects, type AnalyzeOptions, type AnalyzeResult } from "./analyze/analyze.ts";
export {
  LLM_PRESETS,
  LlmError,
  OpenAiCompatibleClient,
  type LlmClient,
  type LlmJsonRequest,
  type LlmJsonResponse,
  type LlmPreset,
} from "./analyze/llm.ts";
export { copyJsonSchema, promptFacts, systemPrompt, userPrompt, type PromptContext } from "./analyze/prompt.ts";
export {
  buildPortfolio,
  BuildError,
  type BuildPortfolioInput,
  type BuildPortfolioResult,
  isPublished,
  primarySite,
  publishedWith,
  type ScreenshotAsset,
} from "./build/portfolio.ts";
export { SCREENSHOT_HIDE_CSS, SCREENSHOT_VIEWPORTS, screenshotTargets, type ScreenshotTarget } from "./build/targets.ts";
export {
  defaultPublished,
  setClientLabel,
  setCopyText,
  setOrder,
  setOverride,
  setPublished,
  setTags,
} from "./editor/config-edit.ts";
export {
  createPagesDeployment,
  createPagesProject,
  deployPagesSite,
  findPagesProject,
  getPagesDeploymentState,
  PAGES_DRAFT_BRANCH,
  type PagesAsset,
  pagesBatches,
  pagesCheckMissing,
  pagesContentType,
  pagesFileHash,
  type PagesProject,
  pagesUpload,
  pagesUploadToken,
  pagesUpsertHashes,
} from "./publish/pages.ts";
export {
  createDeploy,
  createSite,
  deploySite,
  findSite,
  getDeployState,
  sha1Hex,
  uploadDeployFile,
  type CreatedDeploy,
  type DeployFile,
  type DeployState,
  type DeployOptions,
  type DeployResult,
  type NetlifySite,
} from "./publish/deploy.ts";
