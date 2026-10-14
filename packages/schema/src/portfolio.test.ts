import { describe, expect, it } from "vitest";
import { Portfolio } from "./portfolio.ts";

const t = (en: string, sk: string) => ({ en, sk });

const valid = () => ({
  version: 1 as const,
  generatedAt: "2026-10-13T10:00:00Z",
  locales: ["en", "sk"],
  defaultLocale: "en",
  profile: {
    name: "Jane Doe",
    headline: t("Freelance developer", "Freelance vývojárka"),
    bio: t("Builds things.", "Stavia veci."),
    location: null,
    links: [{ label: "GitHub", url: "https://github.com/janedoe" }],
  },
  projects: [
    {
      slug: "acme-shop",
      title: t("Acme Shop", "Acme Shop"),
      summary: t("An e-shop.", "E-shop."),
      description: t("Longer text.", "Dlhší text."),
      role: null,
      period: { from: "2025-03", to: null },
      tags: ["Vue", "Supabase"],
      links: { live: "https://acme.example.com", repo: null },
      client: { isClient: true, anonymized: true, label: t("E-shop for a client", "E-shop pre klienta") },
      screenshots: [{ viewport: "desktop" as const, src: "screenshots/acme-shop-desktop.webp", alt: t("Home", "Úvod") }],
      featured: true,
    },
  ],
});

const messages = (input: unknown) => {
  const result = Portfolio.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("Portfolio", () => {
  it("accepts a complete bilingual portfolio", () => {
    expect(messages(valid())).toEqual([]);
  });

  it("accepts a single-locale portfolio", () => {
    const p = valid();
    const en = <T extends { en: string }>(x: T) => ({ en: x.en });
    const project = p.projects[0]!;
    expect(
      messages({
        ...p,
        locales: ["en"],
        profile: { ...p.profile, headline: en(p.profile.headline), bio: en(p.profile.bio) },
        projects: [
          {
            ...project,
            title: en(project.title),
            summary: en(project.summary),
            description: en(project.description),
            client: { ...project.client, label: en(project.client.label) },
            screenshots: project.screenshots.map((s) => ({ ...s, alt: en(s.alt) })),
          },
        ],
      }),
    ).toEqual([]);
  });

  it("reports a missing translation with its path", () => {
    const p = valid();
    p.projects[0]!.description = { en: "Only English" } as ReturnType<typeof t>;
    expect(messages(p)).toEqual(["projects.0.description: locales: missing sk"]);
  });

  it("reports an undeclared locale", () => {
    const p = valid();
    (p.profile.bio as Record<string, string>).de = "Baut Dinge.";
    expect(messages(p)).toEqual(["profile.bio: locales: undeclared de"]);
  });

  it("requires defaultLocale to be declared", () => {
    expect(messages({ ...valid(), defaultLocale: "de" })).toEqual(['defaultLocale: defaultLocale "de" is not in locales']);
  });

  it("loads a v1 file from before profile email/availability with nulls", () => {
    const parsed = Portfolio.parse(valid());
    expect(parsed.profile.email).toBeNull();
    expect(parsed.profile.available).toBeNull();
  });

  it("limits summary length in every locale", () => {
    const p = valid();
    p.projects[0]!.summary.sk = "x".repeat(201);
    expect(messages(p)).toEqual(["projects.0.summary: summary must be at most 200 characters in every locale"]);
  });
});
