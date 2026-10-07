import { describe, expect, it } from "vitest";
import type { SmartListeningConfig } from "../src/listeningPreferences.js";
import { evaluateSnapshot, type PolicySnapshot, rankCandidates } from "../src/smartPolicy.js";
import type { Station, TrackInfo } from "../src/types.js";

const station = (id: string): Station => ({ id, name: id, short: id, cat: "test", provider: "rmf", stream: id });
const config: SmartListeningConfig = {
  version: 1,
  enabled: true,
  content: { advertisement: true, news: true, otherBreak: true },
  preferences: [],
};
const song: TrackInfo = { artist: "A", title: "Song", contentKind: "track" };
const snapshot = (id: string, track: TrackInfo | null = song): PolicySnapshot => ({
  station: station(id),
  track,
  kind: track?.contentKind ?? "unknown",
  evidence: track?.contentEvidence ?? null,
  updatedAt: 100000,
  stale: false,
  error: false,
  upcoming: [],
});
const preferred = (): SmartListeningConfig => ({
  ...config,
  preferences: [
    { scope: "artist", artist: "Liked", title: "", key: "artist:liked", value: "positive" },
    { scope: "artist", artist: "Bad", title: "", key: "artist:bad", value: "negative" },
    { scope: "track", artist: "A", title: "Blocked", key: "track:a::blocked", value: "negative" },
    { scope: "track", artist: "A", title: "Best", key: "track:a::best", value: "positive" },
  ],
});

describe("pure listening policy", () => {
  it.each(["advertisement", "news", "otherBreak"] as const)("rejects avoided current %s", (kind) => {
    expect(
      evaluateSnapshot(
        snapshot("s", { artist: "", title: kind, contentKind: kind, contentEvidence: "explicit" }),
        config,
        100000,
      ),
    ).toMatchObject({ eligibility: "rejected", trigger: { reason: kind } });
  });
  it("does not conflate programmes, unknown or predicted gaps with ads", () => {
    expect(
      evaluateSnapshot(snapshot("s", { artist: "", title: "Audycja", contentKind: "programme" }), config, 100000)
        .eligibility,
    ).toBe("eligible");
    expect(evaluateSnapshot(snapshot("s", null), config, 100000).eligibility).toBe("fallback");
    expect(
      evaluateSnapshot(
        snapshot("s", { artist: "", title: "gap", contentKind: "advertisement", isPredicted: true }),
        config,
        100000,
      ).eligibility,
    ).toBe("fallback");
  });
  it.each([
    [{ ...song, title: "Blocked" }, "negativeTrack"],
    [{ ...song, artist: " BAD ", title: "Any song" }, "negativeArtist"],
  ] as const)("rejects negative known music", (track, reason) => {
    expect(evaluateSnapshot(snapshot("s", track), preferred(), 100000)).toMatchObject({
      eligibility: "rejected",
      trigger: { reason },
    });
  });
  it("examines the entire pool, rejects all disallowed candidates and prefers explicit liked artist over neutral/favorite", () => {
    const pool = [
      snapshot("eska", { ...song, artist: "Bad" }),
      snapshot("maxx"),
      snapshot("classic", { ...song, artist: "Liked" }),
      snapshot("ads", { artist: "", title: "ad", contentKind: "advertisement" }),
    ];
    expect(
      rankCandidates(pool, preferred(), 100000, "origin", new Set(["maxx"])).map((item) => item.snapshot.station.id),
    ).toEqual(["classic", "maxx"]);
  });
  it("strongest exact positive preference wins; negative artist still overrides liked track", () => {
    expect(
      rankCandidates(
        [snapshot("artist", { ...song, artist: "Liked" }), snapshot("track", { ...song, title: "Best" })],
        preferred(),
        100000,
        "origin",
      )[0]?.snapshot.station.id,
    ).toBe("track");
    const both = preferred();
    both.preferences.push({ scope: "track", artist: "Bad", title: "Song", key: "track:bad::song", value: "positive" });
    expect(evaluateSnapshot(snapshot("s", { ...song, artist: "Bad" }), both, 100000).eligibility).toBe("rejected");
  });
  it("rejects reliable imminent content but does not hard-reject speculative or untimed upcoming evidence", () => {
    const s = snapshot("s");
    s.upcoming = [{ artist: "", title: "news", contentKind: "news", contentEvidence: "explicit", timestamp: 110 }];
    expect(evaluateSnapshot(s, config, 100000).eligibility).toBe("rejected");
    s.upcoming[0] = { ...s.upcoming[0], artist: "", title: "predicted", isPredicted: true };
    expect(evaluateSnapshot(s, config, 100000).eligibility).toBe("eligible");
    s.upcoming = [
      { artist: "", title: "ad", contentKind: "advertisement", contentEvidence: "inferred", timestamp: 110 },
    ];
    expect(evaluateSnapshot(s, config, 100000).eligibility).toBe("eligible");
    s.upcoming = [{ artist: "", title: "ad", contentKind: "advertisement", contentEvidence: "explicit" }];
    expect(evaluateSnapshot(s, config, 100000).eligibility).toBe("eligible");
  });
  it("known safe always precedes stale/unknown fallbacks even with high preference score", () => {
    const stale = { ...snapshot("stale", { ...song, title: "Best" }), stale: true };
    expect(
      rankCandidates([stale, snapshot("unknown", null), snapshot("safe")], preferred(), 100000, "origin").map(
        (item) => item.snapshot.station.id,
      ),
    ).toEqual(["safe", "stale", "unknown"]);
    expect(evaluateSnapshot({ ...snapshot("s"), updatedAt: 0 }, config, 100000).eligibility).toBe("fallback");
  });
  it("ties follow supplied catalog order despite snapshot completion order", () => {
    const a = snapshot("a"),
      b = snapshot("b");
    expect(
      rankCandidates([b, a], config, 100000, "origin", new Set(), new Set(), ["a", "b"])[0]?.snapshot.station.id,
    ).toBe("a");
  });
  it("disabling a rule makes matching current content eligible", () => {
    expect(
      evaluateSnapshot(
        snapshot("s", { artist: "", title: "news", contentKind: "news" }),
        { ...config, content: { ...config.content, news: false } },
        100000,
      ).eligibility,
    ).toBe("eligible");
  });
});
