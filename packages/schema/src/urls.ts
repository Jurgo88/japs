import { z } from "zod";

/**
 * Schemes a portfolio may link to. Zod's url() accepts any scheme, including javascript:,
 * data: and vbscript:, which run script on the portfolio's domain when clicked. With
 * portfolios on shared subdomains (*.japs.app) that would reach every user of the domain.
 */
export const WEB_PROTOCOLS: readonly string[] = ["http:", "https:"];
export const LINK_PROTOCOLS: readonly string[] = [...WEB_PROTOCOLS, "mailto:"];

/**
 * The scheme a browser reads from `url`, e.g. "https:". WHATWG URL parsing normalizes case,
 * surrounding whitespace and embedded tabs or newlines the way browsers do, so
 * " JavaScript:" and "java\tscript:" both come out as "javascript:". Relative URLs resolve
 * against `base`; null when it isn't a URL at all.
 */
export function urlProtocol(url: string, base?: string): string | null {
  try {
    return new URL(url, base).protocol;
  } catch {
    return null;
  }
}

/** Only the scheme check; url() already reports strings that aren't URLs. */
const withProtocol = (allowed: readonly string[]) => (url: string) => {
  const protocol = urlProtocol(url);
  return protocol === null || allowed.includes(protocol);
};

/** Absolute http(s) URL: live sites, repositories, pages to screenshot. */
export const WebUrl = z.string().url().refine(withProtocol(WEB_PROTOCOLS), "expected an http:// or https:// URL");

/** A link a visitor can click, e.g. in the profile: http(s) or mailto:. */
export const LinkUrl = z.string().url().refine(withProtocol(LINK_PROTOCOLS), "expected an http(s) or mailto: URL");
