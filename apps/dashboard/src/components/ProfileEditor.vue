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

const AVAILABILITY = [
  { value: undefined, label: "Don't show" },
  { value: true, label: "Available" },
  { value: false, label: "Not taking projects" },
] as const;

function setAvailable(available: boolean | undefined): void {
  edit((p) => (available === undefined ? delete p.available : (p.available = available)));
}

const headline = computed(() => profile.value.headline[editLocale.value]?.trim() ?? "");
const bio = computed(() => profile.value.bio[editLocale.value]?.trim() ?? "");
const initials = computed(
  () =>
    profile.value.name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toLocaleUpperCase())
      .join("") || "?",
);
const shownLinks = computed(() => (profile.value.links ?? []).filter((l) => l.label.trim() && l.url.trim()));

/** Rough guide for the bio: themes show it in the hero, where short reads better. */
const BIO_SOFT_LIMIT = 320;
</script>

<template>
  <div class="with-aside">
    <section class="card editor">
      <header class="card-head">
        <h2>Profile</h2>
        <p class="muted">The introduction at the top of your portfolio.</p>
      </header>

      <div class="group">
        <div class="group-intro">
          <h3>About you</h3>
          <p class="muted">Who you are and what you do. Headline and bio are written per language.</p>
          <LocaleTabs :status="localeStatus" />
        </div>
        <div class="group-fields">
          <div class="row">
            <label class="field">
              <span>Name</span>
              <input type="text" autocomplete="name" :value="profile.name" placeholder="Jane Doe" @input="edit((p) => (p.name = value($event)))" />
            </label>
            <label class="field">
              <span>Headline <span class="lang">{{ editLocale.toUpperCase() }}</span></span>
              <input
                :key="`headline-${editLocale}`"
                type="text"
                :value="profile.headline[editLocale] ?? ''"
                placeholder="e.g. Full-stack developer building fast web apps"
                @input="edit((p) => (p.headline[editLocale] = value($event)))"
              />
            </label>
          </div>
          <label class="field">
            <span class="label-row">
              <span>Bio <span class="lang">{{ editLocale.toUpperCase() }}</span></span>
              <span class="count" :class="{ over: (profile.bio[editLocale]?.length ?? 0) > BIO_SOFT_LIMIT }">
                {{ profile.bio[editLocale]?.length ?? 0 }} / {{ BIO_SOFT_LIMIT }}
              </span>
            </span>
            <textarea
              :key="`bio-${editLocale}`"
              :value="profile.bio[editLocale] ?? ''"
              rows="5"
              placeholder="A few sentences about what you do and what you're good at."
              @input="edit((p) => (p.bio[editLocale] = value($event)))"
            />
          </label>
        </div>
      </div>

      <div class="group">
        <div class="group-intro">
          <h3>Contact</h3>
          <p class="muted">All optional. The email becomes the call to action; availability is a badge in themes that show one.</p>
        </div>
        <div class="group-fields">
          <div class="row">
            <label class="field">
              <span>Location</span>
              <input
                type="text"
                :value="profile.location ?? ''"
                placeholder="e.g. Bratislava, Slovakia"
                @input="edit((p) => (p.location = value($event).trim() || null))"
              />
            </label>
            <label class="field">
              <span>Contact email</span>
              <input
                type="email"
                autocomplete="email"
                :value="profile.email ?? ''"
                placeholder="you@example.com"
                @input="edit((p) => (value($event).trim() ? (p.email = value($event).trim()) : delete p.email))"
              />
            </label>
          </div>
          <div class="field" role="radiogroup" aria-labelledby="availability-label">
            <span id="availability-label">Availability</span>
            <div class="segmented">
              <label v-for="opt in AVAILABILITY" :key="String(opt.value)" :class="{ active: profile.available === opt.value }">
                <input type="radio" name="availability" :checked="profile.available === opt.value" @change="setAvailable(opt.value)" />
                <span v-if="opt.value !== undefined" class="status-dot" :class="opt.value ? 'on' : 'off'" aria-hidden="true" />
                {{ opt.label }}
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-intro">
          <h3>Links</h3>
          <p class="muted">GitHub, LinkedIn, your blog… shown in the header or footer, depending on the theme.</p>
        </div>
        <div class="group-fields">
          <div v-if="profile.links?.length" class="links">
            <div v-for="(link, i) in profile.links" :key="i" class="link">
              <input
                type="text"
                list="link-labels"
                :value="link.label"
                placeholder="Label"
                :aria-label="`Link ${i + 1} label`"
                @input="edit((p) => (p.links![i]!.label = value($event)))"
              />
              <input
                type="url"
                :value="link.url"
                placeholder="https://…"
                :aria-label="`Link ${i + 1} URL`"
                @input="edit((p) => (p.links![i]!.url = value($event)))"
              />
              <button class="icon-btn" type="button" :aria-label="`Remove ${link.label || 'link'}`" title="Remove" @click="edit((p) => p.links!.splice(i, 1))">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
              </button>
            </div>
          </div>
          <button class="add" type="button" @click="edit((p) => (p.links = [...(p.links ?? []), { label: '', url: '' }]))">+ Add link</button>
          <datalist id="link-labels">
            <option v-for="l in LINK_LABELS" :key="l" :value="l" />
          </datalist>
        </div>
      </div>
    </section>

    <aside class="aside">
      <section class="card preview" aria-label="Profile preview">
        <header class="preview-head">
          <span class="eyebrow">Preview · {{ editLocale.toUpperCase() }}</span>
        </header>
        <div class="hero">
          <div class="avatar" aria-hidden="true">{{ initials }}</div>
          <div class="who">
            <strong :class="{ placeholder: !profile.name.trim() }">{{ profile.name.trim() || "Your name" }}</strong>
            <span :class="{ placeholder: !headline }">{{ headline || "Your headline" }}</span>
          </div>
        </div>
        <div v-if="profile.available !== undefined || profile.location" class="meta">
          <span v-if="profile.available !== undefined" class="pill" :class="profile.available ? 'on' : 'off'">
            <span class="status-dot" :class="profile.available ? 'on' : 'off'" aria-hidden="true" />
            {{ profile.available ? "Available for projects" : "Not taking projects" }}
          </span>
          <span v-if="profile.location" class="muted">{{ profile.location }}</span>
        </div>
        <p class="bio" :class="{ placeholder: !bio }">{{ bio || "Your bio appears here." }}</p>
        <div v-if="shownLinks.length || profile.email" class="cta">
          <span v-if="profile.email" class="btn primary small">Get in touch</span>
          <span v-for="(l, i) in shownLinks" :key="i" class="chip">{{ l.label }}</span>
        </div>
        <p class="muted note">A sketch of the content — the theme decides the final look.</p>
      </section>
      <slot name="aside" />
    </aside>
  </div>
</template>

<style scoped>
.editor { gap: 0; padding: 0; }
.editor > .card-head { padding: 20px 24px 18px; border-bottom: 1px solid var(--border); }

/* Settings rows: description on the left, fields on the right. */
.group {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  gap: 16px 32px;
  padding: 22px 24px;
}
.group + .group { border-top: 1px solid var(--border); }
.group-intro { display: grid; gap: 6px; align-content: start; justify-items: start; }
.group-intro h3 { margin: 0; font-size: 14px; font-weight: 650; }
.group-intro p { margin: 0 0 4px; font-size: 13px; }
.group-fields { display: grid; gap: 16px; min-width: 0; }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }

.field { display: grid; gap: 6px; }
.field > span, .label-row { font-weight: 600; font-size: 13px; }
.label-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.lang { font-size: 11px; font-weight: 700; color: var(--muted); margin-left: 4px; }
.count { font-size: 12px; font-weight: 500; color: var(--muted); font-variant-numeric: tabular-nums; }
.count.over { color: var(--warn); }
input, textarea, select { transition: border-color 0.15s, box-shadow 0.15s; }
input:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.segmented {
  display: inline-flex;
  flex-wrap: wrap;
  justify-self: start;
  gap: 2px;
  padding: 3px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.segmented label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.segmented label.active { background: var(--panel); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.segmented label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
.segmented input { position: absolute; opacity: 0; pointer-events: none; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.status-dot.on { background: var(--ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 20%, transparent); }
.status-dot.off { background: var(--muted); }

.links { display: grid; gap: 8px; }
.link { display: grid; grid-template-columns: minmax(120px, 200px) minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.icon-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.icon-btn:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, transparent); }
.add {
  padding: 9px 12px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: none;
  color: var(--muted);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.add:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

/* Preview */
.preview { gap: 14px; overflow: hidden; }
.preview-head { margin: -20px -22px 0; padding: 10px 22px; background: var(--bg); border-bottom: 1px solid var(--border); }
.eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.hero { display: flex; gap: 14px; align-items: center; }
.avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 45%, var(--ok)));
  color: var(--on-accent);
  font-weight: 700;
  font-size: 18px;
}
.who { display: grid; gap: 2px; min-width: 0; }
.who strong { font-size: 17px; line-height: 1.25; }
.who span { color: var(--muted); font-size: 13px; }
.who > * { overflow-wrap: anywhere; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; font-size: 12px; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px 2px 8px; border-radius: 999px; font-weight: 600; border: 1px solid var(--border); }
.pill.on { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 35%, transparent); }
.pill.off { color: var(--muted); }
.bio { margin: 0; font-size: 13px; white-space: pre-line; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden; }
.cta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cta .btn { cursor: default; }
.chip { font-size: 12px; padding: 2px 10px; border: 1px solid var(--border); border-radius: 999px; }
.placeholder { color: var(--muted); font-style: italic; opacity: 0.75; }
.note { margin: 0; font-size: 12px; }

@media (max-width: 760px) {
  .group { grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 18px 16px; }
  .editor > .card-head { padding: 18px 16px 14px; }
  .segmented { display: grid; justify-self: stretch; }
  .link { grid-template-columns: minmax(0, 1fr) auto; }
  .link input[type="url"] { grid-column: 1; }
  .link .icon-btn { grid-row: 1 / span 2; grid-column: 2; }
}
</style>
