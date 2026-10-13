import type { LiveSiteFacts } from "@japs/schema";

const USER_AGENT = "JAPS portfolio generator (+https://github.com/Jurgo88/japs)";

/** <title>, meta description, og:* and <html lang> from raw HTML. Regex-based: core has no DOM. */
export function parseHtmlMeta(html: string): Omit<LiveSiteFacts, "status" | "finalUrl"> {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd >= 0 ? html.slice(0, headEnd) : html;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([^"'\s>]*)/i.exec(html)?.[1];

  let description: string | null = null;
  const og: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    const content = attrs.content;
    if (content === undefined) continue;
    if (key === "description") description = clean(content);
    else if (key.startsWith("og:")) og[key.slice(3)] = clean(content);
  }

  return {
    title: title ? clean(title) || null : null,
    description: description || null,
    lang: lang || null,
    og,
  };
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function clean(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetches the live site. Throws on network errors and timeouts; the caller records a warning. */
export async function fetchLiveSite(url: string, fetchImpl: typeof fetch, timeoutMs = 10_000): Promise<LiveSiteFacts> {
  const res = await fetchImpl(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const html = res.headers.get("content-type")?.includes("html") === false ? "" : await res.text();
  return { status: res.status, finalUrl: res.url || url, ...parseHtmlMeta(html) };
}
