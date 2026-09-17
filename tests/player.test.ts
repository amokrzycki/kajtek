import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, PlaylistResult, Provider, Station } from "../src/types.js";

type HlsEventData = {
  fatal?: boolean;
  type?: string;
  details?: string;
  frag?: unknown;
};

type HlsHandler = (event: string, data: HlsEventData) => void;

interface FakeHlsInstance {
  readonly destroy: ReturnType<typeof vi.fn>;
  readonly startLoad: ReturnType<typeof vi.fn>;
  readonly recoverMediaError: ReturnType<typeof vi.fn>;
  emit(event: string, data?: HlsEventData): void;
}

const mocks = vi.hoisted(() => {
  class FakeAudio {
    crossOrigin = "";
    muted = false;
    src = "";
    volume = 1;
    readonly play = vi.fn<() => Promise<void>>();
    readonly pause = vi.fn<() => void>();
    private readonly listeners = new Map<string, Array<() => void>>();

    addEventListener(event: string, handler: () => void): void {
      const handlers = this.listeners.get(event) ?? [];
      handlers.push(handler);
      this.listeners.set(event, handlers);
    }

    dispatch(event: string): void {
      for (const handler of this.listeners.get(event) ?? []) handler();
    }

    reset(): void {
      this.crossOrigin = "";
      this.src = "";
      this.play.mockReset().mockResolvedValue(undefined);
      this.pause.mockReset();
      this.listeners.clear();
    }
  }

  const genericProvider = { name: "Generic", parse: vi.fn() } satisfies Provider;
  const rmfProvider = { name: "RMF", parse: vi.fn() } satisfies Provider;
  const trojkaProvider = { name: "Trojka", parse: vi.fn() } satisfies Provider;
  const eskaProvider = { name: "ESKA", parse: vi.fn(), fetch: vi.fn() } satisfies Provider;

  return {
    audio: new FakeAudio(),
    detectBlacklistedUpcoming: vi.fn(),
    detectUpcomingAdBreak: vi.fn(),
    eskaProvider,
    genericProvider,
    hlsInstances: [] as FakeHlsInstance[],
    hlsSupported: true,
    notifyState: vi.fn(),
    readZprTag: vi.fn(),
    resetBlacklistWarningState: vi.fn(),
    rmfProvider,
    setHistoryLoadingState: vi.fn(),
    setPlaybackStatus: vi.fn(),
    startEskaSession: vi.fn(),
    trojkaProvider,
    updateAlbumArt: vi.fn(),
    updateHistoryUI: vi.fn(),
    updateNowPlayingTrack: vi.fn(),
  };
});

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

const intervals = vi.hoisted(() => ({
  sleep: null as ReturnType<typeof setInterval> | number | null,
  track: null as ReturnType<typeof setInterval> | number | null,
}));

const fetchMock = vi.fn<typeof fetch>();

vi.mock("hls.js", () => {
  class FakeHls implements FakeHlsInstance {
    static readonly Events = { ERROR: "error", FRAG_CHANGED: "fragChanged", FRAG_LOADED: "fragLoaded" };
    static readonly ErrorTypes = { MEDIA_ERROR: "mediaError", NETWORK_ERROR: "networkError" };
    static isSupported = () => mocks.hlsSupported;

    readonly destroy = vi.fn();
    readonly startLoad = vi.fn();
    readonly recoverMediaError = vi.fn();
    readonly loadSource = vi.fn<(url: string) => void>();
    readonly attachMedia = vi.fn<(audio: unknown) => void>();
    private readonly handlers = new Map<string, HlsHandler>();

    constructor(_options: unknown) {
      mocks.hlsInstances.push(this);
    }

    on(event: string, handler: HlsHandler): void {
      this.handlers.set(event, handler);
    }

    emit(event: string, data: HlsEventData = {}): void {
      this.handlers.get(event)?.(event, data);
    }
  }

  return { default: FakeHls };
});

vi.mock("../src/blacklistWarning.js", () => ({
  detectBlacklistedUpcoming: mocks.detectBlacklistedUpcoming,
  detectUpcomingAdBreak: mocks.detectUpcomingAdBreak,
  resetBlacklistWarningState: mocks.resetBlacklistWarningState,
}));

vi.mock("../src/catalog.js", () => ({ getOrderedStations: vi.fn(() => []) }));
vi.mock("../src/controls.js", () => ({ applyAudioVolume: vi.fn() }));
vi.mock("../src/providers/eska.js", () => ({
  readZprTag: mocks.readZprTag,
  startEskaSession: mocks.startEskaSession,
}));
vi.mock("../src/providers/rmf.js", () => ({ rmfProvider: mocks.rmfProvider }));
vi.mock("../src/providers/trojka.js", () => ({ trojkaProvider: mocks.trojkaProvider }));
vi.mock("../src/providers.js", () => ({
  genericProvider: mocks.genericProvider,
  getFactsInfo: vi.fn(() => ({ isFacts: false, targetHourStr: "" })),
  getProvider: vi.fn((station?: Station | null) => {
    if (station?.provider === "rmf") return mocks.rmfProvider;
    if (station?.provider === "trojka") return mocks.trojkaProvider;
    if (station?.provider === "eska") return mocks.eskaProvider;
    return mocks.genericProvider;
  }),
}));
vi.mock("../src/state.js", () => ({
  intervals,
  notifyState: mocks.notifyState,
  radioAudio: mocks.audio,
  state,
}));
vi.mock("../src/ui.js", () => ({
  els: { npLiveDot: { classList: { contains: vi.fn(() => false) } } },
  resolveAlbumCoverUrl: vi.fn(() => ""),
  setHistoryLoadingState: mocks.setHistoryLoadingState,
  setPlaybackStatus: mocks.setPlaybackStatus,
  updateAlbumArt: mocks.updateAlbumArt,
  updateHistoryUI: mocks.updateHistoryUI,
  updateNowPlayingTrack: mocks.updateNowPlayingTrack,
}));
vi.mock("../src/utils.js", () => ({
  getFactsLabel: vi.fn((hour: string) => hour),
  resolveProtocolRelativeUrl: vi.fn((url: string) => url),
  withinRateLimit: (timestamps: number[], windowMs: number, max: number) => {
    const recent = timestamps.filter((timestamp) => Date.now() - timestamp < windowMs);
    return recent.length >= max
      ? { timestamps: recent, limited: true }
      : { timestamps: [...recent, Date.now()], limited: false };
  },
}));

type PlayerModule = typeof import("../src/player.js");

let player: PlayerModule;

function station(overrides: Partial<Station> = {}): Station {
  return {
    id: "test",
    name: "Test Radio",
    short: "TEST",
    cat: "test",
    provider: "generic",
    stream: "https://example.test/primary.mp3",
    ...overrides,
  };
}

async function settlePlayback(): Promise<void> {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

function latestHls(): FakeHlsInstance {
  const instance = mocks.hlsInstances.at(-1);
  if (!instance) throw new Error("Expected an HLS instance");
  return instance;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  fetchMock.mockReset().mockRejectedValue(new Error("offline test"));
  mocks.audio.reset();
  mocks.hlsInstances.length = 0;
  mocks.hlsSupported = true;
  mocks.readZprTag.mockReturnValue(false);
  vi.mocked(mocks.eskaProvider.fetch).mockReset().mockResolvedValue(null);
  state.station = null;
  state.playing = false;
  state.liveTrack = null;
  state.history = [];
  state.showHistory = false;
  intervals.track = null;
  player = await import("../src/player.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HLS recovery", () => {
  it.each([
    ["network", "networkError", "startLoad"],
    ["media", "mediaError", "recoverMediaError"],
  ] as const)("uses three local %s recoveries, then fails over", async (_label, type, recoveryMethod) => {
    const target = station({
      stream: "https://example.test/primary.m3u8",
      _streams: ["https://example.test/primary.m3u8", "https://example.test/backup.mp3"],
    });

    player.selectStation(target);
    await settlePlayback();
    const hls = latestHls();

    for (let attempt = 0; attempt < 3; attempt++) {
      hls.emit("error", { fatal: true, type, details: "fixture" });
    }
    expect(hls[recoveryMethod]).toHaveBeenCalledTimes(3);
    expect(target._currentStreamIndex).toBeUndefined();

    hls.emit("error", { fatal: true, type, details: "fixture" });
    expect(target._currentStreamIndex).toBe(1);
    expect(mocks.audio.src).toBe("https://example.test/backup.mp3");
    expect(hls.destroy).toHaveBeenCalledOnce();
  });

  it("resets the recovery counter after a fragment loads", async () => {
    const target = station({
      stream: "https://example.test/primary.m3u8",
      _streams: ["https://example.test/primary.m3u8", "https://example.test/backup.mp3"],
    });
    player.selectStation(target);
    await settlePlayback();
    const hls = latestHls();

    for (let attempt = 0; attempt < 3; attempt++) {
      hls.emit("error", { fatal: true, type: "networkError" });
    }
    hls.emit("fragLoaded");
    hls.emit("error", { fatal: true, type: "networkError" });

    expect(hls.startLoad).toHaveBeenCalledTimes(4);
    expect(target._currentStreamIndex).toBeUndefined();
  });

  it("ignores non-fatal HLS errors", async () => {
    const target = station({ stream: "https://example.test/primary.m3u8" });
    player.selectStation(target);
    await settlePlayback();
    const hls = latestHls();

    hls.emit("error", { fatal: false, type: "networkError" });

    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(hls.recoverMediaError).not.toHaveBeenCalled();
    expect(target._currentStreamIndex).toBeUndefined();
  });

  it("fails over immediately for an unknown fatal HLS error", async () => {
    const target = station({
      stream: "https://example.test/primary.m3u8",
      _streams: ["https://example.test/primary.m3u8", "https://example.test/backup.mp3"],
    });
    player.selectStation(target);
    await settlePlayback();
    const hls = latestHls();

    hls.emit("error", { fatal: true, type: "otherError" });

    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(hls.recoverMediaError).not.toHaveBeenCalled();
    expect(target._currentStreamIndex).toBe(1);
  });

  it("refreshes once for a changed ZPR block and ignores its stale result", async () => {
    const oldTrack: PlaylistResult = {
      current: { artist: "Old", title: "Request" },
      all: [{ artist: "Old", title: "Request" }],
    };
    let resolveFetch: ((result: PlaylistResult) => void) | undefined;
    const pendingFetch = new Promise<PlaylistResult>((resolve) => {
      resolveFetch = resolve;
    });
    const target = station({
      provider: "eska",
      stream: "https://example.test/primary.m3u8",
      apiBaseUrl: "/playlist",
    });
    vi.mocked(mocks.eskaProvider.fetch).mockResolvedValueOnce(null);
    player.selectStation(target);
    await settlePlayback();
    const hls = latestHls();
    vi.mocked(mocks.eskaProvider.fetch).mockClear().mockReturnValueOnce(pendingFetch);
    mocks.readZprTag.mockReturnValueOnce(false).mockReturnValueOnce(true);

    hls.emit("fragChanged", { frag: { id: 1 } });
    hls.emit("fragChanged", { frag: { id: 2 } });
    expect(mocks.eskaProvider.fetch).toHaveBeenCalledOnce();

    state.station = station({ id: "replacement" });
    resolveFetch?.(oldTrack);
    await Promise.resolve();
    expect(mocks.updateNowPlayingTrack).not.toHaveBeenCalledWith(oldTrack.current);
  });

  it("uses native HLS without constructing hls.js when MediaSource support is absent", async () => {
    mocks.hlsSupported = false;
    player.selectStation(station({ stream: "https://example.test/native.m3u8" }));
    await settlePlayback();

    expect(mocks.hlsInstances).toHaveLength(0);
    expect(mocks.audio.src).toBe("https://example.test/native.m3u8");
    expect(mocks.audio.play).toHaveBeenCalledOnce();
  });
});

describe("stream failover", () => {
  it("rotates streams modulo their length and stops on the fourth switch in 30 seconds", () => {
    const target = station({
      _streams: ["https://example.test/one.mp3", "https://example.test/two.mp3", "https://example.test/three.mp3"],
    });
    player.selectStation(target);

    mocks.audio.dispatch("error");
    expect(target._currentStreamIndex).toBe(1);
    expect(mocks.audio.src).toContain("two.mp3");
    mocks.audio.dispatch("error");
    expect(target._currentStreamIndex).toBe(2);
    mocks.audio.dispatch("error");
    expect(target._currentStreamIndex).toBe(0);
    expect(mocks.audio.src).toContain("one.mp3");

    mocks.audio.dispatch("error");
    expect(state.playing).toBe(false);
    expect(mocks.audio.pause).toHaveBeenCalledOnce();
    expect(mocks.updateNowPlayingTrack).toHaveBeenCalledWith({
      artist: target.name,
      title: "Błąd odtwarzania streamu",
    });
  });

  it("retries one stream three times, then stops", () => {
    const target = station();
    player.selectStation(target);

    for (let attempt = 0; attempt < 3; attempt++) mocks.audio.dispatch("error");
    expect(mocks.audio.play).toHaveBeenCalledTimes(4);
    expect(state.playing).toBe(true);

    mocks.audio.dispatch("error");
    expect(state.playing).toBe(false);
    expect(mocks.audio.play).toHaveBeenCalledTimes(4);
  });

  it("expires a switch exactly on the rolling-window boundary", () => {
    const target = station({ _streams: ["https://example.test/one.mp3", "https://example.test/two.mp3"] });
    player.selectStation(target);

    mocks.audio.dispatch("error");
    vi.advanceTimersByTime(10);
    mocks.audio.dispatch("error");
    vi.advanceTimersByTime(10);
    mocks.audio.dispatch("error");
    vi.advanceTimersByTime(29_980);
    mocks.audio.dispatch("error");

    expect(state.playing).toBe(true);
    mocks.audio.dispatch("error");
    expect(state.playing).toBe(false);
  });

  it("resets the audio failover limit when a station is selected", () => {
    const first = station({ _streams: ["https://example.test/a.mp3", "https://example.test/b.mp3"] });
    player.selectStation(first);
    for (let attempt = 0; attempt < 3; attempt++) mocks.audio.dispatch("error");

    const second = station({
      id: "second",
      _streams: ["https://example.test/c.mp3", "https://example.test/d.mp3"],
    });
    player.selectStation(second);
    mocks.audio.dispatch("error");

    expect(state.playing).toBe(true);
    expect(second._currentStreamIndex).toBe(1);
    expect(mocks.audio.src).toContain("d.mp3");
  });

  it("characterizes playing as not resetting the rolling failover limit", () => {
    const target = station({ _streams: ["https://example.test/one.mp3", "https://example.test/two.mp3"] });
    player.selectStation(target);
    for (let attempt = 0; attempt < 3; attempt++) mocks.audio.dispatch("error");

    mocks.audio.dispatch("playing");
    mocks.audio.dispatch("error");

    expect(state.playing).toBe(false);
    expect(mocks.audio.pause).toHaveBeenCalledOnce();
  });

  it("does not duplicate hls.js recovery from audio events", async () => {
    const target = station({
      stream: "https://example.test/primary.m3u8",
      _streams: ["https://example.test/primary.m3u8", "https://example.test/backup.mp3"],
    });
    player.selectStation(target);
    await settlePlayback();

    mocks.audio.dispatch("waiting");
    mocks.audio.dispatch("stalled");
    mocks.audio.dispatch("error");

    expect(target._currentStreamIndex).toBeUndefined();
    expect(mocks.setPlaybackStatus).toHaveBeenCalledWith("Buforowanie…", "buffering");
  });

  it("keeps waiting passive but fails over on stalled audio without hls.js", () => {
    const target = station({ _streams: ["https://example.test/one.mp3", "https://example.test/two.mp3"] });
    player.selectStation(target);

    mocks.audio.dispatch("waiting");
    expect(target._currentStreamIndex).toBeUndefined();
    mocks.audio.dispatch("stalled");
    expect(target._currentStreamIndex).toBe(1);
  });
});

describe("playback state and cleanup", () => {
  it("starts polling once when duplicate playing events arrive", () => {
    state.station = station({ apiBaseUrl: "/playlist" });

    mocks.audio.dispatch("playing");
    const firstInterval = intervals.track;
    mocks.audio.dispatch("playing");

    expect(state.playing).toBe(true);
    expect(firstInterval).not.toBeNull();
    expect(intervals.track).toBe(firstInterval);
    expect(mocks.notifyState).toHaveBeenCalledOnce();
  });

  it("ignores AbortError from an interrupted play call", async () => {
    mocks.audio.play.mockRejectedValueOnce(new DOMException("superseded", "AbortError"));
    player.selectStation(station());
    await Promise.resolve();

    expect(state.playing).toBe(true);
    expect(mocks.setPlaybackStatus).not.toHaveBeenCalledWith("Nie udało się uruchomić — naciśnij PLAY", "failed");
  });

  it("stops and reports a non-AbortError play failure", async () => {
    mocks.audio.play.mockRejectedValueOnce(new Error("decoder failed"));
    player.selectStation(station());
    await Promise.resolve();

    expect(state.playing).toBe(false);
    expect(mocks.setPlaybackStatus).toHaveBeenCalledWith("Nie udało się uruchomić — naciśnij PLAY", "failed");
  });

  it("destroys the previous HLS instance when selecting another source", async () => {
    player.selectStation(station({ stream: "https://example.test/first.m3u8" }));
    await settlePlayback();
    const firstHls = latestHls();

    player.selectStation(station({ id: "second", stream: "https://example.test/second.m3u8" }));
    await settlePlayback();

    expect(firstHls.destroy).toHaveBeenCalledOnce();
    expect(mocks.hlsInstances).toHaveLength(2);
  });

  it("characterizes a stale initial HLS attach after an immediate MP3 switch", async () => {
    player.selectStation(station({ stream: "https://example.test/slow-import.m3u8" }));
    const replacement = station({
      id: "replacement",
      _streams: ["https://example.test/replacement.mp3", "https://example.test/backup.mp3"],
    });
    player.selectStation(replacement);
    await settlePlayback();

    mocks.audio.dispatch("error");

    expect(mocks.hlsInstances).toHaveLength(1);
    expect(replacement._currentStreamIndex).toBeUndefined();
  });

  it("does not carry HLS recovery attempts into a new source", async () => {
    player.selectStation(station({ stream: "https://example.test/first.m3u8" }));
    await settlePlayback();
    const firstHls = latestHls();
    for (let attempt = 0; attempt < 3; attempt++) {
      firstHls.emit("error", { fatal: true, type: "networkError" });
    }

    player.selectStation(station({ id: "second", stream: "https://example.test/second.m3u8" }));
    await settlePlayback();
    const secondHls = latestHls();
    secondHls.emit("error", { fatal: true, type: "networkError" });

    expect(secondHls.startLoad).toHaveBeenCalledOnce();
    expect(state.playing).toBe(true);
  });
});

describe("metadata failure boundaries", () => {
  it("uses the 3500 ms timeout, counts an error, and preserves displayed metadata", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const oldTrack = { artist: "Still", title: "Visible" };
    const target = station({ apiBaseUrl: "/playlist" });
    state.station = target;
    state.liveTrack = oldTrack;

    await expect(player.fetchPlaylist(target)).resolves.toBeNull();

    expect(timeoutSpy).toHaveBeenCalledWith(3500);
    expect(target._consecutiveFailures).toBe(1);
    expect(state.liveTrack).toBe(oldTrack);
    expect(mocks.updateNowPlayingTrack).not.toHaveBeenCalled();
  });

  it("characterizes the current failure cap as six requests, then no seventh request", async () => {
    const target = station({ apiBaseUrl: "/playlist" });

    for (let attempt = 0; attempt < 7; attempt++) await player.fetchPlaylist(target);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(target._consecutiveFailures).toBe(6);
  });
});
