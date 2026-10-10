import { getStoredString, removeStoredItem, setStoredString } from "./utils.js";

declare const APP_VERSION: string;

import type { CaseSlug } from "./consts.js";
import { CASES, DEFAULT_VERSION, STORAGE_KEYS } from "./consts.js";
import { getSmartListeningConfig, subscribeSmartListeningConfig } from "./listeningPreferences.js";
import type { AppState, FavTrack, TrackInfo } from "./types.js";
import { getStoredJSON, setStoredJSON } from "./utils.js";

export function persistFavTracks(): void {
  setStoredJSON(STORAGE_KEYS.FAV_TRACKS, state.favTracks);
}

function getStoredFavTracks(): FavTrack[] {
  return getStoredJSON<unknown[]>(STORAGE_KEYS.FAV_TRACKS, [], Array.isArray).filter((value): value is FavTrack => {
    if (!value || typeof value !== "object") return false;
    const track = value as Partial<FavTrack>;
    return (
      typeof track.key === "string" &&
      typeof track.artist === "string" &&
      typeof track.title === "string" &&
      typeof track.stationId === "string" &&
      typeof track.stationTag === "string" &&
      typeof track.timestamp === "number" &&
      Number.isFinite(track.timestamp) &&
      !Number.isNaN(new Date(track.timestamp).getTime())
    );
  });
}

const storedCase = getStoredString(STORAGE_KEYS.CASE);
const storedTheme = getStoredString(STORAGE_KEYS.THEME);
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

export const state: AppState = {
  dark: storedTheme === "dark" || (storedTheme !== "light" && systemTheme.matches),
  case: (CASES as readonly string[]).includes(storedCase ?? "") ? (storedCase as CaseSlug) : "red",
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
  favTracks: getStoredFavTracks(),
  viewMode: getStoredString(STORAGE_KEYS.VIEW_MODE) === "grid" ? "grid" : "list",
  version: typeof APP_VERSION !== "undefined" ? APP_VERSION : DEFAULT_VERSION,
  smartListening: getSmartListeningConfig(),
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

export function setTheme(dark: boolean | null): void {
  if (dark === null) removeStoredItem(STORAGE_KEYS.THEME);
  else setStoredString(STORAGE_KEYS.THEME, dark ? "dark" : "light");
  state.dark = dark ?? systemTheme.matches;
  notifyState();
}

systemTheme.addEventListener("change", () => {
  const theme = getStoredString(STORAGE_KEYS.THEME);
  if (theme === "dark" || theme === "light") return;
  state.dark = systemTheme.matches;
  notifyState();
});

export const radioAudio = new Audio();
radioAudio.crossOrigin = "anonymous";

export type PlaybackState = "idle" | "connecting" | "playing" | "paused" | "buffering" | "failed";
let playbackState: PlaybackState = "idle";

export function getPlaybackState(): PlaybackState {
  return playbackState;
}

export function setPlaybackState(value: PlaybackState): void {
  playbackState = value;
}

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

let liveTrackUpdatedAt = 0;
const liveTrackListeners = new Set<() => void>();

export function setLiveTrack(track: TrackInfo | null, observedAt = Date.now()): void {
  state.liveTrack = track;
  liveTrackUpdatedAt = observedAt;
  liveTrackListeners.forEach((listener) => {
    listener();
  });
}

export function getLiveTrackUpdatedAt(): number {
  return liveTrackUpdatedAt;
}

export type MetadataState = "idle" | "loading" | "ready" | "unavailable" | "failed" | "unsupported";
let metadataState: MetadataState = "idle";

export function getMetadataState(): MetadataState {
  return metadataState;
}

export function setMetadataState(value: MetadataState): void {
  metadataState = value;
}

export function subscribeLiveTrack(listener: () => void): () => void {
  liveTrackListeners.add(listener);
  return () => liveTrackListeners.delete(listener);
}

subscribeSmartListeningConfig(() => {
  state.smartListening = getSmartListeningConfig();
  notifyState();
});
