import type { RepoId } from "@japs/schema";

/**
 * Extracts a normalized GitHub repo id ("owner/repo", lowercase) from any GitHub URL
 * Netlify gives us: repo_url, commit_url, review_url (PR), or an SSH remote.
 *
 * Examples:
 *   https://github.com/Jurgo88/HermanTool                 -> jurgo88/hermantool
 *   https://github.com/Jurgo88/HermanTool.git             -> jurgo88/hermantool
 *   https://github.com/Jurgo88/loqsy/commit/ed46cd6       -> jurgo88/loqsy
 *   https://github.com/Jurgo88/shopmaster/pull/2          -> jurgo88/shopmaster
 *   git@github.com:Jurgo88/japs.git                       -> jurgo88/japs
 */
export function repoIdFromGitHubUrl(url: string | null | undefined): RepoId | null {
  if (!url) return null;
  const match =
    /^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:)([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(
      url.trim(),
    );
  if (!match) return null;
  const [, owner, repo] = match;
  if (!owner || !repo) return null;
  return `${owner}/${repo}`.toLowerCase();
}

/** "https://www.Example.com/path/" -> "example.com". Returns null for unparseable input. */
export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const withProtocol = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Netlify's auto-generated site names look like "beamish-zabaione-259ab3". */
export function isRandomNetlifyName(name: string): boolean {
  return /^[a-z]+-[a-z]+-[0-9a-f]{6}$/.test(name);
}

/** "AcmeShop" / "acme_shop" / "acme-shop" -> "acme-shop" */
export function slugify(input: string): string {
  return (
    input
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

/** Returns the later of two ISO timestamps (nulls ignored). */
export function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}
