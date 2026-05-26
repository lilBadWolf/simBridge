<template>
  <div class="download-toast-host" aria-live="polite" aria-atomic="false">
    <div v-for="toast in toasts" :key="toast.key" class="download-toast">
      <div class="download-toast-title">{{ toast.title }}</div>
      <div
        class="download-toast-track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(toast.progressPct)"
      >
        <div class="download-toast-fill" :style="{ width: `${toast.progressPct}%` }"></div>
      </div>
      <div class="download-toast-label">{{ toast.label }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DownloadToastState } from "../types";

defineProps<{
  toasts: DownloadToastState[];
}>();
</script>
