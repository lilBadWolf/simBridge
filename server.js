const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fsNative = require("fs");
const fs = require("fs/promises");
const os = require("os");
const AdmZip = require("adm-zip");
const { pipeline } = require("stream/promises");

const app = express();

const BASE_URL = "https://zenius-i-vanisher.com/v5.2";
const STEP_MANIA_BASE_URL = "https://stepmaniaonline.net";
const SIMFILE_CATEGORIES = new Set(["latest-user", "latest-official", "top-official", "top-user"]);
const LIBRARY_CACHE_FILENAME = ".simbridge-cache.json";
const REMOTE_PACK_INDEX_TTL_MS = 10 * 60 * 1000;

let remotePackIndexCache = {
  fetchedAt: 0,
  items: []
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

function toAbsoluteUrl(href) {
  if (!href) {
    return "";
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  if (href.startsWith("/")) {
    return `https://zenius-i-vanisher.com${href}`;
  }

  return `${BASE_URL}/${href}`;
}

function toAbsoluteStepmaniaUrl(href) {
  if (!href) {
    return "";
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  if (href.startsWith("/")) {
    return `${STEP_MANIA_BASE_URL}${href}`;
  }

  return `${STEP_MANIA_BASE_URL}/${href}`;
}

function parseLatestUserTable(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $("table tr").each((_, tr) => {
    const nameCell = $(tr).find("td.border").eq(0);
    const categoryCell = $(tr).find("td.border").eq(1);
    const updatedCell = $(tr).find("td.border").eq(2);

    if (!nameCell.length || !categoryCell.length || !updatedCell.length) {
      return;
    }

    const nameLink = nameCell.find("a").first();
    const categoryLink = categoryCell.find("a").first();

    const simfileHref = nameLink.attr("href") || "";
    const simfileIdMatch = simfileHref.match(/simfileid=(\d+)/);
    const simfileId = simfileIdMatch ? simfileIdMatch[1] : "";

    rows.push({
      simfileId,
      name: nameLink.text().trim(),
      detailUrl: toAbsoluteUrl(simfileHref),
      category: categoryLink.text().trim(),
      categoryUrl: toAbsoluteUrl(categoryLink.attr("href")),
      lastUpdate: updatedCell.text().trim(),
      zipUrl: simfileId ? `${BASE_URL}/download.php?type=ddrsimfile&simfileid=${simfileId}` : ""
    });
  });

  return rows;
}

function parseSearchResults(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");

    if (tds.length < 4) {
      return;
    }

    const nameLink = tds.eq(0).find("a").first();
    const categoryLink = tds.eq(3).find("a").first();

    const simfileHref = nameLink.attr("href") || "";
    const simfileIdMatch = simfileHref.match(/simfileid=(\d+)/);
    const simfileId = simfileIdMatch ? simfileIdMatch[1] : "";

    rows.push({
      simfileId,
      name: nameLink.text().replace(/\s+/g, " ").trim(),
      detailUrl: toAbsoluteUrl(simfileHref),
      sp: tds.eq(1).text().replace(/\s+/g, " ").trim(),
      dp: tds.eq(2).text().replace(/\s+/g, " ").trim(),
      category: categoryLink.text().replace(/\s+/g, " ").trim(),
      categoryUrl: toAbsoluteUrl(categoryLink.attr("href")),
      zipUrl: simfileId ? `${BASE_URL}/download.php?type=ddrsimfile&simfileid=${simfileId}` : ""
    });
  });

  return rows;
}

function parseStepmaniaPackRows(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $("#packTable tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 7) {
      return;
    }

    const packLink = tds.eq(1).find("a").first();
    const downloadLink = tds.eq(6).find("a").first();
    const packHref = packLink.attr("href") || "";
    const downloadHref = downloadLink.attr("href") || "";
    const packIdMatch = packHref.match(/\/pack\/(\d+)/);
    const packId = packIdMatch ? packIdMatch[1] : "";

    const typeLabels = tds
      .eq(2)
      .find("img")
      .map((__, img) => cleanText($(img).attr("title") || $(img).attr("alt") || ""))
      .get()
      .filter(Boolean);

    rows.push({
      sourceType: "stepmania-pack",
      packId,
      simfileId: "",
      name: cleanText(packLink.text()),
      detailUrl: toAbsoluteStepmaniaUrl(packHref),
      category: typeLabels.join(", ") || cleanText(tds.eq(2).text()) || "pack",
      categoryUrl: `${STEP_MANIA_BASE_URL}/packs`,
      lastUpdate: cleanText(tds.eq(5).text()),
      size: cleanText(tds.eq(4).text()),
      songCount: cleanText(tds.eq(3).text()),
      zipUrl: toAbsoluteStepmaniaUrl(downloadHref)
    });
  });

  return rows;
}

function parseStepmaniaSearchPackRows(html) {
  const $ = cheerio.load(html);
  const byPackId = new Map();

  $("tbody tr").each((_, tr) => {
    const packLink = $(tr).find("a[href^='/pack/']").first();
    const packHref = packLink.attr("href") || "";
    const packIdMatch = packHref.match(/\/pack\/(\d+)/);
    const packId = packIdMatch ? packIdMatch[1] : "";

    if (!packId) {
      return;
    }

    if (byPackId.has(packId)) {
      return;
    }

    byPackId.set(packId, {
      sourceType: "stepmania-pack",
      packId,
      simfileId: "",
      name: cleanText(packLink.text()),
      detailUrl: toAbsoluteStepmaniaUrl(packHref),
      category: "Song Search Match",
      categoryUrl: `${STEP_MANIA_BASE_URL}/packs`,
      lastUpdate: "-",
      size: "-",
      songCount: "-",
      zipUrl: `${STEP_MANIA_BASE_URL}/download/pack/${packId}/`
    });
  });

  return Array.from(byPackId.values());
}

function parseStepmaniaPackDetails(html, packId) {
  const $ = cheerio.load(html);
  const headingTitle = cleanText($("h1").first().text());
  const pageTitle = cleanText($("title").first().text()).replace(/^Pack\s*-\s*/i, "");
  const title = headingTitle || pageTitle || `Pack ${packId}`;

  let songTable = $("#songTable").first();
  let maxSongLinks = 0;

  if (!songTable.length) {
    $("table").each((_, table) => {
      const songLinks = $(table).find("a[href^='/song/']").length;
      if (songLinks > maxSongLinks) {
        maxSongLinks = songLinks;
        songTable = $(table);
      }
    });
  }

  if (!songTable || !songTable.length) {
    return {
      sourceType: "stepmania-pack",
      packId,
      title,
      detailUrl: `${STEP_MANIA_BASE_URL}/pack/${packId}`,
      songsTableHtml: "",
      songsTable: { headers: [], rows: [] },
      songCount: 0
    };
  }

  const tableForHtml = songTable.clone();
  tableForHtml.find("[src]").each((_, el) => {
    const currentSrc = tableForHtml.find(el).attr("src");
    if (!currentSrc) {
      return;
    }

    tableForHtml.find(el).attr("src", toAbsoluteStepmaniaUrl(currentSrc));
  });
  tableForHtml.find("a[href]").each((_, el) => {
    const currentHref = tableForHtml.find(el).attr("href");
    if (!currentHref) {
      return;
    }

    tableForHtml.find(el).attr("href", toAbsoluteStepmaniaUrl(currentHref));
  });

  const songsTableHtml = $.html(tableForHtml);

  const headers = songTable
    .find("thead tr")
    .first()
    .children("th")
    .map((_, th) => cleanText($(th).text()))
    .get();

  const rows = songTable
    .find("tbody tr")
    .map((_, tr) => {
      const cells = $(tr)
        .children("td")
        .map((__, td) => {
          const cell = $(td);
          const linkTexts = cell
            .find("a")
            .map((___, a) => cleanText($(a).text()))
            .get()
            .filter(Boolean);

          let value = cleanText(cell.text());

          if (!value) {
            const iconTexts = cell
              .find("img")
              .map((___, img) => cleanText($(img).attr("title") || $(img).attr("alt") || ""))
              .get()
              .filter(Boolean);

            value = iconTexts.join(", ");
          }

          if (linkTexts.length) {
            const mergedLinks = linkTexts.join(" | ");
            if (!value || value === mergedLinks.replace(/\s*\|\s*/g, " ")) {
              return mergedLinks;
            }
          }

          return value;
        })
        .get();

      if (headers.length && cells.length > headers.length) {
        return cells.slice(0, headers.length);
      }

      return cells;
    })
    .get();

  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 0);
  const normalizedHeaders = Array.from({ length: columnCount }, (_, i) => headers[i] || "");
  const keepIndices = [];

  for (let i = 0; i < columnCount; i += 1) {
    const hasHeader = Boolean(cleanText(normalizedHeaders[i]));
    const hasValues = rows.some((row) => Boolean(cleanText(row[i] || "")));
    if (hasHeader || hasValues) {
      keepIndices.push(i);
    }
  }

  let compactHeaders = keepIndices.map((index, i) => cleanText(normalizedHeaders[index]) || `Column ${i + 1}`);
  let compactRows = rows.map((row) => keepIndices.map((index) => cleanText(row[index] || "")));

  // Some Stepmania pages include extra generated columns in static HTML; keep the primary song table columns.
  if (compactHeaders.length > 12) {
    compactHeaders = compactHeaders.slice(0, 8);
    compactRows = compactRows.map((row) => row.slice(0, 8));
  }

  return {
    sourceType: "stepmania-pack",
    packId,
    title,
    detailUrl: `${STEP_MANIA_BASE_URL}/pack/${packId}`,
    songsTableHtml,
    songsTable: {
      headers: compactHeaders,
      rows: compactRows
    },
    songCount: compactRows.length
  };
}

function cleanText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeSongName(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseCountValue(value) {
  const cleaned = cleanText(String(value || "")).replace(/[^0-9]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildLibraryCachePath(songLibraryPathInput) {
  return path.join(path.resolve(songLibraryPathInput), LIBRARY_CACHE_FILENAME);
}

function createEmptyLibraryCache() {
  return {
    version: 1,
    packs: {}
  };
}

async function readLibraryCache(songLibraryPathInput) {
  const cachePath = buildLibraryCachePath(songLibraryPathInput);

  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.packs || typeof parsed.packs !== "object") {
      return createEmptyLibraryCache();
    }

    return {
      version: 1,
      packs: parsed.packs
    };
  } catch {
    return createEmptyLibraryCache();
  }
}

async function writeLibraryCache(songLibraryPathInput, cache) {
  const cachePath = buildLibraryCachePath(songLibraryPathInput);
  const payload = JSON.stringify(cache, null, 2);
  await fs.writeFile(cachePath, payload, "utf8");
}

async function listTopLevelDirectories(songLibraryPathInput) {
  const songLibraryPath = path.resolve(songLibraryPathInput);
  const entries = await fs.readdir(songLibraryPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function fetchStepmaniaPackIndexWithCache(force = false) {
  const now = Date.now();
  if (!force && remotePackIndexCache.items.length && now - remotePackIndexCache.fetchedAt < REMOTE_PACK_INDEX_TTL_MS) {
    return remotePackIndexCache.items;
  }

  const response = await axios.get(`${STEP_MANIA_BASE_URL}/`, {
    timeout: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    }
  });

  const items = parseStepmaniaPackRows(response.data);
  remotePackIndexCache = {
    fetchedAt: now,
    items
  };

  return items;
}

function buildStepmaniaPackSnapshot(item) {
  if (!item) {
    return null;
  }

  return {
    packId: item.packId || "",
    name: item.name || "",
    songCount: item.songCount || "0",
    size: item.size || "-",
    lastUpdate: item.lastUpdate || "-",
    zipUrl: item.zipUrl || "",
    detailUrl: item.detailUrl || ""
  };
}

function hasRemoteSnapshotChanged(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot || !nextSnapshot) {
    return false;
  }

  return (
    cleanText(previousSnapshot.songCount) !== cleanText(nextSnapshot.songCount)
    || cleanText(previousSnapshot.size) !== cleanText(nextSnapshot.size)
    || cleanText(previousSnapshot.lastUpdate) !== cleanText(nextSnapshot.lastUpdate)
  );
}

function inferMatchingFoldersByPackName(folderNames, packName) {
  const normalizedPackName = normalizeSongName(packName || "");
  if (!normalizedPackName) {
    return [];
  }

  const exactMatches = folderNames.filter((folderName) => normalizeSongName(folderName) === normalizedPackName);
  if (exactMatches.length) {
    return exactMatches;
  }

  return folderNames.filter((folderName) => {
    const normalizedFolder = normalizeSongName(folderName);
    return normalizedFolder.includes(normalizedPackName) || normalizedPackName.includes(normalizedFolder);
  });
}

async function refreshDownloadedPackMetadata(songLibraryPathInput, packId, candidateFolders = []) {
  if (!songLibraryPathInput || !packId) {
    return;
  }

  const songLibraryPath = path.resolve(songLibraryPathInput);
  const cache = await readLibraryCache(songLibraryPath);
  let changed = false;

  let remotePackItem = null;
  try {
    const remoteItems = await fetchStepmaniaPackIndexWithCache(true);
    remotePackItem = remoteItems.find((item) => item.packId === packId) || null;
  } catch {
    remotePackItem = null;
  }

  const snapshot = buildStepmaniaPackSnapshot(remotePackItem);
  const topFolders = await listTopLevelDirectories(songLibraryPath).catch(() => []);

  const linkedFolders = Object.entries(cache.packs)
    .filter(([, entry]) => entry && entry.linkedPackId === packId)
    .map(([folderName]) => folderName);

  const inferredFolders = inferMatchingFoldersByPackName(topFolders, remotePackItem?.name || "");
  const targets = new Set([...candidateFolders, ...linkedFolders, ...inferredFolders]);

  for (const folderName of targets) {
    const packPath = path.join(songLibraryPath, folderName);
    let stats;
    try {
      stats = await fs.stat(packPath);
    } catch {
      continue;
    }

    if (!stats.isDirectory()) {
      continue;
    }

    const existing = cache.packs[folderName] || {};
    cache.packs[folderName] = {
      ...existing,
      linkedPackId: packId,
      sourceType: "stepmania-pack",
      sourceSnapshot: snapshot || existing.sourceSnapshot || null,
      lastDownloadedAt: new Date().toISOString(),
      packMtimeMs: Number(stats.mtimeMs) || 0
    };
    changed = true;
  }

  if (changed) {
    await writeLibraryCache(songLibraryPath, cache);
  }
}

function buildRemotePackLookups(items) {
  const byPackId = new Map();
  const byNormalizedName = new Map();

  for (const item of items || []) {
    if (item.packId) {
      byPackId.set(item.packId, item);
    }

    const key = normalizeSongName(item.name || "");
    if (key && !byNormalizedName.has(key)) {
      byNormalizedName.set(key, item);
    }
  }

  return { byPackId, byNormalizedName };
}

async function buildInstalledSongIndex(songLibraryPathInput) {
  if (!songLibraryPathInput) {
    return new Set();
  }

  const songLibraryPath = path.resolve(songLibraryPathInput);
  const installed = new Set();
  const stack = [songLibraryPath];
  const seen = new Set();

  while (stack.length) {
    const dir = stack.pop();

    if (seen.has(dir)) {
      continue;
    }

    seen.add(dir);

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    let hasChartFile = false;

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const lower = entry.name.toLowerCase();
      if (lower.endsWith(".sm") || lower.endsWith(".ssc")) {
        hasChartFile = true;
        break;
      }
    }

    if (hasChartFile) {
      installed.add(normalizeSongName(path.basename(dir)));
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      stack.push(path.join(dir, entry.name));
    }
  }

  return installed;
}

async function buildLibraryFolderIndex(songLibraryPathInput) {
  if (!songLibraryPathInput) {
    return new Set();
  }

  const songLibraryPath = path.resolve(songLibraryPathInput);
  const folders = new Set();
  const stack = [songLibraryPath];
  const seen = new Set();

  while (stack.length) {
    const dir = stack.pop();

    if (seen.has(dir)) {
      continue;
    }

    seen.add(dir);

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const childPath = path.join(dir, entry.name);
      folders.add(normalizeSongName(entry.name));
      stack.push(childPath);
    }
  }

  return folders;
}

function normalizePathForUi(value) {
  return (value || "").replace(/\\/g, "/");
}

async function collectPackSongs(packRootPath) {
  const songs = [];
  const stack = [packRootPath];
  const seen = new Set();

  while (stack.length) {
    const dir = stack.pop();

    if (seen.has(dir)) {
      continue;
    }

    seen.add(dir);

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    let hasChartFile = false;
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const lower = entry.name.toLowerCase();
      if (lower.endsWith(".sm") || lower.endsWith(".ssc")) {
        hasChartFile = true;
        break;
      }
    }

    if (hasChartFile) {
      const relativeFolder = path.relative(packRootPath, dir) || ".";
      songs.push({
        name: path.basename(dir),
        folder: normalizePathForUi(relativeFolder)
      });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      stack.push(path.join(dir, entry.name));
    }
  }

  songs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return songs;
}

async function buildLocalLibraryItems(songLibraryPathInput, filters = {}) {
  if (!songLibraryPathInput) {
    return [];
  }

  const songLibraryPath = path.resolve(songLibraryPathInput);
  const cache = await readLibraryCache(songLibraryPath);
  const entries = await fs.readdir(songLibraryPath, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const folderSet = new Set(folders);
  let cacheDirty = false;

  for (const folderName of Object.keys(cache.packs)) {
    if (folderSet.has(folderName)) {
      continue;
    }

    delete cache.packs[folderName];
    cacheDirty = true;
  }

  const titleNeedle = cleanText(filters.songtitle || "").toLowerCase();
  const artistNeedle = cleanText(filters.songartist || "").toLowerCase();
  const hasFilter = Boolean(titleNeedle || artistNeedle);
  const combinedNeedle = [titleNeedle, artistNeedle].filter(Boolean).join(" ").trim();

  let remoteLookup = { byPackId: new Map(), byNormalizedName: new Map() };

  try {
    remoteLookup = buildRemotePackLookups(await fetchStepmaniaPackIndexWithCache());
  } catch {
    remoteLookup = { byPackId: new Map(), byNormalizedName: new Map() };
  }

  const results = [];

  for (const folderName of folders) {
    const packPath = path.join(songLibraryPath, folderName);
    const stats = await fs.stat(packPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      continue;
    }

    const packMtimeMs = Number(stats.mtimeMs) || 0;
    let cacheEntry = cache.packs[folderName] || {};

    if (!Array.isArray(cacheEntry.songs) || Number(cacheEntry.packMtimeMs) !== packMtimeMs) {
      const songs = await collectPackSongs(packPath);
      cacheEntry = {
        ...cacheEntry,
        songs,
        songCount: songs.length,
        packMtimeMs,
        lastScannedAt: new Date().toISOString()
      };
      cache.packs[folderName] = cacheEntry;
      cacheDirty = true;
    }

    const songs = Array.isArray(cacheEntry.songs) ? cacheEntry.songs : [];
    const localSongCount = Number(cacheEntry.songCount ?? songs.length) || 0;

    if (hasFilter) {
      const packMatch = folderName.toLowerCase().includes(combinedNeedle);
      const songMatch = songs.some((song) => song.name.toLowerCase().includes(combinedNeedle));
      if (!packMatch && !songMatch) {
        continue;
      }
    }

    let remoteItem = null;
    if (cacheEntry.linkedPackId) {
      remoteItem = remoteLookup.byPackId.get(cacheEntry.linkedPackId) || null;
    }

    if (!remoteItem) {
      remoteItem = remoteLookup.byNormalizedName.get(normalizeSongName(folderName)) || null;
    }

    if (remoteItem && cacheEntry.linkedPackId !== remoteItem.packId) {
      cacheEntry.linkedPackId = remoteItem.packId;
      cache.packs[folderName] = cacheEntry;
      cacheDirty = true;
    }

    const previousSnapshot = cacheEntry.sourceSnapshot || null;
    const nextSnapshot = buildStepmaniaPackSnapshot(remoteItem);
    if (nextSnapshot && (!previousSnapshot || hasRemoteSnapshotChanged(previousSnapshot, nextSnapshot))) {
      cacheEntry.sourceSnapshot = nextSnapshot;
      cache.packs[folderName] = cacheEntry;
      cacheDirty = true;
    }

    const snapshot = cacheEntry.sourceSnapshot || nextSnapshot;
    const remoteSongCount = parseCountValue(snapshot?.songCount || "0");
    const remoteChanged = hasRemoteSnapshotChanged(previousSnapshot, nextSnapshot);
    const songCountMismatch = remoteSongCount > 0 && remoteSongCount !== localSongCount;
    const updateAvailable = Boolean(snapshot?.zipUrl) && (remoteChanged || songCountMismatch);

    results.push({
      sourceType: "local-pack",
      localPackId: folderName,
      simfileId: "",
      packId: cacheEntry.linkedPackId || "",
      name: folderName,
      detailUrl: snapshot?.detailUrl || "",
      category: String(localSongCount),
      categoryUrl: "",
      lastUpdate: normalizePathForUi(path.join(songLibraryPath, folderName)),
      songCount: String(localSongCount),
      size: "-",
      installed: true,
      updateAvailable,
      updatePackId: snapshot?.packId || "",
      remoteSongCount: snapshot?.songCount || "",
      remoteLastUpdate: snapshot?.lastUpdate || "",
      remoteSize: snapshot?.size || "",
      remoteDetailUrl: snapshot?.detailUrl || ""
    });
  }

  if (cacheDirty) {
    await writeLibraryCache(songLibraryPath, cache);
  }

  return results;
}

function applyInstalledFlag(items, installedIndex) {
  return items.map((item) => ({
    ...item,
    installed: installedIndex.has(normalizeSongName(item.name))
  }));
}

function applyPackInstalledFlag(items, folderIndex) {
  return items.map((item) => ({
    ...item,
    installed: folderIndex.has(normalizeSongName(item.name))
  }));
}

function parseKeyValueTable($, headerText) {
  let targetTable = null;

  $("table").each((_, table) => {
    const heading = cleanText($(table).find("tr th").first().text());
    if (heading.toLowerCase() === headerText.toLowerCase()) {
      targetTable = table;
      return false;
    }

    return undefined;
  });

  if (!targetTable) {
    return [];
  }

  const items = [];

  $(targetTable)
    .find("tr")
    .slice(1)
    .each((_, tr) => {
      const cells = $(tr)
        .find("td")
        .map((__, td) => cleanText($(td).text()))
        .get()
        .filter(Boolean);

      for (let i = 0; i < cells.length; i += 2) {
        const key = cells[i];
        const value = cells[i + 1] || "";

        if (!key) {
          continue;
        }

        items.push({ key, value });
      }
    });

  return items;
}

function parseSimfileDetails(html, simfileId) {
  const $ = cheerio.load(html);
  const title = cleanText($("h1").first().text());
  const progress = parseKeyValueTable($, "Simfile Progress Information");
  const other = parseKeyValueTable($, "Other Information");
  const views = other.find((entry) => entry.key.toLowerCase() === "views")?.value || "-";
  const downloads = other.find((entry) => entry.key.toLowerCase() === "downloads")?.value || "-";

  return {
    simfileId,
    title,
    detailUrl: `${BASE_URL}/viewsimfile.php?simfileid=${simfileId}`,
    progress,
    views,
    downloads
  };
}

function beginProgressStream(res) {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
}

function writeProgressEvent(res, payload) {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  res.write(`${JSON.stringify(payload)}\n`);
}

function isPathInside(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function extractZipSafely(zip, destinationDir) {
  const entries = zip.getEntries();
  let extractedEntries = 0;

  for (const entry of entries) {
    const normalizedEntryPath = path.normalize(entry.entryName || "").replace(/^[\\/]+/, "");
    if (!normalizedEntryPath || normalizedEntryPath.startsWith("..") || path.isAbsolute(normalizedEntryPath)) {
      continue;
    }

    const targetPath = path.resolve(destinationDir, normalizedEntryPath);
    if (!isPathInside(destinationDir, targetPath)) {
      continue;
    }

    if (entry.isDirectory) {
      await fs.mkdir(targetPath, { recursive: true });
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const data = entry.getData();
    await fs.writeFile(targetPath, data);
    extractedEntries += 1;
  }

  return extractedEntries;
}

async function downloadZipToFile(zipUrl, tempZipPath, requestConfig, onProgress) {
  const response = await axios.get(zipUrl, {
    responseType: "stream",
    timeout: requestConfig.timeout,
    maxRedirects: requestConfig.maxRedirects,
    headers: requestConfig.headers
  });

  const totalBytes = Number(response.headers["content-length"] || 0);
  let downloadedBytes = 0;
  let lastSent = -1;

  response.data.on("data", (chunk) => {
    downloadedBytes += chunk.length;

    const progressPct = totalBytes > 0 ? Math.max(2, Math.min(92, Math.round((downloadedBytes / totalBytes) * 90))) : 45;
    if (progressPct === lastSent) {
      return;
    }

    lastSent = progressPct;
    onProgress(progressPct, totalBytes);
  });

  const fileWriter = fsNative.createWriteStream(tempZipPath);
  await pipeline(response.data, fileWriter);

  return { totalBytes, downloadedBytes };
}

async function fetchSimfilesByCategory(category, res, songLibraryPathInput) {
  const siteUrl = `${BASE_URL}/simfiles.php?category=${category}`;

  try {
    const response = await axios.get(siteUrl, {
      timeout: 15000,
      headers: {
        "User-Agent": "simBridge/1.0"
      }
    });

    const baseItems = parseLatestUserTable(response.data);
    const installedIndex = await buildInstalledSongIndex(songLibraryPathInput);
    const items = applyInstalledFlag(baseItems, installedIndex);
    res.json({
      source: siteUrl,
      category,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to fetch simfiles.",
      details: error.message
    });
  }
}

function extractCookieHeader(setCookieHeaders) {
  if (!Array.isArray(setCookieHeaders) || !setCookieHeaders.length) {
    return "";
  }

  return setCookieHeaders
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function fetchStepmaniaSearchPage(searchType, queryValue) {
  const landingResponse = await axios.get(`${STEP_MANIA_BASE_URL}/`, {
    timeout: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    }
  });

  const $ = cheerio.load(landingResponse.data);
  const csrfToken = $("input[name='csrfmiddlewaretoken']").first().attr("value") || "";
  const cookieHeader = extractCookieHeader(landingResponse.headers["set-cookie"]);

  if (!csrfToken) {
    throw new Error("Stepmania search token not found.");
  }

  const body = new URLSearchParams({
    csrfmiddlewaretoken: csrfToken,
    type: searchType,
    search: queryValue,
    submit: "Search"
  }).toString();

  const searchResponse = await axios.post(`${STEP_MANIA_BASE_URL}/search`, body, {
    timeout: 20000,
    maxRedirects: 5,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      Referer: `${STEP_MANIA_BASE_URL}/`,
      Origin: STEP_MANIA_BASE_URL,
      Cookie: cookieHeader
    }
  });

  return searchResponse.data;
}

function mergePackItems(itemsPerQuery) {
  const byKey = new Map();

  for (const items of itemsPerQuery) {
    for (const item of items) {
      const key = item.packId || normalizeSongName(item.name);
      if (!key || byKey.has(key)) {
        continue;
      }

      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values());
}

function parseStepmaniaDatatableRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((cells) => {
      if (!Array.isArray(cells) || cells.length < 7) {
        return null;
      }

      const packCell = cheerio.load(`<div>${cells[1] || ""}</div>`);
      const packLink = packCell("a[href^='/pack/']").first();
      const packHref = packLink.attr("href") || "";
      const packIdMatch = packHref.match(/\/pack\/(\d+)/);
      const packId = packIdMatch ? packIdMatch[1] : "";

      if (!packId) {
        return null;
      }

      const downloadCell = cheerio.load(`<div>${cells[6] || ""}</div>`);
      const downloadHref = downloadCell("a[href]").first().attr("href") || `${STEP_MANIA_BASE_URL}/download/pack/${packId}/`;

      const typeCell = cheerio.load(`<div>${cells[4] || ""}</div>`);
      const typeLabels = typeCell("img")
        .map((_, img) => cleanText(typeCell(img).attr("title") || typeCell(img).attr("alt") || ""))
        .get()
        .filter(Boolean);

      const sizeCell = cheerio.load(`<div>${cells[2] || ""}</div>`);
      const songCountCell = cheerio.load(`<div>${cells[3] || ""}</div>`);
      const updatedCell = cheerio.load(`<div>${cells[5] || ""}</div>`);

      return {
        sourceType: "stepmania-pack",
        packId,
        simfileId: "",
        name: cleanText(packLink.text()),
        detailUrl: toAbsoluteStepmaniaUrl(packHref),
        category: typeLabels.join(", ") || "pack",
        categoryUrl: `${STEP_MANIA_BASE_URL}/packs`,
        lastUpdate: cleanText(updatedCell("div").text() || updatedCell.root().text()),
        size: cleanText(sizeCell("div").text() || sizeCell.root().text()),
        songCount: cleanText(songCountCell("div").text() || songCountCell.root().text()),
        zipUrl: toAbsoluteStepmaniaUrl(downloadHref)
      };
    })
    .filter(Boolean);
}

async function fetchStepmaniaPackNameSearchResults(packName) {
  const params = new URLSearchParams({
    draw: "1",
    start: "0",
    length: "200",
    "search[value]": packName,
    "search[regex]": "false",
    "order[0][column]": "1",
    "order[0][dir]": "asc"
  });

  const response = await axios.get(`${STEP_MANIA_BASE_URL}/api/packs/datatables?${params.toString()}`, {
    timeout: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    }
  });

  return parseStepmaniaDatatableRows(response.data?.data || []);
}

app.get("/api/simfiles", async (req, res) => {
  const category = (req.query.category || "latest-user").toString().trim().toLowerCase();
  const songLibraryPath = (req.query.songLibraryPath || "").toString().trim();

  if (!SIMFILE_CATEGORIES.has(category)) {
    return res.status(400).json({ error: "Invalid category." });
  }

  return fetchSimfilesByCategory(category, res, songLibraryPath);
});

app.get("/api/latest-user", async (_, res) => {
  return fetchSimfilesByCategory("latest-user", res, "");
});

app.get("/api/stepmania-packs", async (req, res) => {
  const songLibraryPath = (req.query.songLibraryPath || "").toString().trim();

  try {
    const response = await axios.get(`${STEP_MANIA_BASE_URL}/`, {
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
      }
    });

    const baseItems = parseStepmaniaPackRows(response.data);
    const folderIndex = await buildLibraryFolderIndex(songLibraryPath);
    const items = applyPackInstalledFlag(baseItems, folderIndex);

    res.json({
      source: `${STEP_MANIA_BASE_URL}/`,
      category: "stepmania-packs",
      count: items.length,
      items
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to fetch Stepmania packs.",
      details: error.message
    });
  }
});

app.get("/api/downloaded", async (req, res) => {
  const songLibraryPath = (req.query.songLibraryPath || "").toString().trim();
  const songtitle = (req.query.songtitle || "").toString().trim();
  const songartist = (req.query.songartist || "").toString().trim();

  if (!songLibraryPath) {
    return res.status(400).json({ error: "Song Library location is required." });
  }

  try {
    const items = await buildLocalLibraryItems(songLibraryPath, { songtitle, songartist });

    res.json({
      source: path.resolve(songLibraryPath),
      category: "downloaded",
      query: { songtitle, songartist },
      count: items.length,
      items
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to read downloaded song library.",
      details: error.message
    });
  }
});

app.get("/api/downloaded/:packId", async (req, res) => {
  const songLibraryPathInput = (req.query.songLibraryPath || "").toString().trim();
  const packId = decodeURIComponent((req.params.packId || "").toString()).trim();

  if (!songLibraryPathInput) {
    return res.status(400).json({ error: "Song Library location is required." });
  }

  if (!packId || packId.includes("/") || packId.includes("\\") || packId.includes("..")) {
    return res.status(400).json({ error: "Invalid local pack ID." });
  }

  const songLibraryPath = path.resolve(songLibraryPathInput);
  const packPath = path.resolve(path.join(songLibraryPath, packId));

  if (!packPath.startsWith(songLibraryPath)) {
    return res.status(400).json({ error: "Invalid local pack path." });
  }

  try {
    const stats = await fs.stat(packPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return res.status(404).json({ error: "Local pack folder was not found." });
    }

    const cache = await readLibraryCache(songLibraryPath);
    const packMtimeMs = Number(stats.mtimeMs) || 0;
    const cacheEntry = cache.packs[packId] || {};
    let songs = Array.isArray(cacheEntry.songs) ? cacheEntry.songs : [];

    if (!songs.length || Number(cacheEntry.packMtimeMs) !== packMtimeMs) {
      songs = await collectPackSongs(packPath);
      cache.packs[packId] = {
        ...cacheEntry,
        songs,
        songCount: songs.length,
        packMtimeMs,
        lastScannedAt: new Date().toISOString()
      };
      await writeLibraryCache(songLibraryPath, cache);
    }

    const rows = songs.map((song) => [song.name]);

    res.json({
      sourceType: "local-pack",
      packId,
      title: packId,
      detailUrl: "",
      songsTable: {
        headers: [],
        rows
      },
      songCount: rows.length
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to read local pack details.",
      details: error.message
    });
  }
});

app.post("/api/stepmania-packs/search", async (req, res) => {
  const songtitle = (req.body.songtitle || "").toString().trim();
  const songartist = (req.body.songartist || "").toString().trim();
  const packcategory = (req.body.packcategory || "").toString().trim();
  const songLibraryPath = (req.body.songLibraryPath || "").toString().trim();

  if (!songtitle && !songartist && !packcategory) {
    return res.status(400).json({ error: "Provide songtitle, songartist, or packcategory." });
  }

  try {
    let baseItems = [];

    if (songtitle || songartist) {
      const requests = [];

      if (songtitle) {
        requests.push(fetchStepmaniaSearchPage("title", songtitle));
      }

      if (songartist) {
        requests.push(fetchStepmaniaSearchPage("artist", songartist));
      }

      const pages = await Promise.all(requests);
      const parsedPerQuery = pages.map((html) => parseStepmaniaSearchPackRows(html));
      baseItems = mergePackItems(parsedPerQuery);
    } else if (packcategory) {
      baseItems = await fetchStepmaniaPackNameSearchResults(packcategory);
    }

    if (packcategory) {
      const needle = packcategory.toLowerCase();
      baseItems = baseItems.filter((item) => cleanText(item.name).toLowerCase().includes(needle));
    }

    const folderIndex = await buildLibraryFolderIndex(songLibraryPath);
    const items = applyPackInstalledFlag(baseItems, folderIndex);

    res.json({
      source: `${STEP_MANIA_BASE_URL}/search`,
      query: { songtitle, songartist, packcategory },
      count: items.length,
      items
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to search Stepmania packs.",
      details: error.message
    });
  }
});

app.post("/api/search", async (req, res) => {
  const songtitle = (req.body.songtitle || "").toString().trim();
  const songartist = (req.body.songartist || "").toString().trim();
  const packcategory = (req.body.packcategory || "").toString().trim();
  const songLibraryPath = (req.body.songLibraryPath || "").toString().trim();

  if (!songtitle && !songartist && !packcategory) {
    return res.status(400).json({ error: "Provide songtitle, songartist, or packcategory." });
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/simfiles_search_ajax.php`,
      new URLSearchParams({ songtitle, songartist }).toString(),
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "simBridge/1.0"
        }
      }
    );

    let baseItems = parseSearchResults(response.data);

    if (packcategory) {
      const needle = packcategory.toLowerCase();
      baseItems = baseItems.filter((item) => cleanText(item.category).toLowerCase().includes(needle));
    }

    const installedIndex = await buildInstalledSongIndex(songLibraryPath);
    const items = applyInstalledFlag(baseItems, installedIndex);
    res.json({
      source: `${BASE_URL}/simfiles_search_ajax.php`,
      query: { songtitle, songartist, packcategory },
      count: items.length,
      items
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to search simfiles.",
      details: error.message
    });
  }
});

app.get("/api/simfile/:simfileId", async (req, res) => {
  const simfileId = (req.params.simfileId || "").toString().trim();

  if (!/^\d+$/.test(simfileId)) {
    return res.status(400).json({ error: "Invalid simfile ID." });
  }

  try {
    const response = await axios.get(`${BASE_URL}/viewsimfile.php?simfileid=${simfileId}`, {
      timeout: 15000,
      headers: {
        "User-Agent": "simBridge/1.0"
      }
    });

    const details = parseSimfileDetails(response.data, simfileId);
    res.json(details);
  } catch (error) {
    res.status(502).json({
      error: "Failed to fetch simfile details.",
      details: error.message
    });
  }
});

app.get("/api/stepmania-pack/:packId", async (req, res) => {
  const packId = (req.params.packId || "").toString().trim();

  if (!/^\d+$/.test(packId)) {
    return res.status(400).json({ error: "Invalid pack ID." });
  }

  try {
    const response = await axios.get(`${STEP_MANIA_BASE_URL}/pack/${packId}`, {
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
      }
    });

    const details = parseStepmaniaPackDetails(response.data, packId);
    res.json(details);
  } catch (error) {
    res.status(502).json({
      error: "Failed to fetch Stepmania pack details.",
      details: error.message
    });
  }
});

app.post("/api/download-simfile", async (req, res) => {
  const simfileId = (req.body.simfileId || "").toString().trim();
  const songLibraryPathInput = (req.body.songLibraryPath || "").toString().trim();

  if (!/^\d+$/.test(simfileId)) {
    return res.status(400).json({ error: "Invalid simfile ID." });
  }

  if (!songLibraryPathInput) {
    return res.status(400).json({ error: "Song Library location is required." });
  }

  const songLibraryPath = path.resolve(songLibraryPathInput);
  const destinationDir = path.join(songLibraryPath, "Shit");
  const tempZipPath = path.join(os.tmpdir(), `simbridge-${simfileId}-${Date.now()}.zip`);
  const zipUrl = `${BASE_URL}/download.php?type=ddrsimfile&simfileid=${simfileId}`;

  try {
    beginProgressStream(res);
    writeProgressEvent(res, { type: "progress", progressPct: 2, message: "Preparing destination..." });
    await fs.mkdir(destinationDir, { recursive: true });

    writeProgressEvent(res, { type: "progress", progressPct: 4, message: "Downloading ZIP..." });
    const transfer = await downloadZipToFile(
      zipUrl,
      tempZipPath,
      {
        timeout: 60000,
        maxRedirects: 5,
        headers: {
          "User-Agent": "simBridge/1.0"
        }
      },
      (progressPct, totalBytes) => {
        const totalLabel = totalBytes > 0 ? ` (${Math.round(progressPct)}%)` : "";
        writeProgressEvent(res, { type: "progress", progressPct, message: `Downloading ZIP${totalLabel}...` });
      }
    );

    writeProgressEvent(res, { type: "progress", progressPct: 95, message: "Extracting ZIP..." });

    const zip = new AdmZip(tempZipPath);
    const entryCount = await extractZipSafely(zip, destinationDir);

    await fs.unlink(tempZipPath).catch(() => {});

    writeProgressEvent(res, {
      type: "done",
      data: {
        ok: true,
        simfileId,
        zipUrl,
        destinationDir,
        extractedEntries: entryCount,
        downloadedBytes: transfer.downloadedBytes
      }
    });
    res.end();
  } catch (error) {
    await fs.unlink(tempZipPath).catch(() => {});

    if (!res.headersSent) {
      return res.status(502).json({
        error: "Failed to download and unzip simfile.",
        details: error.message
      });
    }

    writeProgressEvent(res, {
      type: "error",
      error: "Failed to download and unzip simfile.",
      details: error.message
    });
    res.end();
  }
});

app.post("/api/download-pack", async (req, res) => {
  const packId = (req.body.packId || "").toString().trim();
  const songLibraryPathInput = (req.body.songLibraryPath || "").toString().trim();

  if (!/^[\w-]+$/.test(packId)) {
    return res.status(400).json({ error: "Invalid pack ID." });
  }

  if (!songLibraryPathInput) {
    return res.status(400).json({ error: "Song Library location is required." });
  }

  const songLibraryPath = path.resolve(songLibraryPathInput);
  const destinationDir = songLibraryPath;
  const tempZipPath = path.join(os.tmpdir(), `simbridge-pack-${packId}-${Date.now()}.zip`);
  const zipUrl = `${STEP_MANIA_BASE_URL}/download/pack/${packId}/`;

  try {
    beginProgressStream(res);
    writeProgressEvent(res, { type: "progress", progressPct: 2, message: "Preparing destination..." });
    await fs.mkdir(destinationDir, { recursive: true });

    const beforeFolders = await listTopLevelDirectories(destinationDir).catch(() => []);

    writeProgressEvent(res, { type: "progress", progressPct: 4, message: "Downloading pack ZIP..." });
    const transfer = await downloadZipToFile(
      zipUrl,
      tempZipPath,
      {
        timeout: 120000,
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          Referer: `${STEP_MANIA_BASE_URL}/packs`
        }
      },
      (progressPct, totalBytes) => {
        const totalLabel = totalBytes > 0 ? ` (${Math.round(progressPct)}%)` : "";
        writeProgressEvent(res, { type: "progress", progressPct, message: `Downloading pack ZIP${totalLabel}...` });
      }
    );

    writeProgressEvent(res, { type: "progress", progressPct: 95, message: "Extracting pack ZIP..." });

    const zip = new AdmZip(tempZipPath);
    const entryCount = await extractZipSafely(zip, destinationDir);

    const afterFolders = await listTopLevelDirectories(destinationDir).catch(() => []);
    const beforeSet = new Set(beforeFolders);
    const createdFolders = afterFolders.filter((folderName) => !beforeSet.has(folderName));

    await refreshDownloadedPackMetadata(destinationDir, packId, createdFolders).catch(() => {});

    await fs.unlink(tempZipPath).catch(() => {});

    writeProgressEvent(res, {
      type: "done",
      data: {
        ok: true,
        packId,
        zipUrl,
        destinationDir,
        extractedEntries: entryCount,
        downloadedBytes: transfer.downloadedBytes
      }
    });
    res.end();
  } catch (error) {
    await fs.unlink(tempZipPath).catch(() => {});

    if (!res.headersSent) {
      return res.status(502).json({
        error: "Failed to download and unzip pack.",
        details: error.message
      });
    }

    writeProgressEvent(res, {
      type: "error",
      error: "Failed to download and unzip pack.",
      details: error.message
    });
    res.end();
  }
});

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

function startApiServer(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      console.log(`simBridge API running at http://127.0.0.1:${resolvedPort}`);
      resolve(server);
    });

    server.on("error", (error) => {
      reject(error);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  startApiServer(port).catch((error) => {
    console.error("Failed to start simBridge API server:", error);
    process.exit(1);
  });
}

module.exports = {
  app,
  startApiServer
};
