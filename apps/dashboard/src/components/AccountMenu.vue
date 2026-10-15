<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { account, publishing, signOut } from "../store.ts";

/** Avatar menu (hosted): who is signed in, Settings, the live portfolio, legal links, sign out. */

const emit = defineEmits<{ settings: [] }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const firstItem = ref<HTMLElement | null>(null);

const user = computed(() => account.value?.user);
const initials = computed(() => (user.value?.name ?? user.value?.login ?? "?").slice(0, 1).toUpperCase());
/** The last live (non-draft) publish, so "View portfolio" opens the real site. */
const liveUrl = computed(() => (publishing.value?.status === "live" && !publishing.value.draft ? (publishing.value.url ?? publishing.value.siteUrl) : null));

function onDocument(e: Event): void {
  if (root.value && !root.value.contains(e.target as Node)) close();
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") close(true);
}
async function toggle(): Promise<void> {
  open.value = !open.value;
  if (open.value) {
    document.addEventListener("pointerdown", onDocument);
    document.addEventListener("keydown", onKey);
    await nextTick();
    firstItem.value?.focus();
  } else {
    close();
  }
}
function close(refocus = false): void {
  open.value = false;
  document.removeEventListener("pointerdown", onDocument);
  document.removeEventListener("keydown", onKey);
  if (refocus) root.value?.querySelector<HTMLElement>(".trigger")?.focus();
}
onBeforeUnmount(() => close());

function openSettings(): void {
  close();
  emit("settings");
}
</script>

<template>
  <div v-if="user" ref="root" class="account">
    <button class="trigger" type="button" aria-haspopup="menu" :aria-expanded="open" :title="user.login" @click="toggle()">
      <img v-if="user.avatarUrl" :src="user.avatarUrl" alt="" />
      <span v-else class="initials">{{ initials }}</span>
      <svg class="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
    </button>

    <div v-if="open" class="menu" role="menu">
      <div class="who">
        <strong>{{ user.name ?? user.login }}</strong>
        <span class="muted">@{{ user.login }}</span>
      </div>
      <button ref="firstItem" role="menuitem" type="button" @click="openSettings()">Settings</button>
      <a v-if="liveUrl" role="menuitem" :href="liveUrl" target="_blank" rel="noopener" @click="close()">View portfolio ↗</a>
      <div class="sep" />
      <a role="menuitem" href="/privacy" target="_blank" @click="close()">Privacy</a>
      <a role="menuitem" href="/terms" target="_blank" @click="close()">Terms</a>
      <div class="sep" />
      <button role="menuitem" type="button" @click="signOut()">Sign out</button>
    </div>
  </div>
</template>

<style scoped>
.account { position: relative; }
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 2px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel);
  cursor: pointer;
}
.trigger:hover, .trigger[aria-expanded="true"] { border-color: var(--accent); }
.trigger img, .initials { width: 28px; height: 28px; border-radius: 50%; }
.initials { display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.chevron { color: var(--muted); }
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 220px;
  padding: 6px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.12);
  display: grid;
  z-index: 20;
}
.who { display: grid; padding: 8px 10px 10px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
.who .muted { font-size: 12px; }
.menu > button, .menu > a {
  text-align: left;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}
.menu > button:hover, .menu > a:hover, .menu > button:focus-visible, .menu > a:focus-visible { background: var(--accent-soft); outline: none; }
.sep { height: 1px; background: var(--border); margin: 4px 0; }
</style>
