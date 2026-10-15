import { z } from "zod";

/** Where the portfolio is published (ADR 0008, 0012). */
export const PublishTarget = z.enum(["netlify", "cloudflare"]);
export type PublishTarget = z.infer<typeof PublishTarget>;

const LastDeploy = z
  .object({
    id: z.string(),
    url: z.string().url(),
    draft: z.boolean(),
    at: z.string().datetime(),
  })
  .nullable();

/** The Netlify site JAPS created for the portfolio. */
export const NetlifyPublish = z.object({
  siteId: z.string(),
  siteName: z.string(),
  url: z.string().url(),
  adminUrl: z.string().url().nullable(),
  lastDeploy: LastDeploy,
});
export type NetlifyPublish = z.infer<typeof NetlifyPublish>;

/** The Cloudflare Pages project JAPS created for the portfolio. */
export const CloudflarePublish = z.object({
  accountId: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  url: z.string().url(),
  lastDeploy: LastDeploy,
});
export type CloudflarePublish = z.infer<typeof CloudflarePublish>;

/**
 * publish.json, written by `japs publish` (and the hosted `publish` document): one site per
 * target, so switching targets back and forth never creates a second site. The first version
 * held only the Netlify site at the top level; it is read as `netlify`.
 */
export const PublishState = z.preprocess(
  (raw) => {
    if (raw && typeof raw === "object" && "siteId" in raw && !("netlify" in raw)) {
      const { version, ...netlify } = raw as Record<string, unknown>;
      return { version, netlify };
    }
    return raw;
  },
  z.object({
    version: z.literal(1),
    netlify: NetlifyPublish.nullable().default(null),
    cloudflare: CloudflarePublish.nullable().default(null),
  }),
);
export type PublishState = z.infer<typeof PublishState>;
