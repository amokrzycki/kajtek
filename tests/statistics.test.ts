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
    tracker.route({ id: "ad", kind: "advertisement", automatic: true, adEndsAt: monday + 3000 }, monday);
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
    const legacyTotals = { listeningMs: 120_000, adSavedMs: 20_000, blacklistAvoided: 3, detours: 4 };
    const totals = {
      listeningMs: 120_000,
      adSavedMs: 20_000,
      negativeMusicAvoided: 3,
      adsAvoided: 0,
      newsAvoided: 0,
      otherBreaksAvoided: 0,
      detours: 4,
    };
    storage.setItem(
      "kajtek_statistics",
      JSON.stringify({
        version: 1,
        startedAt: monday - 10_000,
        weekStart: monday,
        allTime: legacyTotals,
        week: { ...legacyTotals, detours: 2 },
        recentOperations: ["old"],
      }),
    );
    const migrated = createStatisticsStore(storage, monday);
    const snapshot = migrated.snapshot(monday);
    expect(snapshot).toMatchObject({
      version: 3,
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
    first.record("switch-1", { negativeMusicAvoided: 1, detours: 1 }, monday);
    const restored = createStatisticsStore(storage, monday);
    restored.record("switch-1", { negativeMusicAvoided: 1, detours: 1 }, monday);
    expect(restored.snapshot(monday).allTime.negativeMusicAvoided).toBe(1);
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
    tracker.route({ id: "ad-sunday", kind: "advertisement", automatic: true, adEndsAt: monday }, monday - 30_000);
    tracker.playing(0, monday - 30_000);
    tracker.sample(60, monday + 30_000, true);
    expect(store.snapshot(monday).week).toMatchObject({ listeningMs: 30_000, adSavedMs: 0 });
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 60_000, adSavedMs: 30_000 });
  });

  it("counts only the overlap with a scheduled window: nothing before its start, nothing after its end", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route(
      { id: "rmf", kind: "advertisement", automatic: false, adStartsAt: monday + 10_000, adEndsAt: monday + 20_000 },
      monday,
    );
    tracker.playing(0, monday);
    tracker.sample(5, monday + 5000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 5000, adSavedMs: 0 });
    tracker.sample(30, monday + 30_000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 30_000, adSavedMs: 10_000 });
    tracker.sample(40, monday + 40_000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 40_000, adSavedMs: 10_000 });
  });

  it("ignores an inverted or end-less window instead of fabricating saved time", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route(
      { id: "bad", kind: "advertisement", automatic: true, adStartsAt: monday + 20_000, adEndsAt: monday + 10_000 },
      monday,
    );
    tracker.playing(0, monday);
    tracker.sample(30, monday + 30_000, true);
    tracker.route({ id: "open", kind: "advertisement", automatic: true, adStartsAt: monday }, monday + 30_000);
    tracker.playing(30, monday + 30_000);
    tracker.sample(60, monday + 60_000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 60_000, adSavedMs: 0 });
  });

  it("counts only advancing audio, excludes timeline jumps and bounds saved ads by remaining duration", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "ad-1", kind: "advertisement", automatic: true, adEndsAt: monday + 15_000 }, monday);
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
    tracker.route({ id: "failed", kind: "negativeTrack", automatic: true }, monday);
    tracker.stop(0, monday + 1000, true);
    tracker.route(null, monday + 2000);
    tracker.playing(0, monday + 3000);
    tracker.recovery("same", "same", monday + 4000);
    tracker.playing(0, monday + 5000);
    expect(store.snapshot(monday).allTime).toMatchObject({ detours: 0, negativeMusicAvoided: 0 });
  });

  it("counts switch-now blacklist protection once but not as automatic, and clears on manual selection", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "blacklist", kind: "negativeTrack", automatic: false }, monday);
    tracker.playing(0, monday);
    tracker.playing(0, monday);
    expect(store.snapshot(monday).allTime).toMatchObject({ negativeMusicAvoided: 1, detours: 0 });
    tracker.route({ id: "ad", kind: "advertisement", automatic: true, adEndsAt: monday + 60_000 }, monday);
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

describe("temporary suspension and route cancellation", () => {
  it("retains a known window across buffering and resets the media/wall baseline", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "ad", kind: "advertisement", automatic: true, adEndsAt: monday + 20_000 }, monday);
    tracker.playing(0, monday);
    tracker.suspend(2, monday + 2000, true);
    tracker.sample(12, monday + 12_000, true);
    tracker.playing(0, monday + 12_000);
    tracker.suspend(3, monday + 15_000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 5000, adSavedMs: 5000, detours: 1 });
  });

  it("keeps a pending stream recovery independent of protective-route cancellation", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "ad", kind: "advertisement", automatic: true, adEndsAt: monday + 20_000 }, monday);
    tracker.playing(0, monday);
    tracker.suspend(2, monday + 2000, true);
    tracker.recovery("first", "second", monday + 2000);
    tracker.endRoute();
    tracker.playing(0, monday + 3000);
    tracker.sample(3, monday + 6000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 5000, adSavedMs: 2000, detours: 2 });
  });

  it("ends protection without stopping ordinary listening or leaking an old window", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "ad", kind: "advertisement", automatic: true, adEndsAt: monday + 20_000 }, monday);
    tracker.playing(0, monday);
    tracker.sample(2, monday + 2000, true);
    tracker.endRoute();
    tracker.sample(5, monday + 5000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({ listeningMs: 5000, adSavedMs: 2000, detours: 1 });
  });
});

describe("Smart Listening statistics", () => {
  it("preserves v2 station durations and IDs while migrating only known counters", () => {
    const storage = memoryStorage();
    const legacy = { listeningMs: 5000, adSavedMs: 1000, blacklistAvoided: 7, detours: 9 };
    const stations = [{ ...firstStation, listeningMs: 5000 }];
    storage.setItem(
      "kajtek_statistics",
      JSON.stringify({
        version: 2,
        startedAt: monday - 1000,
        weekStart: monday,
        allTime: legacy,
        week: legacy,
        allTimeStations: stations,
        weekStations: stations,
        recentOperations: ["old"],
      }),
    );
    const store = createStatisticsStore(storage, monday);
    expect(store.snapshot(monday)).toMatchObject({
      version: 3,
      startedAt: monday - 1000,
      allTime: {
        listeningMs: 5000,
        adSavedMs: 1000,
        negativeMusicAvoided: 7,
        detours: 9,
        adsAvoided: 0,
        newsAvoided: 0,
        otherBreaksAvoided: 0,
      },
      allTimeStations: stations,
      weekStations: stations,
      recentOperations: ["old"],
    });
    expect(store.snapshot(monday).allTime).not.toHaveProperty("blacklistAvoided");
    store.persist();
    const restored = createStatisticsStore(storage, monday);
    restored.record("old", { adsAvoided: 1 }, monday);
    expect(restored.snapshot(monday).allTime.adsAvoided).toBe(0);
  });

  it("counts each successful avoidance reason once and keeps manual avoidance separate from detours", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    const kinds = ["advertisement", "news", "otherBreak", "negativeTrack", "negativeArtist"] as const;
    for (const kind of kinds) {
      tracker.route({ id: kind, kind, automatic: kind !== "negativeArtist" }, monday);
      tracker.playing(0, monday);
      tracker.playing(0, monday);
    }
    expect(store.snapshot(monday).allTime).toMatchObject({
      adsAvoided: 1,
      newsAvoided: 1,
      otherBreaksAvoided: 1,
      negativeMusicAvoided: 2,
      detours: 4,
    });
    tracker.route({ id: "return", kind: "return", automatic: true }, monday);
    tracker.playing(0, monday);
    tracker.recovery("old", "new", monday);
    tracker.playing(0, monday);
    expect(store.snapshot(monday).allTime).toMatchObject({
      adsAvoided: 1,
      newsAvoided: 1,
      otherBreaksAvoided: 1,
      negativeMusicAvoided: 2,
      detours: 5,
    });
    expect(store.snapshot(monday).recentOperations).not.toContain("return");
  });

  it("does not assign saved advertising time to news, other breaks or negative music", () => {
    for (const kind of ["news", "otherBreak", "negativeTrack", "negativeArtist", "return"] as const) {
      const store = createStatisticsStore(memoryStorage(), monday);
      const tracker = new ListeningStatistics(store);
      tracker.route({ id: kind, kind, automatic: true, adEndsAt: monday + 10_000 }, monday);
      tracker.playing(0, monday);
      tracker.sample(5, monday + 5000, true);
      expect(store.snapshot(monday).allTime.adSavedMs).toBe(0);
      expect(store.snapshot(monday).allTime.listeningMs).toBe(5000);
    }
  });

  it("rejects fractional v3 reason counts instead of importing corrupt data", () => {
    const storage = memoryStorage();
    const store = createStatisticsStore(storage, monday);
    store.record("ad", { adsAvoided: 1 }, monday);
    const raw = storage.getItem("kajtek_statistics");
    if (!raw) throw new Error("Expected stored statistics");
    storage.setItem("kajtek_statistics", raw.replace('"adsAvoided":1', '"adsAvoided":1.5'));
    expect(createStatisticsStore(storage, monday).snapshot(monday).allTime.adsAvoided).toBe(0);
  });
});

describe("original advertisement window across temporary reroutes", () => {
  it.each(["negativeTrack", "negativeArtist", "news", "otherBreak"] as const)(
    "keeps original measured ad time across a %s reroute while counting the new reason",
    (kind) => {
      const store = createStatisticsStore(memoryStorage(), monday);
      const tracker = new ListeningStatistics(store);
      tracker.route(
        { id: "origin-ad", kind: "advertisement", automatic: true, adStartsAt: monday, adEndsAt: monday + 10_000 },
        monday,
      );
      tracker.playing(0, monday);
      tracker.suspend(2, monday + 2000, true);
      tracker.route(
        { id: "second-target", kind, automatic: true, originAdWindow: { startsAt: monday, endsAt: monday + 10_000 } },
        monday + 2000,
      );
      tracker.playing(0, monday + 3000);
      tracker.sample(10, monday + 13_000, true);
      expect(store.snapshot(monday).allTime).toMatchObject({
        listeningMs: 12_000,
        adSavedMs: 9000,
        adsAvoided: 1,
        newsAvoided: kind === "news" ? 1 : 0,
        otherBreaksAvoided: kind === "otherBreak" ? 1 : 0,
        negativeMusicAvoided: kind.startsWith("negative") ? 1 : 0,
        detours: 2,
      });
    },
  );

  it("retains an end-only origin interval and clears it on a return even if context is supplied", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    const originAdWindow = { endsAt: monday + 20_000 };
    tracker.route({ id: "negative", kind: "negativeTrack", automatic: false, originAdWindow }, monday);
    tracker.playing(0, monday);
    tracker.suspend(2, monday + 2000, true);
    tracker.route({ id: "return", kind: "return", automatic: true, originAdWindow }, monday + 2000);
    tracker.playing(0, monday + 2000);
    tracker.sample(5, monday + 7000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({
      listeningMs: 7000,
      adSavedMs: 2000,
      negativeMusicAvoided: 1,
      detours: 0,
      adsAvoided: 0,
    });
  });

  it.each([
    { startsAt: monday + 5000, endsAt: monday },
    { startsAt: monday, endsAt: monday },
    { startsAt: Number.NaN, endsAt: monday + 5000 },
    { startsAt: -1, endsAt: monday + 5000 },
    { endsAt: Number.POSITIVE_INFINITY },
    { endsAt: Number.NaN },
    { endsAt: -1 },
  ])("rejects invalid original windows without inventing saved time: %j", (originAdWindow) => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route({ id: "negative", kind: "negativeTrack", automatic: true, originAdWindow }, monday);
    tracker.playing(0, monday);
    tracker.sample(5, monday + 5000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({
      listeningMs: 5000,
      adSavedMs: 0,
      negativeMusicAvoided: 1,
      detours: 1,
    });
  });
});

describe("multiple trustworthy advertising intervals", () => {
  it("measures a new temporary-station advertisement after the original interval expires", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route(
      {
        id: "new-ad",
        kind: "advertisement",
        automatic: true,
        originAdWindow: { startsAt: monday + 90_000, endsAt: monday + 110_000 },
        adStartsAt: monday + 120_000,
        adEndsAt: monday + 150_000,
      },
      monday + 120_000,
    );
    tracker.playing(0, monday + 125_000);
    tracker.sample(10, monday + 135_000, true);
    expect(store.snapshot(monday).allTime).toMatchObject({
      listeningMs: 10_000,
      adSavedMs: 10_000,
      adsAvoided: 1,
      detours: 1,
    });
  });

  it.each([
    { currentStartsAt: 10_000, saved: 25_000 },
    { currentStartsAt: 20_000, saved: 15_000 },
  ])(
    "measures the union of original and current intervals without overlap credit: %j",
    ({ currentStartsAt, saved }) => {
      const store = createStatisticsStore(memoryStorage(), monday);
      const tracker = new ListeningStatistics(store);
      tracker.route(
        {
          id: "new-ad",
          kind: "advertisement",
          automatic: true,
          originAdWindow: { startsAt: monday, endsAt: monday + (currentStartsAt === 10_000 ? 20_000 : 10_000) },
          adStartsAt: monday + currentStartsAt,
          adEndsAt: monday + 30_000,
        },
        monday + 5000,
      );
      tracker.playing(0, monday + 5000);
      tracker.sample(30, monday + 35_000, true);
      expect(store.snapshot(monday).allTime).toMatchObject({
        listeningMs: 30_000,
        adSavedMs: saved,
        adsAvoided: 1,
        detours: 1,
      });
    },
  );

  it("rejects an invalid original interval without hiding a valid current advertising interval", () => {
    const store = createStatisticsStore(memoryStorage(), monday);
    const tracker = new ListeningStatistics(store);
    tracker.route(
      {
        id: "ad",
        kind: "advertisement",
        automatic: false,
        originAdWindow: { startsAt: monday + 20_000, endsAt: monday + 10_000 },
        adStartsAt: monday,
        adEndsAt: monday + 10_000,
      },
      monday,
    );
    tracker.playing(0, monday);
    tracker.sample(5, monday + 5000, true);
    expect(store.snapshot(monday).allTime.adSavedMs).toBe(5000);
  });
});
