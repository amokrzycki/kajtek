import type { Station } from "./types";

export const STORAGE_KEYS = {
  THEME: "kajtek_theme",
  FAVS: "kajtek_favs",
} as const;

export const ALL_STATIONS: Station[] = [
  {
    id: "rmf",
    name: "RMF FM",
    freq: "96.2",
    genre: "Pop / Hity",
    cat: "national",
    provider: "rmf",
    stream: "https://rs202-krk.rmfstream.pl/rmf_fm",
    playlistUrl: "/api/rmf/stations/5/playlist",
  },
  {
    id: "rmf-maxxx",
    name: "RMF MAXX",
    freq: "99.8",
    genre: "Pop / Hity",
    cat: "national",
    provider: "rmf",
    stream: "https://rs202-krk.rmfstream.pl/rmf_maxxx",
    playlistUrl: "/api/rmf/stations/6/playlist",
  },
  {
    id: "rmf-classic",
    name: "RMF CLASSIC",
    freq: "101.4",
    genre: "Classic / Jazz",
    cat: "national",
    provider: "rmf",
    stream: "https://rs202-krk.rmfstream.pl/RMFCLASSIC48",
    playlistUrl: "/api/rmf/stations/7/playlist",
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
