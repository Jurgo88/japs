import { describe, expect, it } from "vitest";
import { allowedNumbers, dropUngroundedSentences, findUngrounded, numbersIn } from "./grounding.ts";

describe("numbersIn", () => {
  it("finds standalone numbers, normalizing decimals and no-break thousands", () => {
    expect(numbersIn("205 commits, 85 PRs, 4,5 stars, 1 200 users, 98 %")).toEqual(["205", "85", "4.5", "1200", "98"]);
  });

  it("ignores digits glued to letters and keeps space-separated numbers apart", () => {
    expect(numbersIn("Nuxt I18n, h2, Vue3, in 2025 85 PRs")).toEqual(["2025", "85"]);
  });
});

describe("allowedNumbers", () => {
  it("allows every number in the facts, date parts and rounded decimals", () => {
    const allowed = allowedNumbers(JSON.stringify({ commits: { count: 120, firstMonth: "2025-03" }, languages: { TypeScript: 79.6 } }));
    for (const n of ["120", "2025", "3", "79.6", "80"]) expect(allowed.has(n)).toBe(true);
    expect(allowed.has("26")).toBe(false);
  });
});

describe("findUngrounded", () => {
  const copy = (description: string) => ({
    title: { en: "Shop" },
    summary: { en: "An online shop." },
    description: { en: description },
    role: { en: "Full-stack development" },
    tags: [],
  });

  it("reports numbers that are not in the facts, per field and locale", () => {
    const allowed = new Set(["205", "85"]);
    expect(findUngrounded(copy("205 commits and 85 pull requests."), allowed)).toEqual([]);
    expect(findUngrounded(copy("Runs on Node 26 for 500 users."), allowed)).toEqual([
      { field: "description", locale: "en", numbers: ["26", "500"] },
    ]);
  });
});

describe("dropUngroundedSentences", () => {
  it("removes only the sentences with ungrounded numbers and keeps paragraphs", () => {
    const { description, dropped } = dropUngroundedSentences(
      { sk: "Aplikácia na objednávky. Slúži 500 zákazníkom.\n\nPostavená na Nuxte. Má 205 commitov." },
      new Set(["205"]),
    );
    expect(description).toEqual({ sk: "Aplikácia na objednávky.\n\nPostavená na Nuxte. Má 205 commitov." });
    expect(dropped).toEqual([{ locale: "sk", text: "Slúži 500 zákazníkom." }]);
  });
});
