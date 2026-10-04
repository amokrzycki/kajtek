import { STORAGE_KEYS } from "./consts.js";

export interface StatisticsTotals {
  listeningMs: number;
  adSavedMs: number;
  blacklistAvoided: number;
  detours: number;
}

interface StoredStatistics {
  version: 1;
  startedAt: number;
  weekStart: number;
  allTime: StatisticsTotals;
  week: StatisticsTotals;
  recentOperations: string[];
}

export interface StatisticsSnapshot extends StoredStatistics {
  persistent: boolean;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type CountDelta = Partial<Pick<StatisticsTotals, "blacklistAvoided" | "detours">>;

const emptyTotals = (): StatisticsTotals => ({ listeningMs: 0, adSavedMs: 0, blacklistAvoided: 0, detours: 0 });
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

function validTotals(value: unknown): value is StatisticsTotals {
  if (!value || typeof value !== "object") return false;
  const numbersValid = ["listeningMs", "adSavedMs", "blacklistAvoided", "detours"].every(
    (key) => key in value && validNumber(Reflect.get(value, key)),
  );
  return (
    numbersValid &&
    Number.isSafeInteger(Reflect.get(value, "blacklistAvoided")) &&
    Number.isSafeInteger(Reflect.get(value, "detours")) &&
    Reflect.get(value, "adSavedMs") <= Reflect.get(value, "listeningMs")
  );
}

function decode(raw: string | null): StoredStatistics | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    if (
      !("version" in value) ||
      value.version !== 1 ||
      !("startedAt" in value) ||
      !validNumber(value.startedAt) ||
      !Number.isFinite(new Date(value.startedAt).getTime()) ||
      !("weekStart" in value) ||
      !validNumber(value.weekStart) ||
      !Number.isFinite(new Date(value.weekStart).getTime()) ||
      !("allTime" in value) ||
      !validTotals(value.allTime) ||
      !("week" in value) ||
      !validTotals(value.week) ||
      !("recentOperations" in value) ||
      !Array.isArray(value.recentOperations) ||
      !value.recentOperations.every((id: unknown) => typeof id === "string")
    )
      return null;
    return {
      version: 1,
      startedAt: value.startedAt,
      weekStart: value.weekStart,
      allTime: { ...value.allTime },
      week: { ...value.week },
      recentOperations: value.recentOperations.slice(-128),
    };
  } catch {
    return null;
  }
}

export function createStatisticsStore(storage: Storage, now = Date.now()) {
  let persistent = true;
  let data: StoredStatistics = {
    version: 1,
    startedAt: now,
    weekStart: getWeekStart(now),
    allTime: emptyTotals(),
    week: emptyTotals(),
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
    }
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
    duration(start: number, end: number, listeningMs: number, adSavedMs: number): void {
      if (end <= start || !validNumber(listeningMs) || !validNumber(adSavedMs)) return;
      sync();
      let cursor = start;
      while (cursor < end) {
        const boundary = Math.min(end, nextWeek(cursor));
        const fraction = (boundary - cursor) / (end - start);
        add({ listeningMs: listeningMs * fraction, adSavedMs: Math.min(adSavedMs, listeningMs) * fraction }, cursor);
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
  kind: "blacklist" | "adSkip";
  automatic: boolean;
  adEndsAt?: number;
}

export class ListeningStatistics {
  private baseline: { media: number; wall: number } | null = null;
  private pending: ProtectiveRoute | null = null;
  private pendingRecovery: string | null = null;
  private adEndsAt: number | null = null;

  constructor(private readonly store: Pick<StatisticsStore, "record" | "duration">) {}

  route(route: ProtectiveRoute | null, _at: number): void {
    this.baseline = null;
    this.pending = route;
    this.pendingRecovery = null;
    this.adEndsAt = route?.adEndsAt ?? null;
  }

  recovery(from: string, to: string, _at: number): void {
    this.baseline = null;
    this.pendingRecovery = from === to ? null : createStatisticsOperationId();
  }

  playing(media: number, at: number): void {
    const pending = this.pending;
    const recovery = this.pendingRecovery;
    // Consume before committing: repeated `playing` after buffering is not another detour.
    this.pending = null;
    this.pendingRecovery = null;
    if (pending)
      this.store.record(
        pending.id,
        {
          blacklistAvoided: pending.kind === "blacklist" ? 1 : 0,
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
    const savedEnd = Math.min(at, this.adEndsAt ?? start);
    if (savedEnd > start) this.store.duration(start, savedEnd, savedEnd - start, savedEnd - start);
    if (at > Math.max(start, savedEnd))
      this.store.duration(Math.max(start, savedEnd), at, at - Math.max(start, savedEnd), 0);
  }

  suspend(media: number, at: number, audible: boolean, playbackRate = 1): void {
    this.sample(media, at, audible, playbackRate);
    this.baseline = null;
  }

  stop(media: number, at: number, audible: boolean, playbackRate = 1): void {
    this.suspend(media, at, audible, playbackRate);
    this.pending = null;
    this.pendingRecovery = null;
    this.adEndsAt = null;
  }
}
