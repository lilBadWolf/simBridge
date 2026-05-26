<template>
  <section class="panel search-panel">
    <form id="search-form" class="search-form">
      <label>
        Title
        <input id="songtitle" name="songtitle" type="text" placeholder="e.g. PARANOiA" />
      </label>
      <label>
        Artist
        <input id="songartist" name="songartist" type="text" placeholder="e.g. NAOKI" />
      </label>
      <label>
        Pack Name
        <input id="pack-category" name="packcategory" type="text" placeholder="e.g. DDR 1st" />
      </label>
      <div class="search-submit-wrap">
        <button type="submit">Search</button>
        <button id="search-clear" class="clear-search-btn" type="button" aria-label="Clear search fields">X</button>
      </div>
      <div class="actions">
        <div id="ziv-category-wrap" class="category-chips" role="group" aria-label="ZIv feed categories">
          <button type="button" class="secondary category-chip active" data-category="latest-user">Latest User</button>
          <button type="button" class="secondary category-chip" data-category="latest-official">Latest Official</button>
          <button type="button" class="secondary category-chip" data-category="top-official">Top Official</button>
          <button type="button" class="secondary category-chip" data-category="top-user">Top User</button>
        </div>
      </div>
    </form>
  </section>
</template>
