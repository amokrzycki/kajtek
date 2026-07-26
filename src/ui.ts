import { STORAGE_KEYS } from "./consts.js";
import { isVolAnimating } from "./controls.js";
import { ICONS } from "./icons.js";
import { genericProvider, getProvider } from "./providers.js";
import { state } from "./state.js";
import type { Station, TrackInfo } from "./types.js";
import { els, initVolumeControlUI, initVU } from "./ui/elements.js";
import { setHistoryLoadingState, triggerHistorySlideIn, updateHistoryUI } from "./ui/history.js";
import { renderStationList } from "./ui/stations.js";
import { triggerFade } from "./utils.js";
import { startVisualizer, stopVisualizer } from "./visualizer.js";

const ART_V: Record<string, string> = {
  rmf: "0",
  "rmf-maxxx": "1",
  "rmf-classic": "2",
};

export {
  els,
  initVolumeControlUI,
  initVU,
  renderStationList,
  setHistoryLoadingState,
  triggerFade,
  triggerHistorySlideIn,
  updateHistoryUI,
};

export function updateSleepUI(): void {
  if (state.sleepMin !== null && state.sleepSec !== null) {
    const m = Math.floor(state.sleepSec / 60);
    const s = String(state.sleepSec % 60).padStart(2, "0");
    els.sleepCount.style.display = "block";
    els.sleepCount.innerHTML = `wyłącza się za <strong>${m}:${s}</strong>`;
  } else {
    els.sleepCount.style.display = "none";
  }
  els.sleepKeys.forEach((btn) => {
    btn.classList.toggle("active", state.sleepMin === Number(btn.getAttribute("data-min")));
  });
}

export function updateNowPlayingTrack(track: TrackInfo | null): void {
  if (!state.station) return;

  if (!track && state.station.apiBaseUrl) {
    els.npTrackWrap.classList.remove("visible");
    return;
  }

  els.npTrackWrap.classList.add("visible");

  const artistText = track?.artist || state.station.name;
  const titleText = track?.title || (state.station.apiBaseUrl ? "Audycja na żywo" : "brak informacji o utworze");

  triggerFade(els.npArtist, artistText);
  triggerFade(els.npTitle, titleText);
}

export function resolveAlbumCoverUrl(track: TrackInfo | null, station: Station | null): string {
  if (track?.isLiveBreak) {
    return station?.coverUrl || "";
  }
  if (track?.coverUrl && track.coverUrl.trim().length > 0) {
    return track.coverUrl;
  }
  return station?.coverUrl || "";
}

export function updateAlbumArt(coverUrl: string | undefined): void {
  const art = els.albumArt;
  let img = art.querySelector<HTMLImageElement>(".album-art-img");
  const initial = art.querySelector<HTMLElement>(".album-art-initial");
  const label = art.querySelector<HTMLElement>(".album-art-label");

  if (coverUrl) {
    if (!img) {
      img = document.createElement("img");
      img.className = "album-art-img";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      art.prepend(img);
    }
    if (img.dataset.src !== coverUrl) {
      img.dataset.src = coverUrl;
      img.style.opacity = "0";
      img.onload = () => {
        if (!img) return;
        img.style.opacity = "1";
      };
      img.onerror = () => {
        if (!img) return;
        img.style.display = "none";
      };
      img.style.display = "";
      img.src = coverUrl;
    }
    if (initial) initial.style.opacity = "0";
    if (label) label.style.opacity = "0";
  } else {
    if (img) {
      img.style.display = "none";
      img.src = "";
      img.dataset.src = "";
    }
    if (initial) initial.style.opacity = "";
    if (label) label.style.opacity = "";
  }
}

export function updateUI(
  currentTrack: TrackInfo | null,
  onSelect: (s: Station) => void,
  onToggleFav: (id: string) => void,
): void {
  applyTheme();

  els.vuStrip.classList.toggle("active", state.playing);
  els.reelLeft.classList.toggle("spinning", state.playing);
  els.reelRight.classList.toggle("spinning", state.playing);
  els.equalizer.classList.toggle("active", state.playing);

  if (state.playing) {
    startVisualizer();
  } else {
    stopVisualizer();
  }

  els.playBtn.disabled = !state.station;
  els.playBtn.classList.toggle("playing", state.playing);
  els.playBtn.innerHTML = state.playing ? ICONS.pause : ICONS.play;

  if (state.station) {
    els.npShortRow.classList.remove("hidden");
    const shortText = state.station.short;
    triggerFade(els.npShort, shortText);
    if (els.npStation.textContent !== state.station.name) {
      els.npStation.classList.remove("empty");
    }
    triggerFade(els.npStation, state.station.name);
    els.npLiveDot.classList.toggle("on", state.playing);
    updateNowPlayingTrack(currentTrack);
    const v = ART_V[state.station.id] ?? "0";
    els.albumArt.dataset.v = v;
    const initial = els.albumArt.querySelector(".album-art-initial");
    const label = els.albumArt.querySelector(".album-art-label");
    if (initial) initial.textContent = state.station.name.charAt(0);
    if (label) label.textContent = state.station.name;
    updateAlbumArt(resolveAlbumCoverUrl(currentTrack, state.station));
  } else {
    els.npShortRow.classList.add("hidden");
    els.npShort.textContent = "—";
    els.npStation.textContent = "wybierz stację";
    els.npStation.classList.add("empty");
    els.npTrackWrap.classList.remove("visible");
    els.npLiveDot.classList.remove("on");
    els.albumArt.dataset.v = "0";
    const initial = els.albumArt.querySelector(".album-art-initial");
    const label = els.albumArt.querySelector(".album-art-label");
    if (initial) initial.textContent = "?";
    if (label) label.textContent = "— —";
  }

  if (!isVolAnimating()) {
    els.muteBtn.classList.toggle("muted", state.muted);
    els.muteBtn.innerHTML = ICONS.vol(state.muted, state.vol);
    const dispVol = state.muted ? 0 : state.vol;
    els.volSlider.value = String(dispVol);
    els.volSlider.style.setProperty("--vol", `${dispVol}%`);
    els.volVal.textContent = state.muted ? "—" : String(state.vol);
  }

  updateSleepUI();

  const isGeneric = Boolean(state.station && getProvider(state.station) === genericProvider);
  if (isGeneric && state.showHistory) {
    state.showHistory = false;
  }

  els.historyToggleBtn.disabled = isGeneric;
  els.historyToggleBtn.classList.toggle("disabled", isGeneric);
  els.historyToggleBtn.setAttribute("aria-expanded", String(state.showHistory));
  els.historyArrow.textContent = state.showHistory ? "▲" : "▼";
  els.historyPanel.classList.toggle("open", state.showHistory);
  updateHistoryUI();

  renderStationList(onSelect, onToggleFav);
}

function applyTheme(): void {
  document.documentElement.classList.toggle("dark", state.dark);
  els.darkToggle.classList.toggle("on", state.dark);
  localStorage.setItem(STORAGE_KEYS.THEME, state.dark ? "dark" : "light");
}
