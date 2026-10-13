export { discover, type DiscoverOptions } from "./discovery/discover.ts";
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
  type ScreenshotAsset,
} from "./build/portfolio.ts";
export { screenshotTargets, type ScreenshotTarget } from "./build/targets.ts";
