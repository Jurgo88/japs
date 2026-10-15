import type { RepoFacts, SiteFacts, TechCategory, TechFact } from "@japs/schema";

type Tech = { name: string; category: TechCategory };
const t = (name: string, category: TechCategory): Tech => ({ name, category });

/**
 * npm package -> technology. Data, not logic: extend freely. Keys ending in "/" match a scope
 * prefix. Tooling noise (eslint, prettier, @types/*) is deliberately absent.
 */
export const DEPENDENCY_TECH: Record<string, Tech> = {
  // Frameworks
  vue: t("Vue", "framework"),
  nuxt: t("Nuxt", "framework"),
  react: t("React", "framework"),
  next: t("Next.js", "framework"),
  astro: t("Astro", "framework"),
  svelte: t("Svelte", "framework"),
  "@sveltejs/kit": t("SvelteKit", "framework"),
  "@angular/core": t("Angular", "framework"),
  "solid-js": t("Solid", "framework"),
  "@remix-run/react": t("Remix", "framework"),
  gatsby: t("Gatsby", "framework"),
  "@11ty/eleventy": t("Eleventy", "framework"),
  express: t("Express", "backend"),
  fastify: t("Fastify", "backend"),
  hono: t("Hono", "backend"),
  "@nestjs/core": t("NestJS", "backend"),
  electron: t("Electron", "framework"),
  "react-native": t("React Native", "framework"),
  "@capacitor/core": t("Capacitor", "framework"),
  // Libraries
  "vue-router": t("Vue Router", "library"),
  pinia: t("Pinia", "library"),
  vuex: t("Vuex", "library"),
  "@tanstack/vue-query": t("TanStack Query", "library"),
  "@tanstack/react-query": t("TanStack Query", "library"),
  "vue-i18n": t("Vue I18n", "library"),
  "@nuxtjs/i18n": t("Nuxt I18n", "library"),
  "@vueuse/core": t("VueUse", "library"),
  redux: t("Redux", "library"),
  "@reduxjs/toolkit": t("Redux", "library"),
  zod: t("Zod", "library"),
  axios: t("Axios", "library"),
  three: t("Three.js", "library"),
  d3: t("D3", "library"),
  "chart.js": t("Chart.js", "library"),
  echarts: t("ECharts", "library"),
  gsap: t("GSAP", "library"),
  leaflet: t("Leaflet", "library"),
  "mapbox-gl": t("Mapbox", "library"),
  "socket.io": t("Socket.IO", "library"),
  "socket.io-client": t("Socket.IO", "library"),
  graphql: t("GraphQL", "library"),
  "@apollo/client": t("Apollo", "library"),
  // UI kits
  vuetify: t("Vuetify", "ui"),
  primevue: t("PrimeVue", "ui"),
  "element-plus": t("Element Plus", "ui"),
  quasar: t("Quasar", "ui"),
  "naive-ui": t("Naive UI", "ui"),
  "@nuxt/ui": t("Nuxt UI", "ui"),
  "@headlessui/vue": t("Headless UI", "ui"),
  "@headlessui/react": t("Headless UI", "ui"),
  "@mui/material": t("Material UI", "ui"),
  "@chakra-ui/react": t("Chakra UI", "ui"),
  "shadcn-vue": t("shadcn/ui", "ui"),
  // Styling
  tailwindcss: t("Tailwind CSS", "styling"),
  "@nuxtjs/tailwindcss": t("Tailwind CSS", "styling"),
  "@tailwindcss/vite": t("Tailwind CSS", "styling"),
  bootstrap: t("Bootstrap", "styling"),
  sass: t("Sass", "styling"),
  "sass-embedded": t("Sass", "styling"),
  "styled-components": t("styled-components", "styling"),
  unocss: t("UnoCSS", "styling"),
  // Backend, data, services
  "@supabase/supabase-js": t("Supabase", "service"),
  "@nuxtjs/supabase": t("Supabase", "service"),
  firebase: t("Firebase", "service"),
  "firebase-admin": t("Firebase", "service"),
  "@prisma/client": t("Prisma", "backend"),
  prisma: t("Prisma", "backend"),
  "drizzle-orm": t("Drizzle ORM", "backend"),
  mongoose: t("MongoDB", "backend"),
  mongodb: t("MongoDB", "backend"),
  pg: t("PostgreSQL", "backend"),
  "better-sqlite3": t("SQLite", "backend"),
  stripe: t("Stripe", "service"),
  "@stripe/stripe-js": t("Stripe", "service"),
  openai: t("OpenAI API", "service"),
  "@anthropic-ai/sdk": t("Claude API", "service"),
  "@google/generative-ai": t("Gemini API", "service"),
  "@sentry/": t("Sentry", "service"),
  resend: t("Resend", "service"),
  nodemailer: t("Nodemailer", "library"),
  "@sendgrid/mail": t("SendGrid", "service"),
  "@netlify/functions": t("Netlify Functions", "hosting"),
  "@netlify/blobs": t("Netlify Blobs", "hosting"),
  "@vercel/": t("Vercel", "hosting"),
  "@playwright/test": t("Playwright", "testing"),
  playwright: t("Playwright", "testing"),
  puppeteer: t("Puppeteer", "library"),
  // Testing and tooling (only the ones worth mentioning)
  vitest: t("Vitest", "testing"),
  jest: t("Jest", "testing"),
  cypress: t("Cypress", "testing"),
  "@vue/test-utils": t("Vue Test Utils", "testing"),
  "@testing-library/": t("Testing Library", "testing"),
  typescript: t("TypeScript", "language"),
  vite: t("Vite", "tooling"),
  webpack: t("webpack", "tooling"),
  storybook: t("Storybook", "tooling"),
  "@storybook/": t("Storybook", "tooling"),
  "vite-plugin-pwa": t("PWA", "tooling"),
  "@vite-pwa/nuxt": t("PWA", "tooling"),
};

/** GitHub linguist language -> technology. Markup and config languages are skipped. */
const LANGUAGE_TECH: Record<string, Tech> = {
  TypeScript: t("TypeScript", "language"),
  JavaScript: t("JavaScript", "language"),
  Vue: t("Vue", "framework"),
  Svelte: t("Svelte", "framework"),
  Astro: t("Astro", "framework"),
  PHP: t("PHP", "language"),
  Python: t("Python", "language"),
  Go: t("Go", "language"),
  Rust: t("Rust", "language"),
  Java: t("Java", "language"),
  Kotlin: t("Kotlin", "language"),
  Swift: t("Swift", "language"),
  Dart: t("Dart", "language"),
  "C#": t("C#", "language"),
  Ruby: t("Ruby", "language"),
  SCSS: t("Sass", "styling"),
  PLpgSQL: t("PostgreSQL", "backend"),
};

/** Netlify `framework` values -> technology. */
const NETLIFY_FRAMEWORK_TECH: Record<string, Tech> = {
  nuxt: t("Nuxt", "framework"),
  vite: t("Vite", "tooling"),
  vue: t("Vue", "framework"),
  astro: t("Astro", "framework"),
  "next-js": t("Next.js", "framework"),
  next: t("Next.js", "framework"),
  gatsby: t("Gatsby", "framework"),
  sveltekit: t("SvelteKit", "framework"),
  angular: t("Angular", "framework"),
  remix: t("Remix", "framework"),
  eleventy: t("Eleventy", "framework"),
  hugo: t("Hugo", "framework"),
  "create-react-app": t("React", "framework"),
};

/** GitHub topics -> technology, for the common spellings. */
const TOPIC_TECH: Record<string, Tech> = {
  vue: t("Vue", "framework"),
  vuejs: t("Vue", "framework"),
  vue3: t("Vue", "framework"),
  nuxt: t("Nuxt", "framework"),
  nuxtjs: t("Nuxt", "framework"),
  nuxt3: t("Nuxt", "framework"),
  react: t("React", "framework"),
  reactjs: t("React", "framework"),
  nextjs: t("Next.js", "framework"),
  astro: t("Astro", "framework"),
  svelte: t("Svelte", "framework"),
  supabase: t("Supabase", "service"),
  firebase: t("Firebase", "service"),
  tailwindcss: t("Tailwind CSS", "styling"),
  typescript: t("TypeScript", "language"),
  netlify: t("Netlify", "hosting"),
};

export function techForDependency(dep: string): Tech | undefined {
  const exact = DEPENDENCY_TECH[dep];
  if (exact) return exact;
  const scope = dep.startsWith("@") ? `${dep.split("/")[0]}/` : undefined;
  return scope ? DEPENDENCY_TECH[scope] : undefined;
}

/** Languages below this share of code (percent) are not reported as tech. */
const MIN_LANGUAGE_SHARE = 5;

const CATEGORY_ORDER: TechCategory[] = [
  "framework",
  "language",
  "library",
  "ui",
  "styling",
  "backend",
  "service",
  "hosting",
  "testing",
  "tooling",
];

/** Union of technologies across a project's repos and sites, each with its evidence. */
export function deriveTech(repos: RepoFacts[], sites: SiteFacts[]): TechFact[] {
  const found = new Map<string, TechFact>();
  const add = (tech: Tech | undefined, evidence: string) => {
    if (!tech) return;
    const entry = found.get(tech.name) ?? { name: tech.name, category: tech.category, evidence: [] };
    if (!entry.evidence.includes(evidence)) entry.evidence.push(evidence);
    found.set(tech.name, entry);
  };

  for (const repo of repos) {
    for (const pkg of repo.packages) {
      for (const dep of [...pkg.dependencies, ...pkg.devDependencies]) add(techForDependency(dep), `dependency:${dep}`);
    }
    // Small shares are build scripts and leftovers, not the project's stack.
    for (const [language, share] of Object.entries(repo.languages)) {
      if (share >= MIN_LANGUAGE_SHARE) add(LANGUAGE_TECH[language], `language:${language}:${share}%`);
    }
    if (repo.primaryLanguage) add(LANGUAGE_TECH[repo.primaryLanguage], `language:${repo.primaryLanguage}:primary`);
    for (const topic of repo.topics) add(TOPIC_TECH[topic.toLowerCase()], `topic:${topic}`);
  }

  for (const site of sites) {
    if (site.provider === "cloudflare") {
      add(t("Cloudflare Pages", "hosting"), `cloudflare:site:${site.domain}`);
      continue;
    }
    add(t("Netlify", "hosting"), `netlify:site:${site.domain}`);
    if (site.framework) add(NETLIFY_FRAMEWORK_TECH[site.framework.toLowerCase()], `netlify:framework:${site.framework}`);
    const handWritten = site.deploy?.functions.filter((f) => !f.generator) ?? [];
    if (handWritten.length) add(t("Netlify Functions", "hosting"), `netlify:functions:${handWritten.length}`);
    if (site.deploy?.scheduledFunctions.length) add(t("Netlify Scheduled Functions", "hosting"), "netlify:schedules");
    if (site.deploy?.edgeFunctions) add(t("Netlify Edge Functions", "hosting"), "netlify:edge-functions");
  }

  return [...found.values()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name),
  );
}
