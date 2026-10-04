import { describe, expect, it, vi } from "vitest";
import { createStatisticsStore, getTopStations, getWeekStart, ListeningStatistics } from "../src/statistics.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const monday = new Date(2026, 9, 5).getTime();
const firstStation = { id: "rmf", name: "RMF FM" };
const secondStation = { id: "custom-1", name: "Moje radio" };

describe("station listening", () => {
  it("merges station writes across stores and isolates snapshots from the persisted aggregate", () => {
    const storage = memoryStorage();
    const first = createStatisticsStore(storage, monday);
    const second = createStatisticsStore(storage, monday);
    first.duration(monday, monday + 1000, 1000, 0, firstStation);
    second.duration(monday + 1000, monday + 3000, 2000, 0, firstStation);
    const snapshot = first.snapshot(monday);
    expect(snapshot.allTimeStations).toEqual([{ ...firstStation, listeningMs: 3000 }]);
    snapshot.allTimeStations.splice(0);
    snapshot.weekStations.splice(0);
    expect(first.snapshot(monday).allTimeStations).toHaveLength(1);
    expect(first.snapshot(monday).weekStations).toHaveLength(1);
  });

  it("shares the global interval, including ad-window splits, and closes station attribution before a switch", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.selectStation(firstStation);
    tracker.route({ id: "ad", kind: "adSkip", automatic: true, adEndsAt: monday + 3000 }, monday);
    tracker.playing(0, monday);
    tracker.suspend(5, monday + 5000, true);
    tracker.selectStation(secondStation);
    tracker.route(null, monday + 5000);
    tracker.sample(100, monday + 6000, true);
    tracker.playing(0, monday + 7000);
    tracker.stop(3, monday + 10_000, true);
    tracker.sample(10, monday + 20_000, true);
    const snapshot = store.snapshot(monday);
    expect(snapshot.allTime.listeningMs).toBe(8000);
    expect(snapshot.allTime.adSavedMs).toBe(3000);
    expect(snapshot.allTimeStations).toEqual([
      { ...firstStation, listeningMs: 5000 },
      { ...secondStation, listeningMs: 3000 },
    ]);
  });

  it("keeps one station through distinct-URL recovery and a display-name change", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.selectStation(firstStation);
    tracker.playing(0, monday);
    tracker.suspend(5, monday + 5000, true);
    tracker.recovery("old-url", "new-url", monday + 5000);
    tracker.playing(0, monday + 6000);
    tracker.playing(0, monday + 6000);
    tracker.suspend(4, monday + 10_000, true);
    tracker.selectStation({ ...firstStation, name: "Nowa nazwa" });
    tracker.playing(0, monday + 10_000);
    tracker.sample(2, monday + 12_000, true);
    expect(store.snapshot(monday).allTimeStations).toEqual([
      { ...firstStation, name: "Nowa nazwa", listeningMs: 11_000 },
    ]);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 11_000, detours: 1 });
  });

  it("excludes pause, buffering, mute, invalid deltas and duplicate samples from both totals", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.selectStation(firstStation);
    tracker.playing(0, monday);
    tracker.sample(5, monday + 5000, true);
    tracker.sample(5, monday + 5000, true);
    tracker.suspend(5, monday + 5000, true);
    tracker.sample(10, monday + 10_000, true);
    tracker.playing(10, monday + 10_000);
    tracker.sample(15, monday + 15_000, false);
    tracker.sample(999, monday + 16_000, true);
    tracker.stop(1001, monday + 17_000, true, 2);
    tracker.sample(1006, monday + 22_000, true);
    const snapshot = store.snapshot(monday);
    expect(snapshot.allTime.listeningMs).toBe(6000);
    expect(snapshot.allTimeStations).toEqual([{ ...firstStation, listeningMs: 6000 }]);
  });

  it("splits station time at the same local week boundary, persists metadata, and rolls only the weekly ranking", () => {
    const storage = memoryStorage();
    const store = createStatisticsStore(storage, monday - 60_000);
    store.duration(monday - 30_000, monday + 30_000, 60_000, 0, firstStation);
    store.duration(monday + 30_000, monday + 70_000, 40_000, 0, secondStation);
    const restored = createStatisticsStore(storage, monday);
    expect(getTopStations(restored.snapshot(monday).weekStations).map((station) => station.id)).toEqual([
      "custom-1",
      "rmf",
    ]);
    expect(getTopStations(restored.snapshot(monday).allTimeStations).map((station) => station.id)).toEqual([
      "rmf",
      "custom-1",
    ]);
    expect(restored.snapshot(monday).allTimeStations[0]).toEqual({ ...firstStation, listeningMs: 60_000 });
    expect(restored.snapshot(monday + 7 * 86_400_000).weekStations).toEqual([]);
    expect(restored.snapshot(monday + 7 * 86_400_000).allTimeStations).toHaveLength(2);
  });

  it("ranks at most five positive durations, breaks ties by stable ID, and handles smaller lists", () => {
    const stations = ["g", "f", "e", "d", "c", "b", "a"].map((id) => ({ id, name: "Same name", listeningMs: 1000 }));
    expect(getTopStations(stations).map((station) => station.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(getTopStations([{ ...firstStation, listeningMs: 0 }])).toEqual([]);
    expect(getTopStations([{ ...firstStation, listeningMs: 100 }])).toHaveLength(1);
    expect(
      getTopStations([
        { ...firstStation, listeningMs: 100 },
        { ...secondStation, listeningMs: 200 },
      ]).map((station) => station.id),
    ).toEqual(["custom-1", "rmf"]);
    expect(stations[0]?.id).toBe("g");
  });

  it("migrates deployed v1 counters and operation IDs deterministically without inventing station history", () => {
    const storage = memoryStorage();
    const totals = { listeningMs: 120_000, adSavedMs: 20_000, blacklistAvoided: 3, detours: 4 };
    storage.setItem(
      "kajtek_statistics",
      JSON.stringify({
        version: 1,
        startedAt: monday - 10_000,
        weekStart: monday,
        allTime: totals,
        week: { ...totals, detours: 2 },
        recentOperations: ["old"],
      }),
    );
    const migrated = createStatisticsStore(storage, monday);
    const snapshot = migrated.snapshot(monday);
    expect(snapshot).toMatchObject({
      version: 2,
      startedAt: monday - 10_000,
      allTime: totals,
      week: { ...totals, detours: 2 },
      allTimeStations: [],
      weekStations: [],
      recentOperations: ["old"],
    });
    migrated.persist();
    expect(createStatisticsStore(storage, monday).snapshot(monday)).toEqual(snapshot);
    migrated.record("old", { detours: 1 }, monday);
    expect(migrated.snapshot(monday).allTime.detours).toBe(4);
    migrated.duration(monday, monday + 1000, 1000, 0, firstStation);
    expect(migrated.snapshot(monday).allTime.listeningMs).toBe(121_000);
    expect(migrated.snapshot(monday).allTimeStations).toEqual([{ ...firstStation, listeningMs: 1000 }]);
  });
});

describe("local listening totals", () => {
  it("merges writes from independently loaded stores instead of overwriting newer totals", () => {
    const storage = memoryStorage();
    const first = createStatisticsStore(storage, monday);
    const second = createStatisticsStore(storage, monday);
    first.record("first", { detours: 1 }, monday);
    second.record("second", { detours: 1 }, monday);
    expect(first.snapshot(monday).allTime.detours).toBe(2);
  });

  it("rejects corrupt timestamps and fractional event counts", () => {
    const storage = memoryStorage();
    createStatisticsStore(storage, monday).persist();
    const raw = storage.values.get("kajtek_statistics");
    if (!raw) throw new Error("Expected persisted statistics");
    storage.values.set("kajtek_statistics", raw.replace(String(monday), "999999999999999999"));
    const restored = createStatisticsStore(storage, monday);
    expect(restored.snapshot(monday).startedAt).toBe(monday);
    restored.persist();
    const corrupted = storage.values.get("kajtek_statistics");
    if (!corrupted) throw new Error("Expected reset statistics");
    storage.values.set("kajtek_statistics", corrupted.replace('"detours":0', '"detours":1.5'));
    expect(createStatisticsStore(storage, monday).snapshot(monday).allTime.detours).toBe(0);
  });

  it("persists counts and rejects duplicate operation commits after reload", () => {
    const storage = memoryStorage();
    const first = createStatisticsStore(storage, monday);
    first.record("switch-1", { blacklistAvoided: 1, detours: 1 }, monday);
    const restored = createStatisticsStore(storage, monday);
    restored.record("switch-1", { blacklistAvoided: 1, detours: 1 }, monday);
    expect(restored.snapshot(monday).allTime.blacklistAvoided).toBe(1);
    expect(restored.snapshot(monday).allTime.detours).toBe(1);
    expect(restored.snapshot(monday).startedAt).toBe(monday);
  });

  it("splits playback at Monday and resets the weekly bucket without losing all-time", () => {
    const store = createStatisticsStore(memoryStorage(), monday - 60_000);
    store.duration(monday - 30_000, monday + 30_000, 60_000, 20_000);
    expect(store.snapshot(monday).week.listeningMs).toBe(30_000);
    expect(store.snapshot(monday).week.adSavedMs).toBe(10_000);
    expect(store.snapshot(monday).allTime.listeningMs).toBe(60_000);
    expect(store.snapshot(monday + 7 * 86_400_000).week.listeningMs).toBe(0);
    expect(store.snapshot(monday + 7 * 86_400_000).allTime.adSavedMs).toBe(20_000);
  });

  it("uses a local Monday boundary, including Sunday and the DST week", () => {
    expect(getWeekStart(new Date(2026, 9, 11, 23, 59).getTime())).toBe(monday);
    expect(getWeekStart(new Date(2026, 9, 25, 12).getTime())).toBe(new Date(2026, 9, 19).getTime());
  });

  it("starts empty for corrupt or unsupported storage and never imports historical favorites", () => {
    const storage = memoryStorage();
    storage.values.set("kajtek_statistics", '{"version":99,"allTime":{"listeningMs":999999}}');
    const store = createStatisticsStore(storage, monday);
    expect(store.snapshot(monday).allTime.listeningMs).toBe(0);
    expect(store.snapshot(monday).startedAt).toBe(monday);
  });

  it("keeps this run working when storage is unavailable", () => {
    const store = createStatisticsStore(
      {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
      monday,
    );
    store.record("switch", { detours: 1 }, monday);
    expect(store.snapshot(monday).allTime.detours).toBe(1);
    expect(store.snapshot(monday).persistent).toBe(false);
  });
});

describe("actual playback and protective routes", () => {
  it("attributes saved ads to the week when the avoided portion played", () => {
    const store = createStatisticsStore(memoryStorage(), monday - 30_000);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "ad-sunday", kind: "adSkip", automatic: true, adEndsAt: monday }, monday - 30_000);
    tracker.playing(0, monday - 30_000);
    tracker.sample(60, monday + 30_000, true);
    expect(store.snapshot(monday).week).toMatchObject({ listeningMs: 30_000, adSavedMs: 0 });
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 60_000, adSavedMs: 30_000 });
  });

  it("counts only advancing audio, excludes timeline jumps and bounds saved ads by remaining duration", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "ad-1", kind: "adSkip", automatic: true, adEndsAt: monday + 15_000 }, monday);
    tracker.playing(0, monday + 5_000);
    tracker.sample(8, monday + 13_000, true);
    tracker.sample(14, monday + 19_000, true);
    tracker.sample(999, monday + 20_000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 14_000, adSavedMs: 10_000, detours: 1 });
    tracker.playing(999, monday + 20_000);
    expect(store.snapshot(monday).allTime.detours).toBe(1);
  });

  it("does not count warnings/failed routes, manual changes, returns, or same-URL retries", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "failed", kind: "blacklist", automatic: true }, monday);
    tracker.stop(0, monday + 1000, true);
    tracker.route(null, monday + 2000);
    tracker.playing(0, monday + 3000);
    tracker.recovery("same", "same", monday + 4000);
    tracker.playing(0, monday + 5000);
    expect(store.snapshot(monday).allTime).toMatchObject({ detours: 0, blacklistAvoided: 0 });
  });

  it("counts switch-now blacklist protection once but not as automatic, and clears on manual selection", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "blacklist", kind: "blacklist", automatic: false }, monday);
    tracker.playing(0, monday);
    tracker.playing(0, monday);
    expect(store.snapshot(monday).allTime).toMatchObject({ blacklistAvoided: 1, detours: 0 });
    tracker.route({ id: "ad", kind: "adSkip", automatic: true, adEndsAt: monday + 60_000 }, monday);
    tracker.playing(0, monday);
    tracker.sample(5, monday + 5000, true);
    tracker.route(null, monday + 5000);
    tracker.playing(0, monday + 5000);
    tracker.sample(5, monday + 10_000, true);
    expect(store.snapshot(monday).allTime.adSavedMs).toBe(5000);
  });

  it("excludes buffering and mute, records successful distinct recovery once", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.playing(0, monday);
    tracker.sample(5, monday + 5000, true);
    tracker.suspend(5, monday + 5000, true);
    tracker.sample(5, monday + 10_000, true);
    tracker.playing(5, monday + 10_000);
    tracker.sample(10, monday + 15_000, false);
    tracker.sample(15, monday + 20_000, true);
    tracker.recovery("first", "second", monday + 20_000);
    tracker.playing(0, monday + 21_000);
    tracker.playing(0, monday + 21_000);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 10_000, detours: 1 });
  });
});

describe("playback rate accounting", () => {
  it("records wall listening time through playback-rate changes and final pause", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.playing(0, monday);
    tracker.sample(10, monday + 5000, true, 2);
    tracker.stop(16, monday + 8000, true, 2);
    expect(store.snapshot(monday).allTime.listeningMs).toBe(8000);
  });
});

describe("operation IDs on local-network HTTP", () => {
  it("records recoveries when randomUUID is unavailable without retaining stream URLs", () => {
    let sequence = 0;
    vi.stubGlobal("crypto", {
      getRandomValues: (values: Uint32Array) => {
        values.set([1, 2, 3, sequence++]);
        return values;
      },
    });
    try {
      const store = createStatisticsStore(memoryStorage(), monday);
      const tracker = new ListeningStatistics(store);
      tracker.recovery("https://example.test/private-a", "https://example.test/private-b", monday);
      tracker.playing(0, monday);
      tracker.recovery("https://example.test/private-b", "https://example.test/private-a", monday);
      tracker.playing(0, monday);
      expect(store.snapshot(monday).allTime.detours).toBe(2);
      expect(store.snapshot(monday).recentOperations.join()).not.toContain("example.test");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
