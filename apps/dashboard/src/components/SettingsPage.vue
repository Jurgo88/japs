<script setup lang="ts">
import { computed } from "vue";
import { account, isCloud } from "../store.ts";
import AiSettings from "./AiSettings.vue";
import ConnectionsSettings from "./ConnectionsSettings.vue";
import DeleteAccount from "./DeleteAccount.vue";
import LocalSettings from "./LocalSettings.vue";

/**
 * Settings, behind the avatar menu (hosted) or the gear (local): account-level things, not
 * portfolio content. Locally there's no account; connections and AI come from .env.
 */

export type SettingsSection = "connections" | "ai" | "account";

const props = defineProps<{ section: SettingsSection }>();
const emit = defineEmits<{ navigate: [section: SettingsSection]; close: [] }>();

/** Icon paths (16×16, stroked) per section. */
const ICONS: Record<SettingsSection, string> = {
  connections: "M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1",
  ai: "M8 2.5l1.3 3.2 3.2 1.3-3.2 1.3L8 11.5 6.7 8.3 3.5 7l3.2-1.3zM12.5 11l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L10.5 13l1.5-.5z",
  account: "M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 13.5c.6-2.3 2.6-3.5 5-3.5s4.4 1.2 5 3.5",
};

const sections = computed<{ id: SettingsSection; label: string; hint: string }[]>(() => [
  { id: "connections", label: "Connections", hint: "Where projects come from" },
  { id: "ai", label: "AI texts", hint: "Model and limits" },
  ...(isCloud.value ? [{ id: "account" as const, label: "Account", hint: "Sign-in and data" }] : []),
]);
const user = computed(() => account.value?.user);
</script>

<template>
  <main class="settings page">
    <aside class="nav">
      <button class="back" type="button" @click="emit('close')">← Back to editor</button>
      <h1>Settings</h1>
      <nav aria-label="Settings">
        <button
          v-for="s in sections"
          :key="s.id"
          type="button"
          :class="{ active: props.section === s.id }"
          :aria-current="props.section === s.id ? 'page' : undefined"
          @click="emit('navigate', s.id)"
        >
          <svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path :d="ICONS[s.id]" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="label">
            {{ s.label }}
            <span class="muted">{{ s.hint }}</span>
          </span>
        </button>
      </nav>
    </aside>

    <div class="content">
      <LocalSettings v-if="!isCloud && props.section !== 'account'" :section="props.section" />
      <ConnectionsSettings v-else-if="props.section === 'connections'" />
      <AiSettings v-else-if="props.section === 'ai'" />
      <template v-else>
        <section v-if="user" class="card">
          <header class="card-head">
            <h2>Account</h2>
            <p class="muted">You sign in with GitHub. JAPS keeps no password.</p>
          </header>
          <div class="profile">
            <img v-if="user.avatarUrl" :src="user.avatarUrl" alt="" />
            <span v-else class="initials" aria-hidden="true">{{ (user.name ?? user.login).slice(0, 1).toUpperCase() }}</span>
            <span>
              <strong>{{ user.name ?? user.login }}</strong>
              <span class="muted">github.com/{{ user.login }}</span>
            </span>
          </div>
          <p class="muted small"><a href="/privacy" target="_blank">Privacy</a> · <a href="/terms" target="_blank">Terms</a></p>
        </section>
        <DeleteAccount />
      </template>
    </div>
  </main>
</template>

<style scoped>
.settings {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}
.nav { position: sticky; top: 72px; display: grid; gap: 8px; }
.nav h1 { margin: 4px 0 8px; font-size: 22px; }
.nav nav { display: grid; gap: 2px; }
.nav nav button, .back {
  text-align: left;
  border: 0;
  background: none;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
}
.nav nav button { display: flex; align-items: flex-start; gap: 10px; border: 1px solid transparent; }
.nav nav button .icon { flex: none; margin-top: 2px; color: var(--muted); }
.nav nav button .label { display: grid; line-height: 1.35; }
.nav nav button .label .muted { font-size: 12px; font-weight: 400; }
.nav nav button:hover { background: var(--panel); border-color: var(--border); }
.nav nav button.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.nav nav button.active .icon { color: var(--accent); }
.back { color: var(--muted); padding-left: 0; }
.back:hover { color: var(--text); }
.content { display: grid; gap: 16px; }
/* Long prose stays readable on wide screens. */
.content :deep(.card > p), .content :deep(.card-head p) { max-width: 80ch; }
.profile { display: flex; gap: 12px; align-items: center; }
.profile img, .initials { width: 48px; height: 48px; border-radius: 50%; }
.initials { display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-size: 20px; font-weight: 700; }
.profile > span:last-child { display: grid; }
.small { font-size: 12px; }
@media (max-width: 760px) {
  .settings { grid-template-columns: 1fr; }
  .nav { position: static; }
  .nav nav { display: flex; flex-wrap: wrap; }
  .nav nav button .label .muted { display: none; }
}
</style>
