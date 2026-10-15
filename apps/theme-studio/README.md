# @japs/theme-studio

Studio theme: dark, wide type, the name spanning the full width and a project index with a screenshot that follows the cursor.

```bash
pnpm dev --theme studio          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme studio  # static site in apps/theme-studio/dist/
```

Pick it for good with `"theme": "studio"` in `japs.config.json` (or in the editor); `japs publish` then deploys it. Data, locales and helpers come from [`@japs/theme-kit`](../../packages/theme-kit) (ADR 0010).

- **Motion:** [GSAP](https://gsap.com) (ScrollTrigger, SplitText), bundled. The name is fitted to the width, a tag strip reacts to scroll speed, a tilted preview trails the cursor over the project rows (pointer devices; touch shows inline thumbnails). Everything is readable without JS, and `prefers-reduced-motion` turns the animations off.
- **Fonts:** Archivo (variable, with width) and DM Mono, self-hosted via Fontsource. No requests to third-party servers.
- **Profile:** `profile.email` adds the contact call to action, `profile.available` the availability badge.
