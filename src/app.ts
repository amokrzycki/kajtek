import { setSleepTimer, toggleFav, toggleMute, updateVolume } from "./controls.js";
import { currentTrack, selectStation, togglePlay } from "./player.js";
import { state } from "./state.js";
import type { Station } from "./types.js";
import { els, initVolumeControlUI, initVU, renderStationList, triggerHistorySlideIn, updateUI } from "./ui.js";

function onSelect(s: Station) {
  selectStation(s, refresh);
}
function onToggleFav(id: string) {
  toggleFav(id, refresh);
}
function refresh() {
  updateUI(currentTrack(), onSelect, onToggleFav);
}

function setVersion() {
  const versionEl = document.getElementById("version");
  if (versionEl) {
    versionEl.textContent = `${state.version}`;
  }
}

function attachEvents() {
  els.darkToggle.addEventListener("click", () => {
    state.dark = !state.dark;
    refresh();
  });

  els.playBtn.addEventListener("click", () => togglePlay(refresh));

  els.historyToggleBtn.addEventListener("click", () => {
    state.showHistory = !state.showHistory;
    if (state.showHistory) {
      triggerHistorySlideIn();
    }
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
  setVersion();
  initVU();
  initVolumeControlUI();
  attachEvents();
  renderStationList(onSelect, onToggleFav);
  refresh();
}

document.addEventListener("DOMContentLoaded", init);
