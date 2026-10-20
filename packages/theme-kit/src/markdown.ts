import { LINK_PROTOCOLS, urlProtocol } from "@japs/schema";
import { Marked } from "marked";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const UNESCAPES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">" };

const escapeText = (s: string) => s.replace(/[&<>]/g, (c) => ESCAPES[c]!);
const escapeAttr = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
/** Undoes escapeText, which runs on the whole source before marked sees it. */
const unescapeText = (s: string) => s.replace(/&(?:amp|lt|gt);/g, (e) => UNESCAPES[e]!);

/** Relative links (#top, /about) resolve against this and count as https. */
const RELATIVE_BASE = "https://portfolio.invalid/";

/**
 * The link target as written in the source, or null when its scheme isn't http(s) or mailto:.
 * marked keeps javascript:, data: and vbscript: links, which run script on the portfolio's
 * domain when clicked.
 */
function safeHref(href: string): string | null {
  const url = unescapeText(href);
  return LINK_PROTOCOLS.includes(urlProtocol(url, RELATIVE_BASE) ?? "") ? url : null;
}

const markdown = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    /**
     * An unsafe link keeps only its text. A safe one is written here with the href escaped in
     * full: the browser then reads exactly the URL that was checked, and no character
     * reference in it (`&#58;`, `&colon;`) can turn into a scheme.
     */
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const url = safeHref(href);
      if (url === null) return text;
      const titleAttr = title ? ` title="${escapeAttr(unescapeText(title))}"` : "";
      return `<a href="${escapeAttr(url)}"${titleAttr}>${text}</a>`;
    },
    /** An unsafe image keeps only its alt text; a safe one renders as usual. */
    image({ href, text }) {
      return safeHref(href) === null ? escapeText(unescapeText(text)) : false;
    },
  },
});

/**
 * Project descriptions are Markdown from an LLM or the config. Raw HTML is escaped first,
 * so only Markdown formatting reaches the page, and links may only point to http(s),
 * mailto: or relative targets.
 */
export function renderMarkdown(source: string): string {
  return markdown.parse(escapeText(source), { async: false });
}
