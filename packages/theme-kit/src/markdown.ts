import { marked } from "marked";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

/**
 * Project descriptions are Markdown from an LLM or the config. Raw HTML is escaped first,
 * so only Markdown formatting reaches the page.
 */
export function renderMarkdown(source: string): string {
  const escaped = source.replace(/[&<>]/g, (c) => ESCAPES[c] ?? c);
  return marked.parse(escaped, { async: false, gfm: true, breaks: false });
}
