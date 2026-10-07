import { TIMERS, TROJKA_PLAYLIST_REFRESH_MS, TROJKA_SCHEDULE_REFRESH_MS } from "../consts.js";
import type {
  MetadataOptions,
  PlaylistaBlock,
  PlaylistResult,
  Provider,
  RamowkaItem,
  Station,
  TrackInfo,
} from "../types.js";
import { decodeEntities } from "../utils.js";

let trojkaScheduleCache: { day: string; fetchedAt: number; items: RamowkaItem[] } | null = null;
let trojkaPlaylistCache: { day: string; fetchedAt: number; items: PlaylistaBlock[] } | null = null;

const TROJKA_UPCOMING_COUNT = 5;
const TROJKA_PAST_COUNT = 4;
const TROJKA_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

function warsawParts(timestampMs: number): Record<string, number> {
  return Object.fromEntries(
    TROJKA_CLOCK.formatToParts(new Date(timestampMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

function parseTrojkaTime(value: string): number {
  const wallTime = Date.parse(`${value}Z`);
  if (!Number.isFinite(wallTime)) return Number.NaN;

  let timestamp = wallTime;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = warsawParts(timestamp);
    const representedWallTime = Date.UTC(
      parts.year ?? 0,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0,
    );
    const offset = representedWallTime - Math.floor(timestamp / 1000) * 1000;
    timestamp = wallTime - offset;
  }
  return timestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isScheduleItem(value: unknown): value is RamowkaItem {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.startTime === "number" &&
    Number.isFinite(value.startTime) &&
    typeof value.endTime === "number" &&
    Number.isFinite(value.endTime) &&
    value.endTime > value.startTime &&
    typeof value.fullStartTime === "string" &&
    Number.isFinite(parseTrojkaTime(value.fullStartTime))
  );
}

function isPlaylistBlock(value: unknown): value is PlaylistaBlock {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.title === "string" &&
    typeof value.startTime === "string" &&
    Number.isFinite(parseTrojkaTime(value.startTime)) &&
    typeof value.stopTime === "string" &&
    Number.isFinite(parseTrojkaTime(value.stopTime)) &&
    Array.isArray(value.playlistItems) &&
    value.playlistItems.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.artist === "string" &&
        typeof item.title === "string" &&
        typeof item.startTime === "string" &&
        Number.isFinite(parseTrojkaTime(item.startTime)) &&
        typeof item.duration === "number" &&
        Number.isFinite(item.duration) &&
        item.duration >= 0,
    )
  );
}

async function fetchTrojkaJson(url: string, signal?: AbortSignal): Promise<unknown> {
  try {
    // Onnetwork derives CORS from Referer but drops its port, breaking local origins.
    const res = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS),
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    signal?.throwIfAborted();
    return json;
  } catch (_) {
    return null;
  }
}

function trojkaDayKey(d: Date): string {
  const parts = warsawParts(d.getTime());
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

async function getTrojkaSchedule(signal?: AbortSignal): Promise<RamowkaItem[] | null> {
  const day = trojkaDayKey(new Date());
  if (trojkaScheduleCache?.day === day && Date.now() - trojkaScheduleCache.fetchedAt < TROJKA_SCHEDULE_REFRESH_MS) {
    return trojkaScheduleCache.items;
  }

  const json = await fetchTrojkaJson("https://video.onnetwork.tv/livePR2.php", signal);
  const items: unknown = isRecord(json) ? json.Trójka : null;
  if (!Array.isArray(items) || !items.every(isScheduleItem)) return trojkaScheduleCache?.items ?? null;

  trojkaScheduleCache = { day, fetchedAt: Date.now(), items };
  return items;
}

async function getTrojkaPlaylist(station: Station, signal?: AbortSignal): Promise<PlaylistaBlock[] | null> {
  const day = trojkaDayKey(new Date());
  if (trojkaPlaylistCache?.day === day && Date.now() - trojkaPlaylistCache.fetchedAt < TROJKA_PLAYLIST_REFRESH_MS) {
    return trojkaPlaylistCache.items;
  }

  const json = await fetchTrojkaJson(`${station.apiBaseUrl}/playlist?date=${day}`, signal);
  const items: unknown = isRecord(json) ? json.data : null;
  if (!Array.isArray(items) || !items.every(isPlaylistBlock)) {
    return trojkaPlaylistCache?.day === day ? trojkaPlaylistCache.items : null;
  }

  trojkaPlaylistCache = { day, fetchedAt: Date.now(), items };
  return items;
}

function formatProgramTime(startSec: number): string {
  const parts = warsawParts(startSec * 1000);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function findActiveProgram(schedule: RamowkaItem[], nowMs: number): RamowkaItem | null {
  return (
    schedule.find((p) => {
      const start = p.startTime * 1000;
      const stop = p.endTime * 1000;
      return nowMs >= start && nowMs < stop;
    }) || null
  );
}

function buildUpcomingProgramItems(schedule: RamowkaItem[], nowMs: number): TrackInfo[] {
  return schedule
    .filter((p) => p.startTime * 1000 > nowMs)
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, TROJKA_UPCOMING_COUNT)
    .map((p): TrackInfo => {
      const startSec = p.startTime;
      const stopSec = p.endTime;
      return {
        artist: "",
        title: p.title,
        isBreak: true,
        contentKind: "programme",
        contentEvidence: "explicit",
        label: p.title,
        start: formatProgramTime(p.startTime),
        timestamp: startSec,
        endTimestamp: stopSec,
        gapSec: stopSec - startSec,
      };
    });
}

function buildProgramHistoryItem(program: RamowkaItem): TrackInfo {
  const startSec = program.startTime;
  const stopSec = program.endTime;
  return {
    artist: "",
    title: program.title,
    isBreak: true,
    label: program.title,
    start: formatProgramTime(program.startTime),
    timestamp: startSec,
    endTimestamp: stopSec,
    gapSec: stopSec - startSec,
  };
}

export const trojkaProvider: Provider = {
  name: "Trójka Provider",
  parse(): PlaylistResult | null {
    return null; // unused — fetch() below owns this provider's data flow
  },
  async fetch(station: Station, options?: MetadataOptions): Promise<PlaylistResult | null> {
    const schedule = await getTrojkaSchedule(options?.signal);
    if (!schedule) return null;

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const program = findActiveProgram(schedule, nowMs);
    const playlist = program ? await getTrojkaPlaylist(station, options?.signal) : null;
    const block =
      playlist?.find((b) => parseTrojkaTime(b.startTime) === (program?.startTime ?? Number.NaN) * 1000) || null;

    const startedSongs: TrackInfo[] = (block?.playlistItems || [])
      .filter((item) => parseTrojkaTime(item.startTime) <= nowMs)
      .map((item): TrackInfo => {
        const startSec = Math.floor(parseTrojkaTime(item.startTime) / 1000);
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

    const lastSong = startedSongs[startedSongs.length - 1] || null;
    // The playlist can lag by a minute; this song-end tolerance is independent of cache revalidation.
    const stalenessToleranceSec = 60;
    const currentSong =
      startedSongs.find((t) => t.endTimestamp != null && nowSec < t.endTimestamp) ||
      (lastSong?.endTimestamp && nowSec - lastSong.endTimestamp <= stalenessToleranceSec ? lastSong : null);

    // Playlist lags up to a minute behind, so a missing/expired song falls back to the
    // schedule's program title instead of a generic "unknown" placeholder, never a fabricated
    // "Przerwa / Reklamy", since nothing here can actually tell an ad break from a live segment.
    const current: TrackInfo | null = currentSong
      ? { artist: currentSong.artist, title: currentSong.title }
      : program
        ? { artist: station.name, title: program.title, isLiveBreak: true, contentKind: "programme" }
        : null;

    // No playlist items at all and we're showing the ramówka fallback as "current" —
    // surface that same program in history too, so past isn't left empty next to a live current.
    const pastSongs =
      startedSongs.length === 0 && !currentSong && program
        ? [buildProgramHistoryItem(program)]
        : startedSongs.slice(-TROJKA_PAST_COUNT);

    return {
      current,
      observedAt: Math.min(
        trojkaScheduleCache?.fetchedAt ?? nowMs,
        currentSong ? (trojkaPlaylistCache?.fetchedAt ?? nowMs) : (trojkaScheduleCache?.fetchedAt ?? nowMs),
      ),
      all: [...pastSongs, ...buildUpcomingProgramItems(schedule, nowMs)],
    };
  },
};
