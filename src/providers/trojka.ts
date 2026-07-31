import { TIMERS, TROJKA_PLAYLIST_REFRESH_MS } from "@/consts";
import type { PlaylistaBlock, PlaylistResult, Provider, RamowkaItem, Station, TrackInfo } from "@/types";
import { decodeEntities } from "@/utils";

let trojkaBuildIdCache: string | null = null;
let trojkaScheduleCache: { day: string; items: RamowkaItem[] } | null = null;
let trojkaPlaylistCache: { fetchedAt: number; items: PlaylistaBlock[] } | null = null;

const TROJKA_UPCOMING_COUNT = 5;
const TROJKA_PAST_COUNT = 4;

async function getTrojkaBuildId(station: Station): Promise<string | null> {
  if (trojkaBuildIdCache) return trojkaBuildIdCache;
  try {
    const res = await fetch(`${station.apiBaseUrl}/`, { signal: AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/);
    if (!match?.[1]) return null;
    trojkaBuildIdCache = match[1];
    return trojkaBuildIdCache;
  } catch (_) {
    return null;
  }
}

async function fetchTrojkaJson<T>(station: Station, file: "ramowka.json" | "playlista.json"): Promise<T | null> {
  const buildId = await getTrojkaBuildId(station);
  if (!buildId) return null;

  try {
    const res = await fetch(`${station.apiBaseUrl}/_next/data/${buildId}/${file}`, {
      signal: AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) {
      // ponytail: build id rotates on Polskie Radio redeploys, re-resolve next call
      trojkaBuildIdCache = null;
      return null;
    }
    if (!res.ok) return null;
    const json = await res.json();
    return json?.pageProps?.data ?? null;
  } catch (_) {
    return null;
  }
}

function trojkaDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

async function getTrojkaSchedule(station: Station): Promise<RamowkaItem[] | null> {
  const day = trojkaDayKey(new Date());
  if (trojkaScheduleCache?.day === day) return trojkaScheduleCache.items;

  const items = await fetchTrojkaJson<RamowkaItem[]>(station, "ramowka.json");
  if (!items) return trojkaScheduleCache?.items ?? null;

  trojkaScheduleCache = { day, items };
  return items;
}

async function getTrojkaPlaylist(station: Station): Promise<PlaylistaBlock[] | null> {
  const isFresh = trojkaPlaylistCache && Date.now() - trojkaPlaylistCache.fetchedAt < TROJKA_PLAYLIST_REFRESH_MS;
  if (isFresh) return trojkaPlaylistCache?.items ?? null;

  const items = await fetchTrojkaJson<PlaylistaBlock[]>(station, "playlista.json");
  if (!items) return trojkaPlaylistCache?.items ?? null;

  trojkaPlaylistCache = { fetchedAt: Date.now(), items };
  return items;
}

function findActiveProgram(schedule: RamowkaItem[], nowMs: number): RamowkaItem | null {
  return (
    schedule.find((p) => {
      const start = new Date(p.fullStartTime).getTime();
      const stop = new Date(p.fullStopTime).getTime();
      return nowMs >= start && nowMs < stop;
    }) || null
  );
}

function buildUpcomingProgramItems(schedule: RamowkaItem[], nowMs: number): TrackInfo[] {
  return schedule
    .filter((p) => new Date(p.fullStartTime).getTime() > nowMs)
    .sort((a, b) => new Date(a.fullStartTime).getTime() - new Date(b.fullStartTime).getTime())
    .slice(0, TROJKA_UPCOMING_COUNT)
    .map((p): TrackInfo => {
      const startSec = Math.floor(new Date(p.fullStartTime).getTime() / 1000);
      const stopSec = Math.floor(new Date(p.fullStopTime).getTime() / 1000);
      return {
        artist: "",
        title: p.title,
        isBreak: true,
        label: p.title,
        start: p.startTime,
        timestamp: startSec,
        endTimestamp: stopSec,
        gapSec: stopSec - startSec,
      };
    });
}

export const trojkaProvider: Provider = {
  name: "Trójka Provider",
  parse(): PlaylistResult | null {
    return null; // unused — fetch() below owns this provider's data flow
  },
  async fetch(station: Station): Promise<PlaylistResult | null> {
    const schedule = await getTrojkaSchedule(station);
    if (!schedule) return null;

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const program = findActiveProgram(schedule, nowMs);
    const playlist = program ? await getTrojkaPlaylist(station) : null;
    const block = playlist?.find((b) => b.id === program?.id && b.startTime === program?.fullStartTime) || null;

    const songs: TrackInfo[] = (block?.playlistItems || [])
      .map((item): TrackInfo => {
        const startSec = Math.floor(new Date(item.startTime).getTime() / 1000);
        return {
          artist: decodeEntities(item.artist),
          title: decodeEntities(item.title),
          start: item.startTime.slice(11, 16),
          timestamp: startSec,
          endTimestamp: startSec + (item.duration || 0),
          length: item.duration,
        };
      })
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    const lastSong = songs[songs.length - 1] || null;
    // Last song is only trusted as "still probably playing" within one playlist-poll's worth of
    // slack past its own end — beyond that, playlist is just stale and we genuinely don't know
    // the song, so fall through to the program-title fallback below instead of showing it forever.
    const stalenessToleranceSec = (TROJKA_PLAYLIST_REFRESH_MS / 1000) * 2;
    const currentSong =
      songs.find((t) => t.timestamp && t.endTimestamp && nowSec >= t.timestamp && nowSec < t.endTimestamp) ||
      (lastSong?.endTimestamp && nowSec - lastSong.endTimestamp <= stalenessToleranceSec ? lastSong : null);

    // Playlist lags up to a minute behind, so a missing/expired song falls back to the
    // schedule's program title instead of a generic "unknown" placeholder, never a fabricated
    // "Przerwa / Reklamy", since nothing here can actually tell an ad break from a live segment.
    const current: TrackInfo | null = currentSong
      ? { artist: currentSong.artist, title: currentSong.title }
      : program
        ? { artist: station.name, title: program.title, isLiveBreak: true }
        : null;

    return {
      current,
      all: [...songs.slice(-TROJKA_PAST_COUNT), ...buildUpcomingProgramItems(schedule, nowMs)],
    };
  },
};
