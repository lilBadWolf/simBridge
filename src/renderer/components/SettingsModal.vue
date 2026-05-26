<template>
  <div class="modal" :class="{ open }" :aria-hidden="(!open).toString()">
    <div class="modal-backdrop" @click="$emit('close')"></div>
    <section class="modal-panel settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="modal-header">
        <h3 id="settings-title">Settings</h3>
        <button class="icon-btn" type="button" aria-label="Close settings" @click="$emit('close')">x</button>
      </header>

      <div class="settings-body">
        <label class="settings-field">
          Song Library Location
          <input
            name="song-library-path"
            type="text"
            placeholder="e.g. C:/Games/ITGmania/Songs"
            :value="modelValue"
            @input="$emit('update:model-value', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <p class="settings-help">
          ZIv single-song ZIPs are unzipped to SongLibrary/Shit. Stepmania pack ZIPs are unzipped directly to SongLibrary.
        </p>
      </div>

      <footer class="modal-actions">
        <button type="button" class="secondary" @click="$emit('browse')">Browse...</button>
        <button type="button" class="secondary" @click="$emit('save')">Save Settings</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean;
  modelValue: string;
}>();

defineEmits<{
  (event: "update:model-value", value: string): void;
  (event: "close"): void;
  (event: "browse"): void;
  (event: "save"): void;
}>();
</script>
