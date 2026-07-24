import { setSleepTimer, toggleFav, toggleMute, updateVolume } from "./controls.js";
import type { Station } from "./data.js";
import { currentTrack, selectStation, togglePlay } from "./player.js";
import { state } from "./state.js";
import { els, initVU, renderStationList, updateUI } from "./ui.js";

function onSelect(s: Station) {
  selectStation(s, refresh);
}
function onToggleFav(id: string) {
  toggleFav(id, refresh);
}
function refresh() {
  updateUI(currentTrack(), onSelect, onToggleFav);
}

function attachEvents() {
  els.darkToggle.addEventListener("click", () => {
    state.dark = !state.dark;
    refresh();
  });

  els.playBtn.addEventListener("click", () => togglePlay(refresh));

  els.historyToggleBtn.addEventListener("click", () => {
    state.showHistory = !state.showHistory;
    refresh();
  });

  els.muteBtn.addEventListener("click", () => toggleMute(refresh));

  els.volSlider.addEventListener("input", (e: Event) =>
    updateVolume(Number((e.target as HTMLInputElement).value), refresh),
  );

  els.sleepKeys.forEach((btn) => {
    btn.addEventListener("click", () => setSleepTimer(Number(btn.getAttribute("data-min")), refresh));
  });
}

function init() {
  initVU();
  attachEvents();
  renderStationList(onSelect, onToggleFav);
  refresh();
}

document.addEventListener("DOMContentLoaded", init);
