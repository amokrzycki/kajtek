import { setSleepTimer, toggleFav, toggleMute, updateVolume } from "./controls.js";
import { currentTrack, selectStation, togglePlay } from "./player.js";
import { genericProvider, getProvider } from "./providers.js";
import { notifyState, state, subscribeState } from "./state.js";
import { removeFavTrackByKey } from "./ui/favorites.js";
import {
  els,
  initVolumeControlUI,
  initVU,
  startHistoryClock,
  toggleFavTrack,
  triggerHistorySlideIn,
  updateUI,
} from "./ui.js";
import { getTrackKey } from "./utils.js";

function refresh() {
  updateUI(currentTrack(), selectStation, toggleFav);
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

  els.historyTabProgram.addEventListener("click", () => {
    state.historyTab = "program";
    notifyState();
  });

  els.historyTabFavorites.addEventListener("click", () => {
    state.historyTab = "favorites";
    notifyState();
  });

  els.historyList.addEventListener("click", (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".pl-fav-star");
    if (!btn) return;
    const key = btn.getAttribute("data-key");
    const track = state.history.find((t) => getTrackKey(t) === key);
    if (track) toggleFavTrack(track, state.station);
  });

  els.favoritesList.addEventListener("click", (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".fav-star");
    if (!btn) return;
    const key = btn.getAttribute("data-key");
    if (key) removeFavTrackByKey(key);
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
