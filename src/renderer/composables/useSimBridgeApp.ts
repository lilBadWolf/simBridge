import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useSimBridgeApi } from "./useSimBridgeApi";
import type {
  BrowserItem,
  CategoryKey,
  DetailChip,
  DetailContent,
  DetailProgressRow,
  DetailState,
  DisplayDownloadState,
  DownloadStreamEvent,
  DownloadToastState,
  KeyValuePair,
  ListMode,
  ResultDisplayItem,
  SearchFilters,
  SortState,
  SourceKey,
  SourceType,
  StatusState,
  TableColumn,
  ZivCategory
} from "../types";

const SONG_LIBRARY_KEY = "simBridge.songLibraryPath";
const DEFAULT_SONG_LIBRARY_PATH = "C:/Games/ITGmania/Songs";
const QUALITY_KEYS = new Set(["Audio Quality", "Banner Quality", "Background Quality"]);
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  "latest-user": "Latest User",
  "latest-official": "Latest Official",
  "top-official": "Top Official",
  "top-user": "Top User",
  "stepmania-packs": "Stepmania Packs",
  downloaded: "Downloaded"
};
const CATEGORY_STATUS_LABELS: Record<CategoryKey, string> = {
  "latest-user": "Latest User Submitted",
  "latest-official": "Latest Official",
  "top-official": "Top Official",
  "top-user": "Top User Submitted",
  "stepmania-packs": "Stepmania Packs",
  downloaded: "Downloaded"
};

interface InternalDownloadState {
  title: string;
  progressPct: number;
  label: string;
  visible: boolean;
  isDownloading: boolean;
}

function createClosedDetailState(): DetailState {
  return {
    isOpen: false,
    isLoading: false,
    title: "Simfile Details",
    subtitleText: "",
    stats: [],
    subtitleChips: [],
    sectionTitle: "Progress Information",
    content: { kind: "empty", message: "No data available." },
    item: null,
    webUrl: "",
    showWebLink: false
  };
}

function isZivCategory(category: CategoryKey): category is ZivCategory {
  return category === "latest-user" || category === "latest-official" || category === "top-official" || category === "top-user";
}

function normalizeSongLibraryPath(value: string) {
  return (value || "").trim().replace(/\\/g, "/");
}

function getItemKey(item: BrowserItem | null) {
  if (!item) {
    return "";
  }

  if (item.sourceType === "stepmania-pack") {
    return `stepmania-pack:${item.packId || item.name}`;
  }

  if (item.sourceType === "local-pack") {
    return `local-pack:${item.localPackId || item.name}`;
  }

  return `ziv:${item.simfileId || item.name}`;
}

function canUpdateLocalPack(item: BrowserItem | null) {
  return Boolean(item && item.sourceType === "local-pack" && item.updateAvailable && item.updatePackId);
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function normalizeSearchApiError(rawError: string) {
  const text = String(rawError || "").trim();
  if (/^Provide\s+songtitle\s+or\s+songartist\.?$/i.test(text)) {
    return "Provide song title, artist, or Pack Name / Category.";
  }

  return text;
}

function parseComparableValue(rawValue: string) {
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
    const multipliers: Record<string, number> = {
      b: 1,
      kb: 1024,
      mb: 1024 ** 2,
      gb: 1024 ** 3,
      tb: 1024 ** 4
    };
    return value * multipliers[unit];
  }

  const agoMatch = text.match(/^((?:\d+(?:\.\d+)?))\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago$/i);
  if (agoMatch) {
    const value = Number(agoMatch[1]);
    const unit = agoMatch[2].toLowerCase();
    const multipliers: Record<string, number> = {
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

function getSortColumnValue(item: BrowserItem, mode: ListMode, columnIndex: number) {
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

function extractLevelNumber(value: string) {
  const match = (value || "").match(/level\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function qualityClass(value: string) {
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

function buildProgressContent(progressItems: KeyValuePair[]): DetailContent {
  if (!progressItems.length) {
    return { kind: "empty", message: "No data available." };
  }

  const tiers = ["Beginner", "Basic", "Difficult", "Expert", "Challenge"];
  const chartData = new Map<string, { single: number | null; double: number | null }>(
    tiers.map((tier) => [tier, { single: null, double: null }])
  );
  const extras: KeyValuePair[] = [];

  for (const pair of progressItems) {
    const singleMatch = pair.key.match(/^Single\s+(Beginner|Basic|Difficult|Expert|Challenge)$/i);
    const doubleMatch = pair.key.match(/^Double\s+(Beginner|Basic|Difficult|Expert|Challenge)$/i);

    if (singleMatch) {
      const tier = `${singleMatch[1].charAt(0).toUpperCase()}${singleMatch[1].slice(1).toLowerCase()}`;
      chartData.get(tier)!.single = extractLevelNumber(pair.value);
      continue;
    }

    if (doubleMatch) {
      const tier = `${doubleMatch[1].charAt(0).toUpperCase()}${doubleMatch[1].slice(1).toLowerCase()}`;
      chartData.get(tier)!.double = extractLevelNumber(pair.value);
      continue;
    }

    if (!QUALITY_KEYS.has(pair.key)) {
      extras.push(pair);
    }
  }

  const rows: DetailProgressRow[] = tiers.map((tier) => ({
    tier,
    single: chartData.get(tier)?.single ?? null,
    double: chartData.get(tier)?.double ?? null
  }));

  return { kind: "progress", rows, extras };
}

function buildQualityChips(progressItems: KeyValuePair[]): DetailChip[] {
  const qualityMap = new Map(progressItems.map((pair) => [pair.key, pair.value || "-"]));

  return ["Audio Quality", "Banner Quality", "Background Quality"].map((key) => ({
    kind: "quality",
    label: key,
    value: qualityMap.get(key) || "-",
    valueClass: qualityClass(qualityMap.get(key) || "-")
  }));
}

function normalizeItems(items: BrowserItem[], fallbackSourceType: SourceType) {
  return (items || []).map((item) => ({
    ...item,
    sourceType: item.sourceType || fallbackSourceType
  }));
}

function createLoadingDetailState(item: BrowserItem): DetailState {
  const isLocal = item.sourceType === "local-pack";
  const webUrl = item.remoteDetailUrl || item.detailUrl || "";

  return {
    isOpen: true,
    isLoading: true,
    title: isLocal ? "Loading local pack details..." : "Loading details...",
    subtitleText: isLocal ? "Reading songs from your local Song Library." : item.sourceType === "stepmania-pack"
      ? "Fetching pack song list from Stepmania Online."
      : "Fetching simfile information from ZIv.",
    stats: [],
    subtitleChips: [],
    sectionTitle: isLocal ? "Songs" : "Progress Information",
    content: { kind: "empty", message: "" },
    item,
    webUrl,
    showWebLink: Boolean(webUrl)
  };
}

function createErrorDetailState(item: BrowserItem, title: string, message: string): DetailState {
  const webUrl = item.remoteDetailUrl || item.detailUrl || "";

  return {
    isOpen: true,
    isLoading: false,
    title,
    subtitleText: message,
    stats: [],
    subtitleChips: [],
    sectionTitle: item.sourceType === "local-pack" ? "Songs" : "Progress Information",
    content: { kind: "empty", message: "No data available." },
    item,
    webUrl,
    showWebLink: Boolean(webUrl)
  };
}

export function useSimBridgeApp() {
  const api = useSimBridgeApi();
  const filters = reactive<SearchFilters>({ songtitle: "", songartist: "", packcategory: "" });
  const selectedSource = ref<SourceKey>("ziv");
  const selectedCategory = ref<CategoryKey>("latest-user");
  const lastZivCategory = ref<ZivCategory>("latest-user");
  const listMode = ref<ListMode>("latest");
  const listTitle = ref("Latest User Songs");
  const resultCount = ref(0);
  const listItems = ref<BrowserItem[]>([]);
  const listLoading = ref(false);
  const status = reactive<StatusState>({
    message: "Loading latest user songs...",
    isError: false
  });
  const sortState = reactive<SortState>({ columnIndex: -1, direction: "asc" });
  const isSettingsOpen = ref(false);
  const songLibraryPath = ref(DEFAULT_SONG_LIBRARY_PATH);
  const detailState = ref<DetailState>(createClosedDetailState());
  const listRequestSequence = ref(0);
  const activeListRequestId = ref(0);
  const downloadStates = reactive<Record<string, InternalDownloadState>>({});

  function setStatus(message: string, isError = false) {
    status.message = String(message || "").trimEnd().replace(/\.$/, "");
    status.isError = isError;
  }

  function ensureSongLibraryPath() {
    const saved = normalizeSongLibraryPath(localStorage.getItem(SONG_LIBRARY_KEY) || "");
    if (!saved) {
      localStorage.setItem(SONG_LIBRARY_KEY, DEFAULT_SONG_LIBRARY_PATH);
      return DEFAULT_SONG_LIBRARY_PATH;
    }

    return saved;
  }

  function beginListRequest() {
    listRequestSequence.value += 1;
    activeListRequestId.value = listRequestSequence.value;
    return activeListRequestId.value;
  }

  function isActiveListRequest(requestId: number) {
    return requestId === activeListRequestId.value;
  }

  function resetSort() {
    sortState.columnIndex = -1;
    sortState.direction = "asc";
  }

  function resetSearchFields() {
    filters.songtitle = "";
    filters.songartist = "";
    filters.packcategory = "";
  }

  function updateFilters(next: Partial<SearchFilters>) {
    Object.assign(filters, next);
  }

  function getDisplayDownloadState(item: BrowserItem | null): DisplayDownloadState {
    if (!item) {
      return {
        label: "Download",
        hidden: true,
        disabled: true,
        toneClass: "",
        isDownloading: false,
        ariaLabel: "Download"
      };
    }

    const downloadEntry = downloadStates[getItemKey(item)];
    const isPack = item.sourceType === "stepmania-pack" || canUpdateLocalPack(item);

    if (downloadEntry?.isDownloading) {
      return {
        label: isPack ? "Downloading pack" : "Downloading",
        hidden: false,
        disabled: true,
        toneClass: "downloading-btn",
        isDownloading: true,
        ariaLabel: isPack ? "Downloading pack" : "Downloading"
      };
    }

    if (item.sourceType === "local-pack") {
      if (canUpdateLocalPack(item)) {
        return {
          label: "Update",
          hidden: false,
          disabled: false,
          toneClass: "",
          isDownloading: false,
          ariaLabel: "Update downloaded pack"
        };
      }

      return {
        label: "Update",
        hidden: true,
        disabled: true,
        toneClass: "",
        isDownloading: false,
        ariaLabel: "Update downloaded pack"
      };
    }

    if (item.installed) {
      return {
        label: "Downloaded",
        hidden: false,
        disabled: true,
        toneClass: "installed-btn",
        isDownloading: false,
        ariaLabel: "Already downloaded"
      };
    }

    return {
      label: "Download",
      hidden: false,
      disabled: false,
      toneClass: "",
      isDownloading: false,
      ariaLabel: "Download"
    };
  }

  function scheduleToastRemoval(item: BrowserItem) {
    const key = getItemKey(item);
    window.setTimeout(() => {
      delete downloadStates[key];
    }, 1200);
  }

  function updateDownloadProgress(item: BrowserItem, progressPct: number, label: string, visible = true) {
    const key = getItemKey(item);
    downloadStates[key] = {
      title: item.name || "Download",
      progressPct: Math.max(0, Math.min(100, Number(progressPct) || 0)),
      label: label || `${Math.round(progressPct)}%`,
      visible,
      isDownloading: visible
    };
  }

  async function loadCategory(category: ZivCategory | "stepmania-packs") {
    const requestId = beginListRequest();
    const label = CATEGORY_LABELS[category];
    const statusLabel = CATEGORY_STATUS_LABELS[category];
    const savedSongLibraryPath = ensureSongLibraryPath();

    listLoading.value = true;
    listItems.value = [];
    resultCount.value = 0;
    listTitle.value = category === "stepmania-packs" ? label : `${label} Songs`;
    setStatus(`Loading ${label.toLowerCase()}...`);

    selectedCategory.value = category;
    selectedSource.value = category === "stepmania-packs" ? "stepmania" : "ziv";

    if (isZivCategory(category)) {
      lastZivCategory.value = category;
      listMode.value = "latest";
    } else {
      listMode.value = "pack";
    }

    try {
      if (category === "stepmania-packs") {
        const { response, data } = await api.listStepmaniaPacks(savedSongLibraryPath);

        if (!isActiveListRequest(requestId)) {
          return;
        }

        if (!response.ok) {
          throw new Error((data as { error?: string; details?: string }).error || `Request failed (${response.status})`);
        }

        listItems.value = normalizeItems(data.items, "stepmania-pack");
        resultCount.value = data.count;
        setStatus(`Found ${data.count} Packs`);
        return;
      }

      const { response, data } = await api.listSimfiles(category, savedSongLibraryPath);

      if (!isActiveListRequest(requestId)) {
        return;
      }

      if (!response.ok) {
        throw new Error((data as { error?: string; details?: string }).error || `Request failed (${response.status})`);
      }

      listMode.value = "latest";
      listItems.value = normalizeItems(data.items, "ziv");
      resultCount.value = data.count;
      setStatus(`Found ${data.count} Songs from ${statusLabel}.`);
    } catch (error) {
      if (isActiveListRequest(requestId)) {
        setStatus(normalizeError(error), true);
      }
    } finally {
      if (isActiveListRequest(requestId)) {
        listLoading.value = false;
      }
    }
  }

  async function loadDownloadedLibrary() {
    const requestId = beginListRequest();
    const savedSongLibraryPath = ensureSongLibraryPath();

    if (!savedSongLibraryPath) {
      setStatus("Set Song Library Location in settings before browsing downloads.", true);
      isSettingsOpen.value = true;
      return;
    }

    listLoading.value = true;
    listItems.value = [];
    resultCount.value = 0;
    listMode.value = "downloaded";
    listTitle.value = "Downloaded Packs";
    setStatus("Loading downloaded packs...");
    selectedCategory.value = "downloaded";
    selectedSource.value = "downloaded";

    try {
      const { response, data } = await api.listDownloaded(savedSongLibraryPath, {
        songtitle: filters.songtitle,
        songartist: filters.songartist
      });

      if (!isActiveListRequest(requestId)) {
        return;
      }

      if (!response.ok) {
        throw new Error((data as { error?: string; details?: string }).error || `Request failed (${response.status})`);
      }

      listItems.value = normalizeItems(data.items, "local-pack");
      resultCount.value = data.count;
      const updateCount = data.items.filter((item) => item.updateAvailable).length;
      setStatus(`${data.count} Packs Installed${updateCount ? ` (${updateCount} update${updateCount === 1 ? "" : "s"} available)` : ""}`);
    } catch (error) {
      if (isActiveListRequest(requestId)) {
        setStatus(normalizeError(error), true);
      }
    } finally {
      if (isActiveListRequest(requestId)) {
        listLoading.value = false;
      }
    }
  }

  async function runPackSearch() {
    const requestId = beginListRequest();
    const savedSongLibraryPath = ensureSongLibraryPath();
    const payload = {
      songtitle: filters.songtitle.trim(),
      songartist: filters.songartist.trim(),
      packcategory: filters.packcategory.trim(),
      songLibraryPath: savedSongLibraryPath
    };

    if (!payload.songtitle && !payload.songartist && !payload.packcategory) {
      setStatus("Enter a song title, artist, or pack name before searching.", true);
      return;
    }

    listLoading.value = true;
    listItems.value = [];
    resultCount.value = 0;
    listMode.value = "pack";
    listTitle.value = "Stepmania Pack Search Results";
    setStatus("Searching Stepmania packs...");

    try {
      const { response, data } = await api.searchStepmaniaPacks(payload);

      if (!isActiveListRequest(requestId)) {
        return;
      }

      if (!response.ok) {
        const normalizedError = normalizeSearchApiError((data as { error?: string }).error || "");

        if (
          normalizedError === "Provide song title, artist, or Pack Name / Category."
          && payload.packcategory
          && !payload.songtitle
          && !payload.songartist
        ) {
          const fallback = await api.listStepmaniaPacks(savedSongLibraryPath);
          if (!fallback.response.ok) {
            throw new Error((fallback.data as { error?: string; details?: string }).error || `Request failed (${fallback.response.status})`);
          }

          const needle = payload.packcategory.toLowerCase();
          const filtered = fallback.data.items.filter((item) => String(item.name || "").toLowerCase().includes(needle));
          listItems.value = normalizeItems(filtered, "stepmania-pack");
          resultCount.value = filtered.length;
          setStatus(`Found ${filtered.length} matching Stepmania packs.`);
          return;
        }

        throw new Error(normalizedError || `Request failed (${response.status})`);
      }

      listItems.value = normalizeItems(data.items, "stepmania-pack");
      resultCount.value = data.count;
      setStatus(`Found ${data.count} matching Stepmania packs.`);
    } catch (error) {
      if (isActiveListRequest(requestId)) {
        setStatus(normalizeError(error), true);
      }
    } finally {
      if (isActiveListRequest(requestId)) {
        listLoading.value = false;
      }
    }
  }

  async function submitSearch() {
    if (selectedSource.value === "downloaded") {
      await loadDownloadedLibrary();
      return;
    }

    if (selectedCategory.value === "stepmania-packs") {
      await runPackSearch();
      return;
    }

    const requestId = beginListRequest();
    const savedSongLibraryPath = ensureSongLibraryPath();
    const payload = {
      songtitle: filters.songtitle.trim(),
      songartist: filters.songartist.trim(),
      packcategory: filters.packcategory.trim(),
      songLibraryPath: savedSongLibraryPath
    };

    if (!payload.songtitle && !payload.songartist && !payload.packcategory) {
      setStatus("Enter a song title, artist, or category before searching.", true);
      return;
    }

    listLoading.value = true;
    listItems.value = [];
    resultCount.value = 0;
    listMode.value = "search";
    listTitle.value = "Search Results";
    setStatus("Searching ZIv songs...");

    try {
      const { response, data } = await api.searchSimfiles(payload);

      if (!isActiveListRequest(requestId)) {
        return;
      }

      if (!response.ok) {
        const normalizedError = normalizeSearchApiError((data as { error?: string }).error || "");

        if (
          normalizedError === "Provide song title, artist, or Pack Name / Category."
          && payload.packcategory
          && !payload.songtitle
          && !payload.songartist
          && isZivCategory(selectedCategory.value)
        ) {
          const fallback = await api.listSimfiles(selectedCategory.value, savedSongLibraryPath);
          if (!fallback.response.ok) {
            throw new Error((fallback.data as { error?: string; details?: string }).error || `Request failed (${fallback.response.status})`);
          }

          const needle = payload.packcategory.toLowerCase();
          const filtered = fallback.data.items.filter((item) => String(item.category || "").toLowerCase().includes(needle));
          listItems.value = normalizeItems(filtered, "ziv");
          resultCount.value = filtered.length;
          setStatus(`Found ${filtered.length} matching songs.`);
          return;
        }

        throw new Error(normalizedError || `Request failed (${response.status})`);
      }

      listItems.value = normalizeItems(data.items, "ziv");
      resultCount.value = data.count;
      setStatus(`Found ${data.count} matching songs.`);
    } catch (error) {
      if (isActiveListRequest(requestId)) {
        setStatus(normalizeError(error), true);
      }
    } finally {
      if (isActiveListRequest(requestId)) {
        listLoading.value = false;
      }
    }
  }

  function selectCategory(category: ZivCategory) {
    resetSearchFields();
    resetSort();
    loadCategory(category);
  }

  function selectSource(source: SourceKey) {
    resetSearchFields();
    resetSort();
    beginListRequest();

    if (source === "stepmania") {
      loadCategory("stepmania-packs");
      return;
    }

    if (source === "downloaded") {
      loadDownloadedLibrary();
      return;
    }

    loadCategory(lastZivCategory.value);
  }

  function clearSearchAndResetList() {
    resetSearchFields();
    resetSort();
    beginListRequest();

    if (selectedSource.value === "downloaded") {
      loadDownloadedLibrary();
      return;
    }

    if (selectedSource.value === "stepmania" || selectedCategory.value === "stepmania-packs") {
      loadCategory("stepmania-packs");
      return;
    }

    loadCategory(lastZivCategory.value);
  }

  async function openDetails(item: BrowserItem) {
    const savedSongLibraryPath = ensureSongLibraryPath();

    if (item.sourceType === "local-pack" && !savedSongLibraryPath) {
      setStatus("Set Song Library Location in settings before browsing downloads.", true);
      isSettingsOpen.value = true;
      return;
    }

    detailState.value = createLoadingDetailState(item);

    try {
      if (item.sourceType === "local-pack") {
        const { response, data } = await api.getDownloadedPackDetails(item.localPackId || item.name, savedSongLibraryPath);
        if (!response.ok) {
          throw new Error((data as { error?: string; details?: string }).error || `Request failed (${response.status})`);
        }

        detailState.value = {
          isOpen: true,
          isLoading: false,
          title: data.title || item.name,
          subtitleText: "",
          stats: [{ kind: "meta", value: `🎵 ${String(data.songCount || 0)}`, emphasis: true }],
          subtitleChips: [
            { kind: "meta", value: "Local Pack" },
            { kind: "meta", value: `Folder: ${item.name || "-"}` },
            ...(item.updateAvailable ? [{ kind: "meta", value: "Update available" } as DetailChip] : [])
          ],
          sectionTitle: "Songs",
          content: {
            kind: "table",
            headers: [],
            rows: data.songsTable?.rows || []
          },
          item,
          webUrl: item.remoteDetailUrl || item.detailUrl || "",
          showWebLink: Boolean(item.remoteDetailUrl || item.detailUrl)
        };
        return;
      }

      if (item.sourceType === "stepmania-pack") {
        const { response, data } = await api.getStepmaniaPackDetails(item.packId || "");
        if (!response.ok) {
          throw new Error((data as { error?: string; details?: string }).error || `Request failed (${response.status})`);
        }

        detailState.value = {
          isOpen: true,
          isLoading: false,
          title: data.title || item.name,
          subtitleText: "",
          stats: [{ kind: "meta", value: `🎵 ${String(data.songCount || 0)}`, emphasis: true }],
          subtitleChips: [
            { kind: "meta", value: "Stepmania Pack" },
            { kind: "meta", value: `Pack ID: ${data.packId || item.packId || "-"}` }
          ],
          sectionTitle: "Songs",
          content: data.songsTableHtml
            ? { kind: "exact-html", html: data.songsTableHtml }
            : {
                kind: "table",
                headers: data.songsTable?.headers || [],
                rows: data.songsTable?.rows || []
              },
          item,
          webUrl: data.detailUrl || item.detailUrl || "",
          showWebLink: Boolean(data.detailUrl || item.detailUrl)
        };
        return;
      }

      const { response, data } = await api.getSimfileDetails(item.simfileId);
      if (!response.ok) {
        throw new Error((data as { error?: string; details?: string }).error || `Request failed (${response.status})`);
      }

      detailState.value = {
        isOpen: true,
        isLoading: false,
        title: data.title || item.name,
        subtitleText: "",
        stats: [
          { kind: "meta", value: `👁 ${data.views || "-"}`, emphasis: true },
          { kind: "meta", value: `↓ ${data.downloads || "-"}`, emphasis: true }
        ],
        subtitleChips: [
          ...buildQualityChips(data.progress || []),
          { kind: "meta", value: `Simfile ID: ${data.simfileId || "-"}` }
        ],
        sectionTitle: "Progress Information",
        content: buildProgressContent(data.progress || []),
        item,
        webUrl: data.detailUrl || item.detailUrl || "",
        showWebLink: Boolean(data.detailUrl || item.detailUrl)
      };
    } catch (error) {
      detailState.value = createErrorDetailState(
        item,
        item.sourceType === "local-pack"
          ? "Could not load local pack details"
          : item.sourceType === "stepmania-pack"
            ? "Could not load pack details"
            : "Could not load details",
        normalizeError(error)
      );
    }
  }

  function closeDetail() {
    detailState.value = createClosedDetailState();
  }

  function openSettings() {
    isSettingsOpen.value = true;
  }

  function closeSettings() {
    isSettingsOpen.value = false;
  }

  function saveSettings() {
    const normalized = normalizeSongLibraryPath(songLibraryPath.value) || DEFAULT_SONG_LIBRARY_PATH;
    localStorage.setItem(SONG_LIBRARY_KEY, normalized);
    songLibraryPath.value = normalized;
    setStatus(`Saved song library location: ${normalized}`);
    closeSettings();
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

      songLibraryPath.value = normalizeSongLibraryPath(selectedPath);
    } catch (error) {
      setStatus(normalizeError(error), true);
    }
  }

  async function downloadItem(item: BrowserItem) {
    const savedSongLibraryPath = ensureSongLibraryPath();
    if (!savedSongLibraryPath) {
      setStatus("Set Song Library Location in settings before downloading.", true);
      openSettings();
      return;
    }

    const key = getItemKey(item);
    if (downloadStates[key]?.isDownloading) {
      setStatus(`${item.name} is already downloading.`);
      return;
    }

    const isPack = item.sourceType === "stepmania-pack" || canUpdateLocalPack(item);
    updateDownloadProgress(item, 2, canUpdateLocalPack(item) ? "Starting update..." : "Starting download...");
    setStatus(`${canUpdateLocalPack(item) ? "Updating" : "Downloading"} ${item.name}...`);

    const handleEvent = (event: DownloadStreamEvent) => {
      if (event.type === "progress") {
        updateDownloadProgress(item, event.progressPct, event.message);
        return;
      }

      if (event.type === "done") {
        downloadStates[key] = {
          title: item.name || "Download",
          progressPct: 100,
          label: "Complete",
          visible: true,
          isDownloading: false
        };
      }
    };

    try {
      const doneData = isPack
        ? await api.downloadPack(item.packId || item.updatePackId || "", savedSongLibraryPath, handleEvent)
        : await api.downloadSimfile(item.simfileId, savedSongLibraryPath, handleEvent);

      if (canUpdateLocalPack(item)) {
        item.updateAvailable = false;
        setStatus(`Updated and extracted into ${doneData.destinationDir}`);
        scheduleToastRemoval(item);
        await loadDownloadedLibrary();
        return;
      }

      item.installed = true;
      setStatus(`Downloaded and unzipped into ${doneData.destinationDir}`);
      scheduleToastRemoval(item);
    } catch (error) {
      delete downloadStates[key];
      setStatus(normalizeError(error), true);
    }
  }

  async function downloadActiveDetail() {
    if (!detailState.value.item) {
      return;
    }

    await downloadItem(detailState.value.item);
  }

  function toggleSort(columnIndex: number) {
    if (columnIndex >= 3) {
      return;
    }

    if (sortState.columnIndex === columnIndex) {
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      return;
    }

    sortState.columnIndex = columnIndex;
    sortState.direction = "asc";
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return;
    }

    if (isSettingsOpen.value) {
      closeSettings();
      return;
    }

    if (detailState.value.isOpen) {
      closeDetail();
    }
  }

  const columns = computed<TableColumn[]>(() => {
    if (listMode.value === "pack") {
      return [
        { id: "col-1", label: "Pack Name" },
        { id: "col-2", label: "Song Count" },
        { id: "col-3", label: "Size" },
        { id: "col-4", label: "Actions" }
      ];
    }

    if (listMode.value === "downloaded") {
      return [
        { id: "col-1", label: "Name" },
        { id: "col-2", label: "Songs" },
        { id: "col-3", label: "" },
        { id: "col-4", label: "Actions" }
      ];
    }

    return [
      { id: "col-1", label: "Song" },
      { id: "col-2", label: "Pack Name" },
      { id: "col-3", label: listMode.value === "search" ? "SP / DP" : "Last Update" },
      { id: "col-4", label: "Actions" }
    ];
  });

  const sortedItems = computed(() => {
    if (sortState.columnIndex < 0) {
      return [...listItems.value];
    }

    const directionMultiplier = sortState.direction === "asc" ? 1 : -1;
    return [...listItems.value].sort((left, right) => {
      const leftValue = parseComparableValue(getSortColumnValue(left, listMode.value, sortState.columnIndex));
      const rightValue = parseComparableValue(getSortColumnValue(right, listMode.value, sortState.columnIndex));

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * directionMultiplier;
      }

      return String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: "base" }) * directionMultiplier;
    });
  });

  const displayItems = computed<ResultDisplayItem[]>(() => sortedItems.value.map((item) => ({
    ...item,
    detailLabel: listMode.value === "downloaded" ? "Songs" : "Details",
    metaText: listMode.value === "search"
      ? `${item.sp || "-"} / ${item.dp || "-"}`
      : listMode.value === "pack"
        ? item.size || "-"
        : listMode.value === "downloaded"
          ? ""
          : item.lastUpdate || "-",
    download: getDisplayDownloadState(item)
  })));

  const countLabel = computed(() => `${resultCount.value} items`);

  const downloadToasts = computed<DownloadToastState[]>(() => Object.entries(downloadStates)
    .filter(([, entry]) => entry.visible)
    .map(([key, entry]) => ({
      key,
      title: entry.title,
      progressPct: entry.progressPct,
      label: entry.label
    })));

  const detailDownloadAction = computed(() => getDisplayDownloadState(detailState.value.item));

  onMounted(() => {
    songLibraryPath.value = ensureSongLibraryPath();
    window.addEventListener("keydown", handleKeydown);
    loadCategory("latest-user");
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeydown);
  });

  return {
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
  };
}
