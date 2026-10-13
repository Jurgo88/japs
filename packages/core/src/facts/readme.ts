const MAX_HEADINGS = 30;
/** ATX heading, optional closing hashes: "## Title ##" -> "Title". */
const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;

/**
 * Plain-text excerpt and headings of a README. Badges, images, HTML and code blocks are dropped:
 * they carry no facts for the prompt and waste tokens.
 */
export function summarizeReadme(markdown: string, maxChars = 1500): { excerpt: string; headings: string[] } {
  const withoutCode = markdown.replace(/\r\n/g, "\n").replace(/```[\s\S]*?(```|$)/g, "");

  const headings: string[] = [];
  for (const line of withoutCode.split("\n")) {
    const match = HEADING.exec(line);
    if (match?.[1]) headings.push(stripInline(match[1]));
  }

  const text = withoutCode
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => stripInline(line.replace(HEADING, "$1").replace(/^\s*[-*+]\s+/, "- ")))
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .trim();

  const excerpt = text.length > maxChars ? `${text.slice(0, maxChars).replace(/\s+\S*$/, "")}…` : text;
  return { excerpt, headings: headings.filter(Boolean).slice(0, MAX_HEADINGS) };
}

/** Removes images/badges, keeps link text, drops emphasis markers. */
function stripInline(line: string): string {
  return line
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .trim();
}
