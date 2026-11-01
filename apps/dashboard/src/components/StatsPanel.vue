<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { AnalyticsReport } from "../backend.ts";
import { backend, draft, update } from "../store.ts";
import ToggleSwitch from "./ToggleSwitch.vue";

/** Visits to the published portfolio (ADR 0015). Hosted only: the CLI builds without statistics. */

const report = ref<AnalyticsReport | null>(null);
const error = ref<string | null>(null);
const hovered = ref<AnalyticsReport["days"][number] | null>(null);

onMounted(async () => {
  try {
    report.value = await backend.analytics();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
});

const enabled = computed(() => draft.value.analytics ?? true);
const setEnabled = (value: boolean) => update((c) => ({ ...c, analytics: value }));

const peak = computed(() => Math.max(1, ...(report.value?.days.map((d) => d.views) ?? [])));
const height = (views: number) => (views ? `${Math.max(3, (views / peak.value) * 100)}%` : "0");
const formatDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const summary = (d: AnalyticsReport["days"][number]) => `${formatDay(d.day)}: ${d.views} ${d.views === 1 ? "view" : "views"}, ${d.visits} ${d.visits === 1 ? "visit" : "visits"}`;
const readout = computed(() => (hovered.value ? summary(hovered.value) : "Point at a day to see its numbers"));

const lists = computed(() =>
  report.value
    ? [
        { title: "Pages", rows: report.value.pages, empty: "No pages yet." },
        { title: "Came from", rows: report.value.referrers, empty: "No other sites yet." },
        { title: "Countries", rows: report.value.countries, empty: "No countries yet." },
      ]
    : [],
);
</script>

<template>
  <section class="stats">
    <header>
      <h1>Stats</h1>
      <p v-if="report" class="muted">Visits to your published portfolio over the last {{ report.periodDays }} days.</p>
    </header>

    <div class="card">
      <ToggleSwitch
        :model-value="enabled"
        label="Count visits"
        hint="No cookies and no visitor identifiers, only daily totals. A change applies from your next publish. Drafts are never counted."
        @update:model-value="setEnabled"
      />
    </div>

    <p v-if="error" class="banner warn">Could not load the statistics: {{ error }}</p>
    <p v-else-if="!report" class="muted">Loading…</p>
    <template v-else>
      <div class="tiles">
        <div class="tile"><strong>{{ report.totals.visits }}</strong><span class="muted">visits</span></div>
        <div class="tile"><strong>{{ report.totals.views }}</strong><span class="muted">page views</span></div>
      </div>

      <p v-if="!report.totals.views" class="muted">No visits yet. Portfolios start counting from the next publish.</p>
      <div v-else class="card">
        <div class="chart-head">
          <h2>Page views per day</h2>
          <span class="muted small" aria-live="polite">{{ readout }}</span>
        </div>
        <div class="plot">
          <span class="muted small top">{{ peak }}</span>
          <div class="bars">
            <button
              v-for="d in report.days"
              :key="d.day"
              type="button"
              class="day"
              :aria-label="summary(d)"
              @mouseenter="hovered = d"
              @mouseleave="hovered = null"
              @focus="hovered = d"
              @blur="hovered = null"
            >
              <span class="bar" :style="{ height: height(d.views) }" />
            </button>
          </div>
        </div>
        <div class="axis muted small">
          <span>{{ formatDay(report.days[0]!.day) }}</span>
          <span>{{ formatDay(report.days[report.days.length - 1]!.day) }}</span>
        </div>
        <details>
          <summary class="muted small">Show as a table</summary>
          <table>
            <thead><tr><th>Day</th><th class="num">Page views</th><th class="num">Visits</th></tr></thead>
            <tbody>
              <tr v-for="d in report.days.filter((x) => x.views)" :key="d.day">
                <td>{{ formatDay(d.day) }}</td><td class="num">{{ d.views }}</td><td class="num">{{ d.visits }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>

      <div v-if="report.totals.views" class="lists">
        <div v-for="list in lists" :key="list.title" class="card">
          <h2>{{ list.title }}</h2>
          <table v-if="list.rows.length">
            <tbody>
              <tr v-for="row in list.rows" :key="row.value">
                <td class="value">{{ row.value }}</td><td class="num">{{ row.count }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted small">{{ list.empty }}</p>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.stats { display: grid; gap: 16px; max-width: 880px; }
h1 { margin: 0 0 4px; font-size: 22px; }
h2 { margin: 0; font-size: 14px; }
.small { font-size: 13px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: grid; gap: 12px; align-content: start; }
.tiles { display: flex; flex-wrap: wrap; gap: 16px; }
.tile { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; min-width: 140px; display: grid; }
.tile strong { font-size: 26px; font-variant-numeric: tabular-nums; }
.chart-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; align-items: baseline; }
.plot { position: relative; }
.top { position: absolute; top: 0; left: 0; }
.bars { height: 160px; display: flex; gap: 2px; align-items: stretch; border-bottom: 1px solid var(--border); }
.day { flex: 1; min-width: 0; display: flex; align-items: flex-end; padding: 0; background: none; border: 0; cursor: default; }
.day:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.bar { display: block; width: 100%; background: var(--accent); border-radius: 4px 4px 0 0; }
.day:hover .bar, .day:focus .bar { opacity: 0.75; }
.axis { display: flex; justify-content: space-between; }
.lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-weight: 600; }
td, th { padding: 4px 0; border-bottom: 1px solid var(--border); }
tr:last-child td { border-bottom: 0; }
.num { text-align: right; font-variant-numeric: tabular-nums; padding-left: 12px; }
.value { overflow-wrap: anywhere; }
</style>
