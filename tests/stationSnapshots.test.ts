import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSmartListeningConfig, setListeningPreference } from "../src/listeningPreferences.js";
import type { ActiveMetadata } from "../src/nowPlaying.js";
import { evaluateSnapshot } from "../src/smartPolicy.js";
import { SmartRouteController } from "../src/smartRoute.js";
import type { PlaylistResult, Station, TrackInfo } from "../src/types.js";

vi.mock("../src/state.js", () => ({
  state: { playing: false, station: null, liveTrack: null, history: [], favTracks: [] },
  getLiveTrackUpdatedAt: () => 0,
  subscribeState: () => () => undefined,
  subscribeLiveTrack: () => () => undefined,
}));
vi.hoisted(() => vi.stubGlobal("DOMParser", class {}));

import { StationSnapshotMonitor } from "../src/stationSnapshots.js";

const station: Station = {
  id: "a",
  name: "A",
  short: "A",
  cat: "test",
  provider: "rmf",
  stream: "https://a",
  apiBaseUrl: "/a",
};
const result: PlaylistResult = { current: { artist: "Artist", title: "Song" }, all: [] };
let monitor: StationSnapshotMonitor;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
});
afterEach(() => {
  monitor?.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("shared station snapshot demand", () => {
  it.each([
    { reason: "advertisement", track: { artist: "", title: "Ad", contentKind: "advertisement" } },
    { reason: "negativeTrack", track: { artist: "Artist", title: "Blocked" } },
  ] satisfies { reason: string; track: TrackInfo }[])(
    "does not authorize a detour from cached $reason after fresh active unknown metadata",
    async ({ reason, track }) => {
      setListeningPreference("track", "Artist", "Blocked", "negative");
      const config = getSmartListeningConfig();
      const alternative = { ...station, id: "b" };
      const stations = [station, alternative];
      let active: ActiveMetadata | null = null;
      monitor = new StationSnapshotMonitor({
        fetcher: async (s) => ({ current: s.id === station.id ? track : result.current, all: [] }),
        activeMetadata: () => active,
      });
      monitor.setDemand("smart", stations);
      await monitor.refresh();
      const cached = monitor.snapshots(stations).find((s) => s.station.id === station.id);
      expect(evaluateSnapshot(cached, config, 100_000)).toMatchObject({
        eligibility: "rejected",
        trigger: { reason },
      });
      vi.setSystemTime(145_000);
      expect(
        evaluateSnapshot(
          monitor.snapshots(stations).find((s) => s.station.id === station.id),
          config,
          145_000,
        ),
      ).toMatchObject({ eligibility: "fallback", trigger: null });
      active = { stationId: station.id, track: null, updatedAt: 145_000, upcoming: [] };
      const route = new SmartRouteController();
      for (const now of [145_000, 150_001]) {
        vi.setSystemTime(now);
        const snapshots = monitor.snapshots(stations);
        const current = snapshots.find((s) => s.station.id === station.id);
        expect.soft(evaluateSnapshot(current, config, now)).toMatchObject({ eligibility: "fallback", trigger: null });
        expect
          .soft(route.step({ now, enabled: true, playing: true, station, config, snapshots, pool: stations }))
          .toBeNull();
      }
      expect.soft(route.status).toBeNull();
    },
  );
  it("shares one TTL refresh for overlapping consumers and continues after discovery closes", async () => {
    const fetcher = vi.fn(async () => result);
    monitor = new StationSnapshotMonitor({ fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    monitor.setDemand("discovery", [station]);
    await monitor.refresh();
    monitor.setDemand("smart", [station]);
    await monitor.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    monitor.setDemand("discovery", []);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(monitor.snapshots([station])[0]?.track).toEqual(result.current);
    monitor.setDemand("smart", []);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("reuses fresh discovery snapshots after closing and reopening without background polling", async () => {
    const fetcher = vi.fn(async () => result);
    monitor = new StationSnapshotMonitor({ fetcher });
    monitor.setDemand("discovery", [station]);
    await monitor.refresh();
    monitor.setDemand("discovery", []);
    monitor.setDemand("discovery", [station]);
    await monitor.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("withdraws obsolete demand and rejects late replies from removed stations", async () => {
    let resolve: (value: PlaylistResult) => void = () => undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<PlaylistResult>((done) => {
          resolve = done;
        }),
    );
    monitor = new StationSnapshotMonitor({ fetcher });
    monitor.setDemand("smart", [station]);
    const refresh = monitor.refresh();
    monitor.setDemand("smart", []);
    resolve(result);
    await refresh;
    expect(monitor.snapshots([station])[0]?.track).toBeNull();
    expect(monitor.refreshing).toBe(false);
  });
  it("uses active metadata and upcoming evidence without fetching the playing station", async () => {
    const fetcher = vi.fn(async () => result);
    const upcoming = { artist: "Next", title: "Song", timestamp: 110 };
    monitor = new StationSnapshotMonitor({
      fetcher,
      activeMetadata: () => ({
        stationId: station.id,
        track: result.current,
        updatedAt: Date.now(),
        upcoming: [upcoming],
      }),
    });
    monitor.setDemand("smart", [station]);
    await monitor.refresh();
    expect(fetcher).not.toHaveBeenCalled();
    expect(monitor.snapshots([station])[0]).toMatchObject({
      source: "player",
      upcoming: [{ ...upcoming, contentKind: "track" }],
    });
  });
  it("does not passively fetch a playing station even before metadata arrives", async () => {
    const fetcher = vi.fn(async () => result);
    monitor = new StationSnapshotMonitor({
      fetcher,
      activeMetadata: () => ({
        stationId: station.id,
        track: null,
        updatedAt: 0,
      }),
    });
    monitor.setDemand("smart", [station]);
    await monitor.refresh();
    expect(fetcher).not.toHaveBeenCalled();
    expect(monitor.snapshots([station])[0]?.kind).toBe("unknown");
  });
});
