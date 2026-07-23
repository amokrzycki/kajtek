import { radioAudio, setTrackInterval, state, trackInterval } from "./state.js";
import { updateHistoryUI, updateNowPlayingTrack } from "./ui.js";

function decodeEntities(str) {
  if (!str) return "";
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

export async function fetchPlaylist(station) {
  if (!station || !station.playlistUrl || station._apiFailed) return null;

  try {
    const res = await fetch(station.playlistUrl);
    if (!res.ok) throw new Error();
    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
      const cur = data.find((item) => item.order === 0) || data[0];
      const upcoming = data
        .filter((item) => item.order > 0)
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          artist: decodeEntities(item.author),
          title: decodeEntities(item.title),
          start: item.start,
        }));

      return {
        current: cur ? { artist: decodeEntities(cur.author), title: decodeEntities(cur.title) } : null,
        upcoming,
      };
    }
  } catch (e) {
    station._apiFailed = true;
  }

  return null;
}

async function refreshTrackInfo() {
  if (!state.playing || !state.station) return;

  if (state.station.playlistUrl && !state.station._apiFailed) {
    const data = await fetchPlaylist(state.station);
    if (data && data.current) {
      state.liveTrack = data.current;
      state.history = data.upcoming;
      updateNowPlayingTrack(state.liveTrack);
      updateHistoryUI();
      return;
    }
  }

  state.liveTrack = null;
  state.history = [];
  updateNowPlayingTrack(null);
  updateHistoryUI();
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

export function currentTrack() {
  return state.liveTrack;
}

export function selectStation(s, onUIUpdate) {
  state.station = s;
  delete s._apiFailed;
  state.playing = true;
  state.liveTrack = null;
  state.history = [];

  if (s.stream) {
    radioAudio.src = s.stream;
    radioAudio.volume = state.muted ? 0 : state.vol / 100;
    radioAudio.play().catch(() => {});
  }

  startTrackRotation();
  onUIUpdate();
}

export function togglePlay(onUIUpdate) {
  if (!state.station) return;
  state.playing = !state.playing;

  if (state.playing) {
    if (state.station.stream) radioAudio.play().catch(() => {});
    startTrackRotation();
  } else {
    radioAudio.pause();
    stopTrackRotation();
  }

  onUIUpdate();
}
