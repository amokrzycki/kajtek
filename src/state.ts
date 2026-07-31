declare const APP_VERSION: string;

import { DEFAULT_VERSION, STORAGE_KEYS } from "./consts.js";
import type { AppState, FavTrack, TrackInfo } from "./types.js";

function getStoredFavs(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVS) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function getStoredFavTracks(): FavTrack[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.FAV_TRACKS) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function persistFavTracks(): void {
  localStorage.setItem(STORAGE_KEYS.FAV_TRACKS, JSON.stringify(state.favTracks));
}

export const state: AppState = {
  dark: localStorage.getItem(STORAGE_KEYS.THEME)
    ? localStorage.getItem(STORAGE_KEYS.THEME) === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches,
  station: null,
  playing: false,
  vol: 10,
  muted: false,
  favs: new Set<string>(getStoredFavs()),
  sleepMin: null,
  sleepSec: null,
  liveTrack: null,
  history: [],
  showHistory: false,
  historyTab: "program",
  favTracks: getStoredFavTracks(),
  viewMode: (localStorage.getItem(STORAGE_KEYS.VIEW_MODE) as "list" | "grid") || "list",
  version: typeof APP_VERSION !== "undefined" ? APP_VERSION : DEFAULT_VERSION,
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
radioAudio.crossOrigin = "use-credentials";

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
