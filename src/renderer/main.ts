import "./styles.css";

const statusEl = document.getElementById("status") as HTMLElement;
const titleEl = document.getElementById("list-title") as HTMLElement;
const countEl = document.getElementById("count-pill") as HTMLElement;
const bodyEl = document.getElementById("results-body") as HTMLElement;
const listTableWrap = document.querySelector(".list-panel .table-wrap") as HTMLElement;
const listPanelEl = document.querySelector(".list-panel") as HTMLElement;
const rowTemplate = document.getElementById("row-template") as HTMLTemplateElement;
const searchForm = document.getElementById("search-form") as HTMLFormElement;
const searchClearBtn = document.getElementById("search-clear") as HTMLButtonElement;
const resultsHeadCells = Array.from(document.querySelectorAll<HTMLTableCellElement>(".list-panel thead th"));
const categoryChips = Array.from(document.querySelectorAll<HTMLButtonElement>(".category-chip"));
const sourceChips = Array.from(document.querySelectorAll<HTMLButtonElement>(".source-chip"));
const zivCategoryWrap = document.getElementById("ziv-category-wrap") as HTMLElement;
const searchActionsRow = document.querySelector(".search-form .actions") as HTMLElement;
const col1 = document.getElementById("col-1") as HTMLElement;
const col2 = document.getElementById("col-2") as HTMLElement;
const col3 = document.getElementById("col-3") as HTMLElement;
const settingsOpenBtn = document.getElementById("settings-open") as HTMLButtonElement;
const settingsModal = document.getElementById("settings-modal") as HTMLElement;
const settingsCloseBtn = document.getElementById("settings-close") as HTMLButtonElement;
const settingsSaveBtn = document.getElementById("settings-save") as HTMLButtonElement;
const songLibraryBrowseBtn = document.getElementById("song-library-browse") as HTMLButtonElement;
const songLibraryInput = document.getElementById("song-library-path") as HTMLInputElement;
const detailModal = document.getElementById("detail-modal") as HTMLElement;
const modalCloseBtn = document.getElementById("modal-close") as HTMLButtonElement;
const modalStats = document.getElementById("modal-stats") as HTMLElement;
const modalTitle = document.getElementById("modal-title") as HTMLElement;
const modalSubtitle = document.getElementById("modal-subtitle") as HTMLElement;
const modalSectionTitle = document.getElementById("modal-section-title") as HTMLElement;
const progressList = document.getElementById("progress-list") as HTMLElement;
const modalViewWeb = document.getElementById("modal-view-web") as HTMLAnchorElement;
const modalDownloadBtn = document.getElementById("modal-download") as HTMLButtonElement;
const downloadToastHost = document.getElementById("download-toast-host") as HTMLElement;
const QUALITY_KEYS = new Set(["Audio Quality", "Banner Quality", "Background Quality"]);
const SONG_LIBRARY_KEY = "simBridge.songLibraryPath";
const DEFAULT_SONG_LIBRARY_PATH = "C:/Games/ITGmania/Songs";
const CATEGORY_LABELS = {
  "latest-user": "Latest User",
  "latest-official": "Latest Official",
  "top-official": "Top Official",
  "top-user": "Top User",
  "stepmania-packs": "Stepmania Packs",
  downloaded: "Downloaded"
};
const CATEGORY_STATUS_LABELS = {
  "latest-user": "Latest User Submitted",
  "latest-official": "Latest Official",
  "top-official": "Top Official",
  "top-user": "Top User Submitted",
  "stepmania-packs": "Stepmania Packs",
  downloaded: "Downloaded"
};
let selectedCategory = "latest-user";
let selectedSource = "ziv";
let lastZivCategory = "latest-user";
let currentListMode = "latest";
let currentListItems = [];
let sortState = {
  columnIndex: -1,
  direction: "asc"
};
let listRequestSequence = 0;
let activeListRequestId = 0;
const downloadUiByKey = new Map();
const downloadToastByKey = new Map();
const activeDownloadKeys = new Set();
const apiBaseUrlPromise = window.simBridgeDesktop?.getApiBaseUrl
  ? window.simBridgeDesktop.getApiBaseUrl()
  : Promise.resolve("http://127.0.0.1:3000");

async function apiFetch(path: string, init?: RequestInit) {
  const apiBaseUrl = await apiBaseUrlPromise;
  return fetch(`${apiBaseUrl}${path}`, init);
}

function isZivCategory(category) {
  return category === "latest-user" || category === "latest-official" || category === "top-official" || category === "top-user";
}

function setActiveSource(source) {
  selectedSource = source;

  for (const chip of sourceChips) {
    chip.classList.toggle("active", chip.dataset.source === source);
  }

  if (zivCategoryWrap) {
    zivCategoryWrap.hidden = source !== "ziv";
  }

  if (searchActionsRow) {
    searchActionsRow.hidden = source !== "ziv";
  }
}

function normalizeSongLibraryPath(value) {
  return (value || "").trim().replace(/\\/g, "/");
}

function ensureSongLibraryPath() {
  const saved = (localStorage.getItem(SONG_LIBRARY_KEY) || "").trim();
  if (!saved) {
    localStorage.setItem(SONG_LIBRARY_KEY, DEFAULT_SONG_LIBRARY_PATH);
    return DEFAULT_SONG_LIBRARY_PATH;
  }

  return saved;
}

function getItemKey(item) {
  if (!item) {
    return "";
  }

  const sourceType = item.sourceType || "ziv";
  const id = sourceType === "stepmania-pack" ? item.packId : sourceType === "local-pack" ? item.localPackId : item.simfileId;
  return `${sourceType}:${id || item.name || "unknown"}`;
}

function setModalActionVisibility(showWeb, showDownload) {
  modalViewWeb.hidden = !showWeb;
  modalDownloadBtn.hidden = !showDownload;
}

function updateSortHeaderIndicators() {
  for (let index = 0; index < resultsHeadCells.length; index += 1) {
    const cell = resultsHeadCells[index];
    const sortable = index < 3;

    cell.classList.toggle("sortable-col", sortable);
    cell.classList.remove("sorted-asc", "sorted-desc");

    if (!sortable) {
      cell.removeAttribute("role");
      cell.removeAttribute("tabindex");
      cell.removeAttribute("aria-sort");
      continue;
    }

    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");

    if (sortState.columnIndex !== index) {
      cell.setAttribute("aria-sort", "none");
      continue;
    }

    if (sortState.direction === "asc") {
      cell.classList.add("sorted-asc");
      cell.setAttribute("aria-sort", "ascending");
    } else {
      cell.classList.add("sorted-desc");
      cell.setAttribute("aria-sort", "descending");
    }
  }
}

function parseComparableValue(rawValue) {
  const text = String(rawValue || "").trim();

  if (!text || text === "-") {
    return "";
  }

  const slashMatch = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashMatch) {
    return Number(slashMatch[1]) * 1000 + Number(slashMatch[2]);
  }

  const sizeMatch = text.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)$/i);
  if (sizeMatch) {
    const value = Number(sizeMatch[1]);
    const unit = sizeMatch[2].toLowerCase();
    const multipliers = {
      b: 1,
      kb: 1024,
      mb: 1024 ** 2,
      gb: 1024 ** 3,
      tb: 1024 ** 4
    };
    return value * multipliers[unit];
  }

  const agoMatch = text.match(/^(\d+(?:\.\d+)?)\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago$/i);
  if (agoMatch) {
    const value = Number(agoMatch[1]);
    const unit = agoMatch[2].toLowerCase();
    const multipliers = {
      second: 1,
      seconds: 1,
      minute: 60,
      minutes: 60,
      hour: 3600,
      hours: 3600,
      day: 86400,
      days: 86400,
      week: 604800,
      weeks: 604800,
      month: 2629800,
      months: 2629800,
      year: 31557600,
      years: 31557600
    };
    return value * multipliers[unit];
  }

  const numericValue = Number(text);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return text.toLowerCase();
}

function getSortColumnValue(item, mode, columnIndex) {
  if (columnIndex === 0) {
    return item.name || "";
  }

  if (columnIndex === 1) {
    if (mode === "pack" || mode === "downloaded") {
      return item.songCount || "0";
    }

    return item.category || "";
  }

  if (mode === "search") {
    return `${item.sp || "-"} / ${item.dp || "-"}`;
  }

  if (mode === "pack") {
    return item.size || "";
  }

  if (mode === "downloaded") {
    return "";
  }

  return item.lastUpdate || "";
}

function sortItems(items, mode) {
  if (sortState.columnIndex < 0) {
    return [...items];
  }

  const directionMultiplier = sortState.direction === "asc" ? 1 : -1;
  const columnIndex = sortState.columnIndex;

  return [...items].sort((left, right) => {
    const leftValue = parseComparableValue(getSortColumnValue(left, mode, columnIndex));
    const rightValue = parseComparableValue(getSortColumnValue(right, mode, columnIndex));

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * directionMultiplier;
    }

    const leftText = String(leftValue);
    const rightText = String(rightValue);
    return leftText.localeCompare(rightText, undefined, { sensitivity: "base" }) * directionMultiplier;
  });
}

function applySort(columnIndex) {
  if (sortState.columnIndex === columnIndex) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.columnIndex = columnIndex;
    sortState.direction = "asc";
  }

  updateSortHeaderIndicators();

  if (!currentListItems.length) {
    return;
  }

  renderRows(currentListItems, currentListMode);
}

function setupListSorting() {
  for (let index = 0; index < resultsHeadCells.length; index += 1) {
    if (index >= 3) {
      continue;
    }

    const cell = resultsHeadCells[index];
    cell.addEventListener("click", () => {
      applySort(index);
    });

    cell.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      applySort(index);
    });
  }

  updateSortHeaderIndicators();
}

function beginListRequest() {
  listRequestSequence += 1;
  activeListRequestId = listRequestSequence;
  return activeListRequestId;
}

function resetListStateForSourceChange() {
  // Invalidate any in-flight list/search request from the previous source.
  beginListRequest();
  currentListItems = [];
  sortState.columnIndex = -1;
  sortState.direction = "asc";
  updateSortHeaderIndicators();

  if (listTableWrap) {
    listTableWrap.scrollTop = 0;
    listTableWrap.scrollLeft = 0;
  }
}

function isActiveListRequest(requestId) {
  return requestId === activeListRequestId;
}

function setButtonDownloading(buttonEl, isPack) {
  if (!buttonEl) {
    return;
  }

  buttonEl.disabled = true;
  buttonEl.classList.remove("installed-btn");
  buttonEl.classList.add("downloading-btn");
  buttonEl.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>';
  buttonEl.setAttribute("aria-label", isPack ? "Downloading pack" : "Downloading");
}

function setButtonInstalled(buttonEl) {
  if (!buttonEl) {
    return;
  }

  buttonEl.classList.remove("downloading-btn");
  buttonEl.classList.add("installed-btn");
  buttonEl.textContent = "Downloaded";
  buttonEl.setAttribute("aria-label", "Already downloaded");
  buttonEl.disabled = true;
}

function setButtonUpdate(buttonEl) {
  if (!buttonEl) {
    return;
  }

  buttonEl.classList.remove("downloading-btn", "installed-btn");
  buttonEl.textContent = "Update";
  buttonEl.setAttribute("aria-label", "Update downloaded pack");
  buttonEl.disabled = false;
}

function canUpdateLocalPack(item) {
  return Boolean(item && item.sourceType === "local-pack" && item.updateAvailable && item.updatePackId);
}

function resetButtonToDownload(buttonEl) {
  if (!buttonEl) {
    return;
  }

  buttonEl.classList.remove("downloading-btn", "installed-btn");
  buttonEl.textContent = "Download";
  buttonEl.setAttribute("aria-label", "Download");
  buttonEl.disabled = false;
}

function removeDownloadToast(item) {
  const key = getItemKey(item);
  const toast = downloadToastByKey.get(key);

  if (!toast) {
    return;
  }

  toast.element.remove();
  downloadToastByKey.delete(key);
}

function ensureDownloadToast(item) {
  const key = getItemKey(item);
  const existing = downloadToastByKey.get(key);
  if (existing) {
    return existing;
  }

  const element = document.createElement("div");
  element.className = "download-toast";

  const title = document.createElement("div");
  title.className = "download-toast-title";
  title.textContent = item?.name || "Download";

  const track = document.createElement("div");
  track.className = "download-toast-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", "0");

  const fill = document.createElement("div");
  fill.className = "download-toast-fill";
  track.appendChild(fill);

  const label = document.createElement("div");
  label.className = "download-toast-label";
  label.textContent = "Preparing download...";

  element.appendChild(title);
  element.appendChild(track);
  element.appendChild(label);
  downloadToastHost.appendChild(element);

  const entry = { element, track, fill, label };
  downloadToastByKey.set(key, entry);
  return entry;
}

function setRowProgressState(item, progressPct, label, visible = true) {
  if (!visible) {
    removeDownloadToast(item);
    return;
  }

  const toast = ensureDownloadToast(item);
  const clamped = Math.max(0, Math.min(100, Number(progressPct) || 0));
  toast.fill.style.width = `${clamped}%`;
  toast.label.textContent = label || `${Math.round(clamped)}%`;
  toast.track.setAttribute("aria-valuenow", String(Math.round(clamped)));
}

function setDownloadUiState(item, mode) {
  const key = getItemKey(item);
  const ui = downloadUiByKey.get(key);
  const isPack = item.sourceType === "stepmania-pack";

  if (mode === "downloading") {
    setButtonDownloading(ui?.downloadBtn, isPack);

    if (detailModal.classList.contains("open") && modalDownloadBtn.onclick) {
      setButtonDownloading(modalDownloadBtn, isPack);
    }

    return;
  }

  if (mode === "installed") {
    setButtonInstalled(ui?.downloadBtn);
    removeDownloadToast(item);

    if (detailModal.classList.contains("open")) {
      setButtonInstalled(modalDownloadBtn);
      modalDownloadBtn.onclick = null;
    }

    return;
  }

  if (canUpdateLocalPack(item)) {
    setButtonUpdate(ui?.downloadBtn);
  } else {
    resetButtonToDownload(ui?.downloadBtn);
  }

  removeDownloadToast(item);
  if (detailModal.classList.contains("open") && modalDownloadBtn.classList.contains("downloading-btn")) {
    if (canUpdateLocalPack(item)) {
      setButtonUpdate(modalDownloadBtn);
    } else {
      resetButtonToDownload(modalDownloadBtn);
    }

    modalDownloadBtn.onclick = () => {
      downloadSimfile(item, modalDownloadBtn);
    };
  }
}

async function parseStreamError(response) {
  try {
    const data = await response.json();
    return data?.error || data?.details || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function normalizeSearchApiError(rawError) {
  const text = String(rawError || "").trim();
  if (/^Provide\s+songtitle\s+or\s+songartist\.?$/i.test(text)) {
    return "Provide song title, artist, or Pack Name / Category.";
  }

  return text;
}

function configureModalDownloadButton(item) {
  if (!modalDownloadBtn || !item) {
    return;
  }

  setModalActionVisibility(true, true);

  modalDownloadBtn.classList.remove("installed-btn", "downloading-btn");
  modalDownloadBtn.innerHTML = "Download";
  modalDownloadBtn.disabled = false;
  modalDownloadBtn.setAttribute("aria-label", "Download");

  if (item.installed) {
    modalDownloadBtn.textContent = "Downloaded";
    modalDownloadBtn.classList.add("installed-btn");
    modalDownloadBtn.disabled = true;
    modalDownloadBtn.setAttribute("aria-label", "Already downloaded");
    modalDownloadBtn.onclick = null;
    return;
  }

  modalDownloadBtn.onclick = () => {
    downloadSimfile(item, modalDownloadBtn);
  };
}

function configureModalLocalPackActions(item) {
  const canUpdate = canUpdateLocalPack(item);
  const hasWebLink = Boolean(item?.remoteDetailUrl || item?.detailUrl);
  setModalActionVisibility(hasWebLink, canUpdate);

  if (hasWebLink) {
    modalViewWeb.href = item.remoteDetailUrl || item.detailUrl;
  } else {
    modalViewWeb.removeAttribute("href");
  }

  if (!canUpdate) {
    modalDownloadBtn.onclick = null;
    return;
  }

  setButtonUpdate(modalDownloadBtn);
  modalDownloadBtn.onclick = () => {
    downloadSimfile(item, modalDownloadBtn);
  };
}

function setStatus(message, isError = false) {
  const normalized = String(message || "").trimEnd().replace(/\.$/, "");
  statusEl.textContent = normalized;
  statusEl.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openModal() {
  detailModal.classList.add("open");
  detailModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  detailModal.classList.remove("open");
  detailModal.setAttribute("aria-hidden", "true");
}

function openSettingsModal() {
  settingsModal.classList.add("open");
  settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettingsModal() {
  settingsModal.classList.remove("open");
  settingsModal.setAttribute("aria-hidden", "true");
}

function loadSettings() {
  const savedPath = ensureSongLibraryPath();
  songLibraryInput.value = savedPath;
}

function saveSettings() {
  const pathValue = songLibraryInput.value.trim() || DEFAULT_SONG_LIBRARY_PATH;
  localStorage.setItem(SONG_LIBRARY_KEY, pathValue);
  setStatus(`Saved song library location: ${pathValue}`);
  songLibraryInput.value = pathValue;
  closeSettingsModal();
}

async function browseForSongLibrary() {
  if (!window.simBridgeDesktop?.pickSongLibrary) {
    setStatus("Native folder picker is unavailable in this runtime.", true);
    return;
  }

  try {
    const selectedPath = (await window.simBridgeDesktop.pickSongLibrary()) || "";
    if (!selectedPath) {
      return;
    }

    songLibraryInput.value = normalizeSongLibraryPath(selectedPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open folder picker.";
    setStatus(message, true);
  }
}

function getSavedSongLibraryPath() {
  return ensureSongLibraryPath();
}

async function downloadSimfile(item, buttonEl) {
  const songLibraryPath = getSavedSongLibraryPath();

  if (!songLibraryPath) {
    setStatus("Set Song Library Location in settings before downloading.", true);
    openSettingsModal();
    return;
  }

  const key = getItemKey(item);

  if (activeDownloadKeys.has(key)) {
    setStatus(`${item.name} is already downloading.`);
    return;
  }

  const isPack = item.sourceType === "stepmania-pack" || canUpdateLocalPack(item);
  const packId = item.packId || item.updatePackId || "";
  activeDownloadKeys.add(key);
  setDownloadUiState(item, "downloading");
  setRowProgressState(item, 2, "Starting download...");
  setStatus(`${canUpdateLocalPack(item) ? "Updating" : "Downloading"} ${item.name}...`);

  try {
    const endpoint = isPack ? "/api/download-pack" : "/api/download-simfile";
    const response = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simfileId: item.simfileId,
        packId,
        songLibraryPath
      })
    });

    if (!response.ok) {
      throw new Error(await parseStreamError(response));
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Download stream was unavailable.");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const event = JSON.parse(trimmed);

        if (event.type === "progress") {
          setRowProgressState(item, event.progressPct, event.message);
          continue;
        }

        if (event.type === "done") {
          finalData = event.data;
          setRowProgressState(item, 100, "Complete");
          continue;
        }

        if (event.type === "error") {
          throw new Error(event.error || "Download failed.");
        }
      }
    }

    if (!finalData) {
      throw new Error("Download did not return a completion event.");
    }

    if (canUpdateLocalPack(item)) {
      item.updateAvailable = false;
      setButtonInstalled(buttonEl);
      modalDownloadBtn.onclick = null;
      setStatus(`Updated and extracted into ${finalData.destinationDir}`);
      setTimeout(() => {
        setRowProgressState(item, 100, "", false);
      }, 1200);
      await loadDownloadedLibrary();
      return;
    }

    setStatus(`Downloaded and unzipped into ${finalData.destinationDir}`);
    item.installed = true;
    setDownloadUiState(item, "installed");
    setTimeout(() => {
      setRowProgressState(item, 100, "", false);
    }, 1200);
  } catch (error) {
    setStatus(error.message, true);
    setDownloadUiState(item, "idle");

    if (canUpdateLocalPack(item)) {
      setButtonUpdate(buttonEl);
      if (detailModal.classList.contains("open")) {
        setButtonUpdate(modalDownloadBtn);
      }
    }

    setRowProgressState(item, 0, "", false);
  } finally {
    activeDownloadKeys.delete(key);
  }
}

function renderDefinitionList(container, items) {
  container.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "No data available.";
    container.appendChild(empty);
    return;
  }

  for (const pair of items) {
    const dt = document.createElement("dt");
    dt.textContent = pair.key;

    const dd = document.createElement("dd");
    dd.textContent = pair.value || "-";

    container.appendChild(dt);
    container.appendChild(dd);
  }
}

function toRoman(value) {
  const romanMap: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];

  let number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }

  let result = "";

  for (const [amount, numeral] of romanMap) {
    while (number >= amount) {
      result += numeral;
      number -= amount;
    }
  }

  return result;
}

function extractLevelNumber(value) {
  const match = (value || "").match(/level\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function chartBadge(icon, levelNumber) {
  if (!levelNumber) {
    return "";
  }

  return `<span class="chart-pill">${icon}<span class="roman-level">${toRoman(levelNumber)}</span></span>`;
}

function qualityClass(value) {
  const text = (value || "").toLowerCase();

  if (text.includes("perfect")) {
    return "quality-perfect";
  }

  if (text.includes("good")) {
    return "quality-good";
  }

  if (text.includes("average") || text.includes("normal")) {
    return "quality-average";
  }

  if (text.includes("poor") || text.includes("bad")) {
    return "quality-poor";
  }

  return "quality-unknown";
}

function extractQualityInfo(progressItems) {
  const qualityMap = new Map();

  for (const pair of progressItems || []) {
    if (!QUALITY_KEYS.has(pair.key)) {
      continue;
    }

    qualityMap.set(pair.key, pair.value || "-");
  }

  return ["Audio Quality", "Banner Quality", "Background Quality"].map((key) => ({
    key,
    value: qualityMap.get(key) || "-"
  }));
}

function renderSubtitle(data) {
  const qualityInfo = extractQualityInfo(data.progress || []);

  const qualityHtml = qualityInfo
    .map((item) => {
      const safeValue = escapeHtml(item.value);
      return `<span class="quality-chip"><span class="quality-key">${escapeHtml(item.key)}:</span> <span class="${qualityClass(item.value)}">${safeValue}</span></span>`;
    })
    .join("");

  modalSubtitle.innerHTML = `
    ${qualityHtml}
    <span class="meta-chip meta-chip-end">Simfile ID: ${escapeHtml(data.simfileId || "-")}</span>
  `;
}

function renderHeaderStats(data) {
  modalStats.innerHTML = `
    <span class="meta-chip meta-chip-head">👁 ${escapeHtml(data.views || "-")}</span>
    <span class="meta-chip meta-chip-head">↓ ${escapeHtml(data.downloads || "-")}</span>
  `;
}

function renderProgressTable(container, items) {
  container.innerHTML = "";

  if (!items.length) {
    renderDefinitionList(container, []);
    return;
  }

  const tiers = ["Beginner", "Basic", "Difficult", "Expert", "Challenge"];
  const chartData = new Map(tiers.map((tier) => [tier, { single: null, double: null }]));
  const extras = [];

  for (const pair of items) {
    const singleMatch = pair.key.match(/^Single\s+(Beginner|Basic|Difficult|Expert|Challenge)$/i);
    const doubleMatch = pair.key.match(/^Double\s+(Beginner|Basic|Difficult|Expert|Challenge)$/i);

    if (singleMatch) {
      const tier = singleMatch[1];
      const key = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
      chartData.get(key).single = extractLevelNumber(pair.value);
      continue;
    }

    if (doubleMatch) {
      const tier = doubleMatch[1];
      const key = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
      chartData.get(key).double = extractLevelNumber(pair.value);
      continue;
    }

    if (!QUALITY_KEYS.has(pair.key)) {
      extras.push(pair);
    }
  }

  const rows = tiers
    .map((tier) => {
      const value = chartData.get(tier);
      return `<tr>
        <td>${tier}</td>
        <td>${chartBadge("👤", value.single)}</td>
        <td>${chartBadge("👥", value.double)}</td>
      </tr>`;
    })
    .join("");

  const extrasHtml = extras.length
    ? `<div class="progress-extras">${extras
        .map((pair) => `<span class="extra-pill">${escapeHtml(pair.key)}: ${escapeHtml(pair.value || "-")}</span>`)
        .join("")}</div>`
    : "";

  container.innerHTML = `
    <table class="progress-table">
      <thead>
        <tr>
          <th>Level</th>
          <th>Single</th>
          <th>Double</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ${extrasHtml}
  `;
}

function renderPackSongsTable(container, songsTable) {
  const headers = songsTable?.headers || [];
  const rows = songsTable?.rows || [];

  container.innerHTML = "";

  if (!rows.length || !headers.length) {
    renderDefinitionList(container, []);
    return;
  }

  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rowsHtml = rows
    .map((row) => {
      const cells = row.map((cell) => `<td>${escapeHtml(cell || "-")}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="pack-songs-table-wrap">
      <table class="progress-table pack-songs-table">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function renderSimpleSongsTable(container, songsTable) {
  const rows = songsTable?.rows || [];
  container.innerHTML = "";

  if (!rows.length) {
    renderDefinitionList(container, []);
    return;
  }

  const rowsHtml = rows
    .map((row) => `<tr><td>${escapeHtml((row && row[0]) || "-")}</td></tr>`)
    .join("");

  container.innerHTML = `
    <div class="pack-songs-table-wrap">
      <table class="progress-table pack-songs-table">
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function renderPackSongsTableExact(container, songsTableHtml) {
  container.innerHTML = '<div class="pack-songs-exact-host"></div>';
  const host = container.querySelector(".pack-songs-exact-host");

  if (!host) {
    return;
  }

  const shadow = host.attachShadow({ mode: "open" });
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
    <div class="table-shell">${songsTableHtml}</div>
  `;
}

async function showDetailsModal(item) {
  if (item.sourceType === "local-pack") {
    await showLocalPackDetailsModal(item);
    return;
  }

  if (item.sourceType === "stepmania-pack") {
    await showPackDetailsModal(item);
    return;
  }

  modalTitle.textContent = "Loading details...";
  modalSectionTitle.textContent = "Progress Information";
  modalSubtitle.textContent = "Fetching simfile information from ZIv.";
  modalStats.innerHTML = "";
  progressList.innerHTML = "";
  modalViewWeb.href = item.detailUrl;
  configureModalDownloadButton(item);
  openModal();

  try {
    const response = await apiFetch(`/api/simfile/${encodeURIComponent(item.simfileId)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    modalTitle.textContent = data.title || item.name;
    renderHeaderStats(data);
    renderSubtitle(data);
    modalViewWeb.href = data.detailUrl;

    renderProgressTable(progressList, data.progress || []);
  } catch (error) {
    modalTitle.textContent = "Could not load details";
    modalSubtitle.textContent = error.message;
    modalStats.innerHTML = "";
    renderProgressTable(progressList, []);
  }
}

async function showPackDetailsModal(item) {
  modalTitle.textContent = "Loading details...";
  modalSectionTitle.textContent = "Progress Information";
  modalSubtitle.textContent = "Fetching pack song list from Stepmania Online.";
  modalStats.innerHTML = "";
  progressList.innerHTML = "";
  modalViewWeb.href = item.detailUrl;
  setModalActionVisibility(true, true);
  configureModalDownloadButton(item);
  openModal();

  try {
    const response = await apiFetch(`/api/stepmania-pack/${encodeURIComponent(item.packId)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    modalTitle.textContent = data.title || item.name;
    modalStats.innerHTML = `<span class="meta-chip meta-chip-head">🎵 ${escapeHtml(String(data.songCount || 0))}</span>`;
    modalSubtitle.innerHTML = `<span class="meta-chip">Stepmania Pack</span><span class="meta-chip">Pack ID: ${escapeHtml(data.packId || item.packId || "-")}</span>`;
    modalViewWeb.href = data.detailUrl || item.detailUrl;
    if (data.songsTableHtml) {
      renderPackSongsTableExact(progressList, data.songsTableHtml);
    } else {
      renderPackSongsTable(progressList, data.songsTable);
    }
  } catch (error) {
    modalTitle.textContent = "Could not load pack details";
    modalSubtitle.textContent = error.message;
    modalStats.innerHTML = "";
    renderProgressTable(progressList, []);
  }
}

async function showLocalPackDetailsModal(item) {
  const songLibraryPath = getSavedSongLibraryPath();
  if (!songLibraryPath) {
    setStatus("Set Song Library Location in settings before browsing downloads.", true);
    openSettingsModal();
    return;
  }

  modalTitle.textContent = "Loading local pack details...";
  modalSectionTitle.textContent = "Songs";
  modalSubtitle.textContent = "Reading songs from your local Song Library.";
  modalStats.innerHTML = "";
  progressList.innerHTML = "";
  configureModalLocalPackActions(item);
  openModal();

  try {
    const params = new URLSearchParams({ songLibraryPath });
    const response = await apiFetch(`/api/downloaded/${encodeURIComponent(item.localPackId)}?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    modalTitle.textContent = data.title || item.name;
    modalStats.innerHTML = `<span class="meta-chip meta-chip-head">🎵 ${escapeHtml(String(data.songCount || 0))}</span>`;
    modalSubtitle.innerHTML = `<span class="meta-chip">Local Pack</span><span class="meta-chip">Folder: ${escapeHtml(item.name || "-")}</span>${item.updateAvailable ? '<span class="meta-chip">Update available</span>' : ""}`;
    renderSimpleSongsTable(progressList, data.songsTable || { headers: [], rows: [] });
  } catch (error) {
    modalTitle.textContent = "Could not load local pack details";
    modalSubtitle.textContent = error.message;
    modalStats.innerHTML = "";
    renderProgressTable(progressList, []);
  }
}

function setActiveCategory(category) {
  selectedCategory = category;

  if (isZivCategory(category)) {
    lastZivCategory = category;
  }

  for (const chip of categoryChips) {
    chip.classList.toggle("active", chip.dataset.category === category);
  }
}

function renderRows(items, mode) {
  currentListMode = mode;
  currentListItems = [...items];

  bodyEl.innerHTML = "";
  downloadUiByKey.clear();
  const isZivMode = mode === "latest" || mode === "search";
  listPanelEl?.classList.toggle("downloaded-mode", mode === "downloaded");
  listPanelEl?.classList.toggle("ziv-mode", isZivMode);

  const sortedItems = sortItems(items, mode);

  if (mode === "pack") {
    if (col1) {
      col1.textContent = "Pack Name";
    }
    if (col2) {
      col2.textContent = "Song Count";
    }
    col3.textContent = "Size";
  } else if (mode === "downloaded") {
    if (col1) {
      col1.textContent = "Name";
    }
    if (col2) {
      col2.textContent = "Songs";
    }
    col3.textContent = "";
  } else {
    if (col1) {
      col1.textContent = "Song";
    }
    if (col2) {
      col2.textContent = "Pack Name";
    }
    col3.textContent = mode === "search" ? "SP / DP" : "Last Update";
  }

  if (!sortedItems.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="4" class="meta">No results.</td>';
    bodyEl.appendChild(tr);
    return;
  }

  for (const item of sortedItems) {
    const fragment = rowTemplate.content.cloneNode(true) as DocumentFragment;
    const nameCell = fragment.querySelector(".name") as HTMLElement;
    const categoryCell = fragment.querySelector(".category") as HTMLElement;
    const metaCell = fragment.querySelector(".meta") as HTMLElement;
    const detailBtn = fragment.querySelector(".detail-btn") as HTMLButtonElement;
    const downloadBtn = fragment.querySelector(".download-btn") as HTMLButtonElement;
    const isPack = item.sourceType === "stepmania-pack";
    const key = getItemKey(item);

    downloadUiByKey.set(key, {
      downloadBtn
    });

    if (item.detailUrl) {
      nameCell.innerHTML = `<a href="${item.detailUrl}" target="_blank" rel="noreferrer">${escapeHtml(item.name)}</a>`;
    } else {
      nameCell.textContent = item.name || "-";
    }
    if (item.categoryUrl) {
      if (mode === "pack" || mode === "downloaded") {
        categoryCell.textContent = item.songCount || "-";
        categoryCell.removeAttribute("title");
      } else {
        const safeCategory = escapeHtml(item.category || "-");
        categoryCell.innerHTML = `<a href="${item.categoryUrl}" target="_blank" rel="noreferrer" title="${safeCategory}">${safeCategory}</a>`;
      }
    } else {
      categoryCell.textContent = mode === "pack" || mode === "downloaded" ? item.songCount || "-" : item.category || "-";
      if (mode !== "pack" && mode !== "downloaded") {
        categoryCell.setAttribute("title", item.category || "-");
      } else {
        categoryCell.removeAttribute("title");
      }
    }

    if (mode === "search") {
      metaCell.textContent = `${item.sp || "-"} / ${item.dp || "-"}`;
    } else if (mode === "pack") {
      metaCell.textContent = item.size || "-";
    } else if (mode === "downloaded") {
      metaCell.textContent = "";
    } else {
      metaCell.textContent = item.lastUpdate || "-";
    }

    detailBtn.textContent = mode === "downloaded" ? "Songs" : "Details";
    detailBtn.addEventListener("click", () => {
      showDetailsModal(item);
    });

    if (mode === "downloaded") {
      if (canUpdateLocalPack(item)) {
        downloadBtn.hidden = false;
        setButtonUpdate(downloadBtn);
        downloadBtn.addEventListener("click", () => {
          downloadSimfile(item, downloadBtn);
        });

        if (activeDownloadKeys.has(key)) {
          setButtonDownloading(downloadBtn, true);
          setRowProgressState(item, 2, "Starting update...");
        }
      } else {
        downloadBtn.hidden = true;
      }

      bodyEl.appendChild(fragment);
      continue;
    }

    if (item.installed) {
      setButtonInstalled(downloadBtn);
    } else {
      downloadBtn.addEventListener("click", () => {
        downloadSimfile(item, downloadBtn);
      });

      if (activeDownloadKeys.has(key)) {
        setButtonDownloading(downloadBtn, isPack);
        setRowProgressState(item, 2, "Starting download...");
      }
    }

    bodyEl.appendChild(fragment);
  }
}

async function loadDownloadedLibrary(filters: { songtitle?: string; songartist?: string } = {}) {
  const requestId = beginListRequest();
  const songLibraryPath = getSavedSongLibraryPath();

  if (!songLibraryPath) {
    setStatus("Set Song Library Location in settings before browsing downloads.", true);
    openSettingsModal();
    return;
  }

  titleEl.textContent = "Downloaded Packs";
  setStatus("Loading downloaded packs...");
  selectedCategory = "downloaded";
  setActiveSource("downloaded");

  try {
    const params = new URLSearchParams({ songLibraryPath });
    if (filters.songtitle) {
      params.set("songtitle", filters.songtitle);
    }

    if (filters.songartist) {
      params.set("songartist", filters.songartist);
    }

    const response = await apiFetch(`/api/downloaded?${params.toString()}`);
    const data = await response.json();

    if (!isActiveListRequest(requestId)) {
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || data.details || `Request failed (${response.status})`);
    }

    countEl.textContent = `${data.count} items`;
    renderRows(data.items, "downloaded");
    const updateCount = (data.items || []).filter((item) => item.updateAvailable).length;
    setStatus(`${data.count} Packs Installed${updateCount ? ` (${updateCount} update${updateCount === 1 ? "" : "s"} available)` : ""}`);
  } catch (error) {
    if (isActiveListRequest(requestId)) {
      setStatus(error.message, true);
    }
  }
}

async function loadCategory(category = selectedCategory) {
  const requestId = beginListRequest();
  const label = CATEGORY_LABELS[category] || "Latest User";
  const statusLabel = CATEGORY_STATUS_LABELS[category] || label;
  const songLibraryPath = getSavedSongLibraryPath();
  titleEl.textContent = category === "stepmania-packs" ? label : `${label} Songs`;
  setStatus(`Loading ${label.toLowerCase()}...`);
  setActiveCategory(category);
  setActiveSource(category === "stepmania-packs" ? "stepmania" : "ziv");

  try {
    const params = new URLSearchParams();
    if (songLibraryPath) {
      params.set("songLibraryPath", songLibraryPath);
    }

    if (category !== "stepmania-packs") {
      params.set("category", category);
    }

    const endpoint = category === "stepmania-packs" ? "/api/stepmania-packs" : "/api/simfiles";
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiFetch(`${endpoint}${suffix}`);

    if (!isActiveListRequest(requestId)) {
      return;
    }

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const data = await response.json();
    countEl.textContent = `${data.count} items`;
    renderRows(data.items, category === "stepmania-packs" ? "pack" : "latest");
    if (category === "stepmania-packs") {
      setStatus(`Found ${data.count} Packs`);
    } else {
      setStatus(`Found ${data.count} Songs from ${statusLabel}.`);
    }
  } catch (error) {
    if (isActiveListRequest(requestId)) {
      setStatus(error.message, true);
    }
  }
}

async function runSearch(event) {
  event.preventDefault();
  if (selectedSource === "downloaded") {
    const formData = new FormData(searchForm);
    await loadDownloadedLibrary({
      songtitle: (formData.get("songtitle") || "").toString().trim(),
      songartist: (formData.get("songartist") || "").toString().trim()
    });
    return;
  }

  if (selectedCategory === "stepmania-packs") {
    await runPackSearch();
    return;
  }

  const songLibraryPath = getSavedSongLibraryPath();

  const formData = new FormData(searchForm);
  const payload = {
    songtitle: (formData.get("songtitle") || "").toString().trim(),
    songartist: (formData.get("songartist") || "").toString().trim(),
    packcategory: (formData.get("packcategory") || "").toString().trim(),
    songLibraryPath
  };

  if (!payload.songtitle && !payload.songartist && !payload.packcategory) {
    setStatus("Enter a song title, artist, or category before searching.", true);
    return;
  }

  titleEl.textContent = "Search Results";
  setStatus("Searching ZIv songs...");
  const requestId = beginListRequest();

  try {
    const response = await apiFetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!isActiveListRequest(requestId)) {
      return;
    }

    if (!response.ok) {
      const normalizedError = normalizeSearchApiError(data.error);

      // Backward compatibility for older running API instances that reject category-only queries.
      if (
        normalizedError === "Provide song title, artist, or Pack Name / Category." &&
        payload.packcategory &&
        !payload.songtitle &&
        !payload.songartist
      ) {
        const fallbackParams = new URLSearchParams();
        const songLibraryPath = getSavedSongLibraryPath();
        if (songLibraryPath) {
          fallbackParams.set("songLibraryPath", songLibraryPath);
        }

        fallbackParams.set("category", selectedCategory);

        const fallbackResponse = await apiFetch(`/api/simfiles?${fallbackParams.toString()}`);
        const fallbackData = await fallbackResponse.json();
        if (!fallbackResponse.ok) {
          throw new Error(fallbackData.error || `Request failed (${fallbackResponse.status})`);
        }

        const needle = payload.packcategory.toLowerCase();
        const filtered = (fallbackData.items || []).filter((item) => String(item.category || "").toLowerCase().includes(needle));
        countEl.textContent = `${filtered.length} items`;
        renderRows(filtered, "latest");
        setStatus(`Found ${filtered.length} matching songs.`);
        return;
      }

      throw new Error(normalizedError || `Request failed (${response.status})`);
    }

    countEl.textContent = `${data.count} items`;
    renderRows(data.items, "search");
    setStatus(`Found ${data.count} matching songs.`);
  } catch (error) {
    if (isActiveListRequest(requestId)) {
      setStatus(error.message, true);
    }
  }
}

async function runPackSearch() {
  const songLibraryPath = getSavedSongLibraryPath();
  const formData = new FormData(searchForm);
  const payload = {
    songtitle: (formData.get("songtitle") || "").toString().trim(),
    songartist: (formData.get("songartist") || "").toString().trim(),
    packcategory: (formData.get("packcategory") || "").toString().trim(),
    songLibraryPath
  };

  if (!payload.songtitle && !payload.songartist && !payload.packcategory) {
    setStatus("Enter a song title, artist, or pack name before searching.", true);
    return;
  }

  titleEl.textContent = "Stepmania Pack Search Results";
  setStatus("Searching Stepmania packs...");
  const requestId = beginListRequest();

  try {
    const response = await apiFetch("/api/stepmania-packs/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!isActiveListRequest(requestId)) {
      return;
    }

    if (!response.ok) {
      const normalizedError = normalizeSearchApiError(data.error);

      // Backward compatibility for older running API instances that reject pack-only queries.
      if (
        normalizedError === "Provide song title, artist, or Pack Name / Category." &&
        payload.packcategory &&
        !payload.songtitle &&
        !payload.songartist
      ) {
        const fallbackParams = new URLSearchParams();
        if (songLibraryPath) {
          fallbackParams.set("songLibraryPath", songLibraryPath);
        }

        const fallbackResponse = await apiFetch(`/api/stepmania-packs?${fallbackParams.toString()}`);
        const fallbackData = await fallbackResponse.json();
        if (!fallbackResponse.ok) {
          throw new Error(fallbackData.error || `Request failed (${fallbackResponse.status})`);
        }

        const needle = payload.packcategory.toLowerCase();
        const filtered = (fallbackData.items || []).filter((item) => String(item.name || "").toLowerCase().includes(needle));
        countEl.textContent = `${filtered.length} items`;
        renderRows(filtered, "pack");
        setStatus(`Found ${filtered.length} matching Stepmania packs.`);
        return;
      }

      throw new Error(normalizedError || `Request failed (${response.status})`);
    }

    countEl.textContent = `${data.count} items`;
    renderRows(data.items, "pack");
    setStatus(`Found ${data.count} matching Stepmania packs.`);
  } catch (error) {
    if (isActiveListRequest(requestId)) {
      setStatus(error.message, true);
    }
  }
}

function clearSearchAndResetList() {
  const inputs = Array.from(searchForm.querySelectorAll<HTMLInputElement>('input[type="text"]'));
  for (const input of inputs) {
    input.value = "";
  }

  resetListStateForSourceChange();

  if (selectedSource === "downloaded") {
    loadDownloadedLibrary();
    return;
  }

  if (selectedSource === "stepmania" || selectedCategory === "stepmania-packs") {
    loadCategory("stepmania-packs");
    return;
  }

  loadCategory(isZivCategory(selectedCategory) ? selectedCategory : lastZivCategory);
}

searchForm.addEventListener("submit", runSearch);
searchClearBtn.addEventListener("click", clearSearchAndResetList);
for (const chip of categoryChips) {
  chip.addEventListener("click", () => {
    searchForm.reset();
    loadCategory(chip.dataset.category || "latest-user");
  });
}

for (const chip of sourceChips) {
  chip.addEventListener("click", () => {
    const source = chip.dataset.source || "ziv";
    searchForm.reset();
    resetListStateForSourceChange();

    if (source === "stepmania") {
      loadCategory("stepmania-packs");
      return;
    }

    if (source === "downloaded") {
      loadDownloadedLibrary();
      return;
    }

    loadCategory(lastZivCategory);
  });
}

settingsOpenBtn.addEventListener("click", openSettingsModal);
settingsCloseBtn.addEventListener("click", closeSettingsModal);
songLibraryBrowseBtn.addEventListener("click", () => {
  browseForSongLibrary();
});
settingsSaveBtn.addEventListener("click", saveSettings);
settingsModal.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.dataset.settingsClose === "true") {
    closeSettingsModal();
  }
});

modalCloseBtn.addEventListener("click", closeModal);
detailModal.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.dataset.close === "true") {
    closeModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (settingsModal.classList.contains("open")) {
    closeSettingsModal();
    return;
  }

  if (detailModal.classList.contains("open")) {
    closeModal();
  }
});

loadSettings();
setupListSorting();
loadCategory("latest-user");

if (import.meta.hot) {
  import.meta.hot.accept();
}
