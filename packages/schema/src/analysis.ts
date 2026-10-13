import { z } from "zod";
import { LocalizedText } from "./portfolio.ts";

/**
 * Generated copy per project (docs/spec/ai-pipeline.md, step 2). Overrides from
 * japs.config.json are applied at build time, never written here.
 */

/** LLM output for one project. Texts in every declared locale (ADR 0005). */
export const ProjectCopy = z.object({
  title: LocalizedText,
  summary: LocalizedText,
  description: LocalizedText,
  role: LocalizedText,
  /** Names from ProjectFacts.tech only. */
  tags: z.array(z.string()),
});
export type ProjectCopy = z.infer<typeof ProjectCopy>;

export const TokenUsage = z.object({
  input: z.number().int(),
  output: z.number().int(),
});
export type TokenUsage = z.infer<typeof TokenUsage>;

export const ProjectAnalysis = z.object({
  key: z.string(),
  /** ProjectFacts.hash this copy was generated from; a mismatch means stale. */
  factsHash: z.string(),
  provider: z.string(),
  model: z.string(),
  generatedAt: z.string().datetime(),
  /** Whether the prompt was anonymized (no names, domains or URLs). */
  anonymized: z.boolean(),
  copy: ProjectCopy,
  usage: TokenUsage,
  /** Description sentences removed by the grounding check (numbers not in the facts). */
  dropped: z.array(z.object({ locale: z.string(), text: z.string() })).default([]),
});
export type ProjectAnalysis = z.infer<typeof ProjectAnalysis>;

export const AnalysisFile = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  locales: z.array(z.string()).min(1),
  projects: z.array(ProjectAnalysis),
  /** Projects that failed to generate; their previous analysis (if any) is kept. */
  warnings: z.array(z.string()),
});
export type AnalysisFile = z.infer<typeof AnalysisFile>;
