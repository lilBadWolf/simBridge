<template>
  <div id="settings-modal" class="modal" aria-hidden="true">
    <div class="modal-backdrop" data-settings-close="true"></div>
    <section class="modal-panel settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="modal-header">
        <h3 id="settings-title">Settings</h3>
        <button id="settings-close" class="icon-btn" type="button" aria-label="Close settings">x</button>
      </header>

      <div class="settings-body">
        <label class="settings-field" for="song-library-path">
          Song Library Location
          <input
            id="song-library-path"
            name="song-library-path"
            type="text"
            placeholder="e.g. C:/Games/ITGmania/Songs"
          />
        </label>
        <p class="settings-help">
          ZIv single-song ZIPs are unzipped to SongLibrary/Shit. Stepmania pack ZIPs are unzipped directly to SongLibrary.
        </p>
      </div>

      <footer class="modal-actions">
        <button id="song-library-browse" type="button" class="secondary">Browse...</button>
        <button id="settings-save" type="button" class="secondary">Save Settings</button>
      </footer>
    </section>
  </div>
</template>
