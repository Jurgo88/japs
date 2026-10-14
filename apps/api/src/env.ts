import type { Db } from "./db.ts";

/** Worker bindings and secrets (wrangler.jsonc; secrets via `wrangler secret put` / .dev.vars). */
export interface Env {
  DB: Db;
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
