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
  /** Default gpt-5-mini. */
  JAPS_LLM_MODEL?: string;
  /** GitHub App URL slug, for the "install on your repositories" link. */
  GITHUB_APP_SLUG?: string;
  /** Workflows (#32): discovery per user, then one instance per project. */
  SYNC_JOBS?: WorkflowBinding<{ userId: string; jobId: string }>;
  PROJECT_JOBS?: WorkflowBinding<ProjectJobParams>;
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
