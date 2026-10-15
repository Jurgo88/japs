# @japs/theme-editorial

Editorial theme: serif type on paper, the name set like a magazine cover, projects as chapters.

```bash
pnpm dev --theme editorial          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme editorial  # static site in apps/theme-editorial/dist/
```

Pick it for good with `"theme": "editorial"` in `japs.config.json` (or in the editor); `japs publish` then deploys it. Data, locales and helpers come from [`@japs/theme-kit`](../../packages/theme-kit) (ADR 0010).

- **Motion:** [GSAP](https://gsap.com) (ScrollTrigger, SplitText), bundled. Letters rise out of their lines, screenshots open like a curtain and drift while scrolling. Everything is readable without JS, and `prefers-reduced-motion` turns the animations off.
- **Fonts:** Fraunces (variable, with optical size) and JetBrains Mono, self-hosted via Fontsource. No requests to third-party servers.
- **Profile:** `profile.email` adds the contact call to action, `profile.available` the availability badge.
