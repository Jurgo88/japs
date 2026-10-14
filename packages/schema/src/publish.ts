import { z } from "zod";

/** publish.json, written by `japs publish` (ADR 0008). Later: the `portfolios` row in Supabase. */
export const PublishState = z.object({
  version: z.literal(1),
  siteId: z.string(),
  siteName: z.string(),
  url: z.string().url(),
  adminUrl: z.string().url().nullable(),
  lastDeploy: z
    .object({
      id: z.string(),
      url: z.string().url(),
      draft: z.boolean(),
      at: z.string().datetime(),
    })
    .nullable(),
});
export type PublishState = z.infer<typeof PublishState>;
