<script setup lang="ts">
import type { PublishTarget } from "@japs/schema";
import { computed } from "vue";
import { account, draft, isCloud, update } from "../store.ts";

/** Where Publish puts the portfolio (ADR 0012). Saved in the config like the theme. */

const target = computed<PublishTarget>(() => draft.value.publish?.target ?? "netlify");
const connected = (provider: string) => account.value?.connections.some((c) => c.provider === provider) ?? false;

const options = computed(() => [
  {
    id: "netlify" as const,
    label: "Netlify",
    hint: "A site <name>-portfolio.netlify.app in your Netlify account.",
    ready: !isCloud.value || connected("netlify"),
    connect: "/auth/netlify/connect",
  },
  {
    id: "cloudflare" as const,
    label: "Cloudflare Pages",
    hint: "A project <name>-portfolio.pages.dev in your Cloudflare account.",
    ready: !isCloud.value || connected("cloudflare"),
    connect: account.value?.cloudflareAvailable ? "/auth/cloudflare/connect" : null,
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
    <div class="options">
      <label v-for="o in options" :key="o.id" class="option" :class="{ active: target === o.id }">
        <input type="radio" name="publish-target" :checked="target === o.id" @change="choose(o.id)" />
        <span>
          <strong>{{ o.label }}</strong>
          <span class="muted"> · {{ o.hint }}</span>
          <template v-if="!o.ready">
            <br />
            <a v-if="o.connect" :href="o.connect">Connect {{ o.label === "Netlify" ? "Netlify" : "Cloudflare" }}</a>
            <span v-else class="muted">Not available on this server.</span>
            <span class="muted"> to publish here.</span>
          </template>
        </span>
      </label>
    </div>
    <p v-if="!isCloud" class="muted small">
      Locally, Netlify needs NETLIFY_TOKEN and Cloudflare Pages needs CLOUDFLARE_API_TOKEN (Pages: Edit) in .env.
    </p>
  </section>
</template>

<style scoped>
.options { display: grid; gap: 8px; }
.option { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
.option.active { border-color: var(--accent); }
.option input { margin-top: 3px; }
.small { font-size: 12px; }
</style>
