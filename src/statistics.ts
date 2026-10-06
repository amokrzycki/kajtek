import { STORAGE_KEYS } from "./consts.js";

export interface StatisticsTotals {
  listeningMs: number;
  adSavedMs: number;
  negativeMusicAvoided: number;
  adsAvoided: number;
  newsAvoided: number;
  otherBreaksAvoided: number;
  detours: number;
}

export interface ListeningStation {
  id: string;
  name: string;
}

export interface StationListening extends ListeningStation {
  listeningMs: number;
}

interface StoredStatistics {
  version: 3;
  startedAt: number;
  weekStart: number;
  allTime: StatisticsTotals;
  week: StatisticsTotals;
  allTimeStations: StationListening[];
  weekStations: StationListening[];
  recentOperations: string[];
}

export function getTopStations(stations: readonly StationListening[]): StationListening[] {
  return stations
    .filter((station) => station.listeningMs > 0)
    .sort((a, b) => b.listeningMs - a.listeningMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, 5);
}

export interface StatisticsSnapshot extends StoredStatistics {
  persistent: boolean;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type CountDelta = Partial<Omit<StatisticsTotals, "listeningMs" | "adSavedMs">>;

const emptyTotals = (): StatisticsTotals => ({
  listeningMs: 0,
  adSavedMs: 0,
  negativeMusicAvoided: 0,
  adsAvoided: 0,
  newsAvoided: 0,
  otherBreaksAvoided: 0,
  detours: 0,
});
const validNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function getWeekStart(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

function nextWeek(at: number): number {
  const date = new Date(getWeekStart(at));
  date.setDate(date.getDate() + 7);
  return date.getTime();
}

function decodeTotals(value: unknown, legacy: boolean): StatisticsTotals | null {
  if (!value || typeof value !== "object") return null;
  const listeningMs: unknown = Reflect.get(value, "listeningMs");
  const adSavedMs: unknown = Reflect.get(value, "adSavedMs");
  const negativeMusicAvoided: unknown = Reflect.get(value, legacy ? "blacklistAvoided" : "negativeMusicAvoided");
  const adsAvoided: unknown = legacy ? 0 : Reflect.get(value, "adsAvoided");
  const newsAvoided: unknown = legacy ? 0 : Reflect.get(value, "newsAvoided");
  const otherBreaksAvoided: unknown = legacy ? 0 : Reflect.get(value, "otherBreaksAvoided");
  const detours: unknown = Reflect.get(value, "detours");
  if (
    !validNumber(listeningMs) ||
    !validNumber(adSavedMs) ||
    adSavedMs > listeningMs ||
    !validNumber(negativeMusicAvoided) ||
    !Number.isSafeInteger(negativeMusicAvoided) ||
    !validNumber(adsAvoided) ||
    !Number.isSafeInteger(adsAvoided) ||
    !validNumber(newsAvoided) ||
    !Number.isSafeInteger(newsAvoided) ||
    !validNumber(otherBreaksAvoided) ||
    !Number.isSafeInteger(otherBreaksAvoided) ||
    !validNumber(detours) ||
    !Number.isSafeInteger(detours)
  )
    return null;
  return { listeningMs, adSavedMs, negativeMusicAvoided, adsAvoided, newsAvoided, otherBreaksAvoided, detours };
}

function validStations(value: unknown): value is StationListening[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((station: unknown) => {
    if (
      !station ||
      typeof station !== "object" ||
      !("id" in station) ||
      typeof station.id !== "string" ||
      !station.id ||
      ids.has(station.id) ||
      !("name" in station) ||
      typeof station.name !== "string" ||
      !("listeningMs" in station) ||
      !validNumber(station.listeningMs)
    )
      return false;
    ids.add(station.id);
    return true;
  });
}

function decode(raw: string | null): StoredStatistics | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    if (
      !("version" in value) ||
      (value.version !== 1 && value.version !== 2 && value.version !== 3) ||
      !("startedAt" in value) ||
      !validNumber(value.startedAt) ||
      !Number.isFinite(new Date(value.startedAt).getTime()) ||
      !("weekStart" in value) ||
      !validNumber(value.weekStart) ||
      !Number.isFinite(new Date(value.weekStart).getTime()) ||
      !("allTime" in value) ||
      !("week" in value) ||
      !("recentOperations" in value) ||
      !Array.isArray(value.recentOperations) ||
      !value.recentOperations.every((id: unknown) => typeof id === "string")
    )
      return null;
    const allTime = decodeTotals(value.allTime, value.version !== 3);
    const week = decodeTotals(value.week, value.version !== 3);
    if (!allTime || !week) return null;
    let allTimeStations: StationListening[] = [];
    let weekStations: StationListening[] = [];
    if (value.version !== 1) {
      if (
        !("allTimeStations" in value) ||
        !validStations(value.allTimeStations) ||
        !("weekStations" in value) ||
        !validStations(value.weekStations)
      )
        return null;
      allTimeStations = value.allTimeStations.map((station) => ({ ...station }));
      weekStations = value.weekStations.map((station) => ({ ...station }));
    }
    return {
      version: 3,
      startedAt: value.startedAt,
      weekStart: value.weekStart,
      allTime,
      week,
      allTimeStations,
      weekStations,
      recentOperations: value.recentOperations.slice(-128),
    };
  } catch {
    return null;
  }
}

export function createStatisticsStore(storage: Storage, now = Date.now()) {
  let persistent = true;
  let data: StoredStatistics = {
    version: 3,
    startedAt: now,
    weekStart: getWeekStart(now),
    allTime: emptyTotals(),
    week: emptyTotals(),
    allTimeStations: [],
    weekStations: [],
    recentOperations: [],
  };

  function sync(): void {
    if (!persistent) return;
    try {
      data = decode(storage.getItem(STORAGE_KEYS.STATISTICS)) ?? data;
    } catch {
      persistent = false;
    }
  }

  function save(): void {
    try {
      storage.setItem(STORAGE_KEYS.STATISTICS, JSON.stringify(data));
      persistent = true;
    } catch {
      persistent = false;
    }
  }

  function rollWeek(at: number): void {
    const start = getWeekStart(at);
    if (start > data.weekStart) {
      data.weekStart = start;
      data.week = emptyTotals();
      data.weekStations = [];
    }
  }

  function addStation(stations: StationListening[], station: ListeningStation, listeningMs: number): void {
    if (listeningMs <= 0) return;
    const existing = stations.find((entry) => entry.id === station.id);
    if (existing) {
      existing.listeningMs += listeningMs;
      existing.name = station.name;
    } else stations.push({ id: station.id, name: station.name, listeningMs });
  }

  function add(delta: Partial<StatisticsTotals>, at: number): void {
    rollWeek(at);
    for (const key of Object.keys(emptyTotals()) as (keyof StatisticsTotals)[]) {
      const amount = delta[key] ?? 0;
      if (!validNumber(amount)) continue;
      data.allTime[key] += amount;
      if (getWeekStart(at) === data.weekStart) data.week[key] += amount;
    }
  }

  sync();

  return {
    persist(): void {
      sync();
      save();
    },
    // Operation IDs belong to completed route changes, never metadata polls or warnings.
    record(id: string, delta: CountDelta, at: number): void {
      sync();
      if (data.recentOperations.includes(id)) return;
      data.recentOperations = [...data.recentOperations, id].slice(-128);
      add(delta, at);
      save();
    },
    duration(start: number, end: number, listeningMs: number, adSavedMs: number, station?: ListeningStation): void {
      if (end <= start || !validNumber(listeningMs) || !validNumber(adSavedMs)) return;
      sync();
      let cursor = start;
      while (cursor < end) {
        const boundary = Math.min(end, nextWeek(cursor));
        const fraction = (boundary - cursor) / (end - start);
        add({ listeningMs: listeningMs * fraction, adSavedMs: Math.min(adSavedMs, listeningMs) * fraction }, cursor);
        if (station) {
          addStation(data.allTimeStations, station, listeningMs * fraction);
          if (getWeekStart(cursor) === data.weekStart) addStation(data.weekStations, station, listeningMs * fraction);
        }
        cursor = boundary;
      }
      save();
    },
    snapshot(at = Date.now()): StatisticsSnapshot {
      sync();
      rollWeek(at);
      return {
        ...data,
        allTime: { ...data.allTime },
        week: { ...data.week },
        allTimeStations: data.allTimeStations.map((station) => ({ ...station })),
        weekStations: data.weekStations.map((station) => ({ ...station })),
        recentOperations: [...data.recentOperations],
        persistent,
      };
    },
  };
}

export type StatisticsStore = ReturnType<typeof createStatisticsStore>;

export function createStatisticsOperationId(): string {
  // getRandomValues also works on the plain HTTP dev server used for phone testing.
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16).padStart(8, "0")).join(
    "",
  );
}

export interface ProtectiveRoute {
  id: string;
  kind: "advertisement" | "news" | "otherBreak" | "negativeTrack" | "negativeArtist" | "return";
  automatic: boolean;
  // Epoch ms bounds of a break with a known, bounded interval; only replacement audio inside it is saved time.
  adStartsAt?: number;
  adEndsAt?: number;
  // A later temporary reroute can retain the original advertisement's measured interval.
  originAdWindow?: { startsAt?: number; endsAt: number };
}

export class ListeningStatistics {
  private baseline: { media: number; wall: number } | null = null;
  private pending: ProtectiveRoute | null = null;
  private pendingRecovery: string | null = null;
  private adWindows: { startsAt: number; endsAt: number }[] = [];
  private station: ListeningStation | undefined;

  constructor(private readonly store: Pick<StatisticsStore, "record" | "duration">) {}

  selectStation(station: ListeningStation): void {
    this.baseline = null;
    this.station = { id: station.id, name: station.name };
  }

  route(route: ProtectiveRoute | null, _at: number): void {
    this.baseline = null;
    this.pending = route;
    this.pendingRecovery = null;
    const windows =
      route && route.kind !== "return"
        ? [
            route.originAdWindow,
            route.kind === "advertisement" ? { startsAt: route.adStartsAt, endsAt: route.adEndsAt } : undefined,
          ]
        : [];
    this.adWindows = windows.flatMap((window) => {
      // Invalid bounds are bad provider data, not evidence.
      if (
        !window ||
        !validNumber(window.endsAt) ||
        (window.startsAt !== undefined && (!validNumber(window.startsAt) || window.startsAt >= window.endsAt))
      )
        return [];
      return [{ startsAt: window.startsAt ?? -Infinity, endsAt: window.endsAt }];
    });
  }

  recovery(from: string, to: string, _at: number): void {
    this.baseline = null;
    this.pendingRecovery = from === to ? null : createStatisticsOperationId();
  }

  playing(media: number, at: number): void {
    this.adWindows = this.adWindows.filter((window) => at < window.endsAt);
    const pending = this.pending;
    const recovery = this.pendingRecovery;
    // Consume before committing: repeated `playing` after buffering is not another detour.
    this.pending = null;
    this.pendingRecovery = null;
    if (pending && pending.kind !== "return")
      this.store.record(
        pending.id,
        {
          negativeMusicAvoided: pending.kind === "negativeTrack" || pending.kind === "negativeArtist" ? 1 : 0,
          adsAvoided: pending.kind === "advertisement" ? 1 : 0,
          newsAvoided: pending.kind === "news" ? 1 : 0,
          otherBreaksAvoided: pending.kind === "otherBreak" ? 1 : 0,
          detours: pending.automatic ? 1 : 0,
        },
        at,
      );
    if (recovery) this.store.record(recovery, { detours: 1 }, at);
    this.baseline = { media, wall: at };
  }

  sample(media: number, at: number, audible: boolean, playbackRate = 1): void {
    const previous = this.baseline;
    if (!previous) return;
    this.baseline = { media, wall: at };
    const elapsed = at - previous.wall;
    const advanced = ((media - previous.media) / playbackRate) * 1000;
    // Source resets, seeks and discontinuous HLS timelines cannot prove listening.
    if (!audible || elapsed <= 0 || !validNumber(advanced) || advanced > elapsed + 2000) return;
    const listening = Math.min(advanced, elapsed);
    if (listening <= 0) return;
    const start = at - listening;
    // Split at every edge; overlapping original/current windows credit the same audio only once.
    const cuts = [start, at, ...this.adWindows.flatMap((window) => [window.startsAt, window.endsAt])]
      .map((cut) => Math.min(Math.max(cut, start), at))
      .sort((a, b) => a - b);
    cuts.reduce((from, to) => {
      if (to > from) {
        const saved = this.adWindows.some((window) => from >= window.startsAt && to <= window.endsAt);
        this.store.duration(from, to, to - from, saved ? to - from : 0, this.station);
      }
      return to;
    });
  }

  suspend(media: number, at: number, audible: boolean, playbackRate = 1): void {
    this.sample(media, at, audible, playbackRate);
    this.baseline = null;
  }

  stop(media: number, at: number, audible: boolean, playbackRate = 1): void {
    this.suspend(media, at, audible, playbackRate);
    this.pendingRecovery = null;
    this.endRoute();
  }

  endRoute(): void {
    this.pending = null;
    this.adWindows = [];
  }
}
