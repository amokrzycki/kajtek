import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ENDPOINTS } from "../src/consts.js";
import eskaCatalog from "./fixtures/eska/catalog-stations.json";
import rmfCatalog from "./fixtures/rmf/catalog-stations.json";

const stored = vi.hoisted(() => new Map<string, unknown>());

vi.mock("../src/state.js", () => ({ state: { favs: new Set<string>() } }));
vi.mock("../src/utils.js", () => ({
  capitalizeFirstLetter: (value: string) => value.charAt(0).toUpperCase() + value.slice(1),
  getStoredJSON: <T>(key: string, fallback: T) => (stored.has(key) ? stored.get(key) : fallback) as T,
  resolveProtocolRelativeUrl: (url: string, base: string) => {
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `${base}${url}`;
    return url;
  },
  setStoredJSON: (key: string, value: unknown) => stored.set(key, value),
}));

import { fetchEskaCatalog, fetchRmfCatalog, getAllKnownStations } from "../src/catalog.js";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

beforeEach(() => {
  stored.clear();
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
