import { z } from "zod";
import { LinkUrl, WebUrl } from "./urls.ts";

/** Contract between analysis and themes. See docs/spec/portfolio-json.md. */

/** BCP 47 language tag, e.g. "en", "sk", "pt-BR". */
export const Locale = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "expected a BCP 47 tag like en or pt-BR");
export type Locale = z.infer<typeof Locale>;

/** Text in every declared locale, e.g. { en: "…", sk: "…" }. See ADR 0005. */
export const LocalizedText = z.record(Locale, z.string());
export type LocalizedText = z.infer<typeof LocalizedText>;

export const Link = z.object({
  label: z.string(),
  url: LinkUrl,
});

export const Screenshot = z.object({
  viewport: z.enum(["desktop", "mobile"]),
  /** Relative path next to portfolio.json. Never a hotlink. */
  src: z.string(),
  alt: LocalizedText,
});

export const PortfolioProject = z.object({
  slug: z.string(),
  title: LocalizedText,
  summary: LocalizedText.refine(
    (text) => Object.values(text).every((s) => s.length <= 200),
    "summary must be at most 200 characters in every locale",
  ),
  description: LocalizedText,
  role: LocalizedText.nullable(),
  period: z.object({
    from: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    to: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
  }),
  tags: z.array(z.string()),
  links: z.object({
    live: WebUrl.nullable(),
    /** Always null for private repositories. */
    repo: WebUrl.nullable(),
  }),
  client: z.object({
    isClient: z.boolean(),
    anonymized: z.boolean(),
    label: LocalizedText.nullable(),
  }),
  screenshots: z.array(Screenshot),
  featured: z.boolean(),
});
export type PortfolioProject = z.infer<typeof PortfolioProject>;

export const Portfolio = z
  .object({
    version: z.literal(1),
    generatedAt: z.string().datetime(),
    locales: z.array(Locale).min(1),
    defaultLocale: Locale,
    profile: z.object({
      name: z.string(),
      headline: LocalizedText,
      bio: LocalizedText,
      location: z.string().nullable(),
      links: z.array(Link),
      /** Added within v1 (ADR 0010): older files load with null. */
      email: z.string().email().nullable().default(null),
      available: z.boolean().nullable().default(null),
    }),
    projects: z.array(PortfolioProject),
  })
  .superRefine((portfolio, ctx) => {
    const { locales } = portfolio;
    if (!locales.includes(portfolio.defaultLocale)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultLocale"],
        message: `defaultLocale "${portfolio.defaultLocale}" is not in locales`,
      });
    }

    // Every LocalizedText must cover exactly the declared locales, so themes never handle gaps.
    const check = (text: LocalizedText | null, path: (string | number)[]): void => {
      if (!text) return;
      const missing = locales.filter((l) => !(l in text));
      const extra = Object.keys(text).filter((l) => !locales.includes(l));
      if (missing.length || extra.length) {
        const parts = [
          missing.length ? `missing ${missing.join(", ")}` : "",
          extra.length ? `undeclared ${extra.join(", ")}` : "",
        ].filter(Boolean);
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `locales: ${parts.join("; ")}` });
      }
    };

    check(portfolio.profile.headline, ["profile", "headline"]);
    check(portfolio.profile.bio, ["profile", "bio"]);
    portfolio.projects.forEach((p, i) => {
      const at = ["projects", i];
      check(p.title, [...at, "title"]);
      check(p.summary, [...at, "summary"]);
      check(p.description, [...at, "description"]);
      check(p.role, [...at, "role"]);
      check(p.client.label, [...at, "client", "label"]);
      p.screenshots.forEach((s, j) => check(s.alt, [...at, "screenshots", j, "alt"]));
    });
  });
export type Portfolio = z.infer<typeof Portfolio>;
