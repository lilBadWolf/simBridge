import { contextBridge, ipcRenderer } from "electron";

type DesktopBridge = {
  getApiBaseUrl: () => Promise<string>;
  pickSongLibrary: () => Promise<string>;
};

const desktopBridge: DesktopBridge = {
  getApiBaseUrl: () => ipcRenderer.invoke("simbridge:getApiBaseUrl"),
  pickSongLibrary: () => ipcRenderer.invoke("simbridge:pickSongLibrary")
};

contextBridge.exposeInMainWorld("simBridgeDesktop", desktopBridge);
