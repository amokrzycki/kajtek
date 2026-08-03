import type Hls from "hls.js";
import { isBlacklisted } from "./blacklist.js";
import { getOrderedStations, getStoredRmfCatalog } from "./catalog.js";
import { API_ENDPOINTS, DEFAULT_BREAK_LABEL, MAX_CONSECUTIVE_FAILURES, TIMERS } from "./consts.js";
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
import { getFactsLabel, getTrackKey, resolveProtocolRelativeUrl } from "./utils.js";

let failoverTimestamps: number[] = [];
let hlsInstance: Hls | null = null;

interface BlacklistWarning {
  phase: "warning" | "switched";
  track: TrackInfo;
  trackKey: string;
  originStation: Station;
  candidate: Station;
  candidateReason: "favorite" | "similar" | "other";
  secondsLeft: number;
  switchedAt?: number;
}

let blacklistWarning: BlacklistWarning | null = null;
let dismissedTrackKey: string | null = null;
let blacklistSwitchTimestamps: number[] = [];

export function getBlacklistWarningState(): BlacklistWarning | null {
  return blacklistWarning;
}

function pickBlacklistCandidate(
  origin: Station,
): { station: Station; reason: "favorite" | "similar" | "other" } | null {
  const pool = getOrderedStations().filter((s) => s.id !== origin.id);
  if (pool.length === 0) return null;

  if (origin.provider === "rmf") {
    const raw = getStoredRmfCatalog()?.stations.find((r) => r.idname === origin.id || String(r.id) === origin.id);
    const similarIds = new Set(raw?.similar_stations.station_list.map((s) => s.id));
    // ponytail: ranking hint only, not a guarantee — doesn't verify the candidate's own live
    // track isn't blacklisted (would need an extra fetch per candidate); the switch-cap below
    // self-corrects on the next detection pass if it turns out bad.
    const similar = pool.find((s) => similarIds.has(s.id));
    if (similar) return { station: similar, reason: state.favs.has(similar.id) ? "favorite" : "similar" };
  }

  const fav = pool.find((s) => state.favs.has(s.id));
  if (fav) return { station: fav, reason: "favorite" };

  const first = pool[0];
  return first ? { station: first, reason: "other" } : null;
}

function performBlacklistSwitch(track: TrackInfo, originStation: Station, candidate: Station, reason: string) {
  const NOW = Date.now();
  blacklistSwitchTimestamps = blacklistSwitchTimestamps.filter((t) => NOW - t < 30000);

  if (blacklistSwitchTimestamps.length >= 3) {
    // ponytail: same rolling cap as handleAudioFailover — avoid switching forever if every
    // candidate keeps landing on another blacklisted song.
    dismissedTrackKey = getTrackKey(track);
    blacklistWarning = null;
    return;
  }

  blacklistSwitchTimestamps.push(NOW);
  selectStation(candidate);
  blacklistWarning = {
    phase: "switched",
    track,
    trackKey: getTrackKey(track),
    originStation,
    candidate,
    candidateReason: reason as "favorite" | "similar" | "other",
    secondsLeft: 0,
    switchedAt: Date.now(),
  };
}

function armBlacklistWarning(track: TrackInfo, origin: Station, immediate: boolean) {
  const picked = pickBlacklistCandidate(origin);
  if (!picked) return;

  state.showHistory = true;
  state.historyTab = "program";

  if (immediate) {
    performBlacklistSwitch(track, origin, picked.station, picked.reason);
  } else {
    const nowSec = Math.floor(Date.now() / 1000);
    blacklistWarning = {
      phase: "warning",
      track,
      trackKey: getTrackKey(track),
      originStation: origin,
      candidate: picked.station,
      candidateReason: picked.reason,
      secondsLeft: (track.timestamp ?? nowSec) - nowSec,
    };
  }
  notifyState();
}

function detectBlacklistedUpcoming() {
  if (!state.station || blacklistWarning) return;

  if (state.liveTrack && !state.liveTrack.isBreak && isBlacklisted(state.liveTrack)) {
    const key = getTrackKey(state.liveTrack);
    if (key !== dismissedTrackKey) armBlacklistWarning(state.liveTrack, state.station, true);
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const upcoming = state.history
    .filter((t) => !t.isBreak && t.artist && t.title && t.timestamp && t.timestamp > nowSec)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0];

  if (upcoming && isBlacklisted(upcoming) && getTrackKey(upcoming) !== dismissedTrackKey) {
    armBlacklistWarning(upcoming, state.station, false);
  }
}

export function switchBlacklistCandidateNow(): void {
  if (blacklistWarning?.phase !== "warning") return;
  performBlacklistSwitch(
    blacklistWarning.track,
    blacklistWarning.originStation,
    blacklistWarning.candidate,
    blacklistWarning.candidateReason,
  );
  notifyState();
}

export function dismissBlacklistWarning(): void {
  if (!blacklistWarning) return;
  dismissedTrackKey = blacklistWarning.trackKey;
  blacklistWarning = null;
  notifyState();
}

export function returnToPreviousStation(): void {
  if (blacklistWarning?.phase !== "switched") return;
  const { originStation } = blacklistWarning;
  blacklistWarning = null;
  selectStation(originStation);
}

setInterval(() => {
  if (!blacklistWarning) return;

  if (blacklistWarning.phase === "warning") {
    const nowSec = Math.floor(Date.now() / 1000);
    const secondsLeft = (blacklistWarning.track.timestamp ?? nowSec) - nowSec;
    if (secondsLeft <= 0) {
      performBlacklistSwitch(
        blacklistWarning.track,
        blacklistWarning.originStation,
        blacklistWarning.candidate,
        blacklistWarning.candidateReason,
      );
      notifyState();
    } else if (secondsLeft !== blacklistWarning.secondsLeft) {
      blacklistWarning.secondsLeft = secondsLeft;
      notifyState();
    }
  } else if (blacklistWarning.phase === "switched") {
    if (Date.now() - (blacklistWarning.switchedAt ?? 0) > 8000) {
      blacklistWarning = null;
      notifyState();
    }
  }
}, 1000);

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

  const NOW = Date.now();
  failoverTimestamps = failoverTimestamps.filter((t) => NOW - t < 30000);

  const streams = state.station._streams || [state.station.stream];

  if (failoverTimestamps.length >= 3) {
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

  failoverTimestamps.push(NOW);
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
      updateAlbumArt(resolveAlbumCoverUrl(state.liveTrack, state.station));
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
      };
    }
  }

  if (evaluated && (state.liveTrack?.artist !== evaluated.artist || state.liveTrack?.title !== evaluated.title)) {
    state.liveTrack = evaluated;
    updateNowPlayingTrack(state.liveTrack);
    updateAlbumArt(resolveAlbumCoverUrl(state.liveTrack, state.station));
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
      updateAlbumArt(resolveAlbumCoverUrl(state.liveTrack, state.station));
      const doFullSlide = pendingStationSlideIn;
      pendingStationSlideIn = false;
      updateHistoryUI(doFullSlide);
      detectBlacklistedUpcoming();
    }
  } else {
    state.liveTrack = null;
    state.history = [];
    updateNowPlayingTrack(null);
    updateAlbumArt(resolveAlbumCoverUrl(null, state.station));
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
  blacklistWarning = null;
  dismissedTrackKey = null;
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
