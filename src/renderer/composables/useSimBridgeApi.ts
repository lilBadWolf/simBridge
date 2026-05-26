import type {
  DownloadDoneData,
  DownloadStreamEvent,
  ListResponse,
  LocalPackDetailResponse,
  SearchFilters,
  SimfileDetailResponse,
  StepmaniaPackDetailResponse,
  ZivCategory
} from "../types";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";

interface JsonResult<T> {
  response: Response;
  data: T;
}

export function useSimBridgeApi() {
  const apiBaseUrlPromise = window.simBridgeDesktop?.getApiBaseUrl
    ? window.simBridgeDesktop.getApiBaseUrl()
    : Promise.resolve(DEFAULT_API_BASE_URL);

  async function apiFetch(path: string, init?: RequestInit) {
    const apiBaseUrl = await apiBaseUrlPromise;
    return fetch(`${apiBaseUrl}${path}`, init);
  }

  async function fetchJson<T>(path: string, init?: RequestInit): Promise<JsonResult<T>> {
    const response = await apiFetch(path, init);
    const data = (await response.json()) as T;
    return { response, data };
  }

  async function parseStreamError(response: Response) {
    try {
      const data = (await response.json()) as { error?: string; details?: string };
      return data?.error || data?.details || `Request failed (${response.status})`;
    } catch {
      return `Request failed (${response.status})`;
    }
  }

  async function streamDownload(
    path: string,
    payload: Record<string, string>,
    onEvent: (event: DownloadStreamEvent) => void
  ): Promise<DownloadDoneData> {
    const response = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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
    let doneData: DownloadDoneData | null = null;

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

        const event = JSON.parse(trimmed) as DownloadStreamEvent;
        onEvent(event);

        if (event.type === "done") {
          doneData = event.data;
        }

        if (event.type === "error") {
          throw new Error(event.error || "Download failed.");
        }
      }
    }

    if (!doneData) {
      throw new Error("Download did not return a completion event.");
    }

    return doneData;
  }

  function createQuery(params: Record<string, string>) {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (String(value || "").trim()) {
        query.set(key, value);
      }
    }

    const suffix = query.toString();
    return suffix ? `?${suffix}` : "";
  }

  return {
    listSimfiles(category: ZivCategory, songLibraryPath: string) {
      return fetchJson<ListResponse>(`/api/simfiles${createQuery({ category, songLibraryPath })}`);
    },
    listStepmaniaPacks(songLibraryPath: string) {
      return fetchJson<ListResponse>(`/api/stepmania-packs${createQuery({ songLibraryPath })}`);
    },
    listDownloaded(songLibraryPath: string, filters: Pick<SearchFilters, "songtitle" | "songartist">) {
      return fetchJson<ListResponse>(
        `/api/downloaded${createQuery({
          songLibraryPath,
          songtitle: filters.songtitle,
          songartist: filters.songartist
        })}`
      );
    },
    getDownloadedPackDetails(localPackId: string, songLibraryPath: string) {
      return fetchJson<LocalPackDetailResponse>(
        `/api/downloaded/${encodeURIComponent(localPackId)}${createQuery({ songLibraryPath })}`
      );
    },
    searchSimfiles(payload: SearchFilters & { songLibraryPath: string }) {
      return fetchJson<ListResponse>("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    },
    searchStepmaniaPacks(payload: SearchFilters & { songLibraryPath: string }) {
      return fetchJson<ListResponse>("/api/stepmania-packs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    },
    getSimfileDetails(simfileId: string) {
      return fetchJson<SimfileDetailResponse>(`/api/simfile/${encodeURIComponent(simfileId)}`);
    },
    getStepmaniaPackDetails(packId: string) {
      return fetchJson<StepmaniaPackDetailResponse>(`/api/stepmania-pack/${encodeURIComponent(packId)}`);
    },
    downloadSimfile(simfileId: string, songLibraryPath: string, onEvent: (event: DownloadStreamEvent) => void) {
      return streamDownload("/api/download-simfile", { simfileId, songLibraryPath }, onEvent);
    },
    downloadPack(packId: string, songLibraryPath: string, onEvent: (event: DownloadStreamEvent) => void) {
      return streamDownload("/api/download-pack", { packId, songLibraryPath }, onEvent);
    }
  };
}
