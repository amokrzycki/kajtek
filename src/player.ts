import { API_ENDPOINTS, DEFAULT_BREAK_LABEL, MAX_CONSECUTIVE_FAILURES, TIMERS } from "./consts.js";
import { applyAudioVolume } from "./controls.js";
import { genericProvider, getFactsInfo, getProvider } from "./providers.js";
import { notifyState, radioAudio, setTrackInterval, state, trackInterval } from "./state.js";
import type { Station, TrackInfo } from "./types.js";
import {
  resolveAlbumCoverUrl,
  setHistoryLoadingState,
  updateAlbumArt,
  updateHistoryUI,
  updateNowPlayingTrack,
} from "./ui.js";
import { getFactsLabel, resolveProtocolRelativeUrl } from "./utils.js";

let failoverTimestamps: number[] = [];

function getCurrentStreamUrl(station: Station): string {
  const streams = station._streams || [station.stream];
  return streams[station._currentStreamIndex || 0] || station.stream;
}

function playStreamUrl(url: string | undefined): void {
  if (!url) return;
  radioAudio.src = url;
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

radioAudio.addEventListener("error", handleAudioFailover);
radioAudio.addEventListener("stalled", handleAudioFailover);

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", togglePlay);
  navigator.mediaSession.setActionHandler("pause", togglePlay);
}

async function fetchWithTimeout(url: string, timeoutMs = TIMERS.FETCH_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
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
  if (!station.apiBaseUrl) return;

  const stationBaseUrl = station.apiBaseUrl;

  if (!station._streamsFetched) {
    station._streamsFetched = true;
    try {
      const res = await fetchWithTimeout(`${stationBaseUrl}/streams`, TIMERS.FETCH_TIMEOUT_MS);
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
      const res = await fetchWithTimeout(stationBaseUrl, TIMERS.FETCH_TIMEOUT_MS);
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
  const target = `${station.apiBaseUrl}/playlist`;

  try {
    const res = await fetchWithTimeout(target, TIMERS.FETCH_TIMEOUT_MS);
    const data = await parseJsonFromRes(res);

    if (data) {
      const parsed = provider.parse(data, station);
      if (parsed) {
        station._consecutiveFailures = 0;
        return parsed;
      }
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
  if (trackInterval) clearInterval(trackInterval);
  setTrackInterval(null);
}

function startTrackRotation() {
  stopTrackRotation();
  refreshTrackInfo();
  if (state.station?.apiBaseUrl) {
    setTrackInterval(
      setInterval(() => {
        checkRealtimeTrackState();
        refreshTrackInfo();
      }, TIMERS.TRACK_POLL_MS),
    );
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
