import { addToBlacklist, isBlacklisted, normalizeTrackKey, removeFromBlacklist } from "./blacklist.js";
import {
  cancelAdSkipAutoReturn,
  dismissBlacklistWarning,
  returnToPreviousStation,
  switchBlacklistCandidateNow,
  undoBlacklistBlock,
} from "./blacklistWarning.js";
import { getAllKnownStations, getOrderedStations } from "./catalog.js";
import { checkForNewChangelog, latestChangelog } from "./changelog.js";
import { STORAGE_KEYS } from "./consts.js";
import { setAdSkipEnabled, setSleepTimer, toggleFav, toggleMute, updateVolume } from "./controls.js";
import { currentTrack, selectStation, togglePlay } from "./player.js";
import { genericProvider, getProvider } from "./providers.js";
import { notifyState, setTheme, state, subscribeState } from "./state.js";
import type { Station } from "./types.js";
import { openCatalogModal } from "./ui/catalog/modal.js";
import { openChangelogModal } from "./ui/changelog/modal.js";
import { removeFavTrackByKey } from "./ui/favorites.js";
import { openOnboardingModal, shouldShowOnboarding } from "./ui/onboarding/modal.js";
import { openSettingsModal } from "./ui/settings/modal.js";
import { openShortcutsModal } from "./ui/shortcuts/modal.js";
import { initStatisticsUI } from "./ui/statistics.js";
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
  updateUI(currentTrack(), selectRememberedStation, toggleFav);
}

function selectRememberedStation(station: Station): void {
  localStorage.setItem(STORAGE_KEYS.LAST_STATION, station.id);
  selectStation(station);
}

function setVersion() {
  const versionEl = document.getElementById("version");
  if (versionEl) {
    versionEl.textContent = `${state.version}`;
    versionEl.addEventListener("click", () => openChangelogModal(latestChangelog()));
  }
}

function focusStationSelection(): void {
  const firstStation = els.stationListContainer.querySelector<HTMLButtonElement>(".station-select");
  if (!firstStation) {
    openCatalogModal();
    return;
  }
  firstStation.scrollIntoView({ behavior: "smooth", block: "center" });
  firstStation.focus({ preventScroll: true });
}

const SLEEP_KEY_MINUTES = [15, 30, 60, 90];

function stepStation(direction: 1 | -1): void {
  const list = getOrderedStations();
  if (list.length === 0) return;
  const at = list.findIndex((s) => s.id === state.station?.id);
  const next = list[at === -1 ? (direction === 1 ? 0 : list.length - 1) : (at + direction + list.length) % list.length];
  if (next) selectRememberedStation(next);
}

function handleShortcut(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector(".k-modal-overlay.is-open")) return;
  const target = e.target as HTMLElement;
  if (target.closest("input, textarea, select, [contenteditable], [role=tab]")) return;

  if (e.key === " ") {
    // a focused button/link/tab already handles Space natively
    if (target.closest("button, a, summary, [role=tab]")) return;
    togglePlay();
  } else if (e.key === "ArrowRight") stepStation(1);
  else if (e.key === "ArrowLeft") stepStation(-1);
  else if (e.key.toLowerCase() === "m") toggleMute();
  else if (e.key === "?") openOnboardingModal(focusStationSelection);
  else if (/^[1-4]$/.test(e.key)) setSleepTimer(SLEEP_KEY_MINUTES[Number(e.key) - 1] ?? 15);
  else return;
  e.preventDefault();
}

function attachEvents() {
  document.addEventListener("keydown", handleShortcut);
  document.getElementById("shortcuts-link")?.addEventListener("click", openShortcutsModal);

  els.helpBtn.addEventListener("click", () => openOnboardingModal(focusStationSelection));

  els.darkToggle.addEventListener("click", () => {
    setTheme(!state.dark);
  });

  els.settingsToggle.addEventListener("click", () => {
    const icon = els.settingsToggle.querySelector(".settings-toggle-icon");
    icon?.classList.remove("is-spinning");
    requestAnimationFrame(() => icon?.classList.add("is-spinning"));
    openSettingsModal();
  });

  els.playBtn.addEventListener("click", () => togglePlay());
  els.npRetry.addEventListener("click", () => {
    togglePlay();
    els.playBtn.focus();
  });

  els.adSkipSwitch.addEventListener("click", () => setAdSkipEnabled(!state.adSkipEnabled));

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
    else if (target.closest(".bl-warn-unblock")) undoBlacklistBlock();
    else if (target.closest(".bl-warn-revert")) returnToPreviousStation();
    else if (target.closest(".bl-warn-cancel-return")) cancelAdSkipAutoReturn();
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
      if (station) selectRememberedStation(station);
    }
  });
}

function init() {
  const isFirstVisit = shouldShowOnboarding();
  const lastStationId = localStorage.getItem(STORAGE_KEYS.LAST_STATION);
  state.station = getAllKnownStations().find((station) => station.id === lastStationId) ?? null;

  setVersion();
  initVU();
  initVolumeControlUI();
  startHistoryClock();
  attachEvents();
  initStatisticsUI();
  subscribeState(refresh);
  refresh();

  const newEntries = checkForNewChangelog();
  if (isFirstVisit) {
    openOnboardingModal(focusStationSelection);
  } else if (newEntries) {
    openChangelogModal(newEntries);
  }
}

document.addEventListener("DOMContentLoaded", init);
