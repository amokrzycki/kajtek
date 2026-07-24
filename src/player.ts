import type { Station } from "./data.js";
import { getProvider } from "./providers.js";
import { radioAudio, setTrackInterval, state, type TrackInfo, trackInterval } from "./state.js";
import { updateHistoryUI, updateNowPlayingTrack } from "./ui.js";

async function fetchWithTimeout(url: string, timeoutMs = 3500): Promise<Response> {
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

export async function fetchPlaylist(station: Station) {
  if (!station?.playlistUrl || (station._consecutiveFailures || 0) > 5) return null;

  const provider = getProvider(station);
  const target = station.playlistUrl;
  const urls = [target];
  if (target.startsWith("http")) {
    urls.push(
      `https://corsproxy.io/?${encodeURIComponent(target)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    );
  }

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, 3500);
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

async function refreshTrackInfo() {
  if (!state.playing || !state.station) return;

  if (state.station.playlistUrl) {
    const data = await fetchPlaylist(state.station);
    if (data?.current) {
      state.liveTrack = data.current;
      state.history = data.all || [];
      updateNowPlayingTrack(state.liveTrack);
      updateHistoryUI();
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
  setTrackInterval(setInterval(refreshTrackInfo, 15000));
}

export function currentTrack(): TrackInfo | null {
  return state.liveTrack;
}

export function selectStation(s: Station, onUIUpdate: () => void) {
  state.station = s;
  delete s._consecutiveFailures;
  delete s._apiFailed;
  state.playing = true;
  state.liveTrack = null;

  if (s.stream) {
    radioAudio.src = s.stream;
    radioAudio.volume = state.muted ? 0 : state.vol / 100;
    radioAudio.play().catch(() => {
      // Ignore autoplay restriction errors
    });
  }

  startTrackRotation();
  onUIUpdate();
}

export function togglePlay(onUIUpdate: () => void) {
  if (!state.station) return;
  state.playing = !state.playing;

  if (state.playing) {
    if (state.station.stream)
      radioAudio.play().catch(() => {
        // Ignore autoplay restriction errors
      });
    startTrackRotation();
  } else {
    radioAudio.pause();
    stopTrackRotation();
  }

  onUIUpdate();
}
