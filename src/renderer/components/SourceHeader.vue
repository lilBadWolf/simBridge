<template>
  <header class="hero">
    <div class="hero-top-row">
      <img class="brand-logo" src="/brand/logo-primary.png" alt="simBridge" />
      <div class="source-chips" role="group" aria-label="Simfile source selector">
        <button
          v-for="source in sources"
          :key="source.value"
          type="button"
          class="secondary source-chip"
          :class="{ active: selectedSource === source.value }"
          @click="$emit('select-source', source.value)"
        >
          {{ source.label }}
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { SourceKey } from "../types";

defineProps<{
  selectedSource: SourceKey;
}>();

defineEmits<{
  (event: "select-source", source: SourceKey): void;
}>();

const sources: Array<{ value: SourceKey; label: string }> = [
  { value: "ziv", label: "zIV Songs" },
  { value: "stepmania", label: "Stepmania Packs" },
  { value: "downloaded", label: "Downloaded" }
];
</script>
