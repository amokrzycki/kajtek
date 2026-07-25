import type { Station } from "./types";

export const STORAGE_KEYS = {
  THEME: "kajtek_theme",
  FAVS: "kajtek_favs",
  STATION_PREFS: "kajtek_station_prefs",
  RMF_CATALOG_CACHE: "kajtek_rmf_catalog",
  CUSTOM_STATIONS: "kajtek_custom_stations",
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
  },
  {
    id: "rmf-maxxx",
    name: "RMF MAXX",
    short: "RMF MAXX. Hity #naMAXXa",
    cat: "national",
    provider: "rmf",
    stream: "https://rs202-krk.rmfstream.pl/rmf_maxxx",
    apiBaseUrl: "/api/rmf/stations/6",
  },
  {
    id: "rmf-classic",
    name: "RMF CLASSIC",
    short: "RMF Classic. Muzyka z klasą",
    cat: "national",
    provider: "rmf",
    stream: "https://rs202-krk.rmfstream.pl/RMFCLASSIC48",
    apiBaseUrl: "/api/rmf/stations/7",
  },
];

export const TIMERS = {
  FETCH_TIMEOUT_MS: 3500,
  TRACK_POLL_MS: 5000,
  SLEEP_STEP_MS: 1000,
  HISTORY_SLIDE_MS: 700,
} as const;

export const VU_COUNT = 18;
export const MAX_CONSECUTIVE_FAILURES = 5;
export const DEFAULT_VERSION = "0.3";

export const getFactsLabel = (targetHourStr: string) => `Serwis informacyjny / Fakty RMF FM (~${targetHourStr})`;
