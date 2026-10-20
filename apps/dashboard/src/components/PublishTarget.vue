<script setup lang="ts">
import type { PublishTarget } from "@japs/schema";
import { computed } from "vue";
import { account, draft, isCloud, site, update } from "../store.ts";
import SiteAddress from "./SiteAddress.vue";

/** Where Publish puts the portfolio (ADR 0012, 0013). Saved in the config like the theme. */

const target = computed<PublishTarget>(() => draft.value.publish?.target ?? "netlify");
const connected = (provider: string) => account.value?.connections.some((c) => c.provider === provider) ?? false;
/** japs.app exists only in the hosted version, on a server that hosts portfolios. */
const hosted = computed(() => isCloud.value && site.value?.available === true);
const address = computed(() => `${site.value?.site?.handle ?? site.value?.suggestion ?? "<name>"}.${site.value?.domain ?? "japs.app"}`);

/**
 * japs.app is always listed so it can be found; where it can't publish (locally, or a server
 * without hosting) it can't be picked, unless the config already chose it.
 */
const options = computed(() => [
  {
    id: "japs" as const,
    label: "japs.app",
    hint: `${hosted.value ? address.value : "<name>.japs.app"}, hosted by JAPS. No other account needed.`,
    ready: hosted.value,
    disabled: !hosted.value && target.value !== "japs",
    connect: null,
    unavailable: isCloud.value ? "Not available on this server." : null,
  },
  {
    id: "netlify" as const,
    label: "Netlify",
    hint: "A site <name>-portfolio.netlify.app in your Netlify account.",
    ready: !isCloud.value || connected("netlify"),
    disabled: false,
    connect: "/auth/netlify/connect",
    unavailable: "Not available on this server.",
  },
  {
    id: "cloudflare" as const,
    label: "Cloudflare Pages",
    hint: "A project <name>-portfolio.pages.dev in your Cloudflare account.",
    ready: !isCloud.value || connected("cloudflare"),
    disabled: false,
    connect: account.value?.cloudflareAvailable ? "/auth/cloudflare/connect" : null,
    unavailable: "Not available on this server.",
  },
]);

function choose(id: PublishTarget): void {
  update((c) => ({ ...c, publish: { ...c.publish, target: id } }));
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <h2>Publish to</h2>
      <p class="muted">JAPS creates its own site there on the first publish and only ever updates that one.</p>
    </header>
    <div class="options" role="radiogroup" aria-label="Publish to">
      <label v-for="o in options" :key="o.id" class="option" :class="{ active: target === o.id, disabled: o.disabled }">
        <input type="radio" name="publish-target" :checked="target === o.id" :disabled="o.disabled" @change="choose(o.id)" />
        <span class="logo" :class="o.id" aria-hidden="true">{{ o.id === "japs" ? "J" : o.label.slice(0, 2) }}</span>
        <span class="text">
          <strong>{{ o.label }}</strong>
          <span class="muted hint">{{ o.hint }}</span>
          <span v-if="!o.ready" class="state">
            <template v-if="o.connect">
              <a :href="o.connect">Connect {{ o.label === "Netlify" ? "Netlify" : "Cloudflare" }}</a>
              <span class="muted"> to publish here.</span>
            </template>
            <span v-else-if="o.unavailable" class="muted">{{ o.unavailable }}</span>
            <template v-else>
              <span class="muted">Only in the hosted editor at </span>
              <a href="https://japs.app" target="_blank" rel="noopener">japs.app ↗</a>
            </template>
          </span>
        </span>
        <span class="radio" aria-hidden="true" />
      </label>
    </div>
    <SiteAddress v-if="target === 'japs' && hosted" />
    <p v-if="!isCloud" class="muted small">
      Locally, Netlify needs NETLIFY_TOKEN and Cloudflare Pages needs CLOUDFLARE_API_TOKEN (Pages: Edit) in .env.
    </p>
  </section>
</template>

<style scoped>
.options { display: grid; gap: 8px; }
.option {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 18px;
  gap: 12px;
  align-items: start;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.option:not(.disabled):hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.option.disabled { cursor: default; background: var(--bg); border-style: dashed; }
.option.disabled .logo, .option.disabled strong, .option.disabled .radio { opacity: 0.55; }
.option.active { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.option input { position: absolute; opacity: 0; pointer-events: none; }
.option:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.text { display: grid; gap: 2px; min-width: 0; }
.hint { font-size: 13px; overflow-wrap: anywhere; }
.state { font-size: 13px; margin-top: 2px; }
.radio { width: 18px; height: 18px; margin-top: 2px; border-radius: 50%; border: 2px solid var(--border); }
.option.active .radio { border-color: var(--accent); background: radial-gradient(circle, var(--accent) 0 4px, transparent 4.5px); }
.small { font-size: 12px; margin: 0; }
</style>
