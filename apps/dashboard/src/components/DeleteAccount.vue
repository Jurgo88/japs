<script setup lang="ts">
import { ref } from "vue";
import { account, backend } from "../store.ts";

/** Hosted only (#36): deletes the account and all its data on the server. */

const confirm = ref("");
const busy = ref(false);
const error = ref<string | null>(null);

async function remove(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await backend.deleteAccount(confirm.value.trim());
    location.assign("/?deleted=1");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="account" class="card">
    <h2>Delete account</h2>
    <p>
      Deletes your account, connections, keys, imported projects and texts from JAPS, and revokes its GitHub access.
      This can't be undone. A portfolio you published stays on your Netlify. See <a href="/privacy">Privacy</a> for
      the apps to remove on GitHub and Netlify too.
    </p>
    <label>
      Type <code>{{ account.user.login }}</code> to confirm
      <input v-model="confirm" type="text" autocomplete="off" spellcheck="false" />
    </label>
    <p>
      <button class="btn danger" :disabled="busy || confirm.trim() !== account.user.login" @click="remove()">
        {{ busy ? "Deleting…" : "Delete my account" }}
      </button>
    </p>
    <p v-if="error" class="err">{{ error }}</p>
  </section>
</template>

<style scoped>
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  display: grid;
  gap: 12px;
}
h2 { margin: 0; font-size: 18px; }
p { margin: 0; }
label { display: grid; gap: 4px; font-weight: 600; max-width: 360px; }
.btn.danger { border-color: var(--danger); color: var(--danger); }
.btn.danger:not(:disabled):hover { background: var(--danger); color: #fff; }
.err { color: var(--danger); }
</style>
