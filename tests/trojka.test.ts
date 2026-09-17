import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistResult, Station } from "../src/types.js";
import home from "./fixtures/trojka/home.html?raw";
import playlist from "./fixtures/trojka/playlista.json";
import schedule from "./fixtures/trojka/ramowka.json";

vi.mock("../src/utils.js", () => ({
  decodeEntities: (value?: string | null) => value?.replaceAll("&amp;", "&") ?? "",
}));

type TrojkaModule = typeof import("../src/providers/trojka.js");

const station: Station = {
  id: "trojka",
  name: "Trójka",
  short: "TR3",
  cat: "polskie-radio",
  provider: "trojka",
  stream: "https://example.test/trojka.mp3",
  apiBaseUrl: "/api/trojka",
};

const fetchMock = vi.fn<typeof fetch>();
let trojka: TrojkaModule;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

function queueDiscovery(buildId = "F3B0feyeEAMtls1dS-Mt8"): void {
  fetchMock.mockResolvedValueOnce(new Response(home.replace("F3B0feyeEAMtls1dS-Mt8", buildId)));
}

function queueSchedule(data: unknown = schedule): void {
  fetchMock.mockResolvedValueOnce(jsonResponse(data));
}

function queuePlaylist(data: unknown = playlist): void {
  fetchMock.mockResolvedValueOnce(jsonResponse(data));
}

async function result(): Promise<PlaylistResult> {
  const value = await trojka.trojkaProvider.fetch?.(station);
  if (!value) throw new Error("Expected a Trójka playlist result");
  return value;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T13:52:00Z"));
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
  trojka = await import("../src/providers/trojka.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("trojkaProvider discovery", () => {
  it("extracts the captured build ID and constructs both Next JSON URLs", async () => {
    queueDiscovery();
    queueSchedule();
    queuePlaylist();

    await result();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/trojka/",
      "/api/trojka/_next/data/F3B0feyeEAMtls1dS-Mt8/ramowka.json",
      "/api/trojka/_next/data/F3B0feyeEAMtls1dS-Mt8/playlista.json",
    ]);
  });

  it("resets a rejected build ID after 404 and rediscovers it on the next call", async () => {
    queueDiscovery("old-build");
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    expect(await trojka.trojkaProvider.fetch?.(station)).toBeNull();

    queueDiscovery("new-build");
    queueSchedule();
    queuePlaylist();
    await result();

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/trojka/_next/data/new-build/ramowka.json");
  });

  it.each([
    [new Response("<html></html>"), "missing manifest"],
    [new Response("error", { status: 500 }), "non-2xx homepage"],
  ])("returns null when build discovery has %s", async (response) => {
    fetchMock.mockResolvedValueOnce(response);
    expect(await trojka.trojkaProvider.fetch?.(station)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("trojkaProvider caches", () => {
  it("caches schedule for the local day and playlist for 60 seconds, retaining the last good playlist", async () => {
    queueDiscovery();
    queueSchedule();
    queuePlaylist();
    const first = await result();

    vi.advanceTimersByTime(59_999);
    const cached = await result();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cached).toEqual(first);

    vi.advanceTimersByTime(1);
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));
    const stale = await result();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(stale).toEqual(first);
  });

  it("refreshes schedule after the local day changes and retains the last good schedule on failure", async () => {
    queueDiscovery();
    queueSchedule();
    queuePlaylist();
    await result();

    vi.setSystemTime(new Date("2026-09-17T22:00:00Z"));
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));
    const stale = await result();

    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/trojka/_next/data/F3B0feyeEAMtls1dS-Mt8/ramowka.json");
    expect(stale.current).toBeNull();
  });
});

describe("trojkaProvider current program", () => {
  it("treats programs as start-inclusive and stop-exclusive and falls back to the program as live", async () => {
    vi.setSystemTime(new Date("2026-09-17T13:05:00Z"));
    queueDiscovery();
    queueSchedule();
    queuePlaylist({ pageProps: { data: [] } });

    const atStart = await result();
    expect(atStart.current).toEqual({ artist: "Trójka", title: "W tonacji Trójki", isLiveBreak: true });
    expect(atStart.all[0]).toMatchObject({ title: "W tonacji Trójki", isBreak: true });

    vi.setSystemTime(new Date("2026-09-17T15:00:00Z"));
    const atStop = await result();
    expect(atStop.current).toBeNull();
  });

  it("sorts captured songs and tolerates the last song through 60 seconds after its end", async () => {
    vi.setSystemTime(new Date("2026-09-17T13:56:51Z"));
    queueDiscovery();
    queueSchedule();
    queuePlaylist();

    const tolerated = await result();
    expect(tolerated.current).toEqual({ artist: "O.N.A.", title: "Krzyczę - jestem" });
    expect(tolerated.all.filter((track) => !track.isBreak).map((track) => track.title)).toEqual([
      "Roses",
      "I Will Survive",
      "Krzyczę - jestem",
    ]);

    vi.advanceTimersByTime(1_000);
    queuePlaylist();
    const stale = await result();
    expect(stale.current).toEqual({ artist: "Trójka", title: "W tonacji Trójki", isLiveBreak: true });
  });
});
