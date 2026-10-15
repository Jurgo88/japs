# @japs/theme-gallery

Gallery theme: playful, a big statement from the headline, count-up stats and projects in a gallery that scrolls sideways.

```bash
pnpm dev --theme gallery          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme gallery  # static site in apps/theme-gallery/dist/
```

Pick it for good with `"theme": "gallery"` in `japs.config.json` (or in the editor); `japs publish` then deploys it. Data, locales and helpers come from [`@japs/theme-kit`](../../packages/theme-kit) (ADR 0010).

- **Motion:** [GSAP](https://gsap.com) (ScrollTrigger, SplitText), bundled. The gallery is pinned and scrolled horizontally on desktop (a plain vertical list on phones and without JS), the availability sticker spins, the tag cloud tumbles in. Everything is readable without JS, and `prefers-reduced-motion` turns the animations off.
- **Fonts:** Bricolage Grotesque (variable), self-hosted via Fontsource. No requests to third-party servers.
- **Profile:** `profile.email` adds the contact call to action, `profile.available` the availability badge.
