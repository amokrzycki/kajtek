import { STORAGE_KEYS } from "./consts.js";
import { createStatisticsStore, ListeningStatistics, type StatisticsStore } from "./statistics.js";

export const statisticsStore = createStatisticsStore({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});

const listeners = new Set<() => void>();
let commits = Promise.resolve();

function commit(apply: () => void): void {
  // Merge under a browser-native lock: two listening tabs must not overwrite each other's totals.
  commits = commits
    .then(async () => {
      if (navigator.locks) await navigator.locks.request(STORAGE_KEYS.STATISTICS, apply);
      else apply();
      for (const listener of listeners) listener();
    })
    .catch((error: unknown) => console.warn("[Statistics] Could not update recap", error));
}

const sink: Pick<StatisticsStore, "record" | "duration"> = {
  record: (...args) => commit(() => statisticsStore.record(...args)),
  duration: (...args) => commit(() => statisticsStore.duration(...args)),
};

commit(() => statisticsStore.persist());

export const listeningStatistics = new ListeningStatistics(sink);

export function subscribeStatistics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bindListeningStatistics(audio: HTMLAudioElement): void {
  let audible = !audio.muted && audio.volume > 0;
  let playbackRate = audio.playbackRate;
  const sample = () => listeningStatistics.sample(audio.currentTime, Date.now(), audible, playbackRate);
  const suspend = () => listeningStatistics.suspend(audio.currentTime, Date.now(), audible, playbackRate);
  const stop = () => listeningStatistics.stop(audio.currentTime, Date.now(), audible, playbackRate);
  audio.addEventListener("playing", () => listeningStatistics.playing(audio.currentTime, Date.now()));
  let lastSampleAt = 0;
  audio.addEventListener("timeupdate", () => {
    if (Date.now() - lastSampleAt < 5000) return;
    lastSampleAt = Date.now();
    sample();
  });
  for (const event of ["waiting", "stalled", "error", "seeking", "emptied"]) audio.addEventListener(event, suspend);
  for (const event of ["pause", "ended"]) audio.addEventListener(event, stop);
  audio.addEventListener("ratechange", () => {
    sample();
    playbackRate = audio.playbackRate;
  });
  audio.addEventListener("volumechange", () => {
    sample();
    audible = !audio.muted && audio.volume > 0;
  });
  audio.addEventListener("seeked", () => {
    if (!audio.paused && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      listeningStatistics.playing(audio.currentTime, Date.now());
    }
  });
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", () => {
    if (!audio.paused && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      listeningStatistics.playing(audio.currentTime, Date.now());
    }
  });
  document.addEventListener("visibilitychange", sample);
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEYS.STATISTICS) for (const listener of listeners) listener();
  });
}
