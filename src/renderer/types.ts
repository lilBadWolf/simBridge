export type SourceType = "ziv" | "stepmania-pack" | "local-pack";

export type SourceKey = "ziv" | "stepmania" | "downloaded";

export type ZivCategory = "latest-user" | "latest-official" | "top-official" | "top-user";

export type CategoryKey = ZivCategory | "stepmania-packs" | "downloaded";

export type ListMode = "latest" | "search" | "pack" | "downloaded";

export type SortDirection = "asc" | "desc";

export interface SearchFilters {
  songtitle: string;
  songartist: string;
  packcategory: string;
}

export interface BrowserItem {
  sourceType: SourceType;
  simfileId: string;
  packId?: string;
  localPackId?: string;
  name: string;
  detailUrl?: string;
  category: string;
  categoryUrl?: string;
  lastUpdate?: string;
  size?: string;
  songCount?: string;
  zipUrl?: string;
  sp?: string;
  dp?: string;
  installed?: boolean;
  updateAvailable?: boolean;
  updatePackId?: string;
  remoteSongCount?: string;
  remoteLastUpdate?: string;
  remoteSize?: string;
  remoteDetailUrl?: string;
}

export interface ListResponse {
  count: number;
  items: BrowserItem[];
}

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface SimfileDetailResponse {
  simfileId: string;
  title: string;
  detailUrl: string;
  progress: KeyValuePair[];
  views: string;
  downloads: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface StepmaniaPackDetailResponse {
  sourceType: "stepmania-pack";
  packId: string;
  title: string;
  detailUrl: string;
  songsTableHtml: string;
  songsTable: TableData;
  songCount: number;
}

export interface LocalPackDetailResponse {
  sourceType: "local-pack";
  packId: string;
  title: string;
  detailUrl: string;
  songsTable: TableData;
  songCount: number;
}

export interface DownloadDoneData {
  ok: boolean;
  simfileId?: string;
  packId?: string;
  zipUrl: string;
  destinationDir: string;
  extractedEntries: number;
  downloadedBytes: number;
}

export interface DownloadProgressEvent {
  type: "progress";
  progressPct: number;
  message: string;
}

export interface DownloadDoneEvent {
  type: "done";
  data: DownloadDoneData;
}

export interface DownloadErrorEvent {
  type: "error";
  error: string;
  details?: string;
}

export type DownloadStreamEvent = DownloadProgressEvent | DownloadDoneEvent | DownloadErrorEvent;

export interface StatusState {
  message: string;
  isError: boolean;
}

export interface SortState {
  columnIndex: number;
  direction: SortDirection;
}

export interface TableColumn {
  id: string;
  label: string;
}

export interface DisplayDownloadState {
  label: string;
  hidden: boolean;
  disabled: boolean;
  toneClass: string;
  isDownloading: boolean;
  ariaLabel: string;
}

export interface ResultDisplayItem extends BrowserItem {
  detailLabel: string;
  metaText: string;
  download: DisplayDownloadState;
}

export interface DetailChip {
  kind: "meta" | "quality";
  label?: string;
  value: string;
  valueClass?: string;
  emphasis?: boolean;
}

export interface DetailProgressRow {
  tier: string;
  single: number | null;
  double: number | null;
}

export type DetailContent =
  | { kind: "progress"; rows: DetailProgressRow[]; extras: KeyValuePair[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "exact-html"; html: string }
  | { kind: "empty"; message: string };

export interface DetailState {
  isOpen: boolean;
  isLoading: boolean;
  title: string;
  subtitleText: string;
  stats: DetailChip[];
  subtitleChips: DetailChip[];
  sectionTitle: string;
  content: DetailContent;
  item: BrowserItem | null;
  webUrl: string;
  showWebLink: boolean;
}

export interface DownloadToastState {
  key: string;
  title: string;
  progressPct: number;
  label: string;
}
