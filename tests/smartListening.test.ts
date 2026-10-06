import { beforeEach, expect, it, vi } from "vitest";
import type { SmartListeningConfig } from "../src/listeningPreferences.js";
import type { Station } from "../src/types.js";

const data = vi.hoisted(() => {
  const origin = { id: "origin", name: "Origin", short: "O", cat: "test", provider: "rmf", stream: "o" };
  const target = { ...origin, id: "target", name: "Target", stream: "t" };
  const state = {
    station: origin,
    playing: true,
    liveTrack: null,
    history: [],
    favs: new Set<string>(),
    smartListening: {
      version: 1,
      enabled: true,
      content: { advertisement: true, news: true, otherBreak: false },
      preferences: [],
    } as SmartListeningConfig,
  };
  return {
    origin,
    target,
    pool: [origin, target],
    state,
    snapshots: [] as unknown[],
    pending: false,
    selectStation: vi.fn(),
    demand: vi.fn(),
    reset: vi.fn(),
    endRoute: vi.fn(),
    listeners: [] as (() => void)[],
  };
});
vi.mock("../src/catalog.js", () => ({
  getSmartStations: () => data.pool,
  getStoredRmfCatalog: () => null,
}));
vi.mock("../src/player.js", () => ({ selectStation: data.selectStation }));
vi.mock("../src/state.js", () => ({
  state: data.state,
  notifyState: vi.fn(),
  radioAudio: { currentTime: 0, muted: false, volume: 1, playbackRate: 1 },
  subscribeState: (fn: () => void) => {
    data.listeners.push(fn);
    return () => undefined;
  },
}));
vi.mock("../src/stationSnapshots.js", () => ({
  sharedSnapshots: {
    setDemand: data.demand,
    snapshots: () => data.snapshots,
    get refreshing() {
      return data.pending;
    },
    subscribe: () => () => undefined,
  },
}));
vi.mock("../src/statisticsPlayback.js", () => ({ listeningStatistics: { sample: vi.fn(), endRoute: data.endRoute } }));
vi.mock("../src/statistics.js", () => ({ createStatisticsOperationId: () => "operation" }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  data.selectStation.mockClear();
  data.endRoute.mockClear();
  data.pool = [data.origin, data.target];
  data.state.smartListening.preferences = [];
  data.pending = false;
  data.state.station = data.origin;
  data.state.playing = true;
  data.state.smartListening.enabled = true;
});
function snapshot(station: Station, kind = "track") {
  return {
    station,
    track: { artist: "A", title: "Song", contentKind: kind },
    kind,
    evidence: "explicit",
    updatedAt: Date.now(),
    stale: false,
    error: false,
  };
}
it("waits for the complete shared pool, then forwards only a Smart operation and preserves lifecycle on internal switching", async () => {
  const smart = await import("../src/smartListening.js");
  smart.resetSmartListening();
  data.pending = true;
  data.snapshots = [snapshot(data.origin, "advertisement"), snapshot(data.target)];
  smart.evaluateSmartListening();
  vi.advanceTimersByTime(6000);
  smart.evaluateSmartListening();
  expect(data.selectStation).not.toHaveBeenCalled();
  data.pending = false;
  smart.evaluateSmartListening();
  vi.advanceTimersByTime(6000);
  smart.evaluateSmartListening();
  expect(data.selectStation).toHaveBeenCalledWith(
    data.target,
    expect.objectContaining({ kind: "advertisement", automatic: true }),
    true,
  );
});
it("disabled Smart Listening withdraws its monitor demand and cancels a warning", async () => {
  const smart = await import("../src/smartListening.js");
  smart.resetSmartListening();
  data.snapshots = [snapshot(data.origin, "news"), snapshot(data.target)];
  smart.evaluateSmartListening();
  data.state.smartListening.enabled = false;
  smart.evaluateSmartListening();
  vi.advanceTimersByTime(10000);
  smart.evaluateSmartListening();
  expect(smart.getSmartListeningStatus()).toBeNull();
  expect(data.demand).toHaveBeenLastCalledWith("smart", []);
  expect(data.selectStation).not.toHaveBeenCalled();
});
it("switch-now bypasses only grace and waits for an in-flight complete pool", async () => {
  const smart = await import("../src/smartListening.js");
  smart.resetSmartListening();
  data.snapshots = [snapshot(data.origin, "advertisement"), snapshot(data.target)];
  smart.evaluateSmartListening();
  data.pending = true;
  smart.switchSmartNow();
  expect(data.selectStation).not.toHaveBeenCalled();
  data.pending = false;
  smart.evaluateSmartListening();
  expect(data.selectStation).toHaveBeenCalledWith(data.target, expect.objectContaining({ automatic: false }), true);
});

it("retains the original reliable ad interval when the temporary station becomes negatively preferred", async () => {
  const smart = await import("../src/smartListening.js");
  smart.resetSmartListening();
  const third = { ...data.target, id: "third", name: "Third", stream: "third" };
  data.pool = [data.origin, data.target, third];
  const ad = snapshot(data.origin, "advertisement");
  Object.assign(ad.track, { timestamp: 90, endTimestamp: 160 });
  data.snapshots = [ad, snapshot(data.target), snapshot(third)];
  smart.evaluateSmartListening();
  smart.switchSmartNow();
  data.state.station = data.target;
  data.state.smartListening.preferences = [
    { scope: "artist", artist: "A", title: "", key: "artist:a", value: "negative" },
  ];
  const safe = snapshot(third);
  safe.track.artist = "Safe";
  vi.advanceTimersByTime(11000);
  data.snapshots = [ad, snapshot(data.target), safe];
  smart.evaluateSmartListening();
  vi.advanceTimersByTime(6000);
  smart.evaluateSmartListening();
  expect(data.selectStation).toHaveBeenLastCalledWith(
    third,
    expect.objectContaining({
      kind: "negativeArtist",
      originAdWindow: { startsAt: 90000, endsAt: 160000 },
    }),
    true,
  );
});
it("disabling Smart during a detour ends the statistics route while retaining current audio", async () => {
  const smart = await import("../src/smartListening.js");
  smart.resetSmartListening();
  data.snapshots = [snapshot(data.origin, "advertisement"), snapshot(data.target)];
  smart.evaluateSmartListening();
  smart.switchSmartNow();
  data.state.station = data.target;
  data.state.smartListening.enabled = false;
  smart.evaluateSmartListening();
  expect(data.endRoute).toHaveBeenCalledTimes(1);
  expect(data.selectStation).toHaveBeenCalledTimes(1);
  expect(smart.getSmartListeningStatus()).toBeNull();
});
