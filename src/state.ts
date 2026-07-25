import packageJson from "../package.json";
import type { Station } from "./data.js";

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

export const state: AppState = {
  dark: localStorage.getItem("kajtek_theme")
    ? localStorage.getItem("kajtek_theme") === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches,
  station: null,
  playing: false,
  vol: 10,
  muted: false,
  favs: new Set<string>(JSON.parse(localStorage.getItem("kajtek_favs") || "[]")),
  sleepMin: null,
  sleepSec: null,
  liveTrack: null,
  history: [],
  showHistory: false,
  version: packageJson.version,
};

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
