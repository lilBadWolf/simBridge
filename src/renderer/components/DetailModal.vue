<template>
  <div id="detail-modal" class="modal" aria-hidden="true">
    <div class="modal-backdrop" data-close="true"></div>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-header">
        <h3 id="modal-title">Simfile Details</h3>
        <div class="modal-header-right">
          <div id="modal-stats" class="modal-stats"></div>
          <button id="modal-close" class="icon-btn" type="button" aria-label="Close details">x</button>
        </div>
      </header>
      <p id="modal-subtitle" class="modal-subtitle"></p>

      <div class="modal-grid">
        <section class="modal-card">
          <h4 id="modal-section-title">Progress Information</h4>
          <div id="progress-list"></div>
        </section>
      </div>

      <footer class="modal-actions">
        <a id="modal-view-web" class="web-link" target="_blank" rel="noreferrer">View on Web</a>
        <button id="modal-download" type="button">Download</button>
      </footer>
    </section>
  </div>
</template>
