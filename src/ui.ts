import { getEnabledStations } from "./catalog.js";
import { STORAGE_KEYS } from "./consts.js";
import { isVolAnimating } from "./controls.js";
import { ICONS } from "./icons.js";
import { getSmartListeningConfig, musicPreference } from "./listeningPreferences.js";
import { classifyContent, NOW_PLAYING_STALE_MS } from "./nowPlaying.js";
import { getLiveTrackUpdatedAt, getMetadataState, type PlaybackState, setPlaybackState, state } from "./state.js";
import type { Station, TrackInfo } from "./types.js";
import { els, initVolumeControlUI, initVU, renderVolLadder } from "./ui/elements.js";
import { applyHistoryTabVisibility, isTrackFavorited, renderFavoritesUI } from "./ui/favorites.js";
import { setHistoryLoadingState, triggerHistorySlideIn, updateHistoryUI } from "./ui/history.js";
import { renderSmartListeningWarning } from "./ui/smartListening/warning.js";
import { renderStationList } from "./ui/stations.js";
import { setStoredString, triggerFade } from "./utils.js";
import { startVisualizer, stopVisualizer } from "./visualizer.js";

const ART_V: Record<string, string> = {
  rmf: "0",
  "rmf-maxxx": "1",
  "rmf-classic": "2",
};

export { toggleFavTrack } from "./ui/favorites.js";
export {
  els,
  initVolumeControlUI,
  initVU,
  renderStationList,
  renderVolLadder,
  setHistoryLoadingState,
  triggerFade,
  triggerHistorySlideIn,
  updateHistoryUI,
};

export function startHistoryClock(): void {
  const tick = () => {
    els.historyClock.textContent = new Date().toLocaleTimeString("pl-PL");
    updateMetadataFreshness();
  };
  tick();
  setInterval(tick, 1000);
}

export function updateSleepUI(): void {
  if (state.sleepMin !== null && state.sleepSec !== null) {
    const m = Math.floor(state.sleepSec / 60);
    const s = String(state.sleepSec % 60).padStart(2, "0");
    els.sleepCountLine.innerHTML = `wyłącza się za <strong>${m}:${s}</strong>`;
    els.sleepCount.classList.add("on");
  } else {
    els.sleepCount.classList.remove("on");
  }
  els.sleepKeys.forEach((btn) => {
    const active = state.sleepMin === Number(btn.getAttribute("data-min"));
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
    btn.setAttribute("aria-label", active ? "Anuluj wyłącznik czasowy" : `Wyłącz za ${btn.dataset.min} minut`);
  });
}

export function setPlaybackStatus(message: string, dotState: PlaybackState = "connecting"): void {
  setPlaybackState(dotState);
  triggerFade(els.npStatus, message);
  els.npStatus.classList.toggle("failed", dotState === "failed");
  els.npRetry.hidden = dotState !== "failed";
  els.npLiveDot.classList.toggle("buffering", dotState === "buffering");
  els.npLiveDot.classList.toggle("failed", dotState === "failed");
  renderSmartListeningWarning();
}

export function updateNowPlayingTrack(track: TrackInfo | null): void {
  if (!state.station) return;

  document.title = track?.title
    ? `${track.artist ? `${track.artist} – ` : ""}${track.title} · ${state.station.name} · KAJTEK`
    : `${state.station.name} · KAJTEK`;

  els.npTrackWrap.classList.add("visible");
  els.npTrackWrap.setAttribute("aria-busy", String(getMetadataState() === "loading"));

  const artistText = track?.artist || state.station.name;
  const titleText =
    track?.title ||
    {
      idle: "brak informacji o treści",
      loading: "Sprawdzanie bieżącej treści…",
      ready: "brak informacji o treści",
      unavailable: "Stacja nie podaje teraz treści",
      failed: "Nie udało się pobrać informacji o treści",
      unsupported: "Ta stacja nie udostępnia informacji o treści",
    }[getMetadataState()];

  triggerFade(els.npArtist, artistText);
  triggerFade(els.npTitle, titleText);
  updateMetadataFreshness();

  if ("mediaSession" in navigator) {
    const coverUrl = resolveAlbumCoverUrl(track, state.station);
    const usesTrackCover = !track?.isLiveBreak && Boolean(track?.coverUrl?.trim());
    const coverSize = usesTrackCover ? "272x272" : "600x600";
    navigator.mediaSession.metadata = new MediaMetadata({
      title: titleText,
      artist: artistText,
      artwork: coverUrl
        ? [{ src: coverUrl, sizes: coverSize }]
        : [{ src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    });
  }
}

function updateMetadataFreshness(): void {
  const track = state.liveTrack;
  const observedAt = getLiveTrackUpdatedAt();
  const stale =
    track &&
    (!observedAt ||
      Date.now() - observedAt >= NOW_PLAYING_STALE_MS ||
      track.isPredicted ||
      (track.endTimestamp != null && track.endTimestamp * 1000 <= Date.now()));
  const text =
    state.station && track && getMetadataState() === "failed"
      ? "Ostatnio znana treść · błąd danych"
      : state.station && stale
        ? "Ostatnio znana treść · starsze dane"
        : "";
  if (els.npMetadataState.textContent !== text) els.npMetadataState.textContent = text;
  els.npMetadataState.hidden = !text;
}

// RMF sometimes returns its generic placeholder logo (empty) instead of a real cover; treat it as "no cover"
const RMF_PLACEHOLDER_COVER = "/assets/images/logo200x200.png";
const failedArtwork = new Set<string>();
const MAX_FAILED_ARTWORK = 100;

export function resolveAlbumCoverUrl(track: TrackInfo | null, station: Station | null): string {
  if (track?.isLiveBreak) {
    return station?.coverUrl || "";
  }
  if (track?.coverUrl && track.coverUrl.trim().length > 0 && !track.coverUrl.includes(RMF_PLACEHOLDER_COVER)) {
    return track.coverUrl;
  }
  return station?.coverUrl || "";
}

export function updateAlbumArt(coverUrl: string | undefined, track: TrackInfo | null): void {
  const art = els.albumArt;
  const img = art.querySelector<HTMLImageElement>(".album-art-img");
  const initial = art.querySelector<HTMLElement>(".album-art-initial");
  const label = art.querySelector<HTMLElement>(".album-art-label");
  const source = [coverUrl, state.station?.coverUrl].find((url) => url?.trim() && !failedArtwork.has(url));
  const stationId = state.station?.id ?? "";

  if (!source || img?.dataset.src !== source || img.dataset.stationId !== stationId) {
    img?.remove();
    if (initial) initial.style.opacity = "";
    if (label) label.style.opacity = "";
    if (source) {
      const image = document.createElement("img");
      image.className = "album-art-img";
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      image.dataset.src = source;
      image.dataset.stationId = stationId;
      image.style.opacity = "0";
      const isCurrent = () => art.querySelector(".album-art-img") === image && state.station?.id === stationId;
      image.onload = () => {
        if (!isCurrent()) return;
        image.style.opacity = "1";
        if (initial) initial.style.opacity = "0";
        if (label) label.style.opacity = "0";
      };
      image.onerror = () => {
        if (!isCurrent()) return;
        failedArtwork.add(source);
        if (failedArtwork.size > MAX_FAILED_ARTWORK) {
          const first = failedArtwork.values().next().value;
          if (first !== undefined) failedArtwork.delete(first);
        }
        updateAlbumArt(coverUrl, state.liveTrack);
      };
      art.prepend(image);
      image.src = source;
    }
  }

  if (track && state.station && classifyContent(state.station, track) === "track") {
    els.npFavStar.hidden = false;
    els.npFavStar.innerHTML = ICONS.star(isTrackFavorited(track));
    els.npFavStar.classList.toggle("on", isTrackFavorited(track));
    els.npFavStar.setAttribute("aria-pressed", String(isTrackFavorited(track)));
    els.npFavStar.setAttribute("aria-label", `Ulubiony utwór: ${track.artist} – ${track.title}`);
    els.npBlockBtn.hidden = false;
    els.npBlockBtn.innerHTML = ICONS.ban;
    els.npBlockBtn.classList.toggle("on", musicPreference(track, getSmartListeningConfig().preferences).negative);
    els.npBlockBtn.removeAttribute("aria-pressed");
    els.npBlockBtn.setAttribute("aria-label", `Preferencje słuchania: ${track.artist} – ${track.title}`);
  } else {
    els.npFavStar.hidden = true;
    els.npBlockBtn.hidden = true;
  }
}

export function updateMuteAccessibility(): void {
  els.muteBtn.setAttribute("aria-label", state.muted ? "Włącz dźwięk" : "Wycisz");
  els.muteBtn.setAttribute("aria-pressed", String(state.muted));
}

export function updateUI(
  currentTrack: TrackInfo | null,
  onSelect: (s: Station) => void,
  onToggleFav: (id: string) => void,
): void {
  applyTheme();
  applyCase();

  els.vuStrip.classList.toggle("active", state.playing);
  els.reelLeft.classList.toggle("spinning", state.playing);
  els.reelRight.classList.toggle("spinning", state.playing);

  if (state.playing) {
    startVisualizer();
  } else {
    stopVisualizer();
  }

  els.playBtn.disabled = !state.station;
  els.playBtn.classList.toggle("playing", state.playing);
  els.playBtn.innerHTML = state.playing ? ICONS.pause : ICONS.play;
  els.playBtn.setAttribute("aria-label", state.playing ? "Wstrzymaj" : "Odtwarzaj");
  els.playBtn.setAttribute("aria-pressed", String(state.playing));

  if (state.station) {
    els.npShortRow.classList.remove("hidden");
    const shortText = state.station.short;
    triggerFade(els.npShort, shortText);
    if (els.npStation.textContent !== state.station.name) {
      els.npStation.classList.remove("empty");
    }
    triggerFade(els.npStation, state.station.name);
    els.npStation.title = state.station.name;
    els.npLiveDot.classList.toggle("on", state.playing);
    updateNowPlayingTrack(currentTrack);
    const v = ART_V[state.station.id] ?? "0";
    els.albumArt.dataset.v = v;
    const initial = els.albumArt.querySelector(".album-art-initial");
    const label = els.albumArt.querySelector(".album-art-label");
    if (initial) initial.textContent = state.station.name.charAt(0);
    if (label) label.textContent = state.station.name;
    updateAlbumArt(resolveAlbumCoverUrl(currentTrack, state.station), currentTrack);
  } else {
    document.title = "KAJTEK";
    setPlaybackStatus("Gotowy", "idle");
    els.npShortRow.classList.add("hidden");
    els.npShort.textContent = "—";
    els.npStation.textContent = "wybierz stację";
    els.npStation.removeAttribute("title");
    els.npStation.classList.add("empty");
    els.npTrackWrap.classList.remove("visible");
    els.npMetadataState.hidden = true;
    els.npLiveDot.classList.remove("on");
    els.albumArt.dataset.v = "0";
    const initial = els.albumArt.querySelector(".album-art-initial");
    const label = els.albumArt.querySelector(".album-art-label");
    if (initial) initial.textContent = "?";
    if (label) label.textContent = "— —";
    updateAlbumArt(undefined, null);
    els.npFavStar.hidden = true;
    els.npBlockBtn.hidden = true;
  }

  updateMuteAccessibility();

  if (!isVolAnimating()) {
    els.muteBtn.classList.toggle("muted", state.muted);
    els.muteBtn.innerHTML = ICONS.vol(state.muted, state.vol);
    const dispVol = state.muted ? 0 : state.vol;
    els.volSlider.value = String(dispVol);
    els.volSlider.style.setProperty("--vol", `${dispVol}%`);
    els.volVal.textContent = state.muted ? "—" : String(state.vol);
  }

  updateSleepUI();
  els.smartListeningSwitch.setAttribute("aria-checked", String(state.smartListening.enabled));

  els.historyToggleBtn.setAttribute("aria-expanded", String(state.showHistory));
  const willOpenHistory = state.showHistory;
  els.historyPanel.classList.toggle("open", willOpenHistory);
  els.historyPanel.inert = !willOpenHistory;
  updateHistoryUI();
  renderSmartListeningWarning();
  renderFavoritesUI();
  applyHistoryTabVisibility();

  const listChanged = shouldRenderStationList();
  if (listChanged || lastViewMode !== state.viewMode) {
    renderStationList(onSelect, onToggleFav, !listChanged);
    lastViewMode = state.viewMode;
  }
}

/* memoize station list render triggers so volume/sleep/playing updates don't touch station DOM */
let lastStationId: string | null = null;
let lastFavsKey = "";
let lastEnabledKey = "";
let lastViewMode = "";

function shouldRenderStationList(): boolean {
  const currentStationId = state.station?.id ?? null;
  const currentFavsKey = Array.from(state.favs).sort().join(",");
  const currentEnabledKey = getEnabledStations()
    .map((s) => s.id)
    .join(",");

  if (currentStationId !== lastStationId || currentFavsKey !== lastFavsKey || currentEnabledKey !== lastEnabledKey) {
    lastStationId = currentStationId;
    lastFavsKey = currentFavsKey;
    lastEnabledKey = currentEnabledKey;
    return true;
  }
  return false;
}

function applyTheme(): void {
  document.documentElement.classList.toggle("dark", state.dark);
  els.darkToggle.classList.toggle("on", state.dark);
  els.darkToggle.setAttribute("aria-pressed", String(state.dark));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", state.dark ? "#1a1816" : "#eeebe3");
}

function applyCase(): void {
  document.documentElement.dataset.case = state.case;
  setStoredString(STORAGE_KEYS.CASE, state.case);
}
