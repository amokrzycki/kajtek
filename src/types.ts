import type { CaseSlug } from "./consts.js";
import type { SmartListeningConfig } from "./listeningPreferences.js";

export interface Station {
  id: string;
  name: string;
  short: string;
  cat: string;
  provider: string;
  stream: string;
  apiBaseUrl?: string;
  coverUrl?: string;
  _streams?: string[];
}

export type StationPref = {
  id: string;
  enabled: boolean;
  favorite: boolean;
  smartEnabled?: boolean;
};

export type CustomStation = {
  id: string;
  name: string;
  stream: string;
};

export interface RawRmfStation {
  id: number | string;
  name: string;
  idname: string;
  slug: string;
  short: string;
  mountpoint_mp3: string;
  mountpoint_aac: string;
  description?: string;
  img: string;
  search?: string;
  in_premium: number;
  station_category: Array<{ name: string; slug: string }>;
  similar_stations: SimilarStations;
}

interface SimilarStations {
  id_list: number[];
}

export interface RmfCatalogCache {
  fetchedAt: number;
  stations: RawRmfStation[];
}

export interface RawEskaStation {
  uid: string;
  now_playing_url: string;
  name: string;
  dedicated_name: string;
  cover: string;
  stream_url: string;
  stream_ic: string;
  sort: number;
}

export interface EskaCatalogCache {
  fetchedAt: number;
  stations: RawEskaStation[];
}

export interface EskaTrack {
  artists?: string[];
  name?: string;
  image?: string;
  thumb?: string;
}

export interface EskaNowPlaying {
  current?: EskaTrack | null;
  pasts?: EskaTrack[];
  futures?: EskaTrack[];
}

export interface RawTrack {
  order?: number;
  lenght?: string | number;
  length?: string | number;
  timestamp?: number;
  author?: string;
  artist?: string;
  title?: string;
  start?: string;
  startTime?: string;
  name?: string;
  song?: string;
  coverUrl?: string;
  coverBigUrl?: string;
  current?: RawTrack;
  now?: RawTrack;
  upcoming?: RawTrack[];
  next?: RawTrack[];
  songs?: RawTrack[];
  tracks?: RawTrack[];
  playlist?: RawTrack[];
}

export type ContentKind = "track" | "advertisement" | "news" | "programme" | "otherBreak" | "unknown";

export interface TrackInfo {
  artist: string;
  title: string;
  order?: number;
  start?: string | null;
  timestamp?: number;
  endTimestamp?: number | null;
  length?: number;
  isBreak?: boolean;
  isPredicted?: boolean;
  gapSec?: number;
  gapMin?: number;
  label?: string;
  isLiveBreak?: boolean;
  isFacts?: boolean;
  contentKind?: ContentKind;
  contentEvidence?: "explicit" | "inferred";
  // Playback-relative deadline from an explicitly identified, timed advertisement block.
  adEndsAt?: number;
  coverUrl?: string;
}

export interface FavTrack {
  key: string;
  timestamp: number;
  artist: string;
  title: string;
  stationTag: string;
  stationId: string;
}

export interface AppState {
  dark: boolean;
  case: CaseSlug;
  station: Station | null;
  playing: boolean;
  vol: number;
  muted: boolean;
  favs: Set<string>;
  sleepMin: number | null;
  sleepSec: number | null;
  liveTrack: TrackInfo | null;
  history: TrackInfo[];
  showHistory: boolean;
  historyTab: "program" | "favorites";
  favTracks: FavTrack[];
  viewMode: "list" | "grid";
  version: string;
  smartListening: SmartListeningConfig;
}

export interface PlaylistResult {
  observedAt?: number;
  current: TrackInfo | null;
  all: TrackInfo[];
}

export interface MetadataOptions {
  passive?: boolean;
  signal?: AbortSignal;
}

export interface Provider {
  name: string;
  parse(data: unknown, station?: Station | null): PlaylistResult | null;
  fetch?(station: Station, options?: MetadataOptions): Promise<PlaylistResult | null>;
}

export interface RamowkaItem {
  title: string;
  startTime: number;
  endTime: number;
  fullStartTime: string;
}

export interface PlaylistaItem {
  title: string;
  artist: string;
  startTime: string;
  duration: number;
}

export interface PlaylistaBlock {
  id: number;
  title: string;
  startTime: string;
  stopTime: string;
  playlistItems: PlaylistaItem[];
}
