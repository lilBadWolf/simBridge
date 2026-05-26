import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

const { startApiServer } = require("../../server.js") as {
  startApiServer: (port?: number) => Promise<Server>;
};

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const __SIMBRIDGE_GITHUB_REPO__: string;

let mainWindow: BrowserWindow | null = null;
let apiServer: Server | null = null;
let apiBaseUrl = "http://127.0.0.1:3000";
let updateCheckInterval: NodeJS.Timeout | null = null;

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubRelease = {
  tag_name: string;
  name?: string;
  html_url: string;
  assets: ReleaseAsset[];
};

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function archAliasesForUpdater(arch: string): string[] {
  const value = (arch || "").toLowerCase();
  if (value === "x64") {
    return ["x64", "amd64"];
  }

  if (value === "arm64") {
    return ["arm64", "aarch64"];
  }

  return [value];
}

function parseVersion(version: string): number[] {
  const base = (version || "").replace(/^v/i, "").split("-")[0];
  return base
    .split(".")
    .map((part) => Number(part))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function isRemoteVersionNewer(currentVersion: string, remoteVersion: string): boolean {
  const current = parseVersion(currentVersion);
  const remote = parseVersion(remoteVersion);
  const maxLen = Math.max(current.length, remote.length);

  for (let index = 0; index < maxLen; index += 1) {
    const currentPart = current[index] || 0;
    const remotePart = remote[index] || 0;

    if (remotePart > currentPart) {
      return true;
    }

    if (remotePart < currentPart) {
      return false;
    }
  }

  return false;
}

function resolveGithubRepoSlug(): string {
  if (__SIMBRIDGE_GITHUB_REPO__) {
    return __SIMBRIDGE_GITHUB_REPO__;
  }

  return (process.env.SIMBRIDGE_GITHUB_REPO || "").trim();
}

function findBestAsset(assets: ReleaseAsset[]): string {
  if (!assets?.length) {
    return "";
  }

  const platform = process.platform;
  const arch = process.arch;
  const archAliases = archAliasesForUpdater(arch);
  const names = assets.map((asset) => asset.name.toLowerCase());

  if (platform === "win32") {
    const winExe = assets.find((asset, idx) => names[idx].endsWith(".exe") && archAliases.some((alias) => names[idx].includes(alias)));
    if (winExe) {
      return winExe.browser_download_url;
    }

    const anyExe = assets.find((asset, idx) => names[idx].endsWith(".exe"));
    if (anyExe) {
      return anyExe.browser_download_url;
    }
  }

  if (platform === "linux") {
    const deb = assets.find((asset, idx) => names[idx].endsWith(".deb") && archAliases.some((alias) => names[idx].includes(alias)));
    if (deb) {
      return deb.browser_download_url;
    }

    const anyDeb = assets.find((asset, idx) => names[idx].endsWith(".deb"));
    if (anyDeb) {
      return anyDeb.browser_download_url;
    }

    const appImage = assets.find((asset, idx) => names[idx].includes("appimage") && archAliases.some((alias) => names[idx].includes(alias)));
    if (appImage) {
      return appImage.browser_download_url;
    }

    const anyAppImage = assets.find((asset, idx) => names[idx].includes("appimage"));
    if (anyAppImage) {
      return anyAppImage.browser_download_url;
    }
  }

  return assets[0].browser_download_url;
}

async function fetchLatestRelease(repoSlug: string): Promise<GitHubRelease | null> {
  if (!repoSlug) {
    return null;
  }

  const url = `https://api.github.com/repos/${repoSlug}/releases/latest`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "simBridge-updater",
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as GitHubRelease;
}

async function checkForAppUpdates(): Promise<void> {
  if (!app.isPackaged) {
    return;
  }

  const repoSlug = resolveGithubRepoSlug();
  if (!repoSlug) {
    return;
  }

  try {
    const release = await fetchLatestRelease(repoSlug);
    if (!release) {
      return;
    }

    const currentVersion = app.getVersion();
    const remoteVersion = release.tag_name.replace(/^app-v/i, "").replace(/^v/i, "");

    if (!isRemoteVersionNewer(currentVersion, remoteVersion)) {
      return;
    }

    const targetUrl = findBestAsset(release.assets) || release.html_url;
    const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    const result = await dialog.showMessageBox(targetWindow, {
      type: "info",
      title: "Update Available",
      message: `simBridge ${remoteVersion} is available (you have ${currentVersion}).`,
      detail: "Download the latest installer now?",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (result.response === 0 && isSafeExternalUrl(targetUrl)) {
      shell.openExternal(targetUrl).catch(() => {});
    }
  } catch (error) {
    console.warn("Update check failed:", error);
  }
}

function scheduleUpdateChecks(): void {
  checkForAppUpdates().catch(() => {});

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
  }

  updateCheckInterval = setInterval(() => {
    checkForAppUpdates().catch(() => {});
  }, 1000 * 60 * 60 * 6);
}

async function loadUrlWithRetry(window: BrowserWindow, url: string, retries = 20): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await window.loadURL(url);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError;
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1060,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() || "";
    if (url === currentUrl) {
      return;
    }

    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await loadUrlWithRetry(mainWindow, MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

async function bootstrap(): Promise<void> {
  apiServer = await startApiServer(0);

  const address = apiServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve API server address.");
  }

  const apiPort = (address as AddressInfo).port;
  apiBaseUrl = `http://127.0.0.1:${apiPort}`;

  ipcMain.handle("simbridge:getApiBaseUrl", () => apiBaseUrl);
  ipcMain.handle("simbridge:pickSongLibrary", async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    const result = await dialog.showOpenDialog(focusedWindow, {
      title: "Select Song Library Location",
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || !result.filePaths.length) {
      return "";
    }

    return result.filePaths[0];
  });

  await createMainWindow();
  scheduleUpdateChecks();
}

app.whenReady().then(bootstrap).catch((error) => {
  console.error("Failed to bootstrap simBridge desktop:", error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow().catch((error) => {
      console.error("Failed to create window:", error);
    });
  }
});

app.on("before-quit", () => {
  ipcMain.removeHandler("simbridge:getApiBaseUrl");
  ipcMain.removeHandler("simbridge:pickSongLibrary");

  if (apiServer) {
    apiServer.close();
    apiServer = null;
  }

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
});
