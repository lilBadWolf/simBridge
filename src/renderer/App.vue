<template>
  <div>
    <div class="bg-grid"></div>
    <button id="settings-open" class="settings-fab" type="button" aria-label="Open settings">⚙️</button>
    <main class="app-shell">
      <SourceHeader />
      <SearchPanel />
      <ResultsPanel />
      <AppFooter />
    </main>

    <div id="download-toast-host" class="download-toast-host" aria-live="polite" aria-atomic="false"></div>
    <DetailModal />
    <SettingsModal />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import AppFooter from "./components/AppFooter.vue";
import DetailModal from "./components/DetailModal.vue";
import ResultsPanel from "./components/ResultsPanel.vue";
import SearchPanel from "./components/SearchPanel.vue";
import SettingsModal from "./components/SettingsModal.vue";
import SourceHeader from "./components/SourceHeader.vue";
import { initializeSimBridgeController } from "./simBridgeController";

onMounted(() => {
  initializeSimBridgeController();
});
</script>
