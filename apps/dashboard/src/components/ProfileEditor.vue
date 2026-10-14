<script setup lang="ts">
import type { JapsConfigInput } from "@japs/schema";
import { computed } from "vue";
import { draft, locales, update } from "../store.ts";

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
</script>

<template>
  <section class="card">
    <h2>Profile</h2>
    <p class="muted">Shown at the top of the portfolio. Texts for every language: {{ locales.join(", ") }}.</p>

    <label class="field">
      <span>Name</span>
      <input type="text" :value="profile.name" @change="edit((p) => (p.name = value($event)))" />
    </label>

    <div class="field">
      <span>Headline</span>
      <div v-for="l in locales" :key="l" class="row">
        <span class="locale">{{ l.toUpperCase() }}</span>
        <input type="text" :value="profile.headline[l] ?? ''" @change="edit((p) => (p.headline[l] = value($event)))" />
      </div>
    </div>

    <div class="field">
      <span>Bio</span>
      <div v-for="l in locales" :key="l" class="row">
        <span class="locale">{{ l.toUpperCase() }}</span>
        <textarea :value="profile.bio[l] ?? ''" rows="3" @change="edit((p) => (p.bio[l] = value($event)))" />
      </div>
    </div>

    <label class="field">
      <span>Location <span class="muted">(optional)</span></span>
      <input type="text" :value="profile.location ?? ''" @change="edit((p) => (p.location = value($event).trim() || null))" />
    </label>

    <label class="field">
      <span>Contact email <span class="muted">(optional, shown as the call to action)</span></span>
      <input
        type="email"
        :value="profile.email ?? ''"
        placeholder="you@example.com"
        @change="edit((p) => (value($event).trim() ? (p.email = value($event).trim()) : delete p.email))"
      />
    </label>

    <label class="field">
      <span>Availability <span class="muted">(badge in themes that show one)</span></span>
      <select
        :value="profile.available === undefined ? '' : String(profile.available)"
        @change="edit((p) => (value($event) === '' ? delete p.available : (p.available = value($event) === 'true')))"
      >
        <option value="">Don't show</option>
        <option value="true">Available for projects</option>
        <option value="false">Not taking projects</option>
      </select>
    </label>

    <div class="field">
      <span>Links</span>
      <div v-for="(link, i) in profile.links ?? []" :key="i" class="link">
        <input type="text" :value="link.label" placeholder="Label" @change="edit((p) => (p.links![i]!.label = value($event)))" />
        <input type="url" :value="link.url" placeholder="https://…" @change="edit((p) => (p.links![i]!.url = value($event)))" />
        <button class="btn small" title="Remove" @click="edit((p) => p.links!.splice(i, 1))">✕</button>
      </div>
      <div>
        <button class="btn small" @click="edit((p) => (p.links = [...(p.links ?? []), { label: '', url: '' }]))">+ Add link</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  display: grid;
  gap: 16px;
}
h2 { margin: 0; }
p { margin: -8px 0 0; }
.field { display: grid; gap: 6px; }
.field > span { font-weight: 600; }
.row { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 8px; align-items: start; }
.locale { font-size: 11px; font-weight: 700; color: var(--muted); padding-top: 8px; }
.link { display: grid; grid-template-columns: 160px minmax(0, 1fr) auto; gap: 8px; }
</style>
