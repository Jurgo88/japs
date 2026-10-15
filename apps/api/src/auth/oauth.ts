import { z } from "zod";

/**
 * OAuth code exchanges and profile lookups for GitHub (App user tokens) and Netlify.
 * Pure functions over an injectable fetch, so they are tested without the network.
 */

export const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
export const NETLIFY_AUTHORIZE = "https://app.netlify.com/authorize";

export class OAuthError extends Error {}

const GithubToken = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export interface GithubTokens {
  accessToken: string;
  refreshToken: string | null;
  /** GitHub App user tokens expire (8 h); null if the app has expiry disabled. */
  expiresAt: string | null;
}

function toGithubTokens(raw: z.infer<typeof GithubToken>, now: Date): GithubTokens {
  if (raw.error || !raw.access_token) {
    throw new OAuthError(`GitHub: ${raw.error_description ?? raw.error ?? "no access token"}`);
  }
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    expiresAt: raw.expires_in ? new Date(now.getTime() + raw.expires_in * 1000).toISOString() : null,
  };
}

/** GitHub answers 200 with { error } on bad codes, so the body decides, not the status. */
export async function exchangeGithubCode(
  fetchImpl: typeof fetch,
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  now = new Date(),
): Promise<GithubTokens> {
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });
  if (!res.ok) throw new OAuthError(`GitHub token exchange failed: ${res.status}`);
  return toGithubTokens(GithubToken.parse(await res.json()), now);
}

/** Renews an expired GitHub App user token (refresh tokens last ~6 months). */
export async function refreshGithubToken(
  fetchImpl: typeof fetch,
  params: { clientId: string; clientSecret: string; refreshToken: string },
  now = new Date(),
): Promise<GithubTokens> {
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    }),
  });
  if (!res.ok) throw new OAuthError(`GitHub token refresh failed: ${res.status}`);
  return toGithubTokens(GithubToken.parse(await res.json()), now);
}

const GithubUser = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullish(),
  avatar_url: z.string().nullish(),
});

export async function fetchGithubUser(fetchImpl: typeof fetch, accessToken: string) {
  const res = await fetchImpl("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "JAPS",
    },
  });
  if (!res.ok) throw new OAuthError(`GitHub /user failed: ${res.status}`);
  const user = GithubUser.parse(await res.json());
  return { githubId: user.id, login: user.login, name: user.name ?? null, avatarUrl: user.avatar_url ?? null };
}

/** Netlify OAuth2 code exchange (form-encoded, as Netlify's token endpoint expects). */
export async function exchangeNetlifyCode(
  fetchImpl: typeof fetch,
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string },
): Promise<string> {
  const res = await fetchImpl("https://api.netlify.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
    }).toString(),
  });
  const body = z.object({ access_token: z.string().optional(), error: z.string().optional() }).parse(await res.json().catch(() => ({})));
  if (!res.ok || !body.access_token) throw new OAuthError(`Netlify token exchange failed: ${body.error ?? res.status}`);
  return body.access_token;
}

export async function fetchNetlifyUser(fetchImpl: typeof fetch, accessToken: string): Promise<{ login: string }> {
  const res = await fetchImpl("https://api.netlify.com/api/v1/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new OAuthError(`Netlify /user failed: ${res.status}`);
  const user = z.object({ email: z.string().nullish(), full_name: z.string().nullish(), slug: z.string().nullish() }).parse(await res.json());
  return { login: user.email ?? user.slug ?? user.full_name ?? "Netlify account" };
}

/**
 * Revokes the user's authorization of the GitHub App, so every token JAPS holds stops working
 * (account deletion, #36). Installations on repos stay until the user removes them on GitHub.
 */
export async function revokeGithubGrant(
  fetchImpl: typeof fetch,
  params: { clientId: string; clientSecret: string; accessToken: string },
): Promise<boolean> {
  const res = await fetchImpl(`https://api.github.com/applications/${encodeURIComponent(params.clientId)}/grant`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Basic ${btoa(`${params.clientId}:${params.clientSecret}`)}`,
      "Content-Type": "application/json",
      "User-Agent": "JAPS",
    },
    body: JSON.stringify({ access_token: params.accessToken }),
  });
  return res.status === 204;
}

// --- Cloudflare (ADR 0012): standard OAuth 2.0, tokens expire and come with a refresh token ---

export const CLOUDFLARE_AUTHORIZE = "https://dash.cloudflare.com/oauth2/auth";
const CLOUDFLARE_TOKEN = "https://dash.cloudflare.com/oauth2/token";
const CLOUDFLARE_REVOKE = "https://dash.cloudflare.com/oauth2/revoke";

/** Pages and Workers read for discovery, Pages write to publish there, account and user for names. */
export const CLOUDFLARE_SCOPES = ["page.read", "page.write", "workers-scripts.read", "account-settings.read", "user-details.read", "offline_access"];

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

const CloudflareToken = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

async function cloudflareTokenRequest(fetchImpl: typeof fetch, form: Record<string, string>, now: Date): Promise<OAuthTokens> {
  const res = await fetchImpl(CLOUDFLARE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const body = CloudflareToken.parse(await res.json().catch(() => ({})));
  if (!res.ok || !body.access_token) {
    throw new OAuthError(`Cloudflare: ${body.error_description ?? body.error ?? `token request failed (${res.status})`}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(now.getTime() + body.expires_in * 1000).toISOString() : null,
  };
}

export function exchangeCloudflareCode(
  fetchImpl: typeof fetch,
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  now = new Date(),
): Promise<OAuthTokens> {
  return cloudflareTokenRequest(
    fetchImpl,
    { grant_type: "authorization_code", code: params.code, redirect_uri: params.redirectUri, client_id: params.clientId, client_secret: params.clientSecret },
    now,
  );
}

export function refreshCloudflareToken(
  fetchImpl: typeof fetch,
  params: { clientId: string; clientSecret: string; refreshToken: string },
  now = new Date(),
): Promise<OAuthTokens> {
  return cloudflareTokenRequest(
    fetchImpl,
    { grant_type: "refresh_token", refresh_token: params.refreshToken, client_id: params.clientId, client_secret: params.clientSecret },
    now,
  );
}

/** A name for the connection in the header: the account email. */
export async function fetchCloudflareUser(fetchImpl: typeof fetch, accessToken: string): Promise<{ login: string }> {
  const res = await fetchImpl("https://api.cloudflare.com/client/v4/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new OAuthError(`Cloudflare /user failed: ${res.status}`);
  const body = z.object({ result: z.object({ email: z.string().nullish() }).nullish() }).parse(await res.json());
  return { login: body.result?.email ?? "Cloudflare account" };
}

/** Revokes a token JAPS holds (disconnect, account deletion). Best effort. */
export async function revokeCloudflareToken(
  fetchImpl: typeof fetch,
  params: { clientId: string; clientSecret: string; token: string },
): Promise<boolean> {
  const res = await fetchImpl(CLOUDFLARE_REVOKE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: params.token, client_id: params.clientId, client_secret: params.clientSecret }).toString(),
  });
  return res.ok;
}
