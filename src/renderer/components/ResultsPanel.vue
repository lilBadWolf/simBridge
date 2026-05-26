<template>
  <section class="panel list-panel">
    <div class="list-head">
      <h2 id="list-title">Latest User Songs</h2>
      <span id="count-pill" class="count-pill">0 items</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th id="col-1">Name</th>
            <th id="col-2">Category</th>
            <th id="col-3">Last Update</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="results-body"></tbody>
      </table>
    </div>
  </section>

  <template id="row-template">
    <tr>
      <td class="name"></td>
      <td class="category"></td>
      <td class="meta"></td>
      <td>
        <div class="row-actions">
          <button class="detail-btn" type="button">Details</button>
          <button class="download-btn" type="button">Download</button>
        </div>
      </td>
    </tr>
  </template>
</template>
