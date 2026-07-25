declare const APP_VERSION: string;

import { DEFAULT_VERSION, STORAGE_KEYS } from "./consts.js";
import type { AppState, TrackInfo } from "./types.js";

export const state: AppState = {
  dark: localStorage.getItem(STORAGE_KEYS.THEME)
    ? localStorage.getItem(STORAGE_KEYS.THEME) === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches,
  station: null,
  playing: false,
  vol: 10,
  muted: false,
  favs: new Set<string>(JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVS) || "[]")),
  sleepMin: null,
  sleepSec: null,
  liveTrack: null,
  history: [],
  showHistory: false,
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
radioAudio.crossOrigin = "anonymous";

export let sleepInterval: ReturnType<typeof setInterval> | number | null = null;
export let trackInterval: ReturnType<typeof setInterval> | number | null = null;

export function setSleepInterval(id: ReturnType<typeof setInterval> | number | null) {
  sleepInterval = id;
}
export function setTrackInterval(id: ReturnType<typeof setInterval> | number | null) {
  trackInterval = id;
}

export type { AppState, TrackInfo };
