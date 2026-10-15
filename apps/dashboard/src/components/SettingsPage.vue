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

const sections = computed<{ id: SettingsSection; label: string }[]>(() => [
  { id: "connections", label: "Connections" },
  { id: "ai", label: "AI texts" },
  ...(isCloud.value ? [{ id: "account" as const, label: "Account" }] : []),
]);
const user = computed(() => account.value?.user);
</script>

<template>
  <main class="settings">
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
          {{ s.label }}
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
  grid-template-columns: 220px minmax(0, 720px);
  gap: 24px;
  padding: 24px 20px;
  align-items: start;
}
.nav { position: sticky; top: 72px; display: grid; gap: 8px; }
.nav h1 { margin: 4px 0 8px; font-size: 22px; }
.nav nav { display: grid; gap: 2px; }
.nav nav button, .back {
  text-align: left;
  border: 0;
  background: none;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.nav nav button:hover { background: var(--panel); }
.nav nav button.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.back { color: var(--muted); padding-left: 0; }
.back:hover { color: var(--text); }
.content { display: grid; gap: 16px; }
.profile { display: flex; gap: 12px; align-items: center; }
.profile img, .initials { width: 48px; height: 48px; border-radius: 50%; }
.initials { display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-size: 20px; font-weight: 700; }
.profile > span:last-child { display: grid; }
.small { font-size: 12px; }
@media (max-width: 760px) {
  .settings { grid-template-columns: 1fr; }
  .nav { position: static; }
  .nav nav { display: flex; flex-wrap: wrap; }
}
</style>
