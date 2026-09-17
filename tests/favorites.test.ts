import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, FavTrack, Station, TrackInfo } from "../src/types.js";

const state = vi.hoisted(
  (): AppState => ({
    dark: false,
    case: "red",
    station: null,
    playing: false,
    vol: 10,
    muted: false,
    favs: new Set<string>(),
    sleepMin: null,
    sleepSec: null,
    liveTrack: null,
    history: [],
    showHistory: false,
    historyTab: "program",
    favTracks: [],
    viewMode: "list",
    version: "test",
    blacklistEnabled: true,
    adSkipEnabled: false,
    adSkipAutoReturnEnabled: true,
  }),
);

vi.mock("../src/state.js", () => ({
  notifyState: vi.fn(),
  persistFavTracks: vi.fn(),
  state,
}));
vi.mock("../src/ui/elements.js", () => ({ els: {} }));
vi.mock("../src/utils.js", () => ({
  escapeHtml: vi.fn((value: string) => value),
  formatFavDateTime: vi.fn(() => ""),
  getTrackKey: vi.fn((track: TrackInfo) => `ts_${track.timestamp}`),
}));

import { isTrackFavorited, toggleFavTrack } from "../src/ui/favorites.js";

const track: TrackInfo = { artist: "Artist", title: "Song", timestamp: 123 };
const stationA: Station = {
  id: "a",
  name: "A",
  short: "A",
  cat: "test",
  provider: "generic",
  stream: "https://example.test/a.mp3",
};
const stationB: Station = { ...stationA, id: "b", name: "B", short: "B" };

beforeEach(() => {
  state.station = stationA;
  state.favTracks = [];
});

describe("favorite track identity", () => {
  it("keeps equal timestamps from different stations as separate favorites", () => {
    toggleFavTrack(track, stationA);
    toggleFavTrack(track, stationB);

    expect(state.favTracks.map((favorite) => favorite.key).sort()).toEqual(["a:ts_123", "b:ts_123"]);
  });

  it("recognizes legacy keys only for their stored station", () => {
    const legacy: FavTrack = {
      key: "ts_123",
      timestamp: 123_000,
      artist: track.artist,
      title: track.title,
      stationTag: stationA.name,
      stationId: stationA.id,
    };
    state.favTracks = [legacy];

    expect(isTrackFavorited(track)).toBe(true);
    state.station = stationB;
    expect(isTrackFavorited(track)).toBe(false);
  });
});
