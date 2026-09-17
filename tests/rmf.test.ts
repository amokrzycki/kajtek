import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmfProvider } from "../src/providers/rmf.js";
import { getFactsInfo } from "../src/providers.js";
import type { RawTrack, Station } from "../src/types.js";
import capturedPlaylist from "./fixtures/rmf/playlist.json";

vi.mock("../src/utils.js", () => ({
  decodeEntities: (value?: string | null) => value?.replaceAll("&amp;", "&") ?? "",
  getFactsLabel: (hour: string) => `Serwis informacyjny (~${hour})`,
}));

const station: Station = {
  id: "rmf",
  name: "RMF FM",
  short: "RMF",
  cat: "rmf",
  provider: "rmf",
  stream: "https://example.test/rmf.mp3",
};

const noFactsStation = { ...station, id: "rmf-classic", name: "RMF Classic" };

function warsawSec(hour: number, minute: number, second = 0): number {
  const time = [hour, minute, second].map((part) => String(part).padStart(2, "0")).join(":");
  return Math.floor(new Date(`2026-09-17T${time}+02:00`).getTime() / 1000);
}

function capturedInLocalTime(): RawTrack[] {
  return capturedPlaylist.map((track) => ({
    ...track,
    timestamp: Math.floor(new Date(`2026-09-17T${track.start}+02:00`).getTime() / 1000),
  }));
}

function gapPlaylist(gapSec: number, endHour = 12, endMinute = 30): RawTrack[] {
  const end = warsawSec(endHour, endMinute);
  return [
    { order: -1, author: "Before", title: "Song A", timestamp: end - 180, length: 180, start: "12:27" },
    { order: 0, author: "After", title: "Song B", timestamp: end + gapSec, lenght: "180", start: "12:30" },
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rmfProvider", () => {
  it("uses the captured top-of-hour gap as Fakty and resolves the following song", () => {
    vi.setSystemTime(new Date("2026-09-17T15:01:40Z"));

    const result = rmfProvider.parse(capturedInLocalTime(), station);

    expect(result?.current).toMatchObject({ artist: "ATB", title: "You're Not Alone" });
    expect(result?.all.find((track) => track.isBreak)).toMatchObject({
      gapSec: 241,
      label: "Serwis informacyjny (~17:00)",
    });
  });

  it.each([
    [119, false],
    [120, true],
  ])("characterizes the general break boundary at %i seconds", (gapSec, isBreak) => {
    vi.setSystemTime(new Date((warsawSec(12, 30) + gapSec + 1) * 1000));
    const result = rmfProvider.parse(gapPlaylist(gapSec), noFactsStation);

    expect(result?.all.some((track) => track.isBreak && !track.isPredicted)).toBe(isBreak);
    expect(result?.all[0]?.length).toBe(isBreak ? 180 : 180 + gapSec);
  });

  it.each([
    [59, false],
    [60, true],
  ])("characterizes the Fakty break boundary at %i seconds", (gapSec, isBreak) => {
    vi.setSystemTime(new Date((warsawSec(5, 59) + gapSec + 1) * 1000));
    const result = rmfProvider.parse(gapPlaylist(gapSec, 5, 59), station);

    expect(result?.all.some((track) => track.isBreak && !track.isPredicted)).toBe(isBreak);
    if (isBreak) expect(result?.all.find((track) => track.isBreak)?.label).toBe("Serwis informacyjny (~06:00)");
  });

  it("characterizes Fakty clock boundaries", () => {
    expect(getFactsInfo(station, warsawSec(5, 54))).toEqual({ isFacts: false, targetHourStr: "" });
    expect(getFactsInfo(station, warsawSec(5, 55))).toEqual({ isFacts: true, targetHourStr: "06:00" });
    expect(getFactsInfo(station, warsawSec(6, 0))).toEqual({ isFacts: true, targetHourStr: "06:00" });
    expect(getFactsInfo(station, warsawSec(23, 3))).toEqual({ isFacts: true, targetHourStr: "23:00" });
    expect(getFactsInfo(station, warsawSec(23, 55))).toEqual({ isFacts: false, targetHourStr: "00:00" });
    expect(getFactsInfo(station, warsawSec(0, 3))).toEqual({ isFacts: false, targetHourStr: "00:00" });
  });

  it("resolves current song, real break, and predicted break through public parse", () => {
    const data = gapPlaylist(120);
    const gapStart = warsawSec(12, 30);

    vi.setSystemTime(new Date((gapStart - 1) * 1000));
    expect(rmfProvider.parse(data, noFactsStation)?.current?.title).toBe("Song A");

    vi.setSystemTime(new Date(gapStart * 1000));
    expect(rmfProvider.parse(data, noFactsStation)?.current).toMatchObject({
      title: "Przerwa / Reklamy",
      isLiveBreak: true,
    });

    const lone: RawTrack[] = [{ order: 0, artist: "Solo", title: "Last song", timestamp: gapStart, length: 180 }];
    vi.setSystemTime(new Date((gapStart + 179) * 1000));
    const playing = rmfProvider.parse(lone, noFactsStation);
    expect(playing?.current?.title).toBe("Last song");
    expect(playing?.all.at(-1)).toMatchObject({ isBreak: true, isPredicted: true, timestamp: gapStart + 180 });

    vi.setSystemTime(new Date((gapStart + 180) * 1000));
    expect(rmfProvider.parse(lone, noFactsStation)?.current?.isLiveBreak).toBe(true);
  });

  it("accepts length and lenght, sorts a copy, and preserves the input", () => {
    const data: RawTrack[] = [
      { order: 1, author: "B", title: "Second", timestamp: warsawSec(12, 4), lenght: "60" },
      { order: 0, artist: "A &amp; B", title: "First", timestamp: warsawSec(12, 0), length: 120 },
    ];
    const before = structuredClone(data);
    vi.setSystemTime(new Date(warsawSec(12, 0, 30) * 1000));

    const result = rmfProvider.parse(data, noFactsStation);

    expect(data).toEqual(before);
    expect(result?.all.filter((track) => !track.isBreak).map((track) => [track.order, track.length])).toEqual([
      [0, 120],
      [1, 60],
    ]);
    expect(result?.current?.artist).toBe("A & B");
    expect(rmfProvider.parse([], station)).toBeNull();
    expect(rmfProvider.parse({}, station)).toBeNull();
  });
});
