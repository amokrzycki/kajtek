import { describe, expect, it } from "vitest";
import type { SmartListeningConfig } from "../src/listeningPreferences.js";
import type { PolicySnapshot } from "../src/smartPolicy.js";
import { SmartRouteController, type SmartRouteInput } from "../src/smartRoute.js";
import type { Station, TrackInfo } from "../src/types.js";

const station = (id: string): Station => ({ id, name: id, short: id, cat: "test", provider: "rmf", stream: id });
const a = station("a"),
  b = station("b"),
  c = station("c");
const song: TrackInfo = { artist: "Artist", title: "Song", contentKind: "track" };
const ad: TrackInfo = {
  artist: "",
  title: "Ad",
  contentKind: "advertisement",
  contentEvidence: "explicit",
  timestamp: 100,
};
const config: SmartListeningConfig = {
  version: 1,
  enabled: true,
  content: { advertisement: true, news: true, otherBreak: true },
  preferences: [],
};
function snapshot(s: Station, track: TrackInfo | null, now: number, upcoming: TrackInfo[] = []): PolicySnapshot {
  return {
    station: s,
    track,
    kind: track?.contentKind ?? "unknown",
    evidence: track?.contentEvidence ?? null,
    updatedAt: now,
    stale: false,
    error: false,
    upcoming,
  };
}
function input(now = 100_000, current = a, tracks: (TrackInfo | null)[] = [ad, song, song]): SmartRouteInput {
  return {
    now,
    enabled: true,
    playing: true,
    station: current,
    config,
    pool: [a, b, c],
    snapshots: [a, b, c].map((s, index) => snapshot(s, tracks[index] ?? null, now)),
  };
}
function detour(route: SmartRouteController, first = input()): void {
  expect(route.step(first)).toBeNull();
  expect(route.step({ ...first, now: first.now + 5_000 })).toMatchObject({
    destination: b,
    automatic: true,
    returning: false,
  });
}

describe("Smart route lifecycle", () => {
  it("1. waits five seconds and ranks the entire pool only after rejection", () => {
    const route = new SmartRouteController();
    const liked = {
      ...config,
      preferences: [
        { scope: "artist" as const, artist: "Liked", title: "", key: "artist:liked", value: "positive" as const },
      ],
    };
    expect(route.step({ ...input(100_000, a, [song, song, { ...song, artist: "Liked" }]), config: liked })).toBeNull();
    expect(route.status).toBeNull();
    const rejected = { ...input(101_000, a, [ad, song, { ...song, artist: "Liked" }]), config: liked };
    route.step(rejected);
    expect(route.status).toMatchObject({ phase: "warning", candidate: c, secondsLeft: 5 });
    expect(route.step({ ...rejected, now: 105_999 })).toBeNull();
    expect(route.step({ ...rejected, now: 106_000 })).toMatchObject({
      destination: c,
      trigger: { reason: "advertisement" },
    });
  });

  it("2. retains the original origin across temporary reroutes", () => {
    const route = new SmartRouteController();
    detour(route);
    route.step(input(106_000, b, [ad, ad, song]));
    expect(route.status).toMatchObject({ originStation: a, triggerStation: b, phase: "warning", candidate: c });
    expect(route.step(input(111_000, b, [ad, ad, song]))).toMatchObject({ destination: c });
    expect(route.status?.originStation).toEqual(a);
  });

  it("3. never blindly returns at an ad deadline and requires distinct safe observations", () => {
    const route = new SmartRouteController();
    detour(route, input(100_000, a, [{ ...ad, adEndsAt: 120_000 }, song, song]));
    expect(route.step(input(120_000, b, [null, song, song]))).toBeNull();
    expect(route.step(input(121_000, b, [song, song, song]))).toBeNull();
    const cached = input(126_000, b, [song, song, song]);
    cached.snapshots[0] = snapshot(a, song, 121_000);
    expect(route.step(cached)).toBeNull();
    expect(route.step(input(126_001, b, [song, song, song]))).toMatchObject({
      destination: a,
      returning: true,
      automatic: true,
    });
    expect(route.status).toBeNull();
  });

  it("4. resets return confirmation on unknown, stale or newly unsafe origin evidence", () => {
    const route = new SmartRouteController();
    detour(route);
    route.step(input(115_000, b, [song, song, song]));
    const stale = input(120_000, b, [song, song, song]);
    stale.snapshots[0] = { ...snapshot(a, song, 120_000), stale: true };
    expect(route.step(stale)).toBeNull();
    route.step(input(121_000, b, [song, song, song]));
    const upcoming = input(126_000, b, [song, song, song]);
    upcoming.snapshots[0] = snapshot(a, song, 126_000, [{ ...ad, timestamp: 130 }]);
    expect(route.step(upcoming)).toBeNull();
    route.step(input(127_000, b, [song, song, song]));
    expect(route.step(input(132_000, b, [song, song, song]))).toMatchObject({ returning: true });
  });

  it("5. enforces minimum dwell even after safe origin confirmation", () => {
    const route = new SmartRouteController();
    detour(route);
    route.step(input(106_000, b, [song, song, song]));
    expect(route.step(input(111_000, b, [song, song, song]))).toBeNull();
    expect(route.step(input(115_000, b, [song, song, song]))).toMatchObject({ returning: true });
  });

  it("6. Stay suppresses an upcoming ad through its current window and unknown metadata", () => {
    const route = new SmartRouteController();
    const upcoming = input(100_000, a, [song, song, song]);
    upcoming.snapshots[0] = snapshot(a, song, 100_000, [{ ...ad, timestamp: 110, adEndsAt: 140_000 }]);
    route.step(upcoming);
    route.dismiss();
    expect(route.status).toBeNull();
    expect(route.step(input(105_000, a, [null, song, song]))).toBeNull();
    expect(route.step(input(110_000, a, [{ ...ad, timestamp: 110, adEndsAt: 140_000 }, song, song]))).toBeNull();
    expect(route.status).toBeNull();
    expect(route.step(input(130_000, a, [{ ...ad, timestamp: 111, adEndsAt: 140_000 }, song, song]))).toBeNull();
    expect(route.status).toBeNull();
    route.step(input(141_000, a, [song, song, song]));
    route.step(input(146_000, a, [song, song, song]));
    route.step(input(147_000, a, [{ ...ad, timestamp: 147 }, song, song]));
    expect(route.status?.phase).toBe("warning");
  });

  it("7. music dismissal normalizes identity and permits different fresh negative music", () => {
    const route = new SmartRouteController();
    const negative = {
      ...config,
      preferences: [
        { scope: "artist" as const, artist: "Artist", title: "", key: "artist:artist", value: "negative" as const },
      ],
    };
    route.step({
      ...input(100_000, a, [song, { ...song, artist: "Safe" }, { ...song, artist: "Safe" }]),
      config: negative,
    });
    route.dismiss();
    route.step({
      ...input(105_000, a, [{ ...song, artist: " ARTIST ", title: " SONG ", timestamp: 105 }, song, song]),
      config: negative,
    });
    expect(route.status).toBeNull();
    route.step({ ...input(106_000, a, [{ ...song, title: "Other" }, song, song]), config: negative });
    expect(route.status?.phase).toBe("unavailable");
  });

  it("8. pause cancels warning, retains detour and prevents paused switches", () => {
    const route = new SmartRouteController();
    route.step(input());
    route.step({ ...input(104_000), playing: false });
    expect(route.status).toBeNull();
    detour(route, input(105_000));
    expect(route.step({ ...input(130_000, b, [song, song, song]), playing: false })).toBeNull();
    expect(route.status?.phase).toBe("detour");
    expect(route.step(input(131_000, b, [song, song, song]))).toBeNull();
    expect(route.step(input(136_000, b, [song, song, song]))).toMatchObject({ returning: true });
  });

  it("9. disable, ordinary selection and cancel-return end the route", () => {
    const route = new SmartRouteController();
    detour(route);
    route.step(input(106_000, c, [ad, song, song]));
    expect(route.status).toBeNull();
    detour(route, input(110_000));
    route.cancelReturn();
    expect(route.status).toBeNull();
    route.reset();
    detour(route, input(120_000));
    route.step({ ...input(126_000, b), enabled: false });
    expect(route.status).toBeNull();
  });

  it("10. warning revalidates destinations and rules without switching on vanished evidence", () => {
    const route = new SmartRouteController();
    route.step(input());
    expect(route.step(input(105_000, a, [ad, ad, song]))).toMatchObject({ destination: c });
    const other = new SmartRouteController();
    other.step(input());
    expect(other.step(input(105_000, a, [null, song, song]))).toBeNull();
    expect(other.status?.phase).toBe("warning");
    expect(
      other.step({ ...input(106_000), config: { ...config, content: { ...config.content, advertisement: false } } }),
    ).toBeNull();
    expect(other.status).toBeNull();
  });

  it("11. empty and rejected pools wait without automatic switches", () => {
    const route = new SmartRouteController();
    route.step({ ...input(), pool: [] });
    expect(route.status).toMatchObject({ phase: "unavailable", candidate: null });
    expect(route.step({ ...input(110_000), pool: [] })).toBeNull();
    expect(route.step(input(120_000, a, [ad, ad, ad]))).toBeNull();
    expect(route.status?.phase).toBe("unavailable");
  });

  it("12. caps automatic switches, including returns, but manual actions bypass the cap", () => {
    const route = new SmartRouteController();
    detour(route);
    route.step(input(106_000, b, [song, song, song]));
    expect(route.step(input(115_000, b, [song, song, song]))).toMatchObject({ returning: true });
    route.step(input(116_000));
    expect(route.step(input(121_000))).toMatchObject({ destination: b });
    route.step(input(122_000, b, [ad, ad, song]));
    expect(route.step(input(127_000, b, [ad, ad, song]))).toBeNull();
    expect(route.switchNow(input(127_000, b, [ad, ad, song]))).toMatchObject({ destination: c, automatic: false });
    expect(route.manualReturn()).toMatchObject({ destination: a, automatic: false, returning: true });
    route.step(input(128_000));
    expect(route.status).toBeNull();
  });

  it("13. manual switch-now bypasses grace without turning a safe return into a detour", () => {
    const route = new SmartRouteController();
    expect(route.switchNow(input())).toMatchObject({ destination: b, automatic: false, returning: false });
    route.step(input(115_000, b, [song, song, song]));
    expect(route.switchNow(input(120_000, b, [song, song, song]))).toBeNull();
    expect(route.status?.phase).toBe("detour");
  });

  it("14. a newly learned origin ad end remains an earliest return boundary", () => {
    const route = new SmartRouteController();
    detour(route);
    route.step(input(110_000, b, [{ ...ad, adEndsAt: 140_000 }, song, song]));
    route.step(input(115_000, b, [song, song, song]));
    expect(route.step(input(120_000, b, [song, song, song]))).toBeNull();
    expect(route.step(input(140_000, b, [song, song, song]))).toMatchObject({ returning: true });
  });

  it("15. allowed news is eligible for safe return, while avoided news holds the detour", () => {
    const route = new SmartRouteController();
    detour(route);
    const news = { ...ad, contentKind: "news" as const };
    const listenNews = { ...config, content: { ...config.content, news: false } };
    route.step({ ...input(115_000, b, [news, song, song]), config: listenNews });
    expect(route.step({ ...input(120_000, b, [news, song, song]), config: listenNews })).toMatchObject({
      destination: a,
      returning: true,
    });
    const avoiding = new SmartRouteController();
    detour(avoiding);
    avoiding.step(input(115_000, b, [news, song, song]));
    expect(avoiding.step(input(120_000, b, [news, song, song]))).toBeNull();
    expect(avoiding.status?.phase).toBe("detour");
  });

  it("16. detour status names the actual temporary station and keeps the origin separately", () => {
    const route = new SmartRouteController();
    detour(route);
    expect(route.status).toMatchObject({ phase: "detour", originStation: a, candidate: b });
    route.step(input(106_000, b, [ad, song, song]));
    expect(route.status?.candidate).toEqual(b);
  });

  it("17. manual return suppresses the origin content currently being returned to", () => {
    const route = new SmartRouteController();
    detour(route);
    const news = { ...ad, contentKind: "news" as const };
    route.step(input(110_000, b, [news, song, song]));
    expect(route.manualReturn()).toMatchObject({ destination: a, automatic: false, returning: true });
    route.step(input(111_000, a, [news, song, song]));
    expect(route.status).toBeNull();
  });

  it("18. Stay suppresses only the same content, allowing a different avoided break to warn", () => {
    const route = new SmartRouteController();
    route.step(input());
    route.dismiss();
    route.step(input(106_000, a, [{ ...ad, contentKind: "news" }, song, song]));
    expect(route.status).toMatchObject({ phase: "warning", trigger: { reason: "news" } });
  });

  it("19. an upcoming dismissal survives safe music before its start and untimed current evidence", () => {
    const route = new SmartRouteController();
    const upcoming = input(100_000, a, [song, song, song]);
    upcoming.snapshots[0] = snapshot(a, song, 100_000, [{ ...ad, timestamp: 110 }]);
    route.step(upcoming);
    route.dismiss();
    route.step(input(105_000, a, [song, song, song]));
    const untimed: TrackInfo = { artist: "", title: "Ad", contentKind: "advertisement", contentEvidence: "explicit" };
    route.step(input(110_000, a, [untimed, song, song]));
    expect(route.status).toBeNull();
  });

  it("20. retains a known RMF timeline ad end when early safe metadata arrives", () => {
    const route = new SmartRouteController();
    detour(route, input(100_000, a, [{ ...ad, endTimestamp: 140 }, song, song]));
    route.step(input(115_000, b, [song, song, song]));
    expect(route.step(input(120_000, b, [song, song, song]))).toBeNull();
    expect(route.step(input(139_999, b, [song, song, song]))).toBeNull();
    expect(route.step(input(140_000, b, [song, song, song]))).toMatchObject({ destination: a, returning: true });
  });

  it("21. learns a newer inferred origin timeline ad deadline during a detour", () => {
    const route = new SmartRouteController();
    detour(route);
    route.step(input(110_000, b, [{ ...ad, contentEvidence: "inferred", endTimestamp: 140 }, song, song]));
    route.step(input(115_000, b, [song, song, song]));
    expect(route.step(input(120_000, b, [song, song, song]))).toBeNull();
    expect(route.step(input(140_000, b, [song, song, song]))).toMatchObject({ returning: true });
  });

  it.each(["track", "news"] as const)("22. ignores advertisement deadline fields on listened %s", (kind) => {
    const route = new SmartRouteController();
    detour(route);
    const allowed = {
      ...song,
      contentKind: kind,
      contentEvidence: "explicit" as const,
      endTimestamp: 140,
      adEndsAt: 140_000,
    };
    const listen = { ...config, content: { ...config.content, news: false } };
    route.step({ ...input(115_000, b, [allowed, song, song]), config: listen });
    expect(route.step({ ...input(120_000, b, [allowed, song, song]), config: listen })).toMatchObject({
      returning: true,
    });
  });

  it("23. Stay preserves an RMF timeline ad window through early music and timestamp jitter", () => {
    const route = new SmartRouteController();
    route.step(input(100_000, a, [{ ...ad, endTimestamp: 140 }, song, song]));
    route.dismiss();
    route.step(input(105_000, a, [song, song, song]));
    route.step(input(130_000, a, [{ ...ad, timestamp: 101, endTimestamp: 140 }, song, song]));
    expect(route.status).toBeNull();
  });

  it("24. retains an origin timeline end learned while the warning is counting down", () => {
    const route = new SmartRouteController();
    route.step(input());
    expect(route.step(input(105_000, a, [{ ...ad, endTimestamp: 140 }, song, song]))).toMatchObject({ destination: b });
    route.step(input(115_000, b, [song, song, song]));
    expect(route.step(input(120_000, b, [song, song, song]))).toBeNull();
    expect(route.step(input(140_000, b, [song, song, song]))).toMatchObject({ returning: true });
  });
});
