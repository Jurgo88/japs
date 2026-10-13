import type { LocalizedText, ProjectCopy } from "@japs/schema";

/**
 * Grounding check (docs/spec/ai-pipeline.md, step 3). Tags are already limited to known
 * technologies by the schema and validation; this checks numbers: every number in the copy
 * must appear in the facts the model saw. A heuristic, not a proof: it catches invented
 * figures ("500 users", "Node 26" when no 26 was given), not every wrong claim.
 */

/**
 * "1 200", "4.5", "4,5" -> "1200", "4.5", "4.5". Thousands are grouped only by (narrow)
 * no-break spaces, so "in 2025 85 PRs" stays two numbers. Digits glued to letters ("i18n") are not numbers.
 */
const NUMBER = /(?<![\p{L}\d.,])\d+(?:[  ]\d{3})*(?:[.,]\d+)?(?![\p{L}\d])/gu;

const normalize = (n: string) => n.replace(/[  ]/g, "").replace(",", ".").replace(/\.0+$/, "");

export function numbersIn(text: string): string[] {
  return [...text.matchAll(NUMBER)].map((m) => normalize(m[0]));
}

/** Numbers available to the copy: everything in the prompt facts, including date parts ("2025-03" -> 2025, 3). */
export function allowedNumbers(promptFactsJson: string): Set<string> {
  const allowed = new Set<string>();
  for (const raw of promptFactsJson.match(/\d+(?:\.\d+)?/g) ?? []) {
    allowed.add(normalize(raw));
    allowed.add(String(Number(raw))); // "03" -> "3"
  }
  // A rounded percentage or score ("about 80 %" for 79.6) is still grounded.
  for (const n of [...allowed]) {
    if (n.includes(".")) allowed.add(String(Math.round(Number(n))));
  }
  return allowed;
}

export interface Ungrounded {
  field: "title" | "summary" | "description" | "role";
  locale: string;
  numbers: string[];
}

export function findUngrounded(copy: ProjectCopy, allowed: Set<string>): Ungrounded[] {
  const found: Ungrounded[] = [];
  for (const field of ["title", "summary", "description", "role"] as const) {
    for (const [locale, text] of Object.entries(copy[field])) {
      const numbers = [...new Set(numbersIn(text).filter((n) => !allowed.has(n)))];
      if (numbers.length) found.push({ field, locale, numbers });
    }
  }
  return found;
}

export const describeUngrounded = (issues: Ungrounded[]): string =>
  issues.map((i) => `${i.field}.${i.locale} contains ${i.numbers.join(", ")}, which is not in the facts`).join("; ");

/** Splits a Markdown paragraph into sentences. */
function sentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?…])\s+(?=[\p{Lu}\d"„(])/u);
}

/**
 * Last resort after a retry: removes description sentences with ungrounded numbers,
 * keeping paragraph breaks. Returns the cleaned text and what was dropped.
 */
export function dropUngroundedSentences(
  description: LocalizedText,
  allowed: Set<string>,
): { description: LocalizedText; dropped: { locale: string; text: string }[] } {
  const dropped: { locale: string; text: string }[] = [];
  const cleaned = Object.fromEntries(
    Object.entries(description).map(([locale, text]) => {
      const paragraphs = text
        .split(/\n{2,}/)
        .map((p) =>
          sentences(p)
            .filter((s) => {
              const ok = numbersIn(s).every((n) => allowed.has(n));
              if (!ok) dropped.push({ locale, text: s });
              return ok;
            })
            .join(" "),
        )
        .filter((p) => p.trim());
      return [locale, paragraphs.join("\n\n")];
    }),
  );
  return { description: cleaned, dropped };
}
