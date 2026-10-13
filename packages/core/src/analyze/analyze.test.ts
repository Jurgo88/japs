import { describe, expect, it } from "vitest";
import type { LlmClient, LlmJsonRequest, LlmJsonResponse } from "./llm.ts";
import { analyzeProjects } from "./analyze.ts";
import { factsFile, shopFacts } from "../__fixtures__/analysis.ts";

const NOW = new Date("2026-10-13T12:00:00Z");
const t = (en: string, sk: string) => ({ en, sk });

const validCopy = (title: string) => ({
  title: t(title, title),
  summary: t("An online shop.", "Online obchod."),
  description: t("Built with Nuxt.", "Postavený na Nuxte."),
  role: t("Solo developer", "Samostatný vývojár"),
  tags: ["Nuxt", "Supabase", "React"],
});

/** Answers from a queue (or a function of the request); records every request. */
function fakeLlm(answer: (req: LlmJsonRequest, call: number) => unknown, model = "m-1"): LlmClient & { requests: LlmJsonRequest[] } {
  const requests: LlmJsonRequest[] = [];
  return {
    provider: "fake",
    model,
    requests,
    async generateJson(req): Promise<LlmJsonResponse> {
      requests.push(structuredClone(req));
      const json = answer(req, requests.length);
      if (json instanceof Error) throw json;
      return { json, text: JSON.stringify(json), usage: { input: 1000, output: 200 } };
    },
  };
}

const titleFromPrompt = (req: LlmJsonRequest) => (req.messages[0]!.content.includes("tiny-lib") ? "Tiny Lib" : "Acme Shop");

describe("analyzeProjects", () => {
  it("generates copy for every project in every locale, keeping only grounded tags", async () => {
    const llm = fakeLlm((req) => validCopy(titleFromPrompt(req)));
    const { file, generated, usage } = await analyzeProjects(factsFile, { llm, locales: ["en", "sk"], now: NOW });

    expect(generated).toBe(2);
    expect(usage).toEqual({ input: 2000, output: 400 });
    expect(file.locales).toEqual(["en", "sk"]);
    expect(file.projects[0]).toMatchObject({
      key: shopFacts.key,
      factsHash: shopFacts.hash,
      provider: "fake",
      model: "m-1",
      anonymized: false,
      copy: { title: { en: "Acme Shop", sk: "Acme Shop" }, tags: ["Nuxt", "Supabase"] },
    });
    // tiny-lib only knows TypeScript.
    expect(file.projects[1]?.copy.tags).toEqual([]);
  });

  it("skips projects whose facts, model and settings are unchanged", async () => {
    const first = await analyzeProjects(factsFile, { llm: fakeLlm(() => validCopy("X")), locales: ["en", "sk"], now: NOW });

    const llm = fakeLlm(() => validCopy("Y"));
    const second = await analyzeProjects(factsFile, { llm, locales: ["en", "sk"], previous: first.file });
    expect(llm.requests).toHaveLength(0);
    expect(second).toMatchObject({ generated: 0, reused: 2 });
    expect(second.file.projects).toEqual(first.file.projects);

    const otherModel = fakeLlm(() => validCopy("Z"), "m-2");
    expect((await analyzeProjects(factsFile, { llm: otherModel, locales: ["en", "sk"], previous: first.file })).generated).toBe(2);

    const forced = fakeLlm(() => validCopy("Z"));
    expect((await analyzeProjects(factsFile, { llm: forced, locales: ["en", "sk"], previous: first.file, force: true })).generated).toBe(2);

    const changedFacts = { ...factsFile, projects: [{ ...shopFacts, hash: "c".repeat(64) }, factsFile.projects[1]!] };
    const changed = fakeLlm(() => validCopy("Z"));
    await analyzeProjects(changedFacts, { llm: changed, locales: ["en", "sk"], previous: first.file });
    expect(changed.requests).toHaveLength(1);
  });

  it("retries once with the validation error, then succeeds", async () => {
    const llm = fakeLlm((_req, call) =>
      call === 1 ? { ...validCopy("A"), summary: { en: "x".repeat(201), sk: "ok" } } : validCopy("A"),
    );
    const { file } = await analyzeProjects(factsFile, { llm, locales: ["en", "sk"], keys: [shopFacts.key] });

    expect(llm.requests).toHaveLength(2);
    const retry = llm.requests[1]!.messages;
    expect(retry.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(retry[2]?.content).toContain("summary.en has 201 characters, max 200");
    expect(file.projects[0]?.copy.title.en).toBe("A");
  });

  it("keeps the previous analysis and warns when generation fails", async () => {
    const first = await analyzeProjects(factsFile, { llm: fakeLlm(() => validCopy("Old")), locales: ["en", "sk"] });
    const failing = fakeLlm(() => ({ title: { en: "missing sk" } }));
    const { file, generated } = await analyzeProjects(factsFile, {
      llm: failing,
      locales: ["en", "sk"],
      previous: first.file,
      force: true,
      keys: [shopFacts.key],
    });

    expect(generated).toBe(0);
    expect(file.projects.find((p) => p.key === shopFacts.key)?.copy.title.en).toBe("Old");
    expect(file.warnings[0]).toMatch(/^repo:devuser\/acmeshop: invalid output after retry: /);
  });

  describe("grounding", () => {
    const withDescription = (en: string, sk: string) => ({ ...validCopy("Acme Shop"), description: t(en, sk) });

    it("retries when a number is not in the facts, telling the model which one", async () => {
      const llm = fakeLlm((_req, call) =>
        call === 1 ? withDescription("Serves 500 bakeries.", "Slúži 500 pekárňam.") : withDescription("120 commits.", "120 commitov."),
      );
      const { file } = await analyzeProjects(factsFile, { llm, locales: ["en", "sk"], keys: [shopFacts.key] });

      expect(llm.requests[1]?.messages[2]?.content).toContain("description.en contains 500, which is not in the facts");
      expect(file.projects[0]).toMatchObject({ copy: { description: t("120 commits.", "120 commitov.") }, dropped: [] });
      expect(file.projects[0]?.usage).toEqual({ input: 2000, output: 400 });
    });

    it("drops the offending description sentence when the retry still invents numbers", async () => {
      const llm = fakeLlm(() => withDescription("Order bread online. Used by 500 bakeries.", "Objednávky chleba online. Používa ho 500 pekární."));
      const { file } = await analyzeProjects(factsFile, { llm, locales: ["en", "sk"], keys: [shopFacts.key] });

      expect(file.projects[0]?.copy.description).toEqual(t("Order bread online.", "Objednávky chleba online."));
      expect(file.projects[0]?.dropped).toEqual([
        { locale: "en", text: "Used by 500 bakeries." },
        { locale: "sk", text: "Používa ho 500 pekární." },
      ]);
    });

    it("fails the project when a summary keeps an invented number", async () => {
      const llm = fakeLlm(() => ({ ...validCopy("Acme Shop"), summary: t("Shop for 500 bakeries.", "Obchod pre 500 pekární.") }));
      const { file } = await analyzeProjects(factsFile, { llm, locales: ["en", "sk"], keys: [shopFacts.key] });
      expect(file.projects).toEqual([]);
      expect(file.warnings[0]).toContain("ungrounded numbers after retry: summary.en contains 500");
    });
  });

  it("turns provider errors into warnings", async () => {
    const llm = fakeLlm(() => new Error("openai 429: Rate limit reached"));
    const { file } = await analyzeProjects(factsFile, { llm, locales: ["en"], keys: [shopFacts.key] });
    expect(file.warnings).toEqual(["repo:devuser/acmeshop: openai 429: Rate limit reached"]);
    expect(file.projects).toEqual([]);
  });

  it("anonymizes per config and notes other committers", async () => {
    const llm = fakeLlm(() => validCopy("Client e-shop"));
    const { file } = await analyzeProjects(factsFile, {
      llm,
      locales: ["en", "sk"],
      keys: [shopFacts.key],
      projects: { [shopFacts.key]: { isClient: true, anonymize: true } },
      accountLogin: "DevUser",
    });

    const prompt = llm.requests[0]!.messages[0]!.content;
    expect(prompt).not.toContain("Acme");
    expect(prompt).toContain('"otherPeopleCommitted": true');
    expect(file.projects[0]?.anonymized).toBe(true);
  });
});
