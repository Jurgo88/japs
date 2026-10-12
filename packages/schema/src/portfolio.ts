import { z } from "zod";

/** Contract between analysis and themes. See docs/spec/portfolio-json.md. */

export const Link = z.object({
  label: z.string(),
  url: z.string().url(),
});

export const Screenshot = z.object({
  viewport: z.enum(["desktop", "mobile"]),
  /** Relative path next to portfolio.json. Never a hotlink. */
  src: z.string(),
  alt: z.string(),
});

export const PortfolioProject = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string().max(200),
  description: z.string(),
  role: z.string().nullable(),
  period: z.object({
    from: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    to: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
  }),
  tags: z.array(z.string()),
  links: z.object({
    live: z.string().url().nullable(),
    /** Always null for private repositories. */
    repo: z.string().url().nullable(),
  }),
  client: z.object({
    isClient: z.boolean(),
    anonymized: z.boolean(),
    label: z.string().nullable(),
  }),
  screenshots: z.array(Screenshot),
  featured: z.boolean(),
});
export type PortfolioProject = z.infer<typeof PortfolioProject>;

export const Portfolio = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  profile: z.object({
    name: z.string(),
    headline: z.string(),
    bio: z.string(),
    location: z.string().nullable(),
    links: z.array(Link),
  }),
  projects: z.array(PortfolioProject),
});
export type Portfolio = z.infer<typeof Portfolio>;
