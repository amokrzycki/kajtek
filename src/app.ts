import { setSleepTimer, toggleFav, toggleMute, updateVolume } from "./controls.js";
import { currentTrack, selectStation, togglePlay } from "./player.js";
import { genericProvider, getProvider } from "./providers.js";
import { notifyState, state, subscribeState } from "./state.js";
import type { Station } from "./types.js";
import { els, initVolumeControlUI, initVU, startHistoryClock, triggerHistorySlideIn, updateUI } from "./ui.js";

function onSelect(s: Station) {
  selectStation(s);
}
function onToggleFav(id: string) {
  toggleFav(id);
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
    notifyState();
  });

  els.playBtn.addEventListener("click", () => togglePlay());

  els.historyToggleBtn.addEventListener("click", () => {
    if (state.station && getProvider(state.station) === genericProvider) {
      return;
    }
    state.showHistory = !state.showHistory;
    if (state.showHistory) {
      triggerHistorySlideIn();
    }
    notifyState();
  });

  els.muteBtn.addEventListener("click", () => toggleMute());

  els.volSlider.addEventListener("input", (e: Event) => updateVolume(Number((e.target as HTMLInputElement).value)));

  els.sleepKeys.forEach((btn) => {
    btn.addEventListener("click", () => setSleepTimer(Number(btn.getAttribute("data-min"))));
  });
}

function init() {
  setVersion();
  initVU();
  initVolumeControlUI();
  startHistoryClock();
  attachEvents();
  subscribeState(refresh);
  refresh();
}

document.addEventListener("DOMContentLoaded", init);
