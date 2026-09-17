import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EskaNowPlaying, EskaTrack, PlaylistResult, Station } from "../src/types.js";
import adFragment from "./fixtures/eska/frag-ad.synthetic.json";
import emptyFragment from "./fixtures/eska/frag-empty.json";
import jingleFragment from "./fixtures/eska/frag-jingle.synthetic.json";
import songFragments from "./fixtures/eska/frag-song.json";
import emptyManifest from "./fixtures/eska/hls-empty-long.m3u8?raw";
import songManifest from "./fixtures/eska/hls-song.m3u8?raw";
import restNull from "./fixtures/eska/rest-null-current.json";
import restSong from "./fixtures/eska/rest-song.json";

type EskaModule = typeof import("../src/providers/eska.js");
type Fragment = { tagList: string[][]; programDateTime: number | null };

const station: Station = {
  id: "eska-2380",
  name: "ESKA Warszawa",
  short: "ESKA",
  cat: "eska",
  provider: "eska",
  stream: "https://example.test/eska.aac",
  apiBaseUrl: "/api/eska/music/v2/now_playing/2380",
};

const otherStation: Station = {
  ...station,
  id: "eska-2980",
  name: "ESKA",
  apiBaseUrl: "/api/eska/music/v2/now_playing/2980",
};

const fetchMock = vi.fn<typeof fetch>();
let eska: EskaModule;

function fragment(title: string, duration = 1_000, timeout: number | null = 180_000): Fragment {
  return {
    tagList: [
      [
        "EXT-X-ZPR",
        JSON.stringify({ data: { title: btoa(title), encoding: "base64", timeout }, duration, expired: null }),
      ],
    ],
    programDateTime: Date.now(),
  };
}

function nowPlaying(current: EskaTrack | null, futures: EskaTrack[] = []): EskaNowPlaying {
  return { current, pasts: [], futures };
}

async function fetchResult(data: EskaNowPlaying, target = station): Promise<PlaylistResult> {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  const result = await eska.eskaProvider.fetch?.(target);
  if (!result) throw new Error("Expected an ESKA playlist result");
  return result;
}

function song(name: string, artist = "Artist"): EskaTrack {
  return { artists: [artist], name };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T15:07:30.000Z"));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.resetModules();
  eska = await import("../src/providers/eska.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("ESKA fixture contract", () => {
  it("preserves the raw ZPR payload represented by captured hls.js fragments", () => {
    const firstSong = songFragments[0];
    if (!firstSong) throw new Error("Missing captured song fragment");

    expect(songManifest).toContain(`#EXT-X-ZPR:${firstSong.tagList[0]?.[1]}`);
    expect(emptyManifest).toContain(`#EXT-X-ZPR:${emptyFragment.tagList[0]?.[1]}`);
  });
});

describe("readZprTag", () => {
  it("decodes captured base64 and keeps one block start across advancing fragments", async () => {
    const first = songFragments[0];
    if (!first) throw new Error("Missing captured song fragments");

    eska.startEskaSession(station.id);
    expect(eska.readZprTag(first, station.id)).toBe(true);
    const firstResult = await fetchResult(restSong);
    expect(firstResult.current).toMatchObject({
      artist: "Avicii & Rita Ora",
      title: "Lonely Together",
      length: 175,
    });

    for (const next of songFragments.slice(1)) {
      expect(eska.readZprTag(next, station.id)).toBe(false);
      const nextResult = await fetchResult(restSong);
      expect(nextResult.current?.start).toBe(firstResult.current?.start);
    }
  });

  it("decodes synthetic Polish UTF-8 without damaging diacritics", async () => {
    eska.startEskaSession(station.id);
    const utf8 = fragment("xbvDk8WBxIYgR09SWkvEhCAtIEtvxYJ5c2Fua2E=");
    const raw = JSON.parse(utf8.tagList[0]?.[1] ?? "{}") as { data?: { title?: string } };
    if (raw.data) raw.data.title = "xbvDk8WBxIYgR09SWkvEhCAtIEtvxYJ5c2Fua2E=";
    utf8.tagList = [["EXT-X-ZPR", JSON.stringify(raw)]];

    expect(eska.readZprTag(utf8, station.id)).toBe(true);
    const result = await fetchResult(nowPlaying(null));
    expect(result.current).toMatchObject({ artist: "Żółć Gorzką", title: "Kołysanka" });
  });

  it("holds a short empty transition, then clears state after the grace period", async () => {
    const first = songFragments[0];
    if (!first) throw new Error("Missing captured song fragment");

    eska.startEskaSession(station.id);
    eska.readZprTag(first, station.id);
    vi.advanceTimersByTime(2_000);
    expect(eska.readZprTag(emptyFragment, station.id)).toBe(false);
    const held = await fetchResult(restSong);
    expect(held.current).toMatchObject({ title: "Lonely Together", length: 175 });

    vi.advanceTimersByTime(1);
    expect(eska.readZprTag(emptyFragment, station.id)).toBe(true);
    const cleared = await fetchResult(restSong);
    expect(cleared.current).not.toHaveProperty("start");
    expect(cleared.current).not.toHaveProperty("length");
  });

  it("ignores missing, malformed, and invalid-base64 tags", async () => {
    const first = songFragments[0];
    if (!first) throw new Error("Missing captured song fragment");
    eska.startEskaSession(station.id);
    eska.readZprTag(first, station.id);

    expect(eska.readZprTag({ tagList: [["EXTINF", "10"]], programDateTime: Date.now() }, station.id)).toBe(false);
    expect(eska.readZprTag({ tagList: [["EXT-X-ZPR", "{"]], programDateTime: Date.now() }, station.id)).toBe(false);
    expect(
      eska.readZprTag({ tagList: [["EXT-X-ZPR", '{"duration":1}']], programDateTime: Date.now() }, station.id),
    ).toBe(false);
    const invalidBase64 = fragment("placeholder");
    invalidBase64.tagList = [
      [
        "EXT-X-ZPR",
        JSON.stringify({ data: { title: "%%%", encoding: "base64", timeout: null }, duration: 1, expired: null }),
      ],
    ];
    expect(eska.readZprTag(invalidBase64, station.id)).toBe(false);

    const result = await fetchResult(restSong);
    expect(result.current?.title).toBe("Lonely Together");
  });
});

describe("eskaProvider.fetch", () => {
  it("classifies synthetic ads above REST and treats a short empty transition as REST", async () => {
    eska.startEskaSession(station.id);
    expect(eska.readZprTag(adFragment, station.id)).toBe(true);
    const ad = await fetchResult(restSong);
    expect(ad.current).toMatchObject({ artist: station.name, title: "Przerwa / Reklamy", isLiveBreak: true });
    expect(ad.all).not.toContainEqual(expect.objectContaining({ isLiveBreak: true }));

    vi.advanceTimersByTime(2_000);
    expect(eska.readZprTag(emptyFragment, station.id)).toBe(false);
    const transition = await fetchResult(restSong);
    expect(transition.current).toMatchObject({ artist: "Avicii & Rita Ora", title: "Lonely Together" });
    expect(transition.current?.isLiveBreak).toBeUndefined();
  });

  it("uses REST during a synthetic jingle but characterizes jingle plus REST null as a break", async () => {
    eska.startEskaSession(station.id);
    eska.readZprTag(jingleFragment, station.id);

    const withRest = await fetchResult(restSong);
    expect(withRest.current).toMatchObject({ title: "Lonely Together" });
    expect(withRest.current?.isLiveBreak).toBeUndefined();

    const withoutRest = await fetchResult(restNull);
    expect(withoutRest.current).toMatchObject({ title: "Przerwa / Reklamy", isLiveBreak: true });
  });

  it("does not attach old HLS timing during either REST mismatch direction", async () => {
    eska.startEskaSession(station.id);
    eska.readZprTag(fragment("ARTIST - Song A"), station.id);

    const restAhead = await fetchResult(nowPlaying(song("Song B")));
    expect(restAhead.current).not.toHaveProperty("start");
    expect(restAhead.current).not.toHaveProperty("length");

    const convergedA = await fetchResult(nowPlaying(song("Song A")));
    expect(convergedA.current).toHaveProperty("start");
    expect(convergedA.current).toHaveProperty("length", 180);

    eska.readZprTag(fragment("ARTIST - Song B"), station.id);
    const hlsAhead = await fetchResult(nowPlaying(song("Song A")));
    expect(hlsAhead.current).not.toHaveProperty("start");
    const convergedB = await fetchResult(nowPlaying(song("Song B")));
    expect(convergedB.current).toHaveProperty("length", 180);
  });

  it("characterizes song to ad to song history without storing the ad", async () => {
    eska.startEskaSession(station.id);
    eska.readZprTag(fragment("ARTIST - Song A"), station.id);
    const firstSong = await fetchResult(nowPlaying(song("Song A")));
    if (!firstSong.current) throw new Error("Missing current song");
    firstSong.current.length = 999;

    eska.readZprTag(adFragment, station.id);
    const duringAd = await fetchResult(restNull);
    expect(duringAd.current?.isLiveBreak).toBe(true);
    expect(duringAd.all.map((track) => track.title)).not.toContain("Song A");

    eska.readZprTag(fragment("ARTIST - Song B"), station.id);
    const afterAd = await fetchResult(nowPlaying(song("Song B")));
    expect(afterAd.current).toMatchObject({ title: "Song B" });
    expect(afterAd.all.map((track) => track.title)).toEqual(["Song A", "Song B"]);
    expect(afterAd.all[0]?.length).toBe(180);
  });

  it("keeps only the last three session songs without duplicates", async () => {
    eska.startEskaSession(station.id);
    let result: PlaylistResult | null = null;

    for (const title of ["Song A", "Song B", "Song C", "Song D", "Song E"]) {
      eska.readZprTag(fragment(`ARTIST - ${title}`), station.id);
      result = await fetchResult(nowPlaying(song(title)));
      result = await fetchResult(nowPlaying(song(title)));
    }

    expect(result?.all.map((track) => track.title)).toEqual(["Song B", "Song C", "Song D", "Song E"]);
    expect(result?.all.map((track) => track.order)).toEqual([-3, -2, -1, 0]);
  });

  it("falls back to ZPR title casing when REST current is null", async () => {
    eska.startEskaSession(station.id);
    const zpr = fragment("placeholder");
    zpr.tagList = [
      [
        "EXT-X-ZPR",
        JSON.stringify({
          data: { title: "QlRTICYgTUdNVCAtIMWBw7Nkxbogbm9jxIU=", encoding: "base64", timeout: 180_000 },
          duration: 1_000,
          expired: null,
        }),
      ],
    ];
    eska.readZprTag(zpr, station.id);

    const result = await fetchResult(nowPlaying(null));
    expect(result.current).toMatchObject({ artist: "BTS & MGMT", title: "Łódź nocą" });
  });

  it("characterizes missing, stale, and another station's ZPR plus REST null as breaks", async () => {
    eska.startEskaSession(station.id);
    const missing = await fetchResult(restNull);
    expect(missing.current?.isLiveBreak).toBe(true);

    eska.readZprTag(fragment("ARTIST - Song A"), station.id);
    const other = await fetchResult(restNull, otherStation);
    expect(other.current?.isLiveBreak).toBe(true);

    vi.advanceTimersByTime(30_001);
    const stale = await fetchResult(restNull);
    expect(stale.current?.isLiveBreak).toBe(true);
  });
});
