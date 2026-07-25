import { getFactsLabel, MAX_CONSECUTIVE_FAILURES, TIMERS } from "./consts.js";
import { applyAudioVolume } from "./controls.js";
import { getProvider, getRmfFactsTimeInfo } from "./providers.js";
import { notifyState, radioAudio, setTrackInterval, state, trackInterval } from "./state.js";
import type { Station, TrackInfo } from "./types.js";
import { els, resolveAlbumCoverUrl, updateAlbumArt, updateHistoryUI, updateNowPlayingTrack } from "./ui.js";

let failoverTimestamps: number[] = [];

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
  const nextUrl = streams[nextIdx];

  if (nextUrl) {
    radioAudio.src = nextUrl;
    applyAudioVolume();
    radioAudio.play().catch(() => {
      // Ignore autoplay restriction errors
    });
  }
}

radioAudio.addEventListener("error", handleAudioFailover);
radioAudio.addEventListener("stalled", handleAudioFailover);

async function fetchWithTimeout(url: string, timeoutMs = TIMERS.FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function parseJsonFromRes(res: Response): Promise<unknown> {
  if (!res.ok) return null;
  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (json?.contents) {
    try {
      const parsed = JSON.parse(json.contents);
      if (Array.isArray(parsed) || typeof parsed === "object") return parsed;
    } catch (_) {
      // Ignore parse errors
    }
  }
  if (typeof json === "object") return json;
  return null;
}

async function ensureStationMetadata(station: Station) {
  if (!station.apiBaseUrl) return;

  const stationBaseUrl = station.apiBaseUrl;

  if (!station._streamsFetched) {
    station._streamsFetched = true;
    try {
      const res = await fetchWithTimeout(`${stationBaseUrl}/streams`, TIMERS.FETCH_TIMEOUT_MS);
      const data = (await parseJsonFromRes(res)) as { playlistMp3?: { item_mp3?: unknown } } | null;
      const rawMp3 = data?.playlistMp3?.item_mp3;
      let mp3Urls: string[] = [];
      if (Array.isArray(rawMp3)) {
        mp3Urls = rawMp3.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
      } else if (typeof rawMp3 === "string" && rawMp3.trim().length > 0) {
        mp3Urls = [rawMp3.trim()];
      }
      // premium streams omitted (require auth, return 401/403). Keep hardcoded stream as first element.
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
        station.coverUrl = data.img.trim();
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
  const urls = [target];

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, TIMERS.FETCH_TIMEOUT_MS);
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
  }

  station._consecutiveFailures = (station._consecutiveFailures || 0) + 1;
  return null;
}

function checkRealtimeTrackState() {
  if (!state.playing || !state.station || !state.history || state.history.length === 0) return;

  const nowSec = Math.floor(Date.now() / 1000);
  const activeItem = state.history.find(
    (t) => t.timestamp && t.timestamp <= nowSec && t.endTimestamp && t.endTimestamp > nowSec,
  );

  let evaluated: TrackInfo | null = null;
  if (activeItem) {
    if (activeItem.isBreak) {
      const isRmf = state.station.id === "rmf";
      const factsInfo = isRmf ? getRmfFactsTimeInfo(nowSec) : { isFacts: false, targetHourStr: "" };
      let label = activeItem.label || "Przerwa / Reklamy";

      if (factsInfo.isFacts) {
        label = getFactsLabel(factsInfo.targetHourStr);
      }

      evaluated = {
        artist: state.station.name,
        title: `📻 ${label}`,
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
      const isRmf = state.station.id === "rmf";
      const factsInfo = isRmf ? getRmfFactsTimeInfo(nowSec) : { isFacts: false, targetHourStr: "" };
      let label = "Przerwa / Reklamy";
      if (factsInfo.isFacts) {
        label = getFactsLabel(factsInfo.targetHourStr);
      }
      evaluated = {
        artist: state.station.name,
        title: `📻 ${label}`,
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
  }
}

function stopTrackRotation() {
  if (trackInterval) clearInterval(trackInterval);
  setTrackInterval(null);
}

function startTrackRotation() {
  stopTrackRotation();
  refreshTrackInfo();
  setTrackInterval(
    setInterval(() => {
      checkRealtimeTrackState();
      refreshTrackInfo();
    }, TIMERS.TRACK_POLL_MS),
  );
}

export function currentTrack(): TrackInfo | null {
  return state.liveTrack;
}

export function selectStation(s: Station) {
  state.station = s;
  delete s._consecutiveFailures;
  delete s._apiFailed;
  state.playing = true;
  state.liveTrack = null;
  pendingStationSlideIn = true;
  failoverTimestamps = [];
  els.historyList.classList.add("is-loading");

  ensureStationMetadata(s);

  const streams = s._streams || [s.stream];
  const streamUrl = streams[s._currentStreamIndex || 0] || s.stream;

  if (streamUrl) {
    radioAudio.src = streamUrl;
    applyAudioVolume();
    radioAudio.play().catch(() => {
      // Ignore autoplay restriction errors
    });
  }

  startTrackRotation();
  notifyState();
}

export function togglePlay() {
  if (!state.station) return;
  state.playing = !state.playing;

  if (state.playing) {
    const streams = state.station._streams || [state.station.stream];
    const streamUrl = streams[state.station._currentStreamIndex || 0] || state.station.stream;
    if (streamUrl) {
      radioAudio.src = streamUrl;
      applyAudioVolume();
      radioAudio.play().catch(() => {
        // Ignore autoplay restriction errors
      });
    }
    startTrackRotation();
  } else {
    radioAudio.pause();
    stopTrackRotation();
  }

  notifyState();
}
