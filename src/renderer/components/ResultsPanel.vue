<template>
  <section class="panel list-panel" :class="panelClasses">
    <div class="list-head">
      <h2>{{ title }}</h2>
      <span class="count-pill">{{ countLabel }}</span>
    </div>
    <div class="table-wrap" :class="{ 'is-loading': isLoading }">
      <table>
        <thead>
          <tr>
            <th
              v-for="(column, index) in columns"
              :key="column.id"
              :class="headerClass(index)"
              :aria-sort="ariaSort(index)"
              :role="index < 3 ? 'button' : undefined"
              :tabindex="index < 3 ? 0 : undefined"
              @click="onSort(index)"
              @keydown.enter.prevent="onSort(index)"
              @keydown.space.prevent="onSort(index)"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody v-if="isLoading">
          <tr v-for="n in 7" :key="`skeleton-${n}`" class="row-skeleton">
            <td colspan="4">
              <div class="row-skeleton-line"></div>
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="items.length === 0">
          <tr>
            <td colspan="4" class="meta">No results.</td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="item in items" :key="itemRowKey(item)">
            <td class="name">
              <a v-if="item.detailUrl" :href="item.detailUrl" target="_blank" rel="noreferrer">{{ item.name }}</a>
              <span v-else>{{ item.name || "-" }}</span>
            </td>
            <td class="category" :title="categoryTitle(item)">
              <a
                v-if="item.categoryUrl && listMode !== 'pack' && listMode !== 'downloaded'"
                :href="item.categoryUrl"
                target="_blank"
                rel="noreferrer"
              >
                {{ categoryText(item) }}
              </a>
              <span v-else>{{ categoryText(item) }}</span>
            </td>
            <td class="meta">{{ item.metaText }}</td>
            <td>
              <div class="row-actions">
                <button class="detail-btn" type="button" @click="$emit('detail', item)">{{ item.detailLabel }}</button>
                <button
                  v-if="!item.download.hidden"
                  class="download-btn"
                  :class="item.download.toneClass"
                  type="button"
                  :disabled="item.download.disabled"
                  :aria-label="item.download.ariaLabel"
                  @click="$emit('download', item)"
                >
                  <span v-if="item.download.isDownloading" class="btn-spinner" aria-hidden="true"></span>
                  <span v-else>{{ item.download.label }}</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ListMode, ResultDisplayItem, SortState, TableColumn } from "../types";

const props = defineProps<{
  title: string;
  countLabel: string;
  columns: TableColumn[];
  items: ResultDisplayItem[];
  listMode: ListMode;
  isLoading: boolean;
  sortState: SortState;
}>();

const emit = defineEmits<{
  (event: "sort", columnIndex: number): void;
  (event: "detail", item: ResultDisplayItem): void;
  (event: "download", item: ResultDisplayItem): void;
}>();

const panelClasses = computed(() => ({
  "downloaded-mode": props.listMode === "downloaded",
  "ziv-mode": props.listMode === "latest" || props.listMode === "search"
}));

function headerClass(index: number) {
  return {
    "sortable-col": index < 3,
    "sorted-asc": index === props.sortState.columnIndex && props.sortState.direction === "asc",
    "sorted-desc": index === props.sortState.columnIndex && props.sortState.direction === "desc"
  };
}

function ariaSort(index: number) {
  if (index >= 3) {
    return undefined;
  }

  if (props.sortState.columnIndex !== index) {
    return "none";
  }

  return props.sortState.direction === "asc" ? "ascending" : "descending";
}

function onSort(index: number) {
  if (index < 3) {
    emit("sort", index);
  }
}

function itemRowKey(item: ResultDisplayItem) {
  if (item.sourceType === "stepmania-pack") {
    return `stepmania:${item.packId || item.name}`;
  }

  if (item.sourceType === "local-pack") {
    return `local:${item.localPackId || item.name}`;
  }

  return `ziv:${item.simfileId || item.name}`;
}

function categoryText(item: ResultDisplayItem) {
  if (props.listMode === "pack" || props.listMode === "downloaded") {
    return item.songCount || "-";
  }

  return item.category || "-";
}

function categoryTitle(item: ResultDisplayItem) {
  if (props.listMode === "pack" || props.listMode === "downloaded") {
    return undefined;
  }

  return item.category || "-";
}
</script>
