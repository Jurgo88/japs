import type { DeployContext } from "@japs/schema";

/**
 * Provider-agnostic inputs for pairing. Adapters (netlify.ts, github.ts) map raw API
 * responses into these, so pairing logic stays pure and testable.
 */

export interface DeployInput {
  commitUrl: string | null;
  reviewUrl: string | null;
  framework: string | null;
  screenshotUrl: string | null;
  context: DeployContext;
  publishedAt: string | null;
}

export interface SiteInput {
  id: string;
  name: string;
  url: string;
  customDomain: string | null;
  /** build_settings.repo_url — the most reliable link when present. */
  repoUrl: string | null;
  /** Current published deploy, or null when the site was never deployed. */
  deploy: DeployInput | null;
}

export interface RepoInput {
  fullName: string;
  url: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  homepage: string | null;
  language: string | null;
  topics: string[];
  description: string | null;
  pushedAt: string | null;
}

export interface PairingOptions {
  /** Projects with no activity for this many months are hidden. Default 24. */
  staleAfterMonths?: number;
  /** Reference time, injectable for tests. Default: now. */
  now?: Date;
}
