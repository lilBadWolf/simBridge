<template>
  <div ref="host" class="pack-songs-exact-host"></div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

const props = defineProps<{
  html: string;
}>();

const host = ref<HTMLElement | null>(null);

function renderTable() {
  if (!host.value) {
    return;
  }

  const shadow = host.value.shadowRoot || host.value.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <base href="https://stepmaniaonline.net/">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdn.datatables.net/1.13.7/css/dataTables.bootstrap5.min.css">
    <link rel="stylesheet" href="https://stepmaniaonline.net/static/css/base.css">
    <link rel="stylesheet" href="https://stepmaniaonline.net/static/css/custom.css">
    <style>
      :host {
        display: block;
      }

      .table-shell {
        max-height: min(48vh, 520px);
        overflow: auto;
      }

      table {
        min-width: 900px;
      }
    </style>
    <div class="table-shell">${props.html}</div>
  `;
}

onMounted(renderTable);
watch(() => props.html, renderTable);
</script>
