import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistResult, Station } from "../src/types.js";
import playlist from "./fixtures/trojka/playlista.json";
import schedule from "./fixtures/trojka/ramowka.json";

vi.mock("../src/utils.js", () => ({
  decodeEntities: (value?: string | null) => value?.replaceAll("&amp;", "&") ?? "",
}));

type TrojkaModule = typeof import("../src/providers/trojka.js");
const scheduleUrl = "https://video.onnetwork.tv/livePR2.php";
const playlistUrl = "/api/trojka/playlist?date=2026-10-05";
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
const replies = new Map<string, () => Response | Promise<Response>>();
let trojka: TrojkaModule;

function respond(url: string, data: unknown): void {
  replies.set(url, () => new Response(JSON.stringify(data)));
}

async function result(): Promise<PlaylistResult> {
  const value = await trojka.trojkaProvider.fetch?.(station);
  if (!value) {
    throw new Error(
      `Expected a Trójka playlist result; requests: ${fetchMock.mock.calls.map(([url]) => url).join(", ")}`,
    );
  }
  return value;
}

function fallback(): object {
  return { artist: "Trójka", title: "Zapraszamy do Trójki - ranek", isLiveBreak: true, contentKind: "programme" };
}

function activeProgram() {
  const program = schedule.Trójka.find((item) => item.fullStartTime === "2026-10-05T07:07:00");
  if (!program) throw new Error("Missing captured program");
  return structuredClone(program);
}

function activeBlock() {
  const block = playlist.data.find((item) => item.startTime === "2026-10-05T07:07:00");
  if (!block) throw new Error("Missing captured playlist block");
  return structuredClone(block);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T05:46:00Z"));
  replies.clear();
  respond(scheduleUrl, schedule);
  respond(playlistUrl, playlist);
  fetchMock.mockImplementation((input) => {
    const reply = replies.get(String(input));
    if (!reply) throw new Error(`Unexpected Trójka endpoint: ${String(input)}`);
    return Promise.resolve(reply());
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
  trojka = await import("../src/providers/trojka.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("Trójka transport and metadata", () => {
  it("uses only Onnetwork and the dated playlist, with abort signals", async () => {
    expect((await result()).current).toEqual({ artist: "DAWID PODSIADŁO", title: "Na błysk" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([scheduleUrl, playlistUrl]);
    for (const [, options] of fetchMock.mock.calls) expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits the referrer so Onnetwork does not reflect a port-stripped CORS origin", async () => {
    await result();
    const scheduleRequest = fetchMock.mock.calls.find(([url]) => url === scheduleUrl);
    expect(scheduleRequest?.[1]?.referrerPolicy).toBe("no-referrer");
  });

  it("matches normalized start times without a schedule ID or title match", async () => {
    const block = activeBlock();
    block.startTime += ".000";
    block.title = "Different playlist title";
    respond(playlistUrl, { data: [playlist.data[0], block] });
    expect((await result()).current).toEqual({ artist: "DAWID PODSIADŁO", title: "Na błysk" });
  });

  it("sorts songs and limits history to four started tracks", async () => {
    const block = activeBlock();
    block.playlistItems.reverse();
    respond(playlistUrl, { data: [block] });
    expect((await result()).all.filter((item) => !item.isBreak).map((item) => item.title)).toEqual([
      "Helicopters",
      "Immigrant Song",
      "GIRLS GO WILD",
      "Na błysk",
    ]);
  });

  it("sorts and limits upcoming programs to five using Unix seconds and Warsaw hours", async () => {
    respond(scheduleUrl, { ...schedule, Trójka: [...schedule.Trójka].reverse() });
    const upcoming = (await result()).all.filter((item) => item.isBreak);
    expect(upcoming.map((item) => item.start)).toEqual(["07:50", "07:55", "08:00", "08:05", "08:07"]);
    expect(upcoming[0]).toMatchObject({
      title: "Piosenka do Wyjaśnienia",
      timestamp: 1791179400,
      endTimestamp: 1791179700,
      gapSec: 300,
    });
  });

  it.each(["empty playlist", "unmatched block"])("falls back and records the program for %s", async (kind) => {
    respond(playlistUrl, { data: kind === "empty playlist" ? [] : [playlist.data[0]] });
    const value = await result();
    expect(value.current).toEqual(fallback());
    expect(value.all[0]).toMatchObject({
      title: "Zapraszamy do Trójki - ranek",
      isBreak: true,
      start: "07:07",
      timestamp: 1791176820,
      endTimestamp: 1791179400,
      gapSec: 2580,
    });
  });

  it.each([
    ["2026-10-05T05:07:00Z", true],
    ["2026-10-05T05:50:00Z", false],
  ])("uses start-inclusive, end-exclusive program intervals at %s", async (now, active) => {
    vi.setSystemTime(new Date(now));
    respond(scheduleUrl, { Trójka: [activeProgram()] });
    respond(playlistUrl, { data: [] });
    expect((await result()).current).toEqual(active ? fallback() : null);
  });

  it("returns no current item when no program is active", async () => {
    respond(scheduleUrl, { Trójka: [] });
    expect(await result()).toMatchObject({ current: null, all: [], observedAt: Date.now() });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([scheduleUrl]);
  });

  it.each([
    ["2026-10-05T05:49:56Z", { artist: "DAWID PODSIADŁO", title: "Na błysk" }],
    ["2026-10-05T05:49:57Z", fallback()],
  ])("handles the last song end +60/+61 seconds at %s", async (now, expected) => {
    vi.setSystemTime(new Date(now));
    expect((await result()).current).toEqual(expected);
  });

  it("does not show a future song as current or history", async () => {
    vi.setSystemTime(new Date("2026-10-05T05:07:00Z"));
    const block = activeBlock();
    block.playlistItems = block.playlistItems.slice(-1);
    respond(playlistUrl, { data: [block] });
    const value = await result();
    expect(value.current).toEqual(fallback());
    expect(value.all.every((item) => item.isBreak)).toBe(true);
  });

  it("does not start a song before its captured fractional second", async () => {
    vi.setSystemTime(new Date("2026-10-05T05:45:07.000Z"));
    const block = activeBlock();
    block.playlistItems = block.playlistItems.slice(-1);
    respond(playlistUrl, { data: [block] });
    expect((await result()).current).toEqual(fallback());
    vi.setSystemTime(new Date("2026-10-05T05:45:07.493Z"));
    expect((await result()).current).toEqual({ artist: "DAWID PODSIADŁO", title: "Na błysk" });
  });

  it("decodes song entities", async () => {
    const block = activeBlock();
    const song = block.playlistItems.at(-1);
    if (!song) throw new Error("Missing song");
    song.artist = "Artist &amp; band";
    song.title = "Song &amp; title";
    respond(playlistUrl, { data: [block] });
    expect((await result()).current).toEqual({ artist: "Artist & band", title: "Song & title" });
  });
});

describe("Trójka caches", () => {
  it("refreshes both sources at 60,000 ms, but not 59,999 ms", async () => {
    await result();
    vi.advanceTimersByTime(59_999);
    await result();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const program = activeProgram();
    program.title = "Updated live program";
    program.endTime += 60;
    respond(scheduleUrl, { Trójka: [program] });
    respond(playlistUrl, { data: [] });
    vi.advanceTimersByTime(1);
    const refreshed = await result();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([scheduleUrl, playlistUrl, scheduleUrl, playlistUrl]);
    expect(refreshed.current).toEqual({
      artist: "Trójka",
      title: "Updated live program",
      isLiveBreak: true,
      contentKind: "programme",
    });
    expect(refreshed.all[0]?.endTimestamp).toBe(program.endTime);
  });

  it.each([
    ["2026-10-05T21:59:59Z", "2026-10-05T22:00:00Z", "2026-10-05", "2026-10-06", "2026-10-06T00:00:00", 1791237600],
    ["2026-01-05T22:59:59Z", "2026-01-05T23:00:00Z", "2026-01-05", "2026-01-06", "2026-01-06T00:00:00", 1767654000],
  ])(
    "refreshes on Warsaw midnight independently of process timezone at %s",
    async (before, after, day, nextDay, local, start) => {
      vi.setSystemTime(new Date(before));
      const program = { ...activeProgram(), startTime: start - 3600, endTime: start + 3600, fullStartTime: local };
      respond(scheduleUrl, { Trójka: [program] });
      respond(`/api/trojka/playlist?date=${day}`, { data: [] });
      await result();
      vi.setSystemTime(new Date(after));
      respond(`/api/trojka/playlist?date=${nextDay}`, { data: [] });
      await result();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        scheduleUrl,
        `/api/trojka/playlist?date=${day}`,
        scheduleUrl,
        `/api/trojka/playlist?date=${nextDay}`,
      ]);
    },
  );

  it("never carries yesterday's playlist into the new day on failure", async () => {
    vi.setSystemTime(new Date("2026-10-05T21:59:59Z"));
    const program = {
      ...activeProgram(),
      startTime: 1791237000,
      endTime: 1791238200,
      fullStartTime: "2026-10-05T23:50:00",
    };
    const block = {
      ...activeBlock(),
      startTime: program.fullStartTime,
      playlistItems: [{ artist: "Yesterday", title: "Old song", startTime: "2026-10-05T23:59:00", duration: 300 }],
    };
    respond(scheduleUrl, { Trójka: [program] });
    respond(playlistUrl, { data: [block] });
    expect((await result()).current?.title).toBe("Old song");
    vi.setSystemTime(new Date("2026-10-05T22:00:00Z"));
    replies.set("/api/trojka/playlist?date=2026-10-06", () => new Response("error", { status: 500 }));
    expect((await result()).current).toEqual(fallback());
  });
});

const failures: [string, () => Response | Promise<Response>][] = [
  ["HTTP 500", () => new Response("error", { status: 500 })],
  ["rejected fetch", () => Promise.reject(new Error("Network failure"))],
  ["invalid JSON", () => new Response("not json")],
  ["missing wrapper", () => new Response(JSON.stringify({ pageProps: { data: [] } }))],
  ["wrong wrapper type", () => new Response(JSON.stringify({ Trójka: {}, data: {} }))],
  ["invalid records", () => new Response(JSON.stringify({ Trójka: [null], data: [null] }))],
];

describe("Trójka failures", () => {
  it.each(failures)("returns null without cached schedule on %s", async (_name, response) => {
    replies.set(scheduleUrl, response);
    expect(await trojka.trojkaProvider.fetch?.(station)).toBeNull();
  });

  it.each(failures)("falls back to an active program on playlist %s", async (_name, response) => {
    replies.set(playlistUrl, response);
    expect((await result()).current).toEqual(fallback());
  });

  it.each(failures)("retains valid same-day data after %s and retries the failed refresh", async (_name, response) => {
    const first = await result();
    vi.advanceTimersByTime(60_000);
    replies.set(scheduleUrl, response);
    replies.set(playlistUrl, response);
    const stale = await result();
    expect(stale.current).toEqual(first.current);
    expect(stale.observedAt).toBe(Date.now() - 60_000);
    respond(scheduleUrl, schedule);
    respond(playlistUrl, { data: [] });
    expect((await result()).current).toEqual(fallback());
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("does not extend cached schedule beyond its emission interval", async () => {
    respond(scheduleUrl, { Trójka: [activeProgram()] });
    await result();
    vi.setSystemTime(new Date("2026-10-05T05:50:00Z"));
    replies.set(scheduleUrl, () => new Response("error", { status: 500 }));
    expect((await result()).current).toBeNull();
  });
});
