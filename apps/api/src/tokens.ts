import { refreshGithubToken } from "./auth/oauth.ts";
import { decrypt, encrypt } from "./crypto.ts";
import type { UserStore } from "./db.ts";
import type { Env } from "./env.ts";

/** A missing or unusable connection: the user has to act (connect, sign in again). */
export class ConnectionError extends Error {}

/** Renew a little before expiry, so a token doesn't run out in the middle of a job. */
const REFRESH_MARGIN_MS = 5 * 60_000;

/**
 * The user's GitHub App token, refreshed when it is about to expire (ADR 0009). The new
 * tokens are stored encrypted right away: refresh tokens are single-use.
 */
export async function githubToken(user: UserStore, env: Env, fetchImpl: typeof fetch, now = new Date()): Promise<string> {
  const connection = await user.getConnection("github");
  if (!connection) throw new ConnectionError("GitHub is not connected. Sign in again.");
  const fresh = !connection.expiresAt || Date.parse(connection.expiresAt) - now.getTime() > REFRESH_MARGIN_MS;
  if (fresh) return decrypt(connection.accessToken, env.ENCRYPTION_KEY);
  if (!connection.refreshToken) throw new ConnectionError("GitHub access expired. Sign in again.");

  const tokens = await refreshGithubToken(
    fetchImpl,
    {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      refreshToken: await decrypt(connection.refreshToken, env.ENCRYPTION_KEY),
    },
    now,
  ).catch((err: unknown) => {
    throw new ConnectionError(`GitHub access expired. Sign in again. (${err instanceof Error ? err.message : String(err)})`);
  });
  await user.setConnection({
    ...connection,
    accessToken: await encrypt(tokens.accessToken, env.ENCRYPTION_KEY),
    refreshToken: tokens.refreshToken ? await encrypt(tokens.refreshToken, env.ENCRYPTION_KEY) : connection.refreshToken,
    expiresAt: tokens.expiresAt,
  });
  return tokens.accessToken;
}

export async function netlifyToken(user: UserStore, env: Env): Promise<string> {
  const connection = await user.getConnection("netlify");
  if (!connection) throw new ConnectionError("Connect Netlify first.");
  return decrypt(connection.accessToken, env.ENCRYPTION_KEY);
}
