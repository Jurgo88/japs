import { z } from "zod";
import type { SiteFacts } from "@japs/schema";
import type { NetlifyClient } from "../discovery/netlify.ts";

/** Deploy fields used for facts. Netlify's function entries use short keys (n = name, g = generator, r = runtime). */
const RawDeployDetails = z.object({
  title: z.string().nullish(),
  commit_message: z.string().nullish(),
  committer: z.string().nullish(),
  available_functions: z
    .array(z.object({ n: z.string(), g: z.string().nullish(), r: z.string().nullish() }).passthrough())
    .nullish(),
  function_schedules: z.array(z.object({ name: z.string(), cron: z.string() }).passthrough()).nullish(),
  edge_functions_present: z.boolean().nullish(),
  lighthouse: z
    .object({ averages: z.record(z.string(), z.number().nullable()).nullish() })
    .passthrough()
    .nullish(),
});
export type RawDeployDetails = z.infer<typeof RawDeployDetails>;

export function toDeployFacts(raw: RawDeployDetails): NonNullable<SiteFacts["deploy"]> {
  const scores = raw.lighthouse?.averages;
  const score = (key: string) => scores?.[key] ?? null;
  return {
    // `title` is the commit title Netlify shows; commit_message is often empty.
    commitMessage: (raw.commit_message || raw.title || null)?.split("\n")[0]?.trim() || null,
    committer: raw.committer || null,
    functions: (raw.available_functions ?? []).map((f) => ({
      name: f.n,
      // "internalFunc" marks Netlify's own helpers, not the framework; both aren't hand-written.
      generator: f.g || null,
      runtime: f.r || null,
    })),
    scheduledFunctions: (raw.function_schedules ?? []).map(({ name, cron }) => ({ name, cron })),
    edgeFunctions: raw.edge_functions_present ?? false,
    lighthouse: scores
      ? {
          performance: score("performance"),
          accessibility: score("accessibility"),
          bestPractices: score("best-practices"),
          seo: score("seo"),
        }
      : null,
  };
}

export async function fetchDeployFacts(netlify: NetlifyClient, deployId: string): Promise<NonNullable<SiteFacts["deploy"]>> {
  return toDeployFacts(RawDeployDetails.parse(await netlify.get(`/deploys/${deployId}`)));
}
