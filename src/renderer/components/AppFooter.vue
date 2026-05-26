<template>
  <footer class="app-footer panel" aria-label="Source credits">
    <p class="status footer-status" :class="{ error: isError }">{{ status }}</p>
    <p>
      <a href="https://zenius-i-vanisher.com/v5.2/" target="_blank" rel="noreferrer">ZIv (Zenius -I- vanisher)</a>
      and
      <a href="https://stepmaniaonline.net/" target="_blank" rel="noreferrer">Stepmania Online</a>
    </p>
    <p>
      <a href="https://thecompanyofwolves.com" target="_blank" rel="noreferrer">The Company of Wolves</a>
    </p>
  </footer>
</template>

<script setup lang="ts">
defineProps<{
  status: string;
  isError: boolean;
}>();
</script>
