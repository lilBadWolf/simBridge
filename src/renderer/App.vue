<template>
  <div>
    <div class="bg-grid"></div>
    <button class="settings-fab" type="button" aria-label="Open settings" @click="openSettings">⚙️</button>
    <main class="app-shell">
      <SourceHeader :selected-source="selectedSource" @select-source="selectSource" />
      <SearchPanel
        :filters="filters"
        :selected-source="selectedSource"
        :selected-category="selectedCategory"
        @update:filters="updateFilters"
        @submit="submitSearch"
        @clear="clearSearchAndResetList"
        @select-category="selectCategory"
      />
      <ResultsPanel
        :title="listTitle"
        :count-label="countLabel"
        :columns="columns"
        :items="displayItems"
        :list-mode="listMode"
        :is-loading="listLoading"
        :sort-state="sortState"
        @sort="toggleSort"
        @detail="openDetails"
        @download="downloadItem"
      />
      <AppFooter :status="status.message" :is-error="status.isError" />
    </main>

    <DownloadToastHost :toasts="downloadToasts" />
    <DetailModal
      :state="detailState"
      :download-action="detailDownloadAction"
      @close="closeDetail"
      @download="downloadActiveDetail"
    />
    <SettingsModal
      :open="isSettingsOpen"
      :model-value="songLibraryPath"
      @update:model-value="songLibraryPath = $event"
      @close="closeSettings"
      @browse="browseForSongLibrary"
      @save="saveSettings"
    />
  </div>
</template>

<script setup lang="ts">
import AppFooter from "./components/AppFooter.vue";
import DetailModal from "./components/DetailModal.vue";
import DownloadToastHost from "./components/DownloadToastHost.vue";
import ResultsPanel from "./components/ResultsPanel.vue";
import SearchPanel from "./components/SearchPanel.vue";
import SettingsModal from "./components/SettingsModal.vue";
import SourceHeader from "./components/SourceHeader.vue";
import { useSimBridgeApp } from "./composables/useSimBridgeApp";

const {
  filters,
  selectedSource,
  selectedCategory,
  listMode,
  listTitle,
  countLabel,
  columns,
  displayItems,
  listLoading,
  status,
  sortState,
  isSettingsOpen,
  songLibraryPath,
  detailState,
  detailDownloadAction,
  downloadToasts,
  updateFilters,
  submitSearch,
  clearSearchAndResetList,
  selectCategory,
  selectSource,
  toggleSort,
  openDetails,
  closeDetail,
  downloadItem,
  downloadActiveDetail,
  openSettings,
  closeSettings,
  saveSettings,
  browseForSongLibrary
} = useSimBridgeApp();
</script>
