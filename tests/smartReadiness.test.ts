import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveMetadata } from "../src/nowPlaying.js";
import type { PlaylistResult, Station } from "../src/types.js";

vi.mock("../src/state.js", () => ({
  state: { playing: false, station: null, liveTrack: null, history: [], favTracks: [] },
  getLiveTrackUpdatedAt: () => 0,
  subscribeState: () => () => undefined,
  subscribeLiveTrack: () => () => undefined,
}));
vi.hoisted(() => vi.stubGlobal("DOMParser", class {}));

import { NowPlayingCache } from "../src/nowPlaying.js";
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
const song = { artist: "Artist", title: "Song" };
const result = (track = song): PlaylistResult => ({ current: track, all: [] });

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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

describe("Smart Listening scoped readiness", () => {
  it("does not block Smart Listening while a Discovery-only request is pending", async () => {
    const a = { ...station, id: "a" };
    const b = { ...station, id: "b" };
    const c = { ...station, id: "c" };
    const jobs = new Map<string, ReturnType<typeof deferred<PlaylistResult>>>();
    const fetcher = vi.fn((s: Station) => {
      const job = deferred<PlaylistResult>();
      jobs.set(s.id, job);
      return job.promise;
    });
    monitor = new StationSnapshotMonitor({ fetcher });
    const smart = [a, b];
    monitor.setDemand("discovery", [a, b, c]);
    monitor.setDemand("smart", smart);
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.refreshing).toBe(true);
    expect(monitor.refreshingFor(smart)).toBe(true);

    jobs.get("a")?.resolve(result());
    jobs.get("b")?.resolve(result());
    await vi.advanceTimersByTimeAsync(0);

    expect(monitor.refreshingFor(smart)).toBe(false);
    expect(monitor.refreshing).toBe(true);
    expect(monitor.snapshots([c])[0]?.loading).toBe(true);

    jobs.get("c")?.resolve(result());
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.refreshing).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("blocks Smart Listening while a routing-required request is pending", async () => {
    const a = { ...station, id: "a" };
    const b = { ...station, id: "b" };
    const c = { ...station, id: "c" };
    const jobs = new Map<string, ReturnType<typeof deferred<PlaylistResult>>>();
    const fetcher = vi.fn((s: Station) => {
      const job = deferred<PlaylistResult>();
      jobs.set(s.id, job);
      return job.promise;
    });
    monitor = new StationSnapshotMonitor({ fetcher });
    const smart = [a, b, c];
    monitor.setDemand("smart", smart);
    await vi.advanceTimersByTimeAsync(0);

    jobs.get("a")?.resolve(result());
    jobs.get("b")?.resolve(result());
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.refreshingFor(smart)).toBe(true);

    jobs.get("c")?.resolve(result());
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.refreshingFor(smart)).toBe(false);
  });

  it("updates readiness when a station stops being routing-required", async () => {
    const a = { ...station, id: "a" };
    const b = { ...station, id: "b" };
    const c = { ...station, id: "c" };
    const jobs = new Map<string, ReturnType<typeof deferred<PlaylistResult>>>();
    const fetcher = vi.fn((s: Station) => {
      const job = deferred<PlaylistResult>();
      jobs.set(s.id, job);
      return job.promise;
    });
    monitor = new StationSnapshotMonitor({ fetcher });
    monitor.setDemand("smart", [a, b, c]);
    await vi.advanceTimersByTimeAsync(0);
    jobs.get("a")?.resolve(result());
    jobs.get("b")?.resolve(result());
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.refreshingFor([a, b, c])).toBe(true);

    monitor.setDemand("smart", [a, b]);
    expect(monitor.refreshingFor([a, b])).toBe(false);
  });

  it("counts a station demanded by both consumers only once", async () => {
    const a = { ...station, id: "a" };
    const jobs = new Map<string, ReturnType<typeof deferred<PlaylistResult>>>();
    const fetcher = vi.fn((s: Station) => {
      const job = deferred<PlaylistResult>();
      jobs.set(s.id, job);
      return job.promise;
    });
    monitor = new StationSnapshotMonitor({ fetcher });
    monitor.setDemand("discovery", [a]);
    monitor.setDemand("smart", [a]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(monitor.refreshingFor([a])).toBe(true);

    jobs.get("a")?.resolve(result());
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.refreshingFor([a])).toBe(false);
  });

  it("does not count a fresh active station as pending for readiness", async () => {
    const a = { ...station, id: "a" };
    const b = { ...station, id: "b" };
    const jobs = new Map<string, ReturnType<typeof deferred<PlaylistResult>>>();
    const fetcher = vi.fn((s: Station) => {
      const job = deferred<PlaylistResult>();
      jobs.set(s.id, job);
      return job.promise;
    });
    const active: ActiveMetadata = {
      stationId: a.id,
      track: result().current,
      updatedAt: Date.now(),
      upcoming: [],
    };
    monitor = new StationSnapshotMonitor({ fetcher, activeMetadata: () => active });
    monitor.setDemand("smart", [a, b]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(monitor.refreshingFor([a, b])).toBe(true);

    jobs.get("b")?.resolve(result());
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.refreshingFor([a, b])).toBe(false);
  });

  it("treats a failed required request as finished, not as fresh evidence", async () => {
    const a = { ...station, id: "a" };
    monitor = new StationSnapshotMonitor({ fetcher: async () => Promise.reject(new Error("offline")) });
    monitor.setDemand("smart", [a]);
    await monitor.refresh();
    expect(monitor.refreshingFor([a])).toBe(false);
    expect(monitor.snapshots([a])[0]).toMatchObject({ error: true });
  });

  it("keeps Discovery-only failures from blocking Smart readiness", async () => {
    const a = { ...station, id: "a" };
    const b = { ...station, id: "b" };
    monitor = new StationSnapshotMonitor({
      fetcher: async (s) => (s.id === "b" ? Promise.reject(new Error("offline")) : result()),
    });
    monitor.setDemand("discovery", [b]);
    monitor.setDemand("smart", [a]);
    await monitor.refresh();
    expect(monitor.refreshingFor([a])).toBe(false);
    expect(monitor.snapshots([b])[0]).toMatchObject({ error: true });
  });

  it("ignores late replies from a superseded refresh generation", async () => {
    const a = { ...station, id: "a" };
    let oldResolve: (value: PlaylistResult) => void = () => undefined;
    let newResolve: (value: PlaylistResult) => void = () => undefined;
    const fetcher = vi
      .fn<(s: Station, signal: AbortSignal) => Promise<PlaylistResult>>()
      .mockImplementationOnce(
        () =>
          new Promise<PlaylistResult>((done) => {
            oldResolve = done;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PlaylistResult>((done) => {
            newResolve = done;
          }),
      );
    const cache = new NowPlayingCache(vi.fn(), fetcher);
    const first = cache.refresh([a]);
    cache.cancel();
    const second = cache.refresh([a]);
    oldResolve(result({ ...song, title: "Old" }));
    await first;
    expect(cache.refreshingFor([a])).toBe(true);
    newResolve(result());
    await second;
    expect(cache.refreshingFor([a])).toBe(false);
    expect(cache.snapshots([a])[0]?.track).toEqual(song);
  });
});
