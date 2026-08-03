import type { Station } from "./types.js";

export const STORAGE_KEYS = {
  THEME: "kajtek_theme",
  FAVS: "kajtek_favs",
  FAV_TRACKS: "kajtek_fav_tracks",
  STATION_PREFS: "kajtek_station_prefs",
  RMF_CATALOG_CACHE: "kajtek_rmf_catalog",
  CUSTOM_STATIONS: "kajtek_custom_stations",
  VIEW_MODE: "kajtek_view_mode",
  BLACKLIST: "kajtek_blacklist",
} as const;

export const API_ENDPOINTS = {
  RMF_CATALOG_LOCAL: "/api/rmf/stations",
  RMF_CATALOG_REMOTE: "https://api.rmfon.pl/stations",
  RMF_STATIC_BASE: "https://static.rmf.pl",
} as const;

export const INIT_STATIONS: Station[] = [
  {
    id: "rmf",
    name: "RMF FM",
    short: "Najlepsza muzyka",
    cat: "national",
    provider: "rmf",
    stream: "https://rs202-krk.rmfstream.pl/rmf_fm",
    apiBaseUrl: "/api/rmf/stations/5",
    coverUrl: "https://static.rmf.pl/portal/stations/covers/rmf-fm/20240404114958_rmf-fm_600.jpg",
  },
  {
    id: "maxxx",
    name: "RMF MAXX",
    short: "RMF MAXX. Hity #naMAXXa",
    cat: "national",
    provider: "rmf",
    stream: "https://rs202-krk.rmfstream.pl/rmf_maxxx",
    apiBaseUrl: "/api/rmf/stations/6",
    coverUrl: "https://static.rmf.pl/portal/stations/covers/rmf-maxx/20240404115440_rmf-maxx_600.jpg",
  },
  {
    id: "classic",
    name: "RMF CLASSIC",
    short: "RMF Classic. Muzyka z klasą",
    cat: "national",
    provider: "rmf",
    stream: "https://rs202-krk.rmfstream.pl/RMFCLASSIC48",
    apiBaseUrl: "/api/rmf/stations/7",
    coverUrl: "https://static.rmf.pl/portal/stations/covers/rmf-classic/20260130151605_rmf-classic_600.jpg",
  },
];

export const TIMERS = {
  FETCH_TIMEOUT_MS: 3500,
  TRACK_POLL_MS: 5000,
  SLEEP_STEP_MS: 1000,
  HISTORY_SLIDE_MS: 700,
} as const;

export const DEFAULT_BREAK_LABEL = "Przerwa / Reklamy";
export const VU_COUNT = 24;
export const STATIONS_WITH_FACTS = ["rmf", "rmf24"];
export const VOL_LEDS = 18;
export const MAX_CONSECUTIVE_FAILURES = 5;
export const DEFAULT_VERSION = "0.6.4";
export const TROJKA_PLAYLIST_REFRESH_MS = 60_000;
