<script setup lang="ts">
import { computed, ref } from "vue";
import { account, disconnect } from "../store.ts";

/** Settings › Connections: where projects come from and where the portfolio goes. */

type Provider = "netlify" | "cloudflare";
const busy = ref<Provider | null>(null);
const error = ref<string | null>(null);

const connection = (provider: string) => account.value?.connections.find((c) => c.provider === provider) ?? null;

const rows = computed(() => [
  {
    id: "netlify" as const,
    name: "Netlify",
    role: "Sites to import, and a place to publish.",
    connection: connection("netlify"),
    connect: "/auth/netlify/connect",
    manage: "https://app.netlify.com/user/applications",
  },
  ...(account.value?.cloudflareAvailable || connection("cloudflare")
    ? [
        {
          id: "cloudflare" as const,
          name: "Cloudflare",
          role: "Pages projects and Workers to import, and Pages to publish.",
          connection: connection("cloudflare"),
          connect: "/auth/cloudflare/connect",
          manage: "https://dash.cloudflare.com/profile/access-management/authorization",
        },
      ]
    : []),
]);

async function remove(provider: Provider, name: string): Promise<void> {
  if (!confirm(`Disconnect ${name}? Imported projects stay; JAPS can't import from or publish to ${name} until you connect it again.`)) return;
  busy.value = provider;
  error.value = null;
  try {
    await disconnect(provider);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <h2>Connections</h2>
      <p class="muted">Accounts JAPS reads your projects from and publishes your portfolio to. Tokens are stored encrypted.</p>
    </header>

    <ul class="list">
      <li class="row">
        <span class="logo github" aria-hidden="true">GH</span>
        <span class="info">
          <strong>GitHub</strong>
          <span class="muted">Repositories, read-only. You sign in with it.</span>
        </span>
        <span class="state ok"><span class="dot" aria-hidden="true" />{{ connection("github")?.accountLogin ?? account?.user.login }}</span>
        <a v-if="account?.githubAppInstallUrl" class="btn" :href="account.githubAppInstallUrl">Repository access</a>
      </li>

      <li v-for="row in rows" :key="row.id" class="row">
        <span class="logo" :class="row.id" aria-hidden="true">{{ row.name.slice(0, 2) }}</span>
        <span class="info">
          <strong>{{ row.name }}</strong>
          <span class="muted">{{ row.role }}</span>
        </span>
        <template v-if="row.connection">
          <span class="state ok"><span class="dot" aria-hidden="true" />{{ row.connection.accountLogin ?? "Connected" }}</span>
          <button class="btn" :disabled="busy !== null" @click="remove(row.id, row.name)">
            {{ busy === row.id ? "Disconnecting…" : "Disconnect" }}
          </button>
        </template>
        <template v-else>
          <span class="state muted">Not connected</span>
          <a class="btn primary" :href="row.connect">Connect</a>
        </template>
      </li>
    </ul>

    <p v-if="error" class="err">{{ error }}</p>
    <p class="muted small">
      Private repositories are visible only where the JAPS GitHub App is installed: use <em>Repository access</em> to add
      them, then import again.
    </p>
  </section>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; display: grid; }
.row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.row:first-child { border-top: 0; }
.info { display: grid; min-width: 0; }
.info .muted { font-size: 13px; }
.state { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; border: 1px solid var(--border); }
.state.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 10%, transparent); border-color: color-mix(in srgb, var(--ok) 30%, transparent); }
.dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.small { font-size: 12px; }
.err { color: var(--danger); }
@media (max-width: 640px) {
  .row { grid-template-columns: 36px minmax(0, 1fr); }
  .state, .row .btn { grid-column: 2; justify-self: start; }
}
</style>
