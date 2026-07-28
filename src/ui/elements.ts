import { VOL_LEDS, VU_COUNT } from "@/consts.js";
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
  historyPanel: document.getElementById("history-panel") as HTMLDivElement,
  historyClock: document.getElementById("history-clock") as HTMLSpanElement,
  historyEmpty: document.getElementById("history-empty") as HTMLDivElement,
  historyList: document.getElementById("history-list") as HTMLDivElement,
  volumePanel: document.getElementById("volume-panel") as HTMLDivElement,
  muteBtn: document.getElementById("mute-btn") as HTMLButtonElement,
  volSlider: document.getElementById("vol-slider") as HTMLInputElement,
  volLadder: document.getElementById("vol-ladder") as HTMLDivElement,
  volVal: document.getElementById("vol-val") as HTMLSpanElement,
  sleepKeys: document.querySelectorAll<HTMLButtonElement>(".sleep-key"),
  sleepCount: document.getElementById("sleep-count") as HTMLDivElement,
  stationListContainer: document.getElementById("station-list-container") as HTMLElement,
};

export function initVolumeControlUI(): void {
  if (els.volLadder) {
    for (let i = 0; i < VOL_LEDS; i++) {
      const d = document.createElement("span");
      d.className = "vol-led";
      els.volLadder.appendChild(d);
    }

    const lit = Math.round((state.vol / 100) * VOL_LEDS);
    [...els.volLadder.children].forEach((d, i) => {
      const pct = ((i + 1) / VOL_LEDS) * 100;
      d.classList.toggle("on", i < lit);
      d.classList.toggle("warn", pct > 60 && pct <= 85);
      d.classList.toggle("hot", pct > 85);
    });
  }
  if (!isIOS()) return;
  state.vol = 100;
  els.volumePanel.classList.add("hidden");
}

export function initVU(): void {
  els.vuStrip.innerHTML = "";
  for (let i = 0; i < VU_COUNT; i++) {
    const col = document.createElement("div");
    col.className = "vu-col";

    const fill = document.createElement("div");
    fill.className = "vu-fill";
    const cap = document.createElement("div");
    cap.className = "vu-cap";

    col.appendChild(fill);
    col.appendChild(cap);
    els.vuStrip.appendChild(col);
  }
}
