# @japs/theme-terminal

Terminal shows the portfolio as a shell session on a retro CRT: scanlines, phosphor glow and a vignette. The home page is a transcript (`whoami`, `cat about.txt`, `ls -l ~/projects`, `stack --top`, `contact`) and ends in a working prompt; project pages are `cat README.md` for that project, its screenshots, notes and `ls ..` to move on.

```bash
pnpm dev --theme terminal          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme terminal  # static site in apps/theme-terminal/dist/
```

Choose it with `"theme": "terminal"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- The prompt understands `help`, `whoami`, `about`, `ls`, `open <name|number>` (also `cd`, `cat`), `stack`, `contact`, `theme green|amber|white`, `lang <locale>`, `clear` (Ctrl+L), `history`, `pwd`, `date`, `echo`, plus a few jokes (`sudo`, `exit`, `hire`). Arrow keys walk the history; Tab completes commands, project names, schemes and languages.
- The colour scheme (green, amber or white phosphor) is remembered in the browser; screenshots are tinted to match and show in full colour on hover. Desktop and mobile screenshots sit side by side on project pages.
- The transcript prints block by block on the first page of a session (not with `prefers-reduced-motion`). Without JavaScript the prompt is hidden and the transcript already links everything.
- The user name in the prompt is the first name in lowercase ASCII. English, Slovak, Czech and German output is included; JetBrains Mono is bundled locally.
