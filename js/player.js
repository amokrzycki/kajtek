import { radioAudio, setTrackInterval, state, trackInterval } from "./state.js";
import { updateHistoryUI, updateNowPlayingTrack } from "./ui.js";

function decodeEntities(str) {
  if (!str) return "";
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

async function fetchWithTimeout(url, timeoutMs = 3500) {
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

async function parseJsonFromRes(res) {
  if (!res.ok) return null;
  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (json?.contents) {
    try {
      const parsed = JSON.parse(json.contents);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return null;
}

export async function fetchPlaylist(station) {
  if (!station?.playlistUrl || (station._consecutiveFailures || 0) > 5) return null;

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

      if (Array.isArray(data) && data.length > 0) {
        station._consecutiveFailures = 0;

        const sorted = [...data].sort((a, b) => a.order - b.order);
        const processed = [];
        const nowSec = Math.floor(Date.now() / 1000);

        for (let i = 0; i < sorted.length; i++) {
          const item = sorted[i];
          const len = Number.parseInt(item.lenght || "0", 10);
          const endTs = item.timestamp ? item.timestamp + len : null;

          processed.push({
            order: item.order,
            artist: decodeEntities(item.author),
            title: decodeEntities(item.title),
            start: item.start,
            timestamp: item.timestamp,
            endTimestamp: endTs,
            length: len,
          });

          if (i < sorted.length - 1) {
            const nextItem = sorted[i + 1];
            if (item.timestamp && len && nextItem.timestamp) {
              const gapSec = nextItem.timestamp - endTs;
              if (gapSec > 60) {
                const gapMin = Math.round(gapSec / 60);
                processed.push({
                  isBreak: true,
                  gapSec,
                  gapMin,
                  label: `Przerwa / Reklamy (~${gapMin} min)`,
                });
              }
            }
          }
        }

        const curItem = sorted.find((item) => item.order === 0) || sorted[0];
        const curLen = Number.parseInt(curItem?.lenght || "0", 10);
        const curEndTs = curItem?.timestamp ? curItem.timestamp + curLen : null;
        const hasUpcoming = sorted.some((item) => item.order > 0);

        if (!hasUpcoming && curEndTs) {
          const endDate = new Date(curEndTs * 1000);
          const endMin = endDate.getMinutes();
          const endHour = endDate.getHours();
          const nextHourStr = `${String((endHour + (endMin >= 55 ? 1 : 0)) % 24).padStart(2, "0")}:00`;

          const isTopOfHour = endMin >= 55 || endMin <= 3;
          const breakLabel = isTopOfHour
            ? `Fakty RMF / Serwis informacyjny (~${nextHourStr})`
            : "Przerwa / Serwis informacyjny";

          processed.push({
            isBreak: true,
            isPredicted: true,
            label: breakLabel,
          });
        }

        let activeTrack = null;
        if (curEndTs && nowSec > curEndTs + 15 && !hasUpcoming) {
          activeTrack = {
            artist: "RMF FM",
            title: "📻 Serwis informacyjny / Fakty",
            isLiveBreak: true,
          };
        } else if (curItem) {
          activeTrack = {
            artist: decodeEntities(curItem.author),
            title: decodeEntities(curItem.title),
          };
        }

        return {
          current: activeTrack,
          all: processed,
        };
      }
    } catch (_) {}
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

export function currentTrack() {
  return state.liveTrack;
}

export function selectStation(s, onUIUpdate) {
  state.station = s;
  delete s._consecutiveFailures;
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
