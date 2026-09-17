import { describe, expect, it, vi } from "vitest";
import { eskaProvider } from "../src/providers/eska.js";
import { rmfProvider } from "../src/providers/rmf.js";
import { trojkaProvider } from "../src/providers/trojka.js";
import { genericProvider, getProvider } from "../src/providers.js";
import type { Station } from "../src/types.js";

vi.mock("../src/utils.js", () => ({
  decodeEntities: (value?: string | null) => value?.replaceAll("&amp;", "&") ?? "",
  getFactsLabel: (hour: string) => `Serwis informacyjny (~${hour})`,
}));

function station(provider: string, apiBaseUrl?: string): Station {
  return {
    id: provider || "custom",
    name: "Test Radio",
    short: "TEST",
    cat: "test",
    provider,
    stream: "https://example.test/radio.mp3",
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
  };
}

describe("getProvider", () => {
  it.each([
    ["rmf", rmfProvider],
    ["eska", eskaProvider],
    ["trojka", trojkaProvider],
    ["generic", genericProvider],
  ])("honors explicit %s selection", (name, expected) => {
    expect(getProvider(station(name, "/api/not-rmf"))).toBe(expected);
  });

  it("keeps the legacy RMF URL fallback and otherwise uses generic", () => {
    expect(getProvider(station("legacy", "/api/rmf/stations/5"))).toBe(rmfProvider);
    expect(getProvider(station("unknown", "/api/custom"))).toBe(genericProvider);
    expect(getProvider()).toBe(genericProvider);
  });
});

describe("genericProvider", () => {
  it.each([
    [[{ artist: "Artist", title: "Title", length: 12 }], "Artist", "Title", 12],
    [{ tracks: [{ author: "Author", song: "Song", lenght: "34" }] }, "Author", "Song", 34],
    [{ playlist: [{ name: "Name", title: "Track" }] }, "Name", "Track", undefined],
    [{ title: "Single" }, "Test Radio", "Single", undefined],
  ])("maps important payload and field aliases", (payload, artist, title, length) => {
    const result = genericProvider.parse(payload, station("generic"));

    expect(result?.current).toEqual({ artist, title });
    expect(result?.all[0]).toMatchObject({ artist, title });
    expect(result?.all[0]?.length).toBe(length);
  });

  it("rejects empty payloads", () => {
    expect(genericProvider.parse(null)).toBeNull();
    expect(genericProvider.parse([])).toBeNull();
    expect(genericProvider.parse({ tracks: [] })).toBeNull();
  });
});
