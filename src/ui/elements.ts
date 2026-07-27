import { VU_COUNT } from "@/consts.js";
import { state } from "@/state.js";
import { isIOS } from "@/utils.js";

export const els = {
  darkToggle: document.getElementById("dark-toggle") as HTMLButtonElement,
  vuStrip: document.getElementById("vu-strip") as HTMLDivElement,
  reelLeft: document.getElementById("reel-left") as HTMLDivElement,
  reelRight: document.getElementById("reel-right") as HTMLDivElement,
  albumArt: document.getElementById("album-art") as HTMLDivElement,
  npShortRow: document.getElementById("np-short-row") as HTMLDivElement,
  npShort: document.getElementById("np-short") as HTMLSpanElement,
  npLiveDot: document.getElementById("np-live-dot") as HTMLSpanElement,
  npStation: document.getElementById("np-station") as HTMLDivElement,
  npTrackWrap: document.getElementById("np-track") as HTMLDivElement,
  npArtist: document.getElementById("np-artist") as HTMLDivElement,
  npTitle: document.getElementById("np-title") as HTMLSpanElement,
  playBtn: document.getElementById("play-btn") as HTMLButtonElement,
  historyToggleBtn: document.getElementById("history-toggle-btn") as HTMLButtonElement,
  historyArrow: document.getElementById("history-arrow") as HTMLSpanElement,
  historyPanel: document.getElementById("history-panel") as HTMLDivElement,
  historyEmpty: document.getElementById("history-empty") as HTMLDivElement,
  historyList: document.getElementById("history-list") as HTMLDivElement,
  volumePanel: document.getElementById("volume-panel") as HTMLDivElement,
  muteBtn: document.getElementById("mute-btn") as HTMLButtonElement,
  volSlider: document.getElementById("vol-slider") as HTMLInputElement,
  volVal: document.getElementById("vol-val") as HTMLSpanElement,
  sleepKeys: document.querySelectorAll<HTMLButtonElement>(".sleep-key"),
  sleepCount: document.getElementById("sleep-count") as HTMLDivElement,
  stationListContainer: document.getElementById("station-list-container") as HTMLElement,
};

export function initVolumeControlUI(): void {
  if (!isIOS()) return;
  state.vol = 100;
  els.volumePanel.classList.add("hidden");
}

export function initVU(): void {
  els.vuStrip.innerHTML = "";
  for (let i = 0; i < VU_COUNT; i++) {
    const seg = document.createElement("div");
    seg.className = "vu-seg";
    els.vuStrip.appendChild(seg);
  }
}
