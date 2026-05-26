<template>
  <div class="modal" :class="{ open: state.isOpen, 'is-loading': state.isLoading }" :aria-hidden="(!state.isOpen).toString()" :aria-busy="state.isLoading.toString()">
    <div class="modal-backdrop" @click="$emit('close')"></div>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-header">
        <h3 id="modal-title">{{ state.title }}</h3>
        <div class="modal-header-right">
          <div v-if="!state.isLoading" class="modal-stats">
            <span
              v-for="(chip, index) in state.stats"
              :key="`stat-${index}`"
              class="meta-chip"
              :class="{ 'meta-chip-head': chip.emphasis }"
            >
              {{ chip.value }}
            </span>
          </div>
          <div v-else class="modal-stats modal-stats-skeleton" aria-hidden="true">
            <span class="skeleton-chip"></span>
            <span class="skeleton-chip skeleton-chip-wide"></span>
          </div>
          <button class="icon-btn" type="button" aria-label="Close details" @click="$emit('close')">x</button>
        </div>
      </header>

      <p v-if="!state.isLoading && state.subtitleChips.length === 0" class="modal-subtitle">{{ state.subtitleText }}</p>
      <div v-else-if="!state.isLoading" class="modal-subtitle">
        <span
          v-for="(chip, index) in state.subtitleChips"
          :key="`subtitle-${index}`"
          class="quality-chip"
          :class="{ 'meta-chip': chip.kind === 'meta' }"
        >
          <template v-if="chip.label">
            <span class="quality-key">{{ chip.label }}:</span>
            <span :class="chip.valueClass">{{ chip.value }}</span>
          </template>
          <template v-else>
            {{ chip.value }}
          </template>
        </span>
      </div>
      <div v-else class="modal-subtitle modal-subtitle-skeleton" aria-hidden="true">
        <span class="skeleton-line skeleton-line-lg"></span>
        <span class="skeleton-line skeleton-line-md"></span>
      </div>

      <div class="modal-grid">
        <section class="modal-card">
          <h4>{{ state.sectionTitle }}</h4>

          <div v-if="state.isLoading" class="detail-loading-state" aria-hidden="true">
            <div class="detail-skeleton-table">
              <span class="skeleton-line skeleton-line-full"></span>
              <span class="skeleton-line skeleton-line-full"></span>
              <span class="skeleton-line skeleton-line-full"></span>
              <span class="skeleton-line skeleton-line-md"></span>
            </div>
          </div>

          <template v-else>
            <p v-if="state.content.kind === 'empty'" class="empty-note">{{ state.content.message }}</p>

            <template v-else-if="state.content.kind === 'progress'">
              <table class="progress-table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Single</th>
                    <th>Double</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in state.content.rows" :key="row.tier">
                    <td>{{ row.tier }}</td>
                    <td>
                      <span v-if="row.single" class="chart-pill">👤<span class="roman-level">{{ toRoman(row.single) }}</span></span>
                    </td>
                    <td>
                      <span v-if="row.double" class="chart-pill">👥<span class="roman-level">{{ toRoman(row.double) }}</span></span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="state.content.extras.length" class="progress-extras">
                <span v-for="pair in state.content.extras" :key="pair.key" class="extra-pill">{{ pair.key }}: {{ pair.value || '-' }}</span>
              </div>
            </template>

            <template v-else-if="state.content.kind === 'table'">
              <div class="pack-songs-table-wrap">
                <table class="progress-table pack-songs-table">
                  <thead v-if="state.content.headers.length">
                    <tr>
                      <th v-for="(header, index) in state.content.headers" :key="`${header}-${index}`">{{ header }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rowIndex) in state.content.rows" :key="`row-${rowIndex}`">
                      <td v-for="(cell, cellIndex) in row" :key="`cell-${rowIndex}-${cellIndex}`">{{ cell || '-' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>

            <ExternalHtmlTable v-else-if="state.content.kind === 'exact-html'" :html="state.content.html" />
          </template>
        </section>
      </div>

      <footer class="modal-actions">
        <a v-if="state.showWebLink" class="web-link" :href="state.webUrl" target="_blank" rel="noreferrer">View on Web</a>
        <button
          v-if="!downloadAction.hidden"
          type="button"
          :class="downloadAction.toneClass"
          :disabled="downloadAction.disabled"
          :aria-label="downloadAction.ariaLabel"
          @click="$emit('download')"
        >
          <span v-if="downloadAction.isDownloading" class="btn-spinner" aria-hidden="true"></span>
          <span v-else>{{ downloadAction.label }}</span>
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import ExternalHtmlTable from "./ExternalHtmlTable.vue";
import type { DetailState, DisplayDownloadState } from "../types";

defineProps<{
  state: DetailState;
  downloadAction: DisplayDownloadState;
}>();

defineEmits<{
  (event: "close"): void;
  (event: "download"): void;
}>();

function toRoman(value: number) {
  const romanMap: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];

  let number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }

  let result = "";

  for (const [amount, numeral] of romanMap) {
    while (number >= amount) {
      result += numeral;
      number -= amount;
    }
  }

  return result;
}
</script>
