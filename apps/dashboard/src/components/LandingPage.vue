<script setup lang="ts">
import "@fontsource-variable/archivo/wdth.css";
import { recordingAvailable, reviewRecording } from "../recording.ts";
import { status } from "../store.ts";

const accountDeleted = new URLSearchParams(location.search).has("deleted");

const SHOTS = ["vinyl", "terminal", "posters", "newspaper"];
const CHORES = [
  { chore: "Building the site", done: "Choose one of 22 finished designs." },
  { chore: "Writing about each project", done: "Texts come from the facts in your repos and live sites." },
  { chore: "Screenshotting every site", done: "Real desktop and mobile shots of what you deployed." },
  { chore: "Translating it all", done: "Every text in each language you add." },
  { chore: "Working out where to host it", done: "Your japs.app address, Netlify or Cloudflare Pages." },
];
</script>

<template>
  <div class="landing">
    <div class="hero">
      <div class="wrap hero-inner">
        <nav class="nav" aria-label="Main">
          <span class="wordmark">JAPS</span>
          <div class="nav-links">
            <a href="https://jurgo.japs.app">See a live portfolio</a>
            <a class="strong" href="/auth/github/login">Sign in</a>
          </div>
        </nav>

        <p v-if="status.error" class="status-line error">{{ status.error }}</p>
        <p v-if="accountDeleted" class="status-line">Your account and all its data were deleted.</p>

        <h1>Your portfolio, minus <s class="strike">the part where you build your portfolio.</s></h1>

        <div class="hero-action">
          <a class="cta" href="/auth/github/login">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            Sign in with GitHub
          </a>
          <p>
            JAPS turns your Netlify and Cloudflare Pages sites and GitHub repos into a finished portfolio. GitHub access
            is read-only. By signing in you agree to the <a href="/terms">terms</a>.
          </p>
        </div>
      </div>
    </div>

    <main class="wrap body">
      <div class="shots" role="group" aria-label="Four of the 22 portfolio designs">
        <img
          v-for="id in SHOTS"
          :key="id"
          :src="`/landing/${id}.jpg`"
          :alt="`Sample portfolio in the ${id} theme`"
          width="800"
          height="500"
        />
      </div>

      <section class="lists" aria-labelledby="off-your-list">
        <div class="chores">
          <h2 id="off-your-list">Off your list</h2>
          <ul>
            <li v-for="c in CHORES" :key="c.chore">
              <s>{{ c.chore }}</s>
              <span>{{ c.done }}</span>
            </li>
          </ul>
        </div>

        <aside aria-labelledby="still-yours">
          <h2 id="still-yours">Still yours</h2>
          <ol>
            <li>Pick the projects.</li>
            <li>Pick the design.</li>
            <li>Press Publish.</li>
          </ol>
          <p>Private repos and client projects stay hidden until you show them. Nothing goes live until you say so.</p>
        </aside>
      </section>

      <section class="closing">
        <h2>Your work is done. Show it.</h2>
        <a class="cta" href="/auth/github/login">Sign in with GitHub</a>
      </section>
    </main>

    <footer class="wrap footer">
      <span>JAPS. Just Another Portfolio Site.</span>
      <span class="footer-links">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="https://github.com/Jurgo88/japs">GitHub</a>
        <a v-if="recordingAvailable" href="#" @click.prevent="reviewRecording()">Session recording</a>
      </span>
    </footer>
  </div>
</template>

<style scoped>
/* One fixed look in both color schemes: the blue field is the page's identity. */
.landing {
  --blue: #2563eb;
  --blue-ink: #123aa8;
  --ink: #0d1830;
  --ink-soft: #3b4660;
  --ground: #f4f5f7;
  --rule: #b8c0d0;
  --strike: #ffd84d;
  color-scheme: light;
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--ground);
  color: var(--ink);
  font: 18px/1.5 "Archivo Variable", "Arial Narrow", Arial, sans-serif;
}
.landing a { color: inherit; }
.landing a:hover { opacity: 0.8; }
.landing a:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
.landing h1, .landing h2 { margin: 0; font-weight: 800; font-stretch: 112%; }
.landing p { margin: 0; }
.wrap { max-width: 1320px; margin: 0 auto; padding-inline: clamp(16px, 4vw, 48px); }

.hero { padding-bottom: 150px; background: var(--blue); color: #fff; }
.hero-inner { display: flex; flex-direction: column; gap: clamp(40px, 5vw, 64px); }
.nav { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; padding-top: 24px; }
.wordmark { font-weight: 900; font-stretch: 125%; font-size: 24px; letter-spacing: 0.01em; }
.nav-links { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; font-weight: 500; }
.nav-links .strong { font-weight: 600; }
.status-line { padding: 12px 16px; background: #fff; color: var(--ink); }
.status-line.error { color: #b42318; }
h1 { font-size: clamp(46px, 8.3vw, 122px); line-height: 1.02; letter-spacing: -0.025em; }
.strike {
  text-decoration: none;
  background: linear-gradient(var(--strike), var(--strike)) no-repeat 0 56% / 100% 0.1em;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  animation: strike 0.9s cubic-bezier(0.6, 0, 0.2, 1) 0.5s backwards;
}
@keyframes strike { from { background-size: 0 0.1em; } }
.hero-action { display: flex; flex-wrap: wrap; gap: 24px 40px; align-items: center; }
.hero-action p { flex: 1 1 320px; max-width: 34em; text-wrap: pretty; }
.cta {
  display: inline-flex;
  gap: 12px;
  align-items: center;
  min-height: 60px;
  padding: 0 30px;
  background: #fff;
  font-weight: 700;
  font-size: 20px;
  text-decoration: none;
}
.landing a.cta { color: var(--blue-ink); }

.body { display: flex; flex-direction: column; gap: clamp(64px, 7vw, 104px); margin-top: -104px; }
.shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 18px; }
.shots img {
  display: block;
  width: 100%;
  height: auto;
  background: #fff;
  box-shadow: 0 14px 34px rgb(13 24 48 / 28%);
}
.shots img:nth-child(1) { rotate: -2deg; }
.shots img:nth-child(2) { rotate: 1.4deg; }
.shots img:nth-child(3) { rotate: -1deg; }
.shots img:nth-child(4) { rotate: 1.8deg; }

.lists { display: flex; flex-wrap: wrap; gap: 48px clamp(40px, 6vw, 96px); align-items: flex-start; }
.lists h2 { font-size: clamp(32px, 3.6vw, 48px); line-height: 1.05; letter-spacing: -0.02em; }
.chores { flex: 3 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.chores ul { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.chores li {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr));
  gap: 4px 32px;
  align-items: baseline;
  padding: 16px 0;
  border-top: 1px solid var(--rule);
}
.chores s {
  justify-self: start;
  text-decoration: none;
  background: linear-gradient(var(--strike), var(--strike)) no-repeat 0 58% / 100% 0.28em;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  font-weight: 600;
  font-size: 22px;
  line-height: 1.3;
}
.chores span { color: var(--ink-soft); }
.lists aside {
  flex: 2 1 320px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: clamp(24px, 3vw, 36px);
  background: var(--ink);
  color: #fff;
}
.lists aside h2 { font-size: clamp(28px, 2.8vw, 36px); line-height: 1.08; }
.lists aside ol {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-weight: 600;
  font-size: 24px;
  line-height: 1.25;
}
.lists aside p { color: #cfd6e4; font-size: 17px; }

.closing {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  padding: clamp(32px, 5vw, 64px);
  background: var(--blue);
  color: #fff;
}
.closing h2 { flex: 1 1 460px; font-size: clamp(32px, 4.4vw, 62px); line-height: 1.04; letter-spacing: -0.025em; text-wrap: balance; }

.footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  justify-content: space-between;
  margin-top: 40px;
  padding-bottom: 32px;
  color: var(--ink-soft);
  font-size: 15px;
}
.footer-links { display: flex; flex-wrap: wrap; gap: 20px; }

@media (prefers-reduced-motion: reduce) {
  .strike { animation: none; }
}
</style>
