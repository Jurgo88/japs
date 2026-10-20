import type { Db } from "./db.ts";

/** Worker bindings and secrets (wrangler.jsonc; secrets via `wrangler secret put` / .dev.vars). */
export interface Env {
  DB: Db;
  /** The built dashboard (wrangler `assets`); absent in tests. */
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Public base URL of the app, e.g. https://japs.example.workers.dev — OAuth redirects go here. */
  APP_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  NETLIFY_CLIENT_ID: string;
  NETLIFY_CLIENT_SECRET: string;
  /** Signs short-lived cookies (OAuth state). Any long random string. */
  SESSION_SECRET: string;
  /** 32 random bytes, base64url: encrypts tokens and keys at rest. */
  ENCRYPTION_KEY: string;
  /** Shared LLM key for the free quota (#35). Without it, texts aren't generated. */
  OPENAI_API_KEY?: string;
  /** Free AI generations per user and month on the shared key (#35). Default 50. */
  JAPS_FREE_GENERATIONS?: string;
  /** Default gpt-5-mini. */
  JAPS_LLM_MODEL?: string;
  /** GitHub App URL slug, for the "install on your repositories" link. */
  GITHUB_APP_SLUG?: string;
  /** Workflows (#32): discovery per user, then one instance per project. */
  SYNC_JOBS?: WorkflowBinding<{ userId: string; jobId: string }>;
  PROJECT_JOBS?: WorkflowBinding<ProjectJobParams>;
  /** Screenshots (#33): Browser Run, R2 for the images, one sequential workflow per run. */
  BROWSER?: Fetcher;
  SHOTS?: Bucket;
  SHOT_JOBS?: WorkflowBinding<ShotJobParams>;
  /** Cloudflare OAuth client (ADR 0012); without it, "Connect Cloudflare" isn't offered. */
  CLOUDFLARE_CLIENT_ID?: string;
  CLOUDFLARE_CLIENT_SECRET?: string;
  /** Publishing (#34, ADR 0011): fine-grained token allowed to dispatch the build workflow. */
  GITHUB_BUILD_TOKEN?: string;
  /** Repo with .github/workflows/publish.yml, e.g. "Jurgo88/japs". */
  JAPS_BUILD_REPO?: string;
  /**
   * Portfolios on <handle>.<SITES_DOMAIN> (ADR 0013): the built files in R2. A separate,
   * read-only Worker serves them; this one writes them. Without both, the target isn't offered.
   */
  SITES?: Bucket;
  /** "japs.app" in production; "localhost:8788" for local development with `pnpm dev:sites`. */
  SITES_DOMAIN?: string;
}

export interface ShotJobParams {
  userId: string;
  /** Projects to capture; only those the portfolio shows with screenshots are taken. */
  keys: string[];
}

/** The part of R2Bucket we use; tests pass an in-memory fake. */
export interface Bucket {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
  delete(keys: string[]): Promise<void>;
}

export interface ProjectJobParams {
  userId: string;
  jobId: string;
  key: string;
}

/** The part of Cloudflare's Workflow binding we use; tests pass a fake. */
export interface WorkflowBinding<P> {
  create(options: { id?: string; params: P }): Promise<{ id: string }>;
  createBatch(batch: { id?: string; params: P }[]): Promise<{ id: string }[]>;
}

/** Secrets the app can't run without; checked on every request so misconfiguration is loud. */
export const REQUIRED_SECRETS = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "NETLIFY_CLIENT_ID",
  "NETLIFY_CLIENT_SECRET",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
] as const satisfies readonly (keyof Env)[];
