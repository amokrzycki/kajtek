import { DEFAULT_FAVS } from "./data.js";

export const state = {
  dark: localStorage.getItem("kajtek_theme")
    ? localStorage.getItem("kajtek_theme") === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches,
  station: null,
  playing: false,
  vol: 10,
  muted: false,
  favs: new Set(JSON.parse(localStorage.getItem("kajtek_favs") || JSON.stringify(DEFAULT_FAVS))),
  sleepMin: null,
  sleepSec: null,
  liveTrack: null,
  history: [],
  showHistory: false,
};

export const radioAudio = new Audio();
radioAudio.crossOrigin = "anonymous";

export let sleepInterval = null;
export let trackInterval = null;

export function setSleepInterval(id) {
  sleepInterval = id;
}
export function setTrackInterval(id) {
  trackInterval = id;
}
