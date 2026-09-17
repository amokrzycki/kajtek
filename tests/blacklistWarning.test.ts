import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, Station } from "../src/types.js";

const origin: Station = {
  id: "origin",
  name: "Origin",
  short: "ORG",
  cat: "test",
  provider: "generic",
  stream: "https://example.test/origin.mp3",
};

const candidate: Station = {
  ...origin,
  id: "candidate",
  name: "Candidate",
  stream: "https://example.test/candidate.mp3",
};

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
    adSkipEnabled: true,
    adSkipAutoReturnEnabled: true,
  }),
);

const mocks = vi.hoisted(() => ({
  notifyState: vi.fn(),
  selectStation: vi.fn(),
}));

vi.mock("../src/blacklist.js", () => ({ isBlacklisted: vi.fn(() => false) }));
vi.mock("../src/catalog.js", () => ({
  getOrderedStations: vi.fn(() => [candidate]),
  getStoredRmfCatalog: vi.fn(() => null),
}));
vi.mock("../src/player.js", () => ({ fetchPlaylist: vi.fn(), selectStation: mocks.selectStation }));
vi.mock("../src/state.js", () => ({ notifyState: mocks.notifyState, state }));
vi.mock("../src/utils.js", () => ({
  getTrackKey: vi.fn((track: { title: string }) => track.title),
  withinRateLimit: vi.fn(() => ({ limited: false, timestamps: [] })),
}));

type BlacklistWarningModule = typeof import("../src/blacklistWarning.js");
let blacklistWarning: BlacklistWarningModule;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
  vi.clearAllMocks();
  vi.resetModules();
  state.station = origin;
  state.playing = true;
  state.liveTrack = { artist: origin.name, title: "Przerwa / Reklamy", isLiveBreak: true };
  state.history = [];
  state.showHistory = false;
  blacklistWarning = await import("../src/blacklistWarning.js");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("blacklist warning automation", () => {
  it("cancels a pending switch when playback is paused", async () => {
    blacklistWarning.detectUpcomingAdBreak();
    await Promise.resolve();
    await Promise.resolve();
    expect(blacklistWarning.getBlacklistWarningState()?.phase).toBe("warning");

    state.playing = false;
    await vi.advanceTimersByTimeAsync(6_000);

    expect(mocks.selectStation).not.toHaveBeenCalled();
    expect(blacklistWarning.getBlacklistWarningState()).toBeNull();
  });

  it("allows a repeated timestamp-free break after intervening playback", async () => {
    blacklistWarning.detectUpcomingAdBreak();
    await Promise.resolve();
    await Promise.resolve();
    blacklistWarning.dismissBlacklistWarning();

    blacklistWarning.detectUpcomingAdBreak();
    await Promise.resolve();
    expect(blacklistWarning.getBlacklistWarningState()).toBeNull();

    state.liveTrack = { artist: "Artist", title: "Song" };
    blacklistWarning.detectUpcomingAdBreak();
    state.liveTrack = { artist: origin.name, title: "Przerwa / Reklamy", isLiveBreak: true };
    blacklistWarning.detectUpcomingAdBreak();
    await Promise.resolve();
    await Promise.resolve();

    expect(blacklistWarning.getBlacklistWarningState()?.phase).toBe("warning");
  });
});
