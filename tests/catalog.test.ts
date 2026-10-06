import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ENDPOINTS, STORAGE_KEYS } from "../src/consts.js";
import eskaCatalog from "./fixtures/eska/catalog-stations.json";
import rmfCatalog from "./fixtures/rmf/catalog-stations.json";

const stored = vi.hoisted(() => new Map<string, unknown>());

vi.mock("../src/state.js", () => ({ state: { favs: new Set<string>() } }));
vi.mock("../src/utils.js", () => ({
  capitalizeFirstLetter: (value: string) => value.charAt(0).toUpperCase() + value.slice(1),
  getStoredJSON: vi.fn(<T>(key: string, fallback: T) => (stored.has(key) ? stored.get(key) : fallback) as T),
  resolveProtocolRelativeUrl: (url: string, base: string) => {
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `${base}${url}`;
    return url;
  },
  setStoredJSON: vi.fn((key: string, value: unknown) => stored.set(key, value)),
}));

import { fetchEskaCatalog, fetchRmfCatalog, getAllKnownStations } from "../src/catalog.js";
import { getStoredJSON, setStoredJSON } from "../src/utils.js";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

beforeEach(() => {
  stored.clear();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("ESKA catalog", () => {
  it("filters invalid records and preserves station identity, stream priority, and provider mapping", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(eskaCatalog));

    const cache = await fetchEskaCatalog();
    const catalogIds = new Set(cache.stations.map((station) => `eska_${station.uid}`));
    const stations = getAllKnownStations().filter((station) => catalogIds.has(station.id));

    expect(cache.stations).toHaveLength(3);
    expect(cache.stations.find((station) => station.uid === "ra-fallback-name")?.name).toBe("Stacja ESKA");
    expect(stations.map((station) => station.id)).toEqual([
      "eska_ra-regional-katowice",
      "eska_ra-regional-silesia",
      "eska_ra-fallback-name",
    ]);
    expect(stations[0]).toMatchObject({
      name: "ESKA Katowice",
      provider: "eska",
      stream: "https://example.test/2220-katowice.aac",
      _streams: ["https://example.test/2220-katowice.aac", "https://example.test/2220-katowice/playlist.m3u8"],
      apiBaseUrl: `${API_ENDPOINTS.ESKA_NOW_PLAYING_BASE}/2220`,
    });
    expect(stations[1]?.apiBaseUrl).toBe(stations[0]?.apiBaseUrl);
    expect(stations[2]).toMatchObject({
      name: "Stacja ESKA",
      stream: "https://example.test/9999/playlist.m3u8",
      apiBaseUrl: `${API_ENDPOINTS.ESKA_NOW_PLAYING_BASE}/9999`,
    });
    expect(stations[2]?._streams).toBeUndefined();
  });
});

describe("RMF catalog", () => {
  it.each([
    ["non-2xx", () => Promise.resolve(new Response("error", { status: 502 })), rmfCatalog],
    ["network failure", () => Promise.reject(new Error("offline")), { contents: rmfCatalog }],
  ])("tries the local proxy before remote after %s", async (_label, localResult, remotePayload) => {
    fetchMock.mockImplementationOnce(localResult).mockResolvedValueOnce(jsonResponse(remotePayload));

    const cache = await fetchRmfCatalog();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      API_ENDPOINTS.RMF_CATALOG_LOCAL,
      API_ENDPOINTS.RMF_CATALOG_REMOTE,
    ]);
    expect(cache.stations).toHaveLength(2);
  });

  it("supports a raw array, normalizes covers and similar IDs, and omits built-in duplicates", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(rmfCatalog));

    const cache = await fetchRmfCatalog();
    const rock = cache.stations.find((station) => station.idname === "rmf-rock");
    const known = getAllKnownStations();

    expect(rock).toMatchObject({
      short: "Mocne granie",
      img: `${API_ENDPOINTS.RMF_STATIC_BASE}/portal/stations/covers/rmf-rock.jpg`,
      similar_stations: { id_list: [5, 102] },
    });
    expect(known.filter((station) => station.id === "rmf")).toHaveLength(1);
    expect(known.find((station) => station.id === "rmf-rock")).toMatchObject({
      provider: "rmf",
      stream: "https://rs202-krk.rmfstream.pl/rmf_rock",
      apiBaseUrl: "/api/rmf/stations/101",
    });
  });
});

describe("independent Smart station pool", () => {
  it("initializes a large pool with one preferences read and one write, then reads without rewriting", async () => {
    stored.set(
      STORAGE_KEYS.CUSTOM_STATIONS,
      Array.from({ length: 1000 }, (_, index) => ({
        id: `custom_${index}`,
        name: `Custom ${index}`,
        stream: `https://example.test/${index}`,
      })),
    );
    const catalog = await import("../src/catalog.js");
    const pool = catalog.getSmartStations();
    expect(pool.filter((station) => station.id.startsWith("custom_"))).toHaveLength(1000);
    expect(vi.mocked(getStoredJSON).mock.calls.filter(([key]) => key === STORAGE_KEYS.STATION_PREFS)).toHaveLength(1);
    expect(vi.mocked(setStoredJSON).mock.calls.filter(([key]) => key === STORAGE_KEYS.STATION_PREFS)).toHaveLength(1);
    vi.clearAllMocks();
    expect(catalog.getSmartStations().map((station) => station.id)).toEqual(pool.map((station) => station.id));
    expect(vi.mocked(getStoredJSON).mock.calls.filter(([key]) => key === STORAGE_KEYS.STATION_PREFS)).toHaveLength(1);
    expect(vi.mocked(setStoredJSON).mock.calls).toHaveLength(0);
  });

  it("reads enabled stations in one preferences pass while keeping Smart choices independent", async () => {
    stored.set(STORAGE_KEYS.STATION_PREFS, {
      rmf: { id: "rmf", enabled: false, favorite: false, smartEnabled: true },
      maxxx: { id: "maxxx", enabled: true, favorite: false, smartEnabled: false },
    });
    const catalog = await import("../src/catalog.js");
    const enabled = catalog.getEnabledStations();
    expect(enabled.some((station) => station.id === "rmf")).toBe(false);
    expect(enabled.some((station) => station.id === "maxxx")).toBe(true);
    expect(vi.mocked(getStoredJSON).mock.calls.filter(([key]) => key === STORAGE_KEYS.STATION_PREFS)).toHaveLength(1);
  });

  it.each([null, [], 42, { broken: null }])("ignores malformed saved station preferences: %j", async (prefs) => {
    stored.set(STORAGE_KEYS.STATION_PREFS, prefs);
    const catalog = await import("../src/catalog.js");
    expect(catalog.getSmartStations().some((station) => station.id === "rmf")).toBe(true);
    expect(catalog.getStationPrefs().broken).toBeUndefined();
  });

  it("initializes old preferences from enabled state and preserves explicit pool choices", async () => {
    stored.set("kajtek_station_prefs", {
      rmf: { id: "rmf", enabled: true, favorite: false },
      maxxx: { id: "maxxx", enabled: false, favorite: false },
    });
    const catalog = await import("../src/catalog.js");
    expect(catalog.isStationSmartEnabled("rmf")).toBe(true);
    expect(catalog.isStationSmartEnabled("maxxx")).toBe(false);
    catalog.setStationSmartEnabled("rmf", false);
    catalog.setStationEnabled("rmf", false);
    catalog.setStationFavorite("rmf", true);
    expect(catalog.isStationSmartEnabled("rmf")).toBe(false);
    catalog.setStationSmartEnabled("maxxx", true);
    catalog.setStationEnabled("maxxx", false);
    expect(catalog.isStationSmartEnabled("maxxx")).toBe(true);
    expect(catalog.getStationPrefs().rmf?.smartEnabled).toBe(false);
  });
  it("freezes the initial choice before ordinary catalog edits", async () => {
    const catalog = await import("../src/catalog.js");
    catalog.setStationEnabled("rmf", false);
    expect(catalog.isStationSmartEnabled("rmf")).toBe(true);
    catalog.setStationFavorite("custom_later", true);
    expect(catalog.isStationSmartEnabled("custom_later")).toBe(false);
  });
});
