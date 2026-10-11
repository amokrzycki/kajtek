import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/consts.js";

vi.mock("../src/ui/elements.js", () => ({ els: {} }));

const storage = new Map<string, string>();
const write = vi.fn((key: string, value: string) => storage.set(key, value));
const custom = { id: "custom_legacy", name: "Legacy Radio", stream: "https://example.test/live" };
const saved = { key: "ts_123", artist: "Artist", title: "Song", timestamp: 123000, stationId: "", stationTag: "" };
const rmf = { id: 101, idname: "legacy-rmf", name: "Legacy RMF" };
const eska = { uid: "legacy-eska", name: "Legacy ESKA", stream_url: "https://example.test/live" };

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  write.mockClear();
  vi.stubGlobal("DOMParser", class {});
  vi.stubGlobal("Audio", class {});
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false, addEventListener: vi.fn() }) });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: write,
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

function store(key: string, value: unknown): void {
  storage.set(key, JSON.stringify(value));
}

describe("custom station decoding", () => {
  it("resolves startup stations when the custom list contains only null", async () => {
    store(STORAGE_KEYS.CUSTOM_STATIONS, [null]);
    const catalog = await import("../src/catalog.js");
    expect(() => catalog.getOrderedStations()).not.toThrow();
    expect(catalog.getCustomStations()).toEqual([]);
  });

  it("filters malformed records without rewriting storage or reordering valid stations", async () => {
    const second = { ...custom, id: "custom_second" };
    store(STORAGE_KEYS.CUSTOM_STATIONS, [null, custom, 42, {}, { ...custom, name: 3 }, second]);
    const catalog = await import("../src/catalog.js");
    expect(catalog.getCustomStations()).toEqual([custom, second]);
    expect(
      catalog
        .getAllKnownStations()
        .filter((station) => station.cat === "custom")
        .map((station) => station.id),
    ).toEqual([custom.id, second.id]);
    expect(write.mock.calls.filter(([key]) => key === STORAGE_KEYS.CUSTOM_STATIONS)).toEqual([]);
  });
});

describe("saved track decoding", () => {
  it("filters malformed elements before favorite consumers and preserves legacy keys and order", async () => {
    const second = { ...saved, key: "station:ts_456", timestamp: 456000 };
    store(STORAGE_KEYS.FAV_TRACKS, [
      null,
      saved,
      {},
      { ...saved, artist: [] },
      { ...saved, timestamp: "bad" },
      { ...saved, timestamp: 1e20 },
      second,
    ]);
    const { state } = await import("../src/state.js");
    const { isTrackFavorited } = await import("../src/ui/favorites.js");
    expect(() => isTrackFavorited({ artist: "Artist", title: "Song", timestamp: 123 })).not.toThrow();
    expect(state.favTracks).toEqual([saved, second]);
    expect(isTrackFavorited({ artist: "Artist", title: "Song", timestamp: 123 })).toBe(true);
    expect(write.mock.calls.filter(([key]) => key === STORAGE_KEYS.FAV_TRACKS)).toEqual([]);
  });
});

describe("catalog cache decoding", () => {
  it("filters malformed records and supplies historical optional defaults before resolution", async () => {
    store(STORAGE_KEYS.RMF_CATALOG_CACHE, {
      fetchedAt: 123,
      stations: [
        null,
        rmf,
        { ...rmf, name: {} },
        { ...rmf, similar_stations: { id_list: [null] } },
        { ...rmf, station_category: [null] },
        {
          ...rmf,
          id: "102",
          idname: "second-rmf",
          short: "Rock",
          description: "Description",
          station_category: [{ name: "rock" }],
        },
      ],
    });
    store(STORAGE_KEYS.ESKA_CATALOG_CACHE, {
      fetchedAt: 456,
      stations: [
        null,
        eska,
        { ...eska, cover: {} },
        { ...eska, sort: "bad" },
        {
          ...eska,
          uid: "second-eska",
          sort: -1,
          stream_ic: "https://example.test/direct",
          dedicated_name: "Dedicated",
        },
      ],
    });
    const catalog = await import("../src/catalog.js");
    expect(() => catalog.getAllKnownStations()).not.toThrow();
    expect(catalog.getStoredRmfCatalog()?.stations.map((station) => station.idname)).toEqual([
      rmf.idname,
      "second-rmf",
    ]);
    expect(catalog.getStoredRmfCatalog()?.stations[0]?.similar_stations.id_list.map(String)).toEqual([]);
    expect(catalog.getStoredEskaCatalog()?.stations.map((station) => station.uid)).toEqual([eska.uid, "second-eska"]);
    expect(catalog.getAllKnownStations().find((station) => station.id === rmf.idname)).toMatchObject({
      name: rmf.name,
      short: "RMF Radio",
      cat: "national",
      stream: "",
    });
    expect(catalog.getAllKnownStations().find((station) => station.id === `eska_${eska.uid}`)).toMatchObject({
      name: eska.name,
      short: eska.name,
      stream: eska.stream_url,
    });
    expect(catalog.getAllKnownStations().find((station) => station.id === "second-rmf")).toMatchObject({
      short: "Rock",
    });
    expect(catalog.getAllKnownStations().find((station) => station.id === "eska_second-eska")).toMatchObject({
      name: "Dedicated",
      stream: "https://example.test/direct",
    });
    expect(
      write.mock.calls.filter(
        ([key]) => key === STORAGE_KEYS.RMF_CATALOG_CACHE || key === STORAGE_KEYS.ESKA_CATALOG_CACHE,
      ),
    ).toEqual([]);
  });

  it("keeps cache envelope compatibility, including unknown version fields", async () => {
    const catalog = await import("../src/catalog.js");
    for (const envelope of [
      null,
      [],
      { stations: [] },
      { fetchedAt: "123", stations: [] },
      { fetchedAt: 123, stations: {} },
    ]) {
      store(STORAGE_KEYS.RMF_CATALOG_CACHE, envelope);
      store(STORAGE_KEYS.ESKA_CATALOG_CACHE, envelope);
      expect(catalog.getStoredRmfCatalog()).toBeNull();
      expect(catalog.getStoredEskaCatalog()).toBeNull();
    }
    store(STORAGE_KEYS.RMF_CATALOG_CACHE, { version: 999, fetchedAt: 123, stations: [rmf] });
    store(STORAGE_KEYS.ESKA_CATALOG_CACHE, { version: 999, fetchedAt: 456, stations: [eska] });
    expect(catalog.getStoredRmfCatalog()?.fetchedAt).toBe(123);
    expect(catalog.getStoredEskaCatalog()?.fetchedAt).toBe(456);
  });
});

describe("persistence fallbacks", () => {
  it("validates feature records from the existing session fallback after denied writes", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const { setStoredJSON } = await import("../src/utils.js");
    setStoredJSON(STORAGE_KEYS.CUSTOM_STATIONS, [null, custom]);
    setStoredJSON(STORAGE_KEYS.FAV_TRACKS, [null, saved]);
    setStoredJSON(STORAGE_KEYS.RMF_CATALOG_CACHE, { fetchedAt: 123, stations: [null, rmf] });
    setStoredJSON(STORAGE_KEYS.ESKA_CATALOG_CACHE, { fetchedAt: 456, stations: [null, eska] });
    const catalog = await import("../src/catalog.js");
    const { state } = await import("../src/state.js");
    expect(catalog.getCustomStations()).toEqual([custom]);
    expect(state.favTracks).toEqual([saved]);
    expect(catalog.getStoredRmfCatalog()?.stations).toHaveLength(1);
    expect(catalog.getStoredEskaCatalog()?.stations).toHaveLength(1);
    expect(() => catalog.getOrderedStations()).not.toThrow();
  });

  it.each(["corrupt JSON", "storage denial", "wrong outer shape"])("retains feature fallbacks for %s", async (mode) => {
    for (const key of [
      STORAGE_KEYS.CUSTOM_STATIONS,
      STORAGE_KEYS.FAV_TRACKS,
      STORAGE_KEYS.RMF_CATALOG_CACHE,
      STORAGE_KEYS.ESKA_CATALOG_CACHE,
    ]) {
      storage.set(key, mode === "wrong outer shape" ? "42" : "{");
    }
    if (mode === "storage denial")
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: write,
      });
    const catalog = await import("../src/catalog.js");
    const { state } = await import("../src/state.js");
    expect(catalog.getCustomStations()).toEqual([]);
    expect(state.favTracks).toEqual([]);
    expect(catalog.getStoredRmfCatalog()).toBeNull();
    expect(catalog.getStoredEskaCatalog()).toBeNull();
    expect(() => catalog.getOrderedStations()).not.toThrow();
  });
});
