import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistResult, Station } from "../src/types.js";

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
