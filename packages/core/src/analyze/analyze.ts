import type { AnalysisFile, FactsFile, ProjectAnalysis, ProjectCopy, ProjectFacts, TokenUsage } from "@japs/schema";
import { AnalysisFile as AnalysisFileSchema, ProjectCopy as ProjectCopySchema } from "@japs/schema";
import { errorMessage, mapLimit } from "../facts/util.ts";
import { allowedNumbers, describeUngrounded, dropUngroundedSentences, findUngrounded } from "./grounding.ts";
import type { LlmClient, LlmJsonRequest } from "./llm.ts";
import { copyJsonSchema, promptFacts, type PromptContext, SUMMARY_LIMIT, systemPrompt, userPrompt } from "./prompt.ts";

export interface AnalyzeOptions {
  llm: LlmClient;
  locales: string[];
  /** Config decisions per project key (isClient, anonymize). Missing = not client, not anonymized. */
  projects?: Record<string, { isClient?: boolean; anonymize?: boolean }>;
  /** Account owner's GitHub login, to tell whether others committed. */
  accountLogin?: string | null;
  /** Previous analysis.json: unchanged projects are not regenerated. */
  previous?: AnalysisFile | null;
  /** Regenerate even when facts are unchanged. */
  force?: boolean;
  /** Only these project keys. */
  keys?: string[];
  now?: Date;
  /** Parallel LLM requests. Default 3. */
  concurrency?: number;
  onProgress?: (done: number, total: number, key: string) => void;
}

export interface AnalyzeResult {
  file: AnalysisFile;
  generated: number;
  reused: number;
  usage: TokenUsage;
}

/** Rejects output the schema can't express: missing locales, long summaries. Tags are filtered, not rejected. */
function validateCopy(json: unknown, locales: string[], techNames: Set<string>): { copy: ProjectCopy } | { error: string } {
  const parsed = ProjectCopySchema.safeParse(json);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const copy = parsed.data;
  const problems: string[] = [];
  for (const field of ["title", "summary", "description", "role"] as const) {
    const missing = locales.filter((l) => !copy[field][l]?.trim());
    if (missing.length) problems.push(`${field} is missing ${missing.join(", ")}`);
  }
  for (const [locale, text] of Object.entries(copy.summary)) {
    if (text.length > SUMMARY_LIMIT) problems.push(`summary.${locale} has ${text.length} characters, max ${SUMMARY_LIMIT}`);
  }
  if (problems.length) return { error: problems.join("; ") };

  // Keep declared locales only, and only tags that exist in the facts (grounding, #11 extends it).
  const pick = (text: Record<string, string>) => Object.fromEntries(locales.map((l) => [l, text[l]!.trim()]));
  return {
    copy: {
      title: pick(copy.title),
      summary: pick(copy.summary),
      description: pick(copy.description),
      role: pick(copy.role),
      tags: [...new Set(copy.tags)].filter((t) => techNames.has(t)),
    },
  };
}

function isFresh(previous: ProjectAnalysis | undefined, facts: ProjectFacts, llm: LlmClient, locales: string[], anonymized: boolean) {
  return (
    previous !== undefined &&
    previous.factsHash === facts.hash &&
    previous.provider === llm.provider &&
    previous.model === llm.model &&
    previous.anonymized === anonymized &&
    locales.every((l) => l in previous.copy.title)
  );
}

/**
 * Step 2 of docs/spec/ai-pipeline.md: one LLM call per changed project, structured output in
 * every locale, validated and retried once. No file I/O.
 */
export async function analyzeProjects(factsFile: FactsFile, options: AnalyzeOptions): Promise<AnalyzeResult> {
  const { llm, locales } = options;
  const me = options.accountLogin?.toLowerCase() ?? null;
  const previousByKey = new Map(options.previous?.projects.map((p) => [p.key, p]) ?? []);
  const warnings: string[] = [];

  const selected = factsFile.projects.filter((p) => !options.keys || options.keys.includes(p.key));
  for (const key of options.keys ?? []) {
    if (!selected.some((p) => p.key === key)) warnings.push(`project "${key}" not found in facts`);
  }

  const contextFor = (facts: ProjectFacts): PromptContext => {
    const decided = options.projects?.[facts.key] ?? {};
    const committers = facts.sites.flatMap((s) => (s.deploy?.committer ? [s.deploy.committer.toLowerCase()] : []));
    return {
      isClient: decided.isClient ?? false,
      anonymize: decided.anonymize ?? false,
      hasOtherCommitters: me !== null && committers.some((c) => c !== me),
    };
  };

  const toGenerate = selected.filter(
    (f) => options.force || !isFresh(previousByKey.get(f.key), f, llm, locales, contextFor(f).anonymize),
  );
  const usage: TokenUsage = { input: 0, output: 0 };
  let done = 0;

  const generated = await mapLimit(toGenerate, options.concurrency ?? 3, async (facts): Promise<ProjectAnalysis | null> => {
    const context = contextFor(facts);
    const techNames = facts.tech.map((t) => t.name);
    const request: LlmJsonRequest = {
      system: systemPrompt(locales),
      messages: [{ role: "user", content: userPrompt(facts, context) }],
      schemaName: "project_copy",
      schema: copyJsonSchema(locales, techNames),
    };
    // Grounding compares against exactly what the model saw.
    const allowed = allowedNumbers(JSON.stringify(promptFacts(facts, context)));
    const projectUsage: TokenUsage = { input: 0, output: 0 };
    const entry = (copy: ProjectCopy, dropped: ProjectAnalysis["dropped"]): ProjectAnalysis => ({
      key: facts.key,
      factsHash: facts.hash,
      provider: llm.provider,
      model: llm.model,
      generatedAt: (options.now ?? new Date()).toISOString(),
      anonymized: context.anonymize,
      copy,
      usage: projectUsage,
      dropped,
    });

    try {
      for (let attempt = 1; ; attempt++) {
        const response = await llm.generateJson(request);
        for (const total of [usage, projectUsage]) {
          total.input += response.usage.input;
          total.output += response.usage.output;
        }
        const result = validateCopy(response.json, locales, new Set(techNames));
        let error: string;
        if ("copy" in result) {
          const ungrounded = findUngrounded(result.copy, allowed);
          if (!ungrounded.length) return entry(result.copy, []);
          if (attempt >= 2) {
            // Last resort: a description sentence can go; a title, summary or role can't.
            if (ungrounded.every((u) => u.field === "description")) {
              const { description, dropped } = dropUngroundedSentences(result.copy.description, allowed);
              if (locales.every((l) => description[l]?.trim())) return entry({ ...result.copy, description }, dropped);
            }
            throw new Error(`ungrounded numbers after retry: ${describeUngrounded(ungrounded)}`);
          }
          error = `${describeUngrounded(ungrounded)}. Use only numbers that appear in the facts, or none`;
        } else {
          if (attempt >= 2) throw new Error(`invalid output after retry: ${result.error}`);
          error = result.error;
        }
        request.messages.push(
          { role: "assistant", content: response.text },
          { role: "user", content: `That output is invalid: ${error}. Return the corrected JSON object.` },
        );
      }
    } catch (err) {
      warnings.push(`${facts.key}: ${errorMessage(err)}`);
      return null;
    } finally {
      options.onProgress?.(++done, toGenerate.length, facts.key);
    }
  });

  // Merge: fresh results win, failed or skipped projects keep their previous analysis.
  const fresh = new Map(generated.flatMap((g) => (g ? [[g.key, g] as const] : [])));
  const projects = factsFile.projects.flatMap((f) => {
    const entry = fresh.get(f.key) ?? previousByKey.get(f.key);
    return entry ? [entry] : [];
  });

  const file: AnalysisFile = {
    version: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    locales,
    projects,
    warnings,
  };
  return {
    file: AnalysisFileSchema.parse(file),
    generated: fresh.size,
    reused: selected.length - toGenerate.length,
    usage,
  };
}
