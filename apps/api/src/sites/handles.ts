import { defaultHandle, handleProblem } from "@japs/schema";
import type { HandleConflict, HostedSite, UserStore } from "../db.ts";

/**
 * Addresses on the hosted domain (ADR 0013). The GitHub login is the default; the user may
 * pick another free name. The first pick and one change are free, after that a change waits
 * HANDLE_COOLDOWN_DAYS. A name given up stays blocked for RETIRED_DAYS and redirects meanwhile.
 */
export const HANDLE_COOLDOWN_DAYS = 30;
export const RETIRED_DAYS = 60;
const DAY = 86_400_000;

export class HandleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 429 = 400,
  ) {
    super(message);
  }
}

const CONFLICTS: Record<HandleConflict, string> = {
  taken: "This address is taken.",
  login: "This address is reserved for the JAPS user with that GitHub username.",
  retired: "This address was given up recently and isn't free yet.",
};

/** Where portfolios live: the domain, and the scheme of the app (http only in local development). */
export interface SitesConfig {
  APP_URL: string;
  SITES_DOMAIN: string;
}

export const siteUrl = (handle: string, env: SitesConfig) => `${new URL(env.APP_URL).protocol}//${handle}.${env.SITES_DOMAIN}`;
export const draftUrl = (handle: string, key: string, env: SitesConfig) => siteUrl(`${key}--${handle}`, env);

/** Why this user can't have `handle`, or null when they can. */
export async function handleUnavailable(user: UserStore, handle: string): Promise<string | null> {
  const problem = handleProblem(handle);
  if (problem) return problem;
  const conflict = await user.handleConflict(handle);
  return conflict ? CONFLICTS[conflict] : null;
}

/** When the address may change again; null when it may change now. */
export function nextChangeAt(site: HostedSite, now: Date): string | null {
  if (!site.handleChangedAt) return null;
  const next = Date.parse(site.handleChangedAt) + HANDLE_COOLDOWN_DAYS * DAY;
  return next > now.getTime() ? new Date(next).toISOString() : null;
}

/** What the editor shows. */
export interface SiteView {
  domain: string;
  site: { handle: string; url: string; live: boolean; nextChangeAt: string | null } | null;
  /** The GitHub login as an address, while the user has none and it's free. */
  suggestion: string | null;
}

async function suggestion(user: UserStore): Promise<string | null> {
  const login = await user.githubLogin();
  const candidate = login ? defaultHandle(login) : null;
  return candidate && (await handleUnavailable(user, candidate)) === null ? candidate : null;
}

export async function siteView(user: UserStore, env: SitesConfig, now: Date): Promise<SiteView> {
  const site = await user.getHostedSite();
  if (!site) return { domain: env.SITES_DOMAIN, site: null, suggestion: await suggestion(user) };
  return {
    domain: env.SITES_DOMAIN,
    site: { handle: site.handle, url: siteUrl(site.handle, env), live: site.liveBuild !== null, nextChangeAt: nextChangeAt(site, now) },
    suggestion: null,
  };
}

/** PUT /api/site: the first address or a change. */
export async function chooseHandle(user: UserStore, handle: string, now: Date): Promise<void> {
  const site = await user.getHostedSite();
  if (site?.handle === handle) return;
  const next = site ? nextChangeAt(site, now) : null;
  if (next) throw new HandleError(`You can change your address again on ${next.slice(0, 10)}.`, 429);
  const problem = await handleUnavailable(user, handle);
  if (problem) throw new HandleError(problem, handleProblem(handle) ? 400 : 409);
  const won = site
    ? await user.changeHandle(handle, new Date(now.getTime() + RETIRED_DAYS * DAY).toISOString())
    : await user.claimHandle(handle);
  // Someone else claimed it between the check and the write.
  if (!won) throw new HandleError(CONFLICTS.taken, 409);
}

/** For a publish: the user's address, claiming the suggested one when there is none yet. */
export async function ensureHostedSite(user: UserStore): Promise<HostedSite> {
  const existing = await user.getHostedSite();
  if (existing) return existing;
  const handle = await suggestion(user);
  if (handle && (await user.claimHandle(handle))) return (await user.getHostedSite())!;
  throw new HandleError("Choose your japs.app address in Settings first.");
}
