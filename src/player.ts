import type Hls from "hls.js";
import { detectBlacklistedUpcoming, detectUpcomingAdBreak, resetBlacklistWarningState } from "./blacklistWarning.js";
import { getOrderedStations } from "./catalog.js";
import { API_ENDPOINTS, DEFAULT_BREAK_LABEL, MAX_CONSECUTIVE_FAILURES, SWITCH_RATE_LIMIT, TIMERS } from "./consts.js";
import { applyAudioVolume } from "./controls.js";
import { rmfProvider } from "./providers/rmf.js";
import { trojkaProvider } from "./providers/trojka.js";
import { genericProvider, getFactsInfo, getProvider } from "./providers.js";
import { intervals, notifyState, radioAudio, state } from "./state.js";
import type { Station, TrackInfo } from "./types.js";
import {
  resolveAlbumCoverUrl,
  setHistoryLoadingState,
  updateAlbumArt,
  updateHistoryUI,
  updateNowPlayingTrack,
} from "./ui.js";
import { getFactsLabel, resolveProtocolRelativeUrl, withinRateLimit } from "./utils.js";

let failoverTimestamps: number[] = [];
let hlsInstance: Hls | null = null;

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

async function attachHlsStream(url: string): Promise<void> {
  const { default: Hls } = await import("hls.js");
  if (!Hls.isSupported()) {
    // Real native HLS support (Safari/iOS) — MediaSource-based hls.js isn't needed there.
    radioAudio.src = url;
    return;
  }
  const hls = new Hls();
  hlsInstance = hls;
  let recoveryAttempts = 0;

  hls.on(Hls.Events.FRAG_LOADED, () => {
    recoveryAttempts = 0;
  });

  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    console.warn("[HLS] fatal error", data.type, data.details);
    if (recoveryAttempts >= MAX_HLS_RECOVERY_ATTEMPTS) {
      handleAudioFailover();
      return;
    }
    recoveryAttempts++;
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
  destroyHls();
  radioAudio.crossOrigin = getProvider(state.station) === rmfProvider ? "use-credentials" : "anonymous";
  if (isHlsStream(url)) {
    await attachHlsStream(url);
  } else {
    radioAudio.src = url;
  }
  applyAudioVolume();
  radioAudio.play().catch(() => {
    // Ignore autoplay restriction errors
  });
}

function handleAudioFailover() {
  if (!state.playing || !state.station) return;

  const rateLimit = withinRateLimit(failoverTimestamps, SWITCH_RATE_LIMIT.WINDOW_MS, SWITCH_RATE_LIMIT.MAX);
  failoverTimestamps = rateLimit.timestamps;

  const streams = state.station._streams || [state.station.stream];

  if (rateLimit.limited) {
    // max 3 stream switches in 30s limit to avoid infinite retry loop during outage.
    state.playing = false;
    radioAudio.pause();
    updateNowPlayingTrack({
      artist: state.station.name,
      title: "Błąd odtwarzania streamu",
    });
    notifyState();
    return;
  }

  const currentIdx = state.station._currentStreamIndex || 0;
  const nextIdx = (currentIdx + 1) % streams.length;
  state.station._currentStreamIndex = nextIdx;
  playStreamUrl(streams[nextIdx]);
}

radioAudio.addEventListener("error", () => {
  if (!hlsInstance) handleAudioFailover();
});
radioAudio.addEventListener("stalled", () => {
  if (!hlsInstance) handleAudioFailover();
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
  navigator.mediaSession.setActionHandler("play", togglePlay);
  navigator.mediaSession.setActionHandler("pause", togglePlay);
  navigator.mediaSession.setActionHandler("previoustrack", () => navigateStation(-1));
  navigator.mediaSession.setActionHandler("nexttrack", () => navigateStation(1));
}

async function parseJsonFromRes(res: Response): Promise<unknown> {
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.contents && typeof json.contents === "string") {
    try {
      return JSON.parse(json.contents);
    } catch (_) {
      // Ignore parse errors
    }
  }
  return json;
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

export async function fetchPlaylist(station: Station) {
  if (!station?.apiBaseUrl || (station._consecutiveFailures || 0) > MAX_CONSECUTIVE_FAILURES) return null;

  const provider = getProvider(station);

  try {
    const parsed = provider.fetch
      ? await provider.fetch(station)
      : await (async () => {
          const res = await fetch(`${station.apiBaseUrl}/playlist`, {
            signal: AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS),
          });
          const data = await parseJsonFromRes(res);
          return data ? provider.parse(data, station) : null;
        })();

    if (parsed) {
      station._consecutiveFailures = 0;
      return parsed;
    }
  } catch (_) {
    // Ignore network or parse failures
  }

  station._consecutiveFailures = (station._consecutiveFailures || 0) + 1;
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
    if (activeItem.isBreak) {
      const factsInfo = getFactsInfo(state.station, nowSec);
      let label = activeItem.label || DEFAULT_BREAK_LABEL;

      if (factsInfo.isFacts) {
        label = getFactsLabel(factsInfo.targetHourStr);
      }

      evaluated = {
        artist: state.station.name,
        title: label,
        isLiveBreak: true,
        isFacts: factsInfo.isFacts,
      };
    } else {
      evaluated = {
        artist: activeItem.artist,
        title: activeItem.title,
        coverUrl: activeItem.coverUrl || "",
      };
    }
  } else {
    const curTrack = state.history.find((t) => t.order === 0) || state.history[0];
    if (curTrack?.endTimestamp && nowSec >= curTrack.endTimestamp) {
      const factsInfo = getFactsInfo(state.station, nowSec);
      let label = DEFAULT_BREAK_LABEL;
      if (factsInfo.isFacts) {
        label = getFactsLabel(factsInfo.targetHourStr);
      }
      evaluated = {
        artist: state.station.name,
        title: label,
        isLiveBreak: true,
        isFacts: factsInfo.isFacts,
      };
    }
  }

  if (evaluated && (state.liveTrack?.artist !== evaluated.artist || state.liveTrack?.title !== evaluated.title)) {
    state.liveTrack = evaluated;
    updateNowPlayingTrack(state.liveTrack);
    updateAlbumArt(resolveAlbumCoverUrl(state.liveTrack, state.station), state.liveTrack);
  }
}

let pendingStationSlideIn = false;

async function refreshTrackInfo() {
  if (!state.playing || !state.station) return;

  if (state.station.apiBaseUrl) {
    const targetId = state.station.id;
    const data = await fetchPlaylist(state.station);
    if (state.station?.id !== targetId) return;

    if (data?.current) {
      state.liveTrack = data.current;
      state.history = data.all || [];
      checkRealtimeTrackState();
      updateNowPlayingTrack(state.liveTrack);
      updateAlbumArt(resolveAlbumCoverUrl(state.liveTrack, state.station), state.liveTrack);
      const doFullSlide = pendingStationSlideIn;
      pendingStationSlideIn = false;
      updateHistoryUI(doFullSlide);
      detectBlacklistedUpcoming();
      detectUpcomingAdBreak();
    }
  } else {
    state.liveTrack = null;
    state.history = [];
    updateNowPlayingTrack(null);
    updateAlbumArt(resolveAlbumCoverUrl(null, state.station), null);
    const doFullSlide = pendingStationSlideIn;
    pendingStationSlideIn = false;
    updateHistoryUI(doFullSlide);
  }
}

function stopTrackRotation() {
  if (intervals.track) clearInterval(intervals.track);
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

export function selectStation(s: Station) {
  state.station = s;
  if (getProvider(s) === genericProvider) {
    state.showHistory = false;
  }
  delete s._consecutiveFailures;
  delete s._apiFailed;
  state.playing = true;
  state.liveTrack = null;
  pendingStationSlideIn = true;
  failoverTimestamps = [];
  resetBlacklistWarningState();
  setHistoryLoadingState(true);

  ensureStationMetadata(s);

  playStreamUrl(getCurrentStreamUrl(s));

  startTrackRotation();
  notifyState();
}

export function togglePlay() {
  if (!state.station) return;
  state.playing = !state.playing;

  if (state.playing) {
    playStreamUrl(getCurrentStreamUrl(state.station));
    startTrackRotation();
  } else {
    radioAudio.pause();
    stopTrackRotation();
  }

  notifyState();
}
