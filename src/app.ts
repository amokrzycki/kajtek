import { addToBlacklist, isBlacklisted, normalizeTrackKey, removeFromBlacklist } from "./blacklist.js";
import { getAllKnownStations } from "./catalog.js";
import { setSleepTimer, toggleFav, toggleMute, updateVolume } from "./controls.js";
import {
  currentTrack,
  dismissBlacklistWarning,
  returnToPreviousStation,
  selectStation,
  switchBlacklistCandidateNow,
  togglePlay,
} from "./player.js";
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
    const target = e.target as HTMLElement;

    const favBtn = target.closest<HTMLButtonElement>(".pl-fav-star");
    if (favBtn) {
      const key = favBtn.getAttribute("data-key");
      const track = state.history.find((t) => getTrackKey(t) === key);
      if (track) toggleFavTrack(track, state.station);
      return;
    }

    const blockBtn = target.closest<HTMLButtonElement>(".pl-block-btn");
    if (blockBtn) {
      const artist = blockBtn.getAttribute("data-artist") || "";
      const title = blockBtn.getAttribute("data-title") || "";
      if (!artist || !title) return;
      if (isBlacklisted({ artist, title })) {
        removeFromBlacklist(normalizeTrackKey(artist, title));
      } else {
        addToBlacklist(artist, title);
      }
      notifyState();
    }
  });

  els.npFavStar.addEventListener("click", () => {
    const track = currentTrack();
    if (track) toggleFavTrack(track, state.station);
  });

  els.npBlockBtn.addEventListener("click", () => {
    const track = currentTrack();
    if (!track) return;
    if (isBlacklisted(track)) {
      removeFromBlacklist(normalizeTrackKey(track.artist, track.title));
    } else {
      addToBlacklist(track.artist, track.title);
    }
    notifyState();
  });

  els.blacklistWarning.addEventListener("click", (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.closest(".bl-warn-switch")) switchBlacklistCandidateNow();
    else if (target.closest(".bl-warn-play-anyway")) dismissBlacklistWarning();
    else if (target.closest(".bl-warn-revert")) returnToPreviousStation();
  });

  els.favoritesList.addEventListener("click", (e: Event) => {
    const target = e.target as HTMLElement;

    const starBtn = target.closest<HTMLButtonElement>(".fav-star");
    if (starBtn) {
      const key = starBtn.getAttribute("data-key");
      if (key) removeFavTrackByKey(key);
      return;
    }

    const gotoBtn = target.closest<HTMLButtonElement>(".fav-goto");
    if (gotoBtn) {
      const stationId = gotoBtn.getAttribute("data-station-id");
      const station = getAllKnownStations().find((s) => s.id === stationId);
      if (station) selectStation(station);
    }
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
