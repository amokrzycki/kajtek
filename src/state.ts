declare const APP_VERSION: string;

import { DEFAULT_VERSION, STORAGE_KEYS } from "./consts.js";
import type { AppState, FavTrack, TrackInfo } from "./types.js";
import { getStoredJSON, setStoredJSON } from "./utils.js";

export function persistFavTracks(): void {
  setStoredJSON(STORAGE_KEYS.FAV_TRACKS, state.favTracks);
}

export const state: AppState = {
  dark: localStorage.getItem(STORAGE_KEYS.THEME)
    ? localStorage.getItem(STORAGE_KEYS.THEME) === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches,
  station: null,
  playing: false,
  vol: getStoredJSON<number>(STORAGE_KEYS.VOLUME, 10, (v) => typeof v === "number"),
  muted: false,
  favs: new Set<string>(getStoredJSON<string[]>(STORAGE_KEYS.FAVS, [], Array.isArray)),
  sleepMin: null,
  sleepSec: null,
  liveTrack: null,
  history: [],
  showHistory: false,
  historyTab: "program",
  favTracks: getStoredJSON<FavTrack[]>(STORAGE_KEYS.FAV_TRACKS, [], Array.isArray),
  viewMode: (localStorage.getItem(STORAGE_KEYS.VIEW_MODE) as "list" | "grid") || "list",
  version: typeof APP_VERSION !== "undefined" ? APP_VERSION : DEFAULT_VERSION,
  blacklistEnabled: localStorage.getItem(STORAGE_KEYS.BLACKLIST_ENABLED) !== "false",
};

type StateListener = (state: AppState) => void;
const listeners = new Set<StateListener>();

export function subscribeState(fn: StateListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyState(): void {
  listeners.forEach((fn) => {
    fn(state);
  });
}

export const radioAudio = new Audio();
radioAudio.crossOrigin = "anonymous";

if ("mediaSession" in navigator) {
  radioAudio.addEventListener("play", () => {
    navigator.mediaSession.playbackState = "playing";
  });
  radioAudio.addEventListener("pause", () => {
    navigator.mediaSession.playbackState = "paused";
  });
}

export const intervals = {
  sleep: null as ReturnType<typeof setInterval> | number | null,
  track: null as ReturnType<typeof setInterval> | number | null,
};

export type { AppState, TrackInfo };
