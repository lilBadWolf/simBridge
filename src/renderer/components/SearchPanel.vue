<template>
  <section class="panel search-panel">
    <form class="search-form" @submit.prevent="$emit('submit')">
      <label>
        Title
        <input
          name="songtitle"
          type="text"
          placeholder="e.g. PARANOiA"
          :value="filters.songtitle"
          @input="emitField('songtitle', $event)"
        />
      </label>
      <label>
        Artist
        <input
          name="songartist"
          type="text"
          placeholder="e.g. NAOKI"
          :value="filters.songartist"
          @input="emitField('songartist', $event)"
        />
      </label>
      <label>
        Pack Name
        <input
          name="packcategory"
          type="text"
          placeholder="e.g. DDR 1st"
          :value="filters.packcategory"
          @input="emitField('packcategory', $event)"
        />
      </label>
      <div class="search-submit-wrap">
        <button type="submit">Search</button>
        <button class="clear-search-btn" type="button" aria-label="Clear search fields" @click="$emit('clear')">X</button>
      </div>
      <div class="actions" :hidden="selectedSource !== 'ziv'">
        <div class="category-chips" role="group" aria-label="ZIv feed categories" :hidden="selectedSource !== 'ziv'">
          <button
            v-for="category in categories"
            :key="category.value"
            type="button"
            class="secondary category-chip"
            :class="{ active: selectedCategory === category.value }"
            @click="$emit('select-category', category.value)"
          >
            {{ category.label }}
          </button>
        </div>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import type { CategoryKey, SearchFilters, SourceKey, ZivCategory } from "../types";

defineProps<{
  filters: SearchFilters;
  selectedSource: SourceKey;
  selectedCategory: CategoryKey;
}>();

const emit = defineEmits<{
  (event: "update:filters", value: Partial<SearchFilters>): void;
  (event: "submit"): void;
  (event: "clear"): void;
  (event: "select-category", category: ZivCategory): void;
}>();

const categories: Array<{ value: ZivCategory; label: string }> = [
  { value: "latest-user", label: "Latest User" },
  { value: "latest-official", label: "Latest Official" },
  { value: "top-official", label: "Top Official" },
  { value: "top-user", label: "Top User" }
];

function emitField(field: keyof SearchFilters, event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:filters", { [field]: target?.value || "" });
}
</script>
