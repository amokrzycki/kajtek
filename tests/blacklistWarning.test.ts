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
  isBlacklisted: vi.fn(() => false),
  notifyState: vi.fn(),
  selectStation: vi.fn(),
  fetchPlaylist: vi.fn(),
  limited: false,
}));

vi.mock("../src/blacklist.js", () => ({ isBlacklisted: mocks.isBlacklisted }));
vi.mock("../src/catalog.js", () => ({
  getOrderedStations: vi.fn(() => [candidate]),
  getStoredRmfCatalog: vi.fn(() => null),
}));
vi.mock("../src/player.js", () => ({ fetchPlaylist: mocks.fetchPlaylist, selectStation: mocks.selectStation }));
vi.mock("../src/state.js", () => ({ notifyState: mocks.notifyState, state }));
vi.mock("../src/utils.js", () => ({
  getTrackKey: vi.fn((track: { title: string }) => track.title),
  withinRateLimit: vi.fn(() => ({ limited: mocks.limited, timestamps: [] })),
}));

type BlacklistWarningModule = typeof import("../src/blacklistWarning.js");
let blacklistWarning: BlacklistWarningModule;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
  vi.clearAllMocks();
  vi.resetModules();
  mocks.isBlacklisted.mockReturnValue(false);
  mocks.limited = false;
  mocks.fetchPlaylist.mockResolvedValue({ current: { artist: "A", title: "Song" }, all: [] });
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

describe("protective route instrumentation", () => {
  it("marks countdown switches as automatic and forwards only available explicit ad timing", async () => {
    state.liveTrack = {
      artist: origin.name,
      title: "Przerwa / Reklamy",
      isLiveBreak: true,
      adEndsAt: Date.now() + 30_000,
    };
    blacklistWarning.detectUpcomingAdBreak();
    await vi.advanceTimersByTimeAsync(6000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
    expect(mocks.selectStation.mock.calls[0]?.[1]).toMatchObject({
      kind: "adSkip",
      automatic: true,
      adEndsAt: Date.now() + 24_000,
    });
    blacklistWarning.switchBlacklistCandidateNow();
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
  });

  it("marks switch-now blacklist protection as manual and never sends fabricated ad timing", async () => {
    mocks.isBlacklisted.mockReturnValue(true);
    state.liveTrack = { artist: "Blocked", title: "Song" };
    blacklistWarning.detectBlacklistedUpcoming();
    await vi.advanceTimersByTimeAsync(0);
    blacklistWarning.switchBlacklistCandidateNow();
    expect(mocks.selectStation.mock.calls[0]?.[1]).toMatchObject({ kind: "blacklist", automatic: false });
    expect(mocks.selectStation.mock.calls[0]?.[1]).not.toHaveProperty("adEndsAt");
  });

  it("never starts a statistics route for a dismissed warning", async () => {
    blacklistWarning.detectUpcomingAdBreak();
    await vi.advanceTimersByTimeAsync(0);
    blacklistWarning.dismissBlacklistWarning();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.selectStation).not.toHaveBeenCalled();
  });
});

describe("saved-ad window forwarded to statistics", () => {
  const routeOf = () => mocks.selectStation.mock.calls[0]?.[1];
  const nowSec = () => Math.floor(Date.now() / 1000);

  it("forwards a scheduled RMF break's start and end for an upcoming break", async () => {
    const now = nowSec();
    state.liveTrack = { artist: "Artist", title: "Song", timestamp: now - 100 };
    state.history = [
      { artist: "", title: "", isBreak: true, label: DEFAULT_BREAK, timestamp: now + 6, endTimestamp: now + 66 },
    ];
    blacklistWarning.detectUpcomingAdBreak();
    await settle();
    await vi.advanceTimersByTimeAsync(7_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
    expect(routeOf()).toMatchObject({
      kind: "adSkip",
      automatic: true,
      adStartsAt: (now + 6) * 1000,
      adEndsAt: (now + 66) * 1000,
    });
  });

  it("resolves a live RMF break's deadline from the matching history item, for manual and automatic switches", async () => {
    const now = nowSec();
    state.history = [
      { artist: "", title: "", isBreak: true, label: DEFAULT_BREAK, timestamp: now - 20, endTimestamp: now + 100 },
    ];
    blacklistWarning.detectUpcomingAdBreak();
    await settle();
    blacklistWarning.switchBlacklistCandidateNow();
    expect(routeOf()).toMatchObject({
      automatic: false,
      adStartsAt: (now - 20) * 1000,
      adEndsAt: (now + 100) * 1000,
    });
    await vi.advanceTimersByTimeAsync(100_000);
    // auto-return fires at the very same deadline the statistics received
    expect(mocks.selectStation).toHaveBeenCalledTimes(2);
  });

  it("forwards only the end for ESKA's explicit ad timing", async () => {
    await startAdSwitch(Date.now() + 30_000);
    expect(routeOf()).toMatchObject({ adEndsAt: Date.now() + 30_000 });
    expect(routeOf()).not.toHaveProperty("adStartsAt");
  });

  it("forwards no window for a predicted or unknown-length break, the news label, or a blacklist route", async () => {
    const now = nowSec();
    state.history = [
      { artist: "", title: "", isBreak: true, isPredicted: true, label: DEFAULT_BREAK, timestamp: now - 5 },
    ];
    await startAdSwitch();
    expect(routeOf()).not.toHaveProperty("adEndsAt");
    expect(routeOf()).not.toHaveProperty("adStartsAt");

    vi.clearAllMocks();
    blacklistWarning.resetBlacklistWarningState();
    state.history = [
      {
        artist: "",
        title: "",
        isBreak: true,
        label: "Serwis informacyjny (~12:00)",
        timestamp: now - 20,
        endTimestamp: now + 100,
      },
    ];
    await startAdSwitch();
    expect(routeOf()).not.toHaveProperty("adEndsAt");

    vi.clearAllMocks();
    blacklistWarning.resetBlacklistWarningState();
    mocks.isBlacklisted.mockReturnValue(true);
    state.liveTrack = { artist: "Blocked", title: "Song" };
    state.history = [
      { artist: "", title: "", isBreak: true, label: DEFAULT_BREAK, timestamp: now - 20, endTimestamp: now + 100 },
    ];
    blacklistWarning.detectBlacklistedUpcoming();
    await settle();
    blacklistWarning.switchBlacklistCandidateNow();
    expect(routeOf()).toMatchObject({ kind: "blacklist" });
    expect(routeOf()).not.toHaveProperty("adEndsAt");
  });
});

const AD_TITLE = "Przerwa / Reklamy";
const DEFAULT_BREAK = AD_TITLE;
const settle = () => vi.advanceTimersByTimeAsync(0);

async function startAdSwitch(adEndsAt?: number) {
  state.liveTrack = {
    artist: origin.name,
    title: AD_TITLE,
    isLiveBreak: true,
    ...(adEndsAt === undefined ? {} : { adEndsAt }),
  };
  blacklistWarning.detectUpcomingAdBreak();
  await settle();
  blacklistWarning.switchBlacklistCandidateNow();
  expect(mocks.selectStation).toHaveBeenCalledTimes(1);
}

describe("manual ad switch and auto-return", () => {
  it("keeps the switch when the origin API reports no break, until the known ad end", async () => {
    await startAdSwitch(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(2);
    expect(mocks.selectStation.mock.calls[1]?.[0]).toBe(origin);
  });

  it("counts down to the known ad end instead of the 3 minute fallback", async () => {
    await startAdSwitch(Date.now() + 45_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(blacklistWarning.getBlacklistWarningState()?.secondsLeft).toBe(44);
  });

  it("falls back to 3 minutes only when no ad length is known", async () => {
    mocks.fetchPlaylist.mockResolvedValue({ current: { artist: origin.name, title: AD_TITLE, isLiveBreak: true } });
    await startAdSwitch();
    await vi.advanceTimersByTimeAsync(179_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(2);
  });

  it("uses the scheduled break end of an upcoming break item", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    state.liveTrack = { artist: "Artist", title: "Song", timestamp: nowSec - 100 };
    state.history = [
      { artist: "", title: "", isBreak: true, label: AD_TITLE, timestamp: nowSec + 6, endTimestamp: nowSec + 66 },
    ];
    blacklistWarning.detectUpcomingAdBreak();
    await settle();
    await vi.advanceTimersByTimeAsync(7_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
    expect(blacklistWarning.getBlacklistWarningState()?.secondsLeft).toBeLessThanOrEqual(40);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(2);
  });

  it("returns once an observed break ends when no length is known", async () => {
    mocks.fetchPlaylist.mockResolvedValue({ current: { artist: origin.name, title: AD_TITLE, isLiveBreak: true } });
    await startAdSwitch();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
    mocks.fetchPlaylist.mockResolvedValue({ current: { artist: "A", title: "Song" } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(2);
  });

  it("ignores an in-flight origin poll that resolves after the user cancelled the return", async () => {
    mocks.fetchPlaylist.mockResolvedValue({ current: { artist: origin.name, title: AD_TITLE, isLiveBreak: true } });
    await startAdSwitch();
    let resolvePoll: (v: unknown) => void = vi.fn();
    mocks.fetchPlaylist.mockReturnValue(new Promise((r) => (resolvePoll = r)));
    await vi.advanceTimersByTimeAsync(5_000);
    blacklistWarning.cancelAdSkipAutoReturn();
    resolvePoll({ current: { artist: "A", title: "Song" } });
    await vi.advanceTimersByTimeAsync(200_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
  });

  it("does not let an old session's timer fire after a newer manual switch started", async () => {
    await startAdSwitch(Date.now() + 20_000);
    blacklistWarning.returnToPreviousStation();
    expect(mocks.selectStation).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(2);
  });

  it("is not blocked by the automatic switch rate limit and ignores repeated clicks", async () => {
    mocks.limited = true;
    state.liveTrack = { artist: origin.name, title: AD_TITLE, isLiveBreak: true };
    blacklistWarning.detectUpcomingAdBreak();
    await settle();
    blacklistWarning.switchBlacklistCandidateNow();
    blacklistWarning.switchBlacklistCandidateNow();
    blacklistWarning.switchBlacklistCandidateNow();
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
    expect(mocks.selectStation.mock.calls[0]?.[1]).toMatchObject({ automatic: false });
  });

  it("arms only one warning for rapid repeated detections", async () => {
    state.liveTrack = { artist: origin.name, title: AD_TITLE, isLiveBreak: true };
    blacklistWarning.detectUpcomingAdBreak();
    blacklistWarning.detectUpcomingAdBreak();
    blacklistWarning.detectUpcomingAdBreak();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(mocks.selectStation).toHaveBeenCalledTimes(1);
  });
});

describe("dismissed ad warning stays dismissed", () => {
  it("does not re-arm when the upcoming break turns into the live break", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    state.liveTrack = { artist: "Artist", title: "Song" };
    state.history = [
      { artist: "", title: "", isBreak: true, label: AD_TITLE, timestamp: nowSec + 30, endTimestamp: nowSec + 90 },
    ];
    blacklistWarning.detectUpcomingAdBreak();
    await settle();
    expect(blacklistWarning.getBlacklistWarningState()?.phase).toBe("warning");
    blacklistWarning.dismissBlacklistWarning();

    await vi.advanceTimersByTimeAsync(31_000);
    state.liveTrack = { artist: origin.name, title: AD_TITLE, isLiveBreak: true };
    blacklistWarning.detectUpcomingAdBreak();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(blacklistWarning.getBlacklistWarningState()).toBeNull();
    expect(mocks.selectStation).not.toHaveBeenCalled();
  });

  it("survives a metadata change while the dismissed break is still upcoming", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    state.liveTrack = { artist: "Artist", title: "Song" };
    state.history = [
      { artist: "", title: "", isBreak: true, label: AD_TITLE, timestamp: nowSec + 60, endTimestamp: nowSec + 120 },
    ];
    blacklistWarning.detectUpcomingAdBreak();
    await settle();
    blacklistWarning.dismissBlacklistWarning();

    state.liveTrack = { artist: "Artist", title: "Song (REST name)" };
    blacklistWarning.detectUpcomingAdBreak();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(blacklistWarning.getBlacklistWarningState()).toBeNull();
    expect(mocks.selectStation).not.toHaveBeenCalled();
  });
});
