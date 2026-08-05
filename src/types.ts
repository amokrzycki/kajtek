import type { CaseSlug } from "./consts.js";

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
  _currentStreamIndex?: number;
  _streamsFetched?: boolean;
  _coverFetched?: boolean;
  _consecutiveFailures?: number;
  _apiFailed?: boolean;
}

export type StationPref = {
  id: string;
  enabled: boolean;
  favorite: boolean;
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
  blacklistEnabled: boolean;
  adSkipEnabled: boolean;
  adSkipAutoReturnEnabled: boolean;
}

export interface PlaylistResult {
  current: TrackInfo | null;
  all: TrackInfo[];
}

export interface Provider {
  name: string;
  parse(data: unknown, station?: Station | null): PlaylistResult | null;
  fetch?(station: Station): Promise<PlaylistResult | null>;
}

export interface RamowkaItem {
  id: number;
  title: string;
  startTime: string;
  fullStartTime: string;
  fullStopTime: string;
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
