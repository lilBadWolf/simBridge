declare global {
  interface Window {
    simBridgeDesktop?: {
      getApiBaseUrl: () => Promise<string>;
      pickSongLibrary: () => Promise<string>;
    };
  }
}

export {};
