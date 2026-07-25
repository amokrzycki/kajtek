export interface Station {
  id: string;
  name: string;
  freq: string;
  genre: string;
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
  idname?: string;
  slug?: string;
  short?: string;
  mountpoint_mp3?: string;
  mountpoint_aac?: string;
  description?: string;
  img?: string;
  search?: string;
  in_premium?: number;
  station_category?: Array<{ name: string; slug: string }>;
}

export interface RmfCatalogCache {
  fetchedAt: number;
  stations: RawRmfStation[];
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
  coverUrl?: string;
}

export interface AppState {
  dark: boolean;
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
  version: string;
}

export interface PlaylistResult {
  current: TrackInfo | null;
  all: TrackInfo[];
}

export interface Provider {
  name: string;
  parse(data: unknown, station?: Station | null): PlaylistResult | null;
}

