<script setup lang="ts">
import type { JapsConfigInput } from "@japs/schema";
import { computed } from "vue";
import { draft, editLocale, locales, update } from "../store.ts";
import LocaleTabs from "./LocaleTabs.vue";

type Profile = NonNullable<JapsConfigInput["profile"]>;

const profile = computed<Profile>(() => ({
  name: "",
  headline: {},
  bio: {},
  location: null,
  links: [],
  ...draft.value.profile,
}));

function edit(change: (p: Profile) => void): void {
  update((c) => {
    // JSON copy: profile.value holds Vue proxies, which structuredClone rejects.
    const next = JSON.parse(JSON.stringify(profile.value)) as Profile;
    change(next);
    return { ...c, profile: next };
  });
}

const value = (e: Event) => (e.target as HTMLInputElement).value;

/** Languages where the headline or bio is still empty (dot on the language tab). */
const localeStatus = computed(() =>
  Object.fromEntries(locales.value.map((l) => [l, !profile.value.headline[l]?.trim() || !profile.value.bio[l]?.trim() ? "missing" : null] as const)),
);

/** Common link labels, offered while typing; any label works. */
const LINK_LABELS = ["GitHub", "LinkedIn", "Website", "Blog", "X", "Mastodon", "Bluesky", "Dribbble", "Behance", "Stack Overflow", "YouTube"];
</script>

<template>
  <section class="card">
    <header class="card-head">
      <h2>Profile</h2>
      <p class="muted">The introduction at the top of your portfolio.</p>
    </header>

    <div class="section-head">
      <h3>About you</h3>
      <LocaleTabs :status="localeStatus" />
    </div>
    <label class="field">
      <span>Name</span>
      <input type="text" :value="profile.name" @change="edit((p) => (p.name = value($event)))" />
    </label>

    <label class="field">
      <span>Headline <span class="lang">{{ editLocale.toUpperCase() }}</span></span>
      <input
        :key="`headline-${editLocale}`"
        type="text"
        :value="profile.headline[editLocale] ?? ''"
        placeholder="e.g. Full-stack developer building fast web apps"
        @change="edit((p) => (p.headline[editLocale] = value($event)))"
      />
    </label>

    <label class="field">
      <span>Bio <span class="lang">{{ editLocale.toUpperCase() }}</span></span>
      <textarea
        :key="`bio-${editLocale}`"
        :value="profile.bio[editLocale] ?? ''"
        rows="4"
        placeholder="A few sentences about what you do and what you're good at."
        @change="edit((p) => (p.bio[editLocale] = value($event)))"
      />
    </label>

    <h3>Contact</h3>
    <div class="columns">
    <label class="field">
      <span>Location</span>
      <input type="text" :value="profile.location ?? ''" @change="edit((p) => (p.location = value($event).trim() || null))" />
    </label>

    <label class="field">
      <span>Contact email</span>
      <input
        type="email"
        :value="profile.email ?? ''"
        placeholder="you@example.com"
        @change="edit((p) => (value($event).trim() ? (p.email = value($event).trim()) : delete p.email))"
      />
    </label>

    <label class="field">
      <span>Availability</span>
      <select
        :value="profile.available === undefined ? '' : String(profile.available)"
        @change="edit((p) => (value($event) === '' ? delete p.available : (p.available = value($event) === 'true')))"
      >
        <option value="">Don't show</option>
        <option value="true">Available for projects</option>
        <option value="false">Not taking projects</option>
      </select>
    </label>
    </div>
    <p class="muted hint">All optional. The email becomes the call to action; availability is a badge in themes that show one.</p>

    <h3>Links</h3>
    <div class="field">
      <span class="muted hint">GitHub, LinkedIn, your blog… shown in the header or footer, depending on the theme.</span>
      <div v-for="(link, i) in profile.links ?? []" :key="i" class="link">
        <input type="text" list="link-labels" :value="link.label" placeholder="Label" @change="edit((p) => (p.links![i]!.label = value($event)))" />
        <input type="url" :value="link.url" placeholder="https://…" @change="edit((p) => (p.links![i]!.url = value($event)))" />
        <button class="btn small" :aria-label="`Remove ${link.label || 'link'}`" title="Remove" @click="edit((p) => p.links!.splice(i, 1))">✕</button>
      </div>
      <div>
        <button class="btn small" @click="edit((p) => (p.links = [...(p.links ?? []), { label: '', url: '' }]))">+ Add link</button>
      </div>
      <datalist id="link-labels">
        <option v-for="l in LINK_LABELS" :key="l" :value="l" />
      </datalist>
    </div>
  </section>
</template>

<style scoped>
h3 {
  margin: 8px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.field { display: grid; gap: 6px; }
.field > span { font-weight: 600; }
.field > span.hint, .hint { font-weight: 400; font-size: 13px; }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border); padding-top: 14px; margin-top: 8px; }
.section-head h3 { border: 0; padding: 0; margin: 0; }
.lang { font-size: 11px; font-weight: 700; color: var(--muted); margin-left: 4px; }
.link { display: grid; grid-template-columns: 160px minmax(0, 1fr) auto; gap: 8px; }
</style>
