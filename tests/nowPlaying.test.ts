import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addToBlacklist } from "../src/blacklist.js";
import {
  classifyContent,
  deriveDiscoveryFlags,
  NOW_PLAYING_MAX_AGE_MS,
  NOW_PLAYING_TTL_MS,
  NowPlayingCache,
  orderSnapshots,
} from "../src/nowPlaying.js";
import type { FavTrack, PlaylistResult, Station, TrackInfo } from "../src/types.js";
import { snapshotHtml, snapshotLabel } from "../src/ui/nowPlaying.js";

vi.hoisted(() => {
  vi.stubGlobal("DOMParser", class {});
});

const stored = new Map<string, string>();
const station: Station = {
  id: "a",
  name: "Radio A",
  short: "A",
  cat: "test",
  provider: "rmf",
  stream: "https://example.test/a",
  apiBaseUrl: "/api/a",
};
const song: TrackInfo = { artist: "Artist", title: "Song" };
const favorite: FavTrack = { ...song, key: "a", timestamp: 0, stationTag: "A", stationId: "a" };
const result = (track = song): PlaylistResult => ({ current: track, all: [] });
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  stored.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("discovery classification and presentation", () => {
  it("maps Facts to news before all other classification", () => {
    expect(classifyContent(station, { ...song, isFacts: true, isLiveBreak: true })).toBe("news");
  });
  it("distinguishes supported ads, inferred RMF gaps and unknown ESKA breaks", () => {
    const breakTrack = { artist: station.name, title: "Przerwa / Reklamy", isLiveBreak: true };
    expect(classifyContent(station, breakTrack)).toBe("advertisement");
    expect(classifyContent({ ...station, provider: "eska" }, breakTrack)).toBe("unknown");
    expect(
      classifyContent(
        { ...station, provider: "eska" },
        { ...breakTrack, contentKind: "advertisement", contentEvidence: "explicit" },
      ),
    ).toBe("advertisement");
    expect(classifyContent(station, { ...breakTrack, isPredicted: true })).toBe("unknown");
  });
  it("never turns a Trójka programme into an ad", () => {
    expect(
      classifyContent({ ...station, provider: "trojka" }, { artist: "Trójka", title: "Audycja", isLiveBreak: true }),
    ).toBe("programme");
  });
  it("keeps missing metadata and blank titles unknown", () => {
    expect(classifyContent(station, null)).toBe("unknown");
    expect(classifyContent(station, { artist: "", title: " " })).toBe("unknown");
  });
  it("uses exact existing artist AND title blacklist semantics, independently of affinity", () => {
    addToBlacklist(" Artist ", " Song ");
    expect(deriveDiscoveryFlags({ artist: "ARTIST", title: "song" }, "track", [favorite])).toEqual({
      blacklisted: true,
      favoriteArtist: true,
    });
    expect(deriveDiscoveryFlags({ ...song, title: "Other" }, "track", [favorite]).blacklisted).toBe(false);
    expect(deriveDiscoveryFlags(song, "programme", [favorite])).toEqual({ blacklisted: false, favoriteArtist: false });
  });
  it("normalizes favorite artists conservatively, without splitting collaborations", () => {
    expect(deriveDiscoveryFlags({ ...song, artist: " ARTIST " }, "track", [favorite]).favoriteArtist).toBe(true);
    expect(deriveDiscoveryFlags({ ...song, artist: "Artist & Other" }, "track", [favorite]).favoriteArtist).toBe(false);
    expect(deriveDiscoveryFlags({ ...song, artist: "Art-ist" }, "track", [favorite]).favoriteArtist).toBe(false);
    expect(deriveDiscoveryFlags({ ...song, artist: "" }, "track", [favorite]).favoriteArtist).toBe(false);
  });
  it("orders songs then other content then unknown, with stable catalog ties", async () => {
    const stations = ["a", "b", "c", "d"].map((id) => ({ ...station, id }));
    const cache = new NowPlayingCache(vi.fn(), async (s) => ({
      current: s.id === "a" ? null : s.id === "c" ? { ...song, isFacts: true } : song,
      all: [],
    }));
    await cache.refresh(stations);
    const snapshots = cache.snapshots(stations, [favorite]);
    expect(snapshots.map((s) => s.station.id)).toEqual(["b", "d", "c", "a"]);
    expect(orderSnapshots(snapshots)).toEqual(snapshots);
  });
  it("labels tuning as content, escapes provider strings, and qualifies inferred breaks", async () => {
    const cache = new NowPlayingCache(vi.fn(), async () => result({ artist: "<script>", title: "A & B" }));
    await cache.refresh([station]);
    const snapshot = cache.snapshots([station], [])[0];
    if (!snapshot) throw new Error("Missing snapshot");
    expect(snapshotLabel(snapshot)).toBe("Odtwórz <script> – A & B na Radio A");
    expect(snapshotHtml(snapshot, true)).toContain("&lt;script&gt;");
    expect(snapshotHtml({ ...snapshot, kind: "advertisement", evidence: "inferred" }, false)).toContain("wg playlisty");
    expect(snapshotLabel({ ...snapshot, kind: "unknown" })).toContain("bez danych");
  });
});

describe("passive cache", () => {
  it("deduplicates refreshes and honors per-station TTL", async () => {
    const pending = deferred<PlaylistResult>();
    const fetcher = vi.fn(() => pending.promise);
    const cache = new NowPlayingCache(vi.fn(), fetcher);
    const first = cache.refresh([station]);
    expect(cache.refresh([station])).toBe(first);
    expect(cache.snapshots([station], [])[0]?.loading).toBe(true);
    pending.resolve(result());
    await first;
    await cache.refresh([station]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(NOW_PLAYING_TTL_MS);
    await cache.refresh([station]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("bounds concurrency to four, exposes partial results and keeps completion order out of sorting", async () => {
    const stations = Array.from({ length: 9 }, (_, i) => ({ ...station, id: String(i) }));
    const jobs = new Map<string, ReturnType<typeof deferred<PlaylistResult>>>();
    let running = 0;
    let max = 0;
    const fetcher = vi.fn(async (s: Station) => {
      running++;
      max = Math.max(max, running);
      const job = deferred<PlaylistResult>();
      jobs.set(s.id, job);
      const value = await job.promise;
      running--;
      return value;
    });
    const cache = new NowPlayingCache(vi.fn(), fetcher);
    const refresh = cache.refresh(stations);
    expect(fetcher).toHaveBeenCalledTimes(4);
    jobs.get("2")?.resolve(result());
    await vi.advanceTimersByTimeAsync(0);
    expect(cache.snapshots(stations, []).find((s) => s.station.id === "2")?.track).toEqual(song);
    for (let index = 0; index < 9; index++) {
      jobs.get(String(index))?.resolve(result());
      await vi.advanceTimersByTimeAsync(0);
    }
    await refresh;
    expect(max).toBe(4);
    expect(cache.snapshots(stations, []).map((s) => s.station.id)).toEqual(stations.map((s) => s.id));
  });
  it("keeps the previous success on failure, marks it stale, and expires it after two minutes", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(result()).mockRejectedValue(new Error("offline"));
    const cache = new NowPlayingCache(vi.fn(), fetcher);
    await cache.refresh([station]);
    vi.advanceTimersByTime(NOW_PLAYING_TTL_MS);
    await cache.refresh([station]);
    expect(cache.snapshots([station], [])[0]).toMatchObject({
      track: song,
      stale: true,
      error: true,
      updatedAt: 100_000,
    });
    vi.advanceTimersByTime(NOW_PLAYING_MAX_AGE_MS);
    expect(cache.snapshots([station], [])[0]).toMatchObject({ track: null, kind: "unknown", stale: true });
  });
  it("does not fail other stations when one fails", async () => {
    const cache = new NowPlayingCache(vi.fn(), async (s) =>
      s.id === "a" ? Promise.reject(new Error("offline")) : result(),
    );
    await cache.refresh([station, { ...station, id: "b" }]);
    expect(cache.snapshots([station, { ...station, id: "b" }], []).map((s) => [s.station.id, s.error])).toEqual([
      ["b", false],
      ["a", true],
    ]);
  });
  it("aborts obsolete refreshes and ignores late replies even if transport ignores cancellation", async () => {
    const old = deferred<PlaylistResult>();
    const current = deferred<PlaylistResult>();
    const fetcher = vi
      .fn<(s: Station, signal: AbortSignal) => Promise<PlaylistResult>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const change = vi.fn();
    const cache = new NowPlayingCache(change, fetcher);
    const first = cache.refresh([station]);
    cache.cancel();
    expect(fetcher.mock.calls[0]?.[1].aborted).toBe(true);
    const second = cache.refresh([station]);
    current.resolve(result({ ...song, title: "New" }));
    await second;
    const calls = change.mock.calls.length;
    old.resolve(result({ ...song, title: "Old" }));
    await first;
    expect(cache.snapshots([station], [])[0]?.track?.title).toBe("New");
    expect(change).toHaveBeenCalledTimes(calls);
  });
  it("prunes disabled entries, cancels queued work, and invalidates changed endpoints", async () => {
    const pending = deferred<PlaylistResult>();
    const fetcher = vi.fn(() => pending.promise);
    const cache = new NowPlayingCache(vi.fn(), fetcher);
    const first = cache.refresh(Array.from({ length: 8 }, (_, i) => ({ ...station, id: String(i) })));
    cache.cancel();
    pending.resolve(result());
    await first;
    expect(fetcher).toHaveBeenCalledTimes(4);
    await cache.refresh([station]);
    await cache.refresh([{ ...station, apiBaseUrl: "/changed" }]);
    expect(fetcher).toHaveBeenCalledTimes(6);
    await cache.refresh([]);
    expect(cache.snapshots([station], [])[0]?.track).toBeNull();
  });
  it("uses active player metadata without duplicate requests and prefers it over pending passive data", async () => {
    const fetcher = vi.fn(async () => result());
    const cache = new NowPlayingCache(vi.fn(), fetcher);
    const active = {
      stationId: "a",
      track: { ...song, title: "ZPR", contentKind: "advertisement" as const, contentEvidence: "explicit" as const },
      updatedAt: Date.now(),
    };
    await cache.refresh([station], active);
    expect(fetcher).not.toHaveBeenCalled();
    expect(cache.snapshots([station], [], active)[0]).toMatchObject({
      source: "player",
      kind: "advertisement",
      evidence: "explicit",
    });
    vi.advanceTimersByTime(30_000);
    await cache.refresh([station], active);
    expect(cache.snapshots([station], [], active)[0]).toMatchObject({ source: "passive", track: song });
  });
  it("does not request custom stations without an API", async () => {
    const fetcher = vi.fn();
    const cache = new NowPlayingCache(vi.fn(), fetcher);
    const custom = { ...station, provider: "generic" };
    delete custom.apiBaseUrl;
    await cache.refresh([custom]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(cache.snapshots([custom], [])[0]).toMatchObject({ kind: "unknown", error: false });
  });
});
