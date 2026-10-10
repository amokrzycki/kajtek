import type Hls from "hls.js";
import { getOrderedStations } from "./catalog.js";
import { API_ENDPOINTS, DEFAULT_BREAK_LABEL, MAX_CONSECUTIVE_FAILURES, SWITCH_RATE_LIMIT, TIMERS } from "./consts.js";
import { applyAudioVolume } from "./controls.js";
import { fetchMetadata, parseJsonFromRes } from "./metadata.js";
import { readZprTag, startEskaSession } from "./providers/eska.js";
import { rmfProvider } from "./providers/rmf.js";
import { trojkaProvider } from "./providers/trojka.js";
import { getProvider } from "./providers.js";
import { evaluateSmartListening, resetSmartListening } from "./smartListening.js";
import {
  getLiveTrackUpdatedAt,
  getMetadataState,
  intervals,
  notifyState,
  radioAudio,
  setLiveTrack,
  setMetadataState,
  state,
} from "./state.js";
import type { ProtectiveRoute } from "./statistics.js";
import { bindListeningStatistics, listeningStatistics } from "./statisticsPlayback.js";
import type { Station, TrackInfo } from "./types.js";
import {
  els,
  resolveAlbumCoverUrl,
  setHistoryLoadingState,
  setPlaybackStatus,
  updateAlbumArt,
  updateHistoryUI,
  updateNowPlayingTrack,
} from "./ui.js";
import { resolveProtocolRelativeUrl, withinRateLimit } from "./utils.js";

bindListeningStatistics(radioAudio);

let failoverTimestamps: number[] = [];
let hlsInstance: Hls | null = null;
let playbackRequestId = 0;
let pendingHlsRequestId: number | null = null;

function getCurrentStreamUrl(station: Station): string {
  const streams = station._streams || [station.stream];
  return streams[station._currentStreamIndex || 0] || station.stream;
}

function destroyHls(): void {
  hlsInstance?.destroy();
  hlsInstance = null;
}

function isHlsStream(url: string): boolean {
  return url.includes(".m3u8");
}

const MAX_HLS_RECOVERY_ATTEMPTS = 3;

async function attachHlsStream(url: string, requestId: number): Promise<void> {
  const { default: Hls } = await import("hls.js");
  if (requestId !== playbackRequestId || !state.playing) return;
  if (!Hls.isSupported()) {
    // Real native HLS support (Safari/iOS) — MediaSource-based hls.js isn't needed there.
    radioAudio.src = url;
    return;
  }
  // old buffered audio segments would otherwise accumulate in memory for the whole session.
  const hls = new Hls({ backBufferLength: 90 });
  hlsInstance = hls;
  let recoveryAttempts = 0;

  hls.on(Hls.Events.FRAG_LOADED, () => {
    recoveryAttempts = 0;
  });

  hls.on(Hls.Events.FRAG_CHANGED, (_event, data) => {
    // ESKA ships track/ad state in a private #EXT-X-ZPR tag on every segment. FRAG_CHANGED fires as playback enters the fragment, so refreshing on a block change lands the panel on the same, moment as the audio instead of waiting up to TRACK_POLL_MS. Other streams carry no such tag.
    if (readZprTag(data.frag, state.station?.id ?? "")) void refreshTrackInfo();
  });

  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    console.warn("[HLS] fatal error", data.type, data.details);
    if (recoveryAttempts >= MAX_HLS_RECOVERY_ATTEMPTS) {
      handleAudioFailover();
      return;
    }
    recoveryAttempts++;
    setPlaybackStatus("Odzyskiwanie połączenia…");
    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        hls.startLoad();
        break;
      case Hls.ErrorTypes.MEDIA_ERROR:
        hls.recoverMediaError();
        break;
      default:
        handleAudioFailover();
        break;
    }
  });
  hls.loadSource(url);
  hls.attachMedia(radioAudio);
}

async function playStreamUrl(url: string | undefined): Promise<void> {
  if (!url) return;
  const requestId = ++playbackRequestId;
  destroyHls();
  radioAudio.crossOrigin = getProvider(state.station) === rmfProvider ? "use-credentials" : "anonymous";
  if (isHlsStream(url)) {
    pendingHlsRequestId = requestId;
    try {
      await attachHlsStream(url, requestId);
    } finally {
      if (pendingHlsRequestId === requestId) pendingHlsRequestId = null;
    }
  } else {
    radioAudio.src = url;
  }
  if (requestId !== playbackRequestId || !state.playing) return;
  applyAudioVolume();
  radioAudio.play().catch((error: unknown) => {
    if (requestId !== playbackRequestId || !state.playing) return;
    if (error instanceof DOMException && error.name === "AbortError") return;
    listeningStatistics.stop(
      radioAudio.currentTime,
      Date.now(),
      !radioAudio.muted && radioAudio.volume > 0,
      radioAudio.playbackRate,
    );
    state.playing = false;
    stopTrackRotation();
    notifyState();
    setPlaybackStatus("Nie udało się włączyć stacji. Ponów lub wybierz inną.", "failed");
  });
}

function handleAudioFailover() {
  if (!state.playing || !state.station) return;

  const rateLimit = withinRateLimit(failoverTimestamps, SWITCH_RATE_LIMIT.WINDOW_MS, SWITCH_RATE_LIMIT.MAX);
  failoverTimestamps = rateLimit.timestamps;

  const streams = state.station._streams || [state.station.stream];

  if (rateLimit.limited) {
    listeningStatistics.stop(
      radioAudio.currentTime,
      Date.now(),
      !radioAudio.muted && radioAudio.volume > 0,
      radioAudio.playbackRate,
    );
    // max 3 stream switches in 30s limit to avoid infinite retry loop during outage.
    state.playing = false;
    stopTrackRotation();
    radioAudio.pause();
    updateNowPlayingTrack({
      artist: state.station.name,
      title: "Błąd odtwarzania stacji",
    });
    notifyState();
    setPlaybackStatus("Nie udało się połączyć ze stacją. Ponów lub wybierz inną.", "failed");
    return;
  }

  const currentIdx = state.station._currentStreamIndex || 0;
  const nextIdx = (currentIdx + 1) % streams.length;
  listeningStatistics.suspend(
    radioAudio.currentTime,
    Date.now(),
    !radioAudio.muted && radioAudio.volume > 0,
    radioAudio.playbackRate,
  );
  listeningStatistics.recovery(
    streams[currentIdx] ?? state.station.stream,
    streams[nextIdx] ?? state.station.stream,
    Date.now(),
  );
  state.station._currentStreamIndex = nextIdx;
  setPlaybackStatus("Zmiana strumienia…");
  playStreamUrl(streams[nextIdx]);
}

radioAudio.addEventListener("error", () => {
  if (!hlsInstance) {
    setPlaybackStatus("Zmiana strumienia…");
    handleAudioFailover();
  }
});
radioAudio.addEventListener("stalled", () => {
  setPlaybackStatus("Buforowanie…", "buffering");
  if (!hlsInstance) handleAudioFailover();
});
radioAudio.addEventListener("waiting", () => setPlaybackStatus("Buforowanie…", "buffering"));
radioAudio.addEventListener("playing", () => {
  if (!state.playing) {
    state.playing = true;
    startTrackRotation();
    notifyState();
  }
  setPlaybackStatus("Na żywo", "playing");
});
radioAudio.addEventListener("pause", () => {
  if (!radioAudio.paused || (state.playing && pendingHlsRequestId === playbackRequestId)) return;
  stopTrackRotation();
  if (state.playing) {
    state.playing = false;
    notifyState();
  }
  if (!els.npLiveDot.classList.contains("failed")) setPlaybackStatus("Pauza", "paused");
});

function navigateStation(direction: 1 | -1) {
  const current = state.station;
  if (!current) return;
  const list = getOrderedStations();
  const idx = list.findIndex((s) => s.id === current.id);
  if (idx === -1) return;
  const nextIdx = (idx + direction + list.length) % list.length;
  const next = list[nextIdx];
  if (next) selectStation(next);
}

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => {
    if (!state.playing) togglePlay();
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    if (state.playing) togglePlay();
  });
  navigator.mediaSession.setActionHandler("previoustrack", () => navigateStation(-1));
  navigator.mediaSession.setActionHandler("nexttrack", () => navigateStation(1));
}

async function ensureStationMetadata(station: Station) {
  if (!station.apiBaseUrl || getProvider(station) !== rmfProvider) return;

  const stationBaseUrl = station.apiBaseUrl;

  if (!station._streamsFetched) {
    station._streamsFetched = true;
    try {
      const res = await fetch(`${stationBaseUrl}/streams`, { signal: AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS) });
      const data = (await parseJsonFromRes(res)) as { playlistMp3?: { item_mp3?: string | string[] } } | null;
      const rawMp3 = data?.playlistMp3?.item_mp3;
      const mp3Urls = Array.isArray(rawMp3) ? rawMp3 : rawMp3 ? [rawMp3] : [];
      station._streams = Array.from(new Set([station.stream, ...mp3Urls]));
    } catch (_) {
      station._streams = [station.stream];
    }
  }

  if (!station._coverFetched) {
    station._coverFetched = true;
    try {
      const res = await fetch(stationBaseUrl, { signal: AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS) });
      const data = (await parseJsonFromRes(res)) as { img?: unknown } | null;
      if (typeof data?.img === "string" && data.img.trim().length > 0) {
        station.coverUrl = resolveProtocolRelativeUrl(data.img.trim(), API_ENDPOINTS.RMF_STATIC_BASE);
      }
    } catch (_) {
      // Ignore errors, coverUrl remains undefined
    }

    if (state.station?.id === station.id) {
      updateAlbumArt(resolveAlbumCoverUrl(state.liveTrack, state.station), state.liveTrack);
    }
  }
}

export async function fetchPlaylist(station: Station, signal?: AbortSignal) {
  if (!station?.apiBaseUrl || (station._consecutiveFailures || 0) > MAX_CONSECUTIVE_FAILURES) return null;

  try {
    const parsed = await fetchMetadata(station, signal ? { signal } : {});

    if (parsed) {
      station._consecutiveFailures = 0;
      return parsed;
    }
  } catch (_) {
    // Ignore network or parse failures
  }

  if (!signal?.aborted) station._consecutiveFailures = (station._consecutiveFailures || 0) + 1;
  return null;
}

function checkRealtimeTrackState() {
  if (!state.playing || !state.station?.apiBaseUrl || !state.history || state.history.length === 0) {
    return;
  }
  // Trójka's history is purely chronological, not RMF's order:0-tagged convention this function
  // assumes; it already recomputes "current" itself every fetch tick, so skip this reconciliation.
  if (getProvider(state.station) === trojkaProvider) return;

  const nowSec = Math.floor(Date.now() / 1000);
  const activeItem = state.history.find(
    (t) => t.timestamp && t.timestamp <= nowSec && t.endTimestamp && t.endTimestamp > nowSec,
  );

  let evaluated: TrackInfo | null = null;
  if (activeItem) {
    evaluated = activeItem.isBreak
      ? {
          ...activeItem,
          artist: state.station.name,
          title: activeItem.label || DEFAULT_BREAK_LABEL,
          isLiveBreak: true,
          isFacts: activeItem.contentKind === "news",
        }
      : { ...activeItem, contentKind: "track" };
  } else {
    const curTrack = state.history.find((t) => t.order === 0) || state.history[0];
    if (curTrack?.endTimestamp && nowSec >= curTrack.endTimestamp) {
      evaluated = {
        artist: state.station.name,
        title: DEFAULT_BREAK_LABEL,
        isLiveBreak: true,
        isPredicted: true,
        contentKind: "unknown",
        contentEvidence: "inferred",
      };
    }
  }

  if (evaluated && (state.liveTrack?.artist !== evaluated.artist || state.liveTrack?.title !== evaluated.title)) {
    setLiveTrack(evaluated, getLiveTrackUpdatedAt());
    updateNowPlayingTrack(state.liveTrack);
    updateAlbumArt(resolveAlbumCoverUrl(state.liveTrack, state.station), state.liveTrack);
  }
}

let pendingStationSlideIn = false;
let metadataRequest: AbortController | null = null;
let restorePending = false;

function cancelMetadataRequest(): void {
  metadataRequest?.abort();
  metadataRequest = null;
}

export async function restoreStationMetadata(): Promise<void> {
  if (!state.station || state.playing) return;
  restorePending = true;
  setMetadataState(state.station.apiBaseUrl ? "loading" : "unsupported");
  notifyState();
  if (!document.hidden) await refreshTrackInfo(true);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && restorePending) cancelMetadataRequest();
  else if (restorePending) void restoreStationMetadata();
});
window.addEventListener("pagehide", cancelMetadataRequest);
window.addEventListener("pageshow", () => {
  if (restorePending) void restoreStationMetadata();
});

async function refreshTrackInfo(passive = false) {
  if ((!passive && !state.playing) || !state.station || metadataRequest) return;
  const station = state.station;
  const controller = new AbortController();
  metadataRequest = controller;

  if (station.apiBaseUrl) {
    const data = await (passive
      ? fetchMetadata(station, { passive: true, signal: controller.signal }).catch(() => null)
      : fetchPlaylist(station, controller.signal));
    if (metadataRequest !== controller || controller.signal.aborted || state.station !== station) return;
    setMetadataState(data?.current ? "ready" : data ? "unavailable" : "failed");

    if (data) {
      state.history = data.all || [];
      setLiveTrack(data.current, data.observedAt ?? Date.now());
      if (!passive && state.playing) checkRealtimeTrackState();
      if (!passive && state.playing && data.current) evaluateSmartListening();
    }
  } else {
    setMetadataState("unsupported");
    setLiveTrack(null);
    state.history = [];
  }
  if (metadataRequest !== controller) return;
  metadataRequest = null;
  if (passive) restorePending = false;
  updateNowPlayingTrack(state.liveTrack);
  updateAlbumArt(resolveAlbumCoverUrl(state.liveTrack, state.station), state.liveTrack);
  setHistoryLoadingState(false);
  const doFullSlide = pendingStationSlideIn;
  pendingStationSlideIn = false;
  updateHistoryUI(doFullSlide);
}

export function stopTrackRotation() {
  if (intervals.track !== null) clearInterval(intervals.track);
  intervals.track = null;
}

function startTrackRotation() {
  stopTrackRotation();
  refreshTrackInfo();
  if (state.station?.apiBaseUrl) {
    intervals.track = setInterval(() => {
      checkRealtimeTrackState();
      refreshTrackInfo();
    }, TIMERS.TRACK_POLL_MS);
  }
}

export function currentTrack(): TrackInfo | null {
  return state.liveTrack;
}

export function selectStation(s: Station, protection: ProtectiveRoute | null = null, smart = false) {
  restorePending = false;
  cancelMetadataRequest();
  if (!smart) resetSmartListening();
  listeningStatistics.suspend(
    radioAudio.currentTime,
    Date.now(),
    !radioAudio.muted && radioAudio.volume > 0,
    radioAudio.playbackRate,
  );
  listeningStatistics.route(protection, Date.now());
  listeningStatistics.selectStation(s);
  state.station = s;
  delete s._consecutiveFailures;
  delete s._apiFailed;
  state.playing = true;
  state.history = [];
  setMetadataState(s.apiBaseUrl ? "loading" : "unsupported");
  setLiveTrack(null);
  pendingStationSlideIn = true;
  failoverTimestamps = [];
  startEskaSession(s.id);
  setHistoryLoadingState(true);
  setPlaybackStatus("Łączenie…");

  ensureStationMetadata(s);

  playStreamUrl(getCurrentStreamUrl(s));

  startTrackRotation();
  notifyState();
}

export function togglePlay() {
  if (!state.station) return;
  restorePending = false;
  cancelMetadataRequest();
  state.playing = !state.playing;

  if (state.playing) {
    setPlaybackStatus("Łączenie…");
    playStreamUrl(getCurrentStreamUrl(state.station));
    startTrackRotation();
  } else {
    playbackRequestId++;
    listeningStatistics.suspend(
      radioAudio.currentTime,
      Date.now(),
      !radioAudio.muted && radioAudio.volume > 0,
      radioAudio.playbackRate,
    );
    radioAudio.pause();
    stopTrackRotation();
    if (getMetadataState() === "loading") void restoreStationMetadata();
  }

  notifyState();
}
