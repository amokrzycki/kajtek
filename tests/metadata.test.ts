import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMetadata } from "../src/metadata.js";
import { eskaProvider, readZprTag, startEskaSession } from "../src/providers/eska.js";
import type { Station } from "../src/types.js";

vi.mock("../src/utils.js", () => ({
  decodeEntities: (value?: string) => value ?? "",
  getFactsLabel: (hour: string) => hour,
}));
const station: Station = {
  id: "eska",
  name: "ESKA",
  provider: "eska",
  short: "E",
  cat: "test",
  stream: "https://example.test/audio",
  apiBaseUrl: "/api/eska",
  _consecutiveFailures: 99,
  _apiFailed: true,
  _currentStreamIndex: 1,
  _streams: ["one", "two"],
};
const fetchMock = vi.fn<typeof fetch>();
const rest = (title: string | null) =>
  new Response(
    JSON.stringify({ current: title === null ? null : { artists: ["Artist"], name: title }, pasts: [], futures: [] }),
  );
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  startEskaSession(station.id);
});
afterEach(() => vi.unstubAllGlobals());

describe("passive provider isolation", () => {
  it("shares simultaneous passive transport without cancelling the other consumer", async () => {
    let finish: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const first = fetchMetadata(station, { passive: true, signal: controller.signal });
    const second = fetchMetadata(station, { passive: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    finish(rest("Shared"));
    expect((await second)?.current?.title).toBe("Shared");
  });
  it.each(["network", "HTTP", "parse"])("does not mutate any station fields after %s failure", async (failure) => {
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("offline"));
    if (failure === "HTTP") fetchMock.mockResolvedValueOnce(new Response("offline", { status: 503 }));
    if (failure === "parse") fetchMock.mockResolvedValueOnce(new Response("{invalid"));
    const before = structuredClone(station);
    await fetchMetadata(station, { passive: true }).catch(() => null);
    expect(station).toEqual(before);
  });
  it("ignores playback-health gating without clearing failures on success", async () => {
    fetchMock.mockResolvedValueOnce(rest("Song"));
    const before = structuredClone(station);
    expect((await fetchMetadata(station, { passive: true }))?.current?.title).toBe("Song");
    expect(station).toEqual(before);
  });
  it("ignores ZPR in passive requests and keeps REST null honest", async () => {
    readZprTag(
      {
        tagList: [["EXT-X-ZPR", JSON.stringify({ data: { title: "REKLAMA", timeout: 30_000 }, duration: 1_000 })]],
        programDateTime: Date.now(),
      },
      station.id,
    );
    fetchMock.mockResolvedValueOnce(rest(null)).mockResolvedValueOnce(rest("Song"));
    expect(await fetchMetadata(station, { passive: true })).toEqual({ current: null, all: [] });
    expect((await fetchMetadata(station))?.current).toMatchObject({
      contentKind: "advertisement",
      contentEvidence: "explicit",
    });
  });
  it("returns the available ESKA REST playlist without creating session history", async () => {
    const target = { ...station, id: "eska-rest-playlist" };
    startEskaSession(target.id);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          current: { artists: ["Current"], name: "Now" },
          pasts: [{ artists: ["Past"], name: "Before" }],
          futures: [{ artists: ["Next"], name: "After" }],
        }),
      ),
    );
    const result = await fetchMetadata(target, { passive: true });
    expect(result?.all.map((track) => [track.artist, track.title, track.order])).toEqual([
      ["Past", "Before", -1],
      ["Current", "Now", 0],
      ["Next", "After", 1],
    ]);
    fetchMock.mockResolvedValueOnce(rest("Active"));
    expect((await eskaProvider.fetch?.(target))?.all.map((track) => track.title)).toEqual(["Active"]);
  });
  it("does not insert passively observed songs into the active ESKA session history", async () => {
    fetchMock.mockResolvedValueOnce(rest("A")).mockResolvedValueOnce(rest("Passive")).mockResolvedValueOnce(rest("B"));
    await eskaProvider.fetch?.(station);
    await fetchMetadata(station, { passive: true });
    expect((await eskaProvider.fetch?.(station))?.all.map((track) => track.title)).toEqual(["A", "B"]);
  });
  it("propagates cancellation to transport and rejects obsolete results", async () => {
    const controller = new AbortController();
    let resolve: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const request = fetchMetadata(station, { passive: true, signal: controller.signal });
    const transportSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    controller.abort();
    resolve(rest("Late"));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(transportSignal?.aborted).toBe(true);
  });
});
