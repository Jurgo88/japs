import { describe, expect, it } from "vitest";
import { shopFacts } from "../__fixtures__/analysis.ts";
import { copyJsonSchema, promptFacts, systemPrompt, userPrompt } from "./prompt.ts";

const context = { isClient: false, anonymize: false, hasOtherCommitters: false };

describe("promptFacts", () => {
  it("passes facts compactly, without framework-generated functions", () => {
    const facts = promptFacts(shopFacts, context);
    expect(facts).toMatchObject({
      project: "AcmeShop",
      technologies: ["Nuxt", "TypeScript", "Supabase"],
      repositories: [
        {
          description: "E-shop for Acme Bakery",
          commits: { count: 120, first: "2025-03-01", last: "2026-10-09" },
          readme: { private: true, excerpt: "Acme Bakery shop. Order bread online." },
        },
      ],
      sites: [{ domain: "acme-bakery.example", functions: ["order-mailer"], siteTitle: "Acme Bakery" }],
    });
  });

  it("sends no names, domains, URLs, README or package names when anonymized", () => {
    const prompt = userPrompt(shopFacts, { ...context, anonymize: true, isClient: true });
    for (const leak of ["Acme", "acme", "Bakery", "bread", "order-mailer", "https://"]) {
      expect(prompt).not.toContain(leak);
    }
    expect(prompt).toContain('"clientWork": true');
    expect(prompt).toContain('"functions": 1');
    expect(prompt).toContain("Supabase");
  });
});

describe("systemPrompt", () => {
  it("names every locale's language", () => {
    expect(systemPrompt(["en", "sk"])).toContain('"en" (English), "sk" (Slovak)');
  });
});

describe("copyJsonSchema", () => {
  it("requires every locale and limits tags to known technologies", () => {
    const schema = copyJsonSchema(["en", "sk"], ["Nuxt", "Supabase"]) as {
      properties: { title: { required: string[]; additionalProperties: boolean }; tags: { items: { enum?: string[] } } };
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.required).toEqual(["title", "summary", "description", "role", "tags"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.title).toMatchObject({ required: ["en", "sk"], additionalProperties: false });
    expect(schema.properties.tags.items.enum).toEqual(["Nuxt", "Supabase"]);
    expect((copyJsonSchema(["en"], []) as typeof schema).properties.tags.items.enum).toBeUndefined();
  });
});
