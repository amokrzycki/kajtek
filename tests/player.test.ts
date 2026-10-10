import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, PlaylistResult, Provider, Station, TrackInfo } from "../src/types.js";

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
    paused = true;
    currentTime = 0;
    playbackRate = 1;
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

    dispatch(event: string, queued = false): void {
      if (event === "pause" && !queued) this.paused = true;
      if (event === "playing") this.paused = false;
      for (const handler of this.listeners.get(event) ?? []) handler();
    }

    reset(): void {
      this.paused = true;
      this.currentTime = 0;
      this.muted = false;
      this.volume = 1;
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
    evaluateSmartListening: vi.fn(),
    eskaProvider,
    genericProvider,
    hlsInstances: [] as FakeHlsInstance[],
    hlsSupported: true,
    notifyState: vi.fn(),
    metadataState: "idle",
    playbackState: "idle",
    readZprTag: vi.fn(),
    resetSmartListening: vi.fn(),
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
    smartListening: {
      version: 1,
      enabled: false,
      content: { advertisement: false, news: false, otherBreak: false },
      preferences: [],
    },
  }),
);

const intervals = vi.hoisted(() => ({
  sleep: null as ReturnType<typeof setInterval> | number | null,
  track: null as ReturnType<typeof setInterval> | number | null,
}));

const liveTrackListeners = vi.hoisted(() => new Set<() => void>());

const fetchMock = vi.fn<typeof fetch>();
const documentEvents = new Map<string, () => void>();

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

vi.mock("../src/smartListening.js", () => ({
  evaluateSmartListening: mocks.evaluateSmartListening,
  resetSmartListening: mocks.resetSmartListening,
}));

vi.mock("../src/catalog.js", () => ({ getOrderedStations: vi.fn(() => []), setStationFavorite: vi.fn() }));
vi.mock("../src/controls.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/controls.js")>()),
  applyAudioVolume: vi.fn(),
}));
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
  getLiveTrackUpdatedAt: () => Date.now(),
  notifyState: mocks.notifyState,
  radioAudio: mocks.audio,
  setLiveTrack: (track: TrackInfo | null) => {
    state.liveTrack = track;
    liveTrackListeners.forEach((listener) => {
      listener();
    });
  },
  state,
  getMetadataState: () => mocks.metadataState,
  getPlaybackState: () => mocks.playbackState,
  setPlaybackState: (value: string) => {
    mocks.playbackState = value;
  },
  setMetadataState: (value: string) => {
    mocks.metadataState = value;
  },
}));
vi.mock("../src/ui.js", () => ({
  updateSleepUI: vi.fn(),
  renderVolLadder: vi.fn(),
  updateMuteAccessibility: vi.fn(),
  els: { npLiveDot: { classList: { contains: vi.fn(() => false) } } },
  resolveAlbumCoverUrl: vi.fn(() => ""),
  setHistoryLoadingState: mocks.setHistoryLoadingState,
  setPlaybackStatus: mocks.setPlaybackStatus,
  updateAlbumArt: mocks.updateAlbumArt,
  updateHistoryUI: mocks.updateHistoryUI,
  updateNowPlayingTrack: mocks.updateNowPlayingTrack,
}));
vi.mock("../src/utils.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils.js")>()),
  getFactsLabel: vi.fn((hour: string) => hour),
  resolveProtocolRelativeUrl: vi.fn((url: string) => url),
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

async function settleMetadata(): Promise<void> {
  for (let step = 0; step < 5; step++) await Promise.resolve();
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
  vi.stubGlobal("DOMParser", class {});
  vi.stubGlobal("window", { addEventListener: vi.fn() });
  documentEvents.clear();
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: (event: string, handler: () => void) => documentEvents.set(event, handler),
  });
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  fetchMock.mockReset().mockRejectedValue(new Error("offline test"));
  mocks.audio.reset();
  mocks.hlsInstances.length = 0;
  mocks.hlsSupported = true;
  mocks.readZprTag.mockReturnValue(false);
  vi.mocked(mocks.eskaProvider.fetch).mockReset().mockResolvedValue(null);
  state.sleepMin = null;
  state.sleepSec = null;
  intervals.sleep = null;
  state.station = null;
  mocks.metadataState = "idle";
  mocks.playbackState = "idle";
  state.playing = false;
  state.liveTrack = null;
  state.history = [];
  liveTrackListeners.clear();
  state.showHistory = false;
  intervals.track = null;
  player = await import("../src/player.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the personal collection open when selecting a generic station", () => {
  state.showHistory = true;
  state.historyTab = "favorites";
  state.favTracks = [{ key: "saved", stationId: "test", stationTag: "Test", artist: "A", title: "T", timestamp: 123 }];
  player.selectStation(station());
  expect(state.showHistory).toBe(true);
  expect(state.historyTab).toBe("favorites");
  expect(state.favTracks[0]?.key).toBe("saved");
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
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    for (let attempt = 0; attempt < 3; attempt++) {
      hls.emit("error", { fatal: true, type, details: "fixture" });
    }
    expect(hls[recoveryMethod]).toHaveBeenCalledTimes(3);
    expect(runtime.currentStreamIndex).toBeUndefined();

    hls.emit("error", { fatal: true, type, details: "fixture" });
    expect(runtime.currentStreamIndex).toBe(1);
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
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    for (let attempt = 0; attempt < 3; attempt++) {
      hls.emit("error", { fatal: true, type: "networkError" });
    }
    hls.emit("fragLoaded");
    hls.emit("error", { fatal: true, type: "networkError" });

    expect(hls.startLoad).toHaveBeenCalledTimes(4);
    expect(runtime.currentStreamIndex).toBeUndefined();
  });

  it("ignores non-fatal HLS errors", async () => {
    const target = station({ stream: "https://example.test/primary.m3u8" });
    player.selectStation(target);
    await settlePlayback();
    const hls = latestHls();
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    hls.emit("error", { fatal: false, type: "networkError" });

    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(hls.recoverMediaError).not.toHaveBeenCalled();
    expect(runtime.currentStreamIndex).toBeUndefined();
  });

  it("fails over immediately for an unknown fatal HLS error", async () => {
    const target = station({
      stream: "https://example.test/primary.m3u8",
      _streams: ["https://example.test/primary.m3u8", "https://example.test/backup.mp3"],
    });
    player.selectStation(target);
    await settlePlayback();
    const hls = latestHls();
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    hls.emit("error", { fatal: true, type: "otherError" });

    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(hls.recoverMediaError).not.toHaveBeenCalled();
    expect(runtime.currentStreamIndex).toBe(1);
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
  it("rotates streams modulo their length and stops on the fourth switch in 30 seconds", async () => {
    const target = station({
      _streams: ["https://example.test/one.mp3", "https://example.test/two.mp3", "https://example.test/three.mp3"],
    });
    player.selectStation(target);
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    mocks.audio.dispatch("error");
    expect(runtime.currentStreamIndex).toBe(1);
    expect(mocks.audio.src).toContain("two.mp3");
    mocks.audio.dispatch("error");
    expect(runtime.currentStreamIndex).toBe(2);
    mocks.audio.dispatch("error");
    expect(runtime.currentStreamIndex).toBe(0);
    expect(mocks.audio.src).toContain("one.mp3");

    mocks.audio.dispatch("error");
    expect(state.playing).toBe(false);
    expect(mocks.audio.pause).toHaveBeenCalledOnce();
    expect(mocks.updateNowPlayingTrack).toHaveBeenCalledWith({
      artist: target.name,
      title: "Błąd odtwarzania stacji",
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

  it("expires a switch exactly on the rolling-window boundary", async () => {
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

  it("resets the audio failover limit when a station is selected", async () => {
    const first = station({ _streams: ["https://example.test/a.mp3", "https://example.test/b.mp3"] });
    player.selectStation(first);
    for (let attempt = 0; attempt < 3; attempt++) mocks.audio.dispatch("error");

    const second = station({
      id: "second",
      _streams: ["https://example.test/c.mp3", "https://example.test/d.mp3"],
    });
    player.selectStation(second);
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(second);
    mocks.audio.dispatch("error");

    expect(state.playing).toBe(true);
    expect(runtime.currentStreamIndex).toBe(1);
    expect(mocks.audio.src).toContain("d.mp3");
  });

  it("characterizes playing as not resetting the rolling failover limit", async () => {
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
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    mocks.audio.dispatch("waiting");
    mocks.audio.dispatch("stalled");
    mocks.audio.dispatch("error");

    expect(runtime.currentStreamIndex).toBeUndefined();
    expect(mocks.setPlaybackStatus).toHaveBeenCalledWith("Buforowanie…");
    expect(mocks.playbackState).toBe("buffering");
  });

  it("keeps waiting passive but fails over on stalled audio without hls.js", async () => {
    const target = station({ _streams: ["https://example.test/one.mp3", "https://example.test/two.mp3"] });
    player.selectStation(target);
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    mocks.audio.dispatch("waiting");
    expect(runtime.currentStreamIndex).toBeUndefined();
    mocks.audio.dispatch("stalled");
    expect(runtime.currentStreamIndex).toBe(1);
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
    expect(mocks.setPlaybackStatus).not.toHaveBeenCalledWith("Nie udało się włączyć stacji. Ponów lub wybierz inną.");
  });

  it("stops and reports a non-AbortError play failure", async () => {
    mocks.audio.play.mockRejectedValueOnce(new Error("decoder failed"));
    player.selectStation(station());
    await Promise.resolve();

    expect(state.playing).toBe(false);
    expect(mocks.setPlaybackStatus).toHaveBeenCalledWith("Nie udało się włączyć stacji. Ponów lub wybierz inną.");
  });

  it("ignores a stale play failure after switching sources", async () => {
    let rejectPlay: ((error: Error) => void) | undefined;
    mocks.audio.play.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectPlay = reject;
      }),
    );
    player.selectStation(station());
    player.selectStation(station({ id: "replacement", stream: "https://example.test/replacement.mp3" }));

    rejectPlay?.(new Error("old source failed"));
    await Promise.resolve();

    expect(state.playing).toBe(true);
    expect(mocks.setPlaybackStatus).not.toHaveBeenCalledWith("Nie udało się włączyć stacji. Ponów lub wybierz inną.");
  });

  it("does not resume a pending HLS request after pausing", async () => {
    player.selectStation(station({ stream: "https://example.test/slow-import.m3u8" }));
    player.togglePlay();
    await settlePlayback();

    expect(state.playing).toBe(false);
    expect(mocks.audio.pause).toHaveBeenCalledOnce();
    expect(mocks.audio.play).not.toHaveBeenCalled();
    expect(mocks.hlsInstances).toHaveLength(0);
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

  it("discards a stale initial HLS attach after an immediate MP3 switch", async () => {
    player.selectStation(station({ stream: "https://example.test/slow-import.m3u8" }));
    const replacement = station({
      id: "replacement",
      _streams: ["https://example.test/replacement.mp3", "https://example.test/backup.mp3"],
    });
    player.selectStation(replacement);
    await settlePlayback();
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(replacement);

    mocks.audio.dispatch("error");

    expect(mocks.hlsInstances).toHaveLength(0);
    expect(runtime.currentStreamIndex).toBe(1);
    expect(mocks.audio.src).toBe("https://example.test/backup.mp3");
  });

  it("ignores recovery and fragment callbacks from a replaced HLS generation", async () => {
    player.selectStation(station({ stream: "https://example.test/first.m3u8" }));
    await settlePlayback();
    const previous = latestHls();
    player.selectStation(station({ id: "replacement" }));
    mocks.setPlaybackStatus.mockClear();
    mocks.readZprTag.mockClear().mockReturnValue(true);
    previous.emit("error", { fatal: true, type: "networkError" });
    previous.emit("fragChanged", { frag: { id: 1 } });
    expect(mocks.setPlaybackStatus).not.toHaveBeenCalled();
    expect(previous.startLoad).not.toHaveBeenCalled();
    expect(mocks.readZprTag).not.toHaveBeenCalled();
    expect(state.station?.id).toBe("replacement");
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

describe("terminal polling cleanup", () => {
  function selectPollingStation(overrides: Partial<Station> = {}): void {
    player.selectStation(station({ provider: "eska", apiBaseUrl: "/playlist", ...overrides }));
  }

  async function interrupt(mode: string): Promise<void> {
    if (mode === "sleep") {
      const { setSleepTimer } = await import("../src/controls.js");
      mocks.audio.pause.mockImplementation(() => mocks.audio.dispatch("pause"));
      setSleepTimer(0);
      await vi.advanceTimersByTimeAsync(1000);
    } else if (mode === "rejection") {
      mocks.audio.play.mockRejectedValueOnce(new Error("decoder failed"));
      selectPollingStation();
      await settleMetadata();
    } else if (mode === "failover") {
      for (let attempt = 0; attempt < 4; attempt++) mocks.audio.dispatch("error");
    } else player.togglePlay();
  }

  it.each(["sleep", "rejection", "failover", "user pause"])(
    "releases polling after %s, then resumes once and replaces polling on selection",
    async (mode) => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      selectPollingStation();
      await settleMetadata();
      const initial = intervals.track;
      expect(initial).not.toBeNull();
      await interrupt(mode);
      expect(state.playing).toBe(false);
      expect(intervals.track).toBeNull();
      expect(clearIntervalSpy).toHaveBeenCalledWith(initial);
      const pollCount = () => setIntervalSpy.mock.calls.filter(([, delay]) => delay === 5000).length;
      const beforeResume = pollCount();
      mocks.audio.dispatch("pause");
      mocks.audio.dispatch("pause");
      expect(intervals.track).toBeNull();
      player.togglePlay();
      await settleMetadata();
      const resumed = intervals.track;
      mocks.audio.dispatch("playing");
      mocks.audio.dispatch("playing");
      expect(state.playing).toBe(true);
      expect(resumed).not.toBeNull();
      expect(intervals.track).toBe(resumed);
      expect(pollCount()).toBe(beforeResume + 1);
      expect(mocks.resetSmartListening).toHaveBeenCalledTimes(mode === "rejection" ? 2 : 1);
      selectPollingStation({ id: "after-interruption" });
      await settleMetadata();
      expect(intervals.track).not.toBeNull();
      expect(intervals.track).not.toBe(resumed);
      expect(clearIntervalSpy).toHaveBeenCalledWith(resumed);
      expect(pollCount()).toBe(beforeResume + 2);
    },
  );

  it("cleans up sleep expiration even if audio was already paused and emits no pause event", async () => {
    selectPollingStation();
    const { setSleepTimer } = await import("../src/controls.js");
    setSleepTimer(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(intervals.track).toBeNull();
  });

  it("does not attach or play a pending HLS generation after sleep expires", async () => {
    const { setSleepTimer } = await import("../src/controls.js");
    selectPollingStation({ stream: "https://example.test/pending.m3u8" });
    setSleepTimer(0);
    vi.advanceTimersByTime(1000);
    await settlePlayback();
    expect(state.playing).toBe(false);
    expect(intervals.track).toBeNull();
    expect(mocks.audio.play).not.toHaveBeenCalled();
    expect(mocks.hlsInstances).toHaveLength(0);
  });

  it("keeps one polling interval across rapid interruption/reselection and stale play rejection", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    let rejectOld: (reason: Error) => void = () => undefined;
    mocks.audio.play.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        }),
    );
    selectPollingStation();
    player.togglePlay();
    selectPollingStation({ id: "replacement" });
    const current = intervals.track;
    rejectOld(new Error("late rejection"));
    await settleMetadata();
    mocks.audio.dispatch("playing");
    expect(state.playing).toBe(true);
    expect(intervals.track).toBe(current);
    const pollingHandles = setIntervalSpy.mock.results
      .filter((_, index) => setIntervalSpy.mock.calls[index]?.[1] === 5000)
      .map((result) => result.value);
    expect(
      pollingHandles.filter((handle) => !clearIntervalSpy.mock.calls.some(([cleared]) => cleared === handle)),
    ).toEqual([current]);
  });

  it.each(["user pause", "sleep", "failover"])(
    "ignores a delayed %s event while replacement HLS attachment is pending",
    async (interruption) => {
      const { setSleepTimer } = await import("../src/controls.js");
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      selectPollingStation();
      await settlePlayback();
      mocks.audio.dispatch("playing");
      if (interruption === "sleep") {
        setSleepTimer(0);
        vi.advanceTimersByTime(1000);
      } else if (interruption === "failover") {
        for (let attempt = 0; attempt < 4; attempt++) mocks.audio.dispatch("error");
      } else player.togglePlay();
      mocks.audio.paused = true;
      selectPollingStation({ id: "replacement", stream: "https://example.test/replacement.m3u8" });
      const replacementPolling = intervals.track;
      const previousPlayCalls = mocks.audio.play.mock.calls.length;
      mocks.audio.dispatch("pause", true);
      mocks.audio.dispatch("pause", true);
      expect(state.playing).toBe(true);
      expect(intervals.track).toBe(replacementPolling);
      await settlePlayback();
      expect(mocks.hlsInstances).toHaveLength(1);
      expect(mocks.audio.play.mock.calls.length).toBe(previousPlayCalls + 1);
      mocks.audio.dispatch("playing");
      expect(intervals.track).toBe(replacementPolling);
      const pollingHandles = setIntervalSpy.mock.results
        .filter((_, index) => setIntervalSpy.mock.calls[index]?.[1] === 5000)
        .map((result) => result.value);
      expect(
        pollingHandles.filter((handle) => !clearIntervalSpy.mock.calls.some(([cleared]) => cleared === handle)),
      ).toEqual([replacementPolling]);
    },
  );

  it("still cancels a pending replacement HLS request on an explicit user pause", async () => {
    selectPollingStation({ stream: "https://example.test/replacement.m3u8" });
    mocks.audio.dispatch("pause", true);
    expect(state.playing).toBe(true);
    player.togglePlay();
    mocks.audio.dispatch("pause", true);
    await settlePlayback();
    expect(state.playing).toBe(false);
    expect(intervals.track).toBeNull();
    expect(mocks.hlsInstances).toHaveLength(0);
    expect(mocks.audio.play).not.toHaveBeenCalled();
  });

  it("keeps only the latest native HLS source through reselection and delayed pause", async () => {
    mocks.hlsSupported = false;
    selectPollingStation({ id: "first-hls", stream: "https://example.test/first.m3u8" });
    selectPollingStation({ id: "second-hls", stream: "https://example.test/second.m3u8" });
    const current = intervals.track;
    mocks.audio.dispatch("pause", true);
    await settlePlayback();
    expect(state.station?.id).toBe("second-hls");
    expect(state.playing).toBe(true);
    expect(mocks.hlsInstances).toHaveLength(0);
    expect(mocks.audio.src).toBe("https://example.test/second.m3u8");
    expect(mocks.audio.play).toHaveBeenCalledOnce();
    expect(intervals.track).toBe(current);
  });

  it("ignores a queued source-replacement pause event once the new audio is playing", async () => {
    selectPollingStation();
    selectPollingStation({ id: "replacement" });
    await settleMetadata();
    mocks.audio.dispatch("playing");
    const current = intervals.track;
    // Deliver the queued event with the current media state, rather than a new pause.
    mocks.audio.dispatch("pause", true);
    expect(state.playing).toBe(true);
    expect(intervals.track).toBe(current);
  });
});

describe("RMF station metadata", () => {
  it("clears the previous station timeline before metadata listeners observe a selection", () => {
    state.station = station({ id: "old" });
    state.history = [{ artist: "Previous", title: "Song", timestamp: 1, endTimestamp: 2 }];
    const observed: TrackInfo[][] = [];
    liveTrackListeners.add(() => observed.push([...state.history]));

    player.selectStation(station({ id: "new" }));

    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every((history) => history.length === 0)).toBe(true);
  });

  it.each([
    [
      "a string",
      "https://example.test/backup.mp3",
      ["https://example.test/primary.mp3", "https://example.test/backup.mp3"],
    ],
    [
      "an array",
      ["https://example.test/primary.mp3", "https://example.test/backup.mp3", "https://example.test/backup.mp3"],
      ["https://example.test/primary.mp3", "https://example.test/backup.mp3"],
    ],
  ])("accepts %s item_mp3 and removes duplicate streams", async (_label, itemMp3, expected) => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/streams")) return new Response(JSON.stringify({ playlistMp3: { item_mp3: itemMp3 } }));
      return new Response("null");
    });
    const target = station({ provider: "rmf", apiBaseUrl: "/api/rmf/stations/101" });

    player.selectStation(target);
    await settleMetadata();
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    expect(runtime.streams).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rmf/stations/101/streams",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("preserves the primary stream when stream metadata fails", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input).endsWith("/streams")) throw new Error("offline");
      return new Response("null");
    });
    const target = station({ provider: "rmf", apiBaseUrl: "/api/rmf/stations/101" });

    player.selectStation(target);
    await settleMetadata();
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    expect(runtime.streams).toEqual([target.stream]);
  });
});

describe("metadata failure boundaries", () => {
  it("finishes loading passively after pausing an initial active request", async () => {
    const target = station({ provider: "eska", apiBaseUrl: "/playlist" });
    let finish: (value: PlaylistResult) => void = () => undefined;
    mocks.eskaProvider.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mocks.eskaProvider.fetch.mockResolvedValueOnce({ current: { artist: "Paused", title: "Visible" }, all: [] });
    player.selectStation(target);
    player.togglePlay();
    finish({ current: { artist: "Cancelled", title: "Old" }, all: [] });
    await settleMetadata();
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);
    expect(state.playing).toBe(false);
    expect(state.liveTrack?.title).toBe("Visible");
    expect(mocks.metadataState).toBe("ready");
    expect(runtime.consecutiveFailures).toBeUndefined();
    expect(mocks.evaluateSmartListening).not.toHaveBeenCalled();
    expect(mocks.eskaProvider.fetch.mock.calls[1]?.[1]?.passive).toBe(true);
  });

  it("waits for visibility, cancels when hidden and resumes the single startup request", async () => {
    const target = station({ provider: "eska", apiBaseUrl: "/playlist" });
    state.station = target;
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await player.restoreStationMetadata();
    expect(mocks.eskaProvider.fetch).not.toHaveBeenCalled();
    expect(mocks.metadataState).toBe("loading");
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    let finish: (value: PlaylistResult) => void = () => undefined;
    mocks.eskaProvider.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    documentEvents.get("visibilitychange")?.();
    const signal = mocks.eskaProvider.fetch.mock.calls[0]?.[1]?.signal;
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    documentEvents.get("visibilitychange")?.();
    expect(signal?.aborted).toBe(true);
    finish({ current: { artist: "Old", title: "Hidden" }, all: [] });
    await settleMetadata();
    expect(state.liveTrack).toBeNull();
    mocks.eskaProvider.fetch.mockResolvedValueOnce({ current: { artist: "Visible", title: "New" }, all: [] });
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    documentEvents.get("visibilitychange")?.();
    await settleMetadata();
    expect(state.liveTrack?.title).toBe("New");
    expect(mocks.eskaProvider.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.audio.play).not.toHaveBeenCalled();
  });

  it.each(["rmf", "eska"] as const)(
    "loads restored %s metadata without playback or health changes",
    async (provider) => {
      const target = station({ provider, apiBaseUrl: "/playlist" });
      const { getStationRuntime } = await import("../src/player.js");
      const runtime = getStationRuntime(target);
      runtime.consecutiveFailures = 99;
      runtime.apiFailed = true;
      const result = {
        current: { artist: "Restored", title: "Song", coverUrl: "/cover.png" },
        all: [{ artist: "Next", title: "Song" }],
      };
      state.station = target;
      fetchMock.mockResolvedValue(new Response("{}"));
      mocks.rmfProvider.parse.mockReturnValue(result);
      mocks.eskaProvider.fetch.mockResolvedValue(result);
      const request = player.restoreStationMetadata();
      expect(mocks.metadataState).toBe("loading");
      await request;
      expect(state.liveTrack).toEqual(result.current);
      expect(state.history).toEqual(result.all);
      expect(mocks.metadataState).toBe("ready");
      expect(runtime.consecutiveFailures).toBe(99);
      expect(runtime.apiFailed).toBe(true);
      expect(mocks.audio.play).not.toHaveBeenCalled();
      expect(mocks.audio.src).toBe("");
      expect(state.playing).toBe(false);
      expect(intervals.track).toBeNull();
      expect(mocks.evaluateSmartListening).not.toHaveBeenCalled();
      const { statisticsStore } = await import("../src/statisticsPlayback.js");
      expect(statisticsStore.snapshot().allTime.listeningMs).toBe(0);
      expect(statisticsStore.snapshot().allTime.detours).toBe(0);
    },
  );

  it("distinguishes unsupported, empty and failed startup metadata", async () => {
    state.station = station();
    await player.restoreStationMetadata();
    expect(mocks.metadataState).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
    state.station = station({ provider: "eska", apiBaseUrl: "/playlist" });
    mocks.eskaProvider.fetch.mockResolvedValueOnce({ current: null, all: [] });
    await player.restoreStationMetadata();
    expect(mocks.metadataState).toBe("unavailable");
    mocks.eskaProvider.fetch.mockRejectedValueOnce(new Error("offline"));
    await player.restoreStationMetadata();
    expect(mocks.metadataState).toBe("failed");
  });

  it("cancels a startup request and rejects its late reply after station selection", async () => {
    const target = station({ provider: "eska", apiBaseUrl: "/playlist" });
    state.station = target;
    let finish: (value: PlaylistResult) => void = () => undefined;
    mocks.eskaProvider.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = player.restoreStationMetadata();
    const signal = mocks.eskaProvider.fetch.mock.calls[0]?.[1]?.signal;
    player.selectStation(station({ id: "new" }));
    finish({ current: { artist: "Late", title: "Old" }, all: [] });
    await request;
    expect(signal?.aborted).toBe(true);
    expect(state.liveTrack).toBeNull();
    expect(state.station?.id).toBe("new");
  });

  it("uses the 3500 ms timeout, counts an error, and preserves displayed metadata", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const oldTrack = { artist: "Still", title: "Visible" };
    const target = station({ apiBaseUrl: "/playlist" });
    state.station = target;
    state.liveTrack = oldTrack;

    await expect(player.fetchPlaylist(target)).resolves.toBeNull();
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    expect(timeoutSpy).toHaveBeenCalledWith(3500);
    expect(runtime.consecutiveFailures).toBe(1);
    expect(state.liveTrack).toBe(oldTrack);
    expect(mocks.updateNowPlayingTrack).not.toHaveBeenCalled();
  });

  it("characterizes the current failure cap as six requests, then no seventh request", async () => {
    const target = station({ apiBaseUrl: "/playlist" });

    for (let attempt = 0; attempt < 7; attempt++) await player.fetchPlaylist(target);
    const { getStationRuntime } = await import("../src/player.js");
    const runtime = getStationRuntime(target);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(runtime.consecutiveFailures).toBe(6);
  });
});

describe("listening recap integration", () => {
  it("closes audible intervals at volume changes and excludes zero-volume and paused audio for both totals", async () => {
    player.selectStation(station());
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(3000);
    mocks.audio.currentTime = 3;
    mocks.audio.volume = 0;
    mocks.audio.dispatch("volumechange");
    vi.advanceTimersByTime(5000);
    mocks.audio.currentTime = 8;
    mocks.audio.volume = 1;
    mocks.audio.dispatch("volumechange");
    vi.advanceTimersByTime(2000);
    mocks.audio.currentTime = 10;
    mocks.audio.dispatch("pause");
    vi.advanceTimersByTime(5000);
    mocks.audio.currentTime = 15;
    mocks.audio.dispatch("timeupdate");
    await vi.advanceTimersByTimeAsync(0);
    const { statisticsStore } = await import("../src/statisticsPlayback.js");
    expect(statisticsStore.snapshot().allTime.listeningMs).toBe(5000);
    expect(statisticsStore.snapshot().allTimeStations).toEqual([{ id: "test", name: "Test Radio", listeningMs: 5000 }]);
  });

  it.each([
    { provider: "eska", starts: undefined },
    { provider: "rmf", starts: 0 },
  ])("resumes saved time inside a known $provider window without counting paused wall time", async ({ starts }) => {
    const start = Date.now();
    player.selectStation(station(), {
      id: "known-ad",
      kind: "advertisement",
      automatic: true,
      adEndsAt: start + 30_000,
      ...(starts === undefined ? {} : { adStartsAt: start + starts }),
    });
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(3000);
    mocks.audio.currentTime = 3;
    player.togglePlay();
    vi.advanceTimersByTime(4000);
    mocks.audio.currentTime = 0;
    player.togglePlay();
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(2000);
    mocks.audio.currentTime = 2;
    player.togglePlay();
    vi.advanceTimersByTime(3000);
    player.togglePlay();
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(2000);
    mocks.audio.currentTime = 4;
    mocks.audio.dispatch("pause");
    await vi.advanceTimersByTimeAsync(0);
    const { statisticsStore } = await import("../src/statisticsPlayback.js");
    expect(statisticsStore.snapshot().allTime).toMatchObject({ listeningMs: 7000, adSavedMs: 7000, detours: 1 });
  });

  it.each(["mute", "zero", "waiting", "expired", "unrelated"])("bounds known-ad listening through %s", async (mode) => {
    const start = Date.now();
    player.selectStation(station(), {
      id: "known-ad",
      kind: "advertisement",
      automatic: false,
      adEndsAt: start + 10_000,
    });
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(2000);
    mocks.audio.currentTime = 2;
    if (mode === "mute") {
      mocks.audio.muted = true;
      mocks.audio.dispatch("volumechange");
    } else if (mode === "zero") {
      mocks.audio.volume = 0;
      mocks.audio.dispatch("volumechange");
    } else if (mode === "unrelated") player.selectStation(station({ id: "unrelated" }));
    else if (mode === "waiting") mocks.audio.dispatch("waiting");
    else player.togglePlay();
    vi.advanceTimersByTime(mode === "expired" ? 12_000 : 3000);
    mocks.audio.currentTime = 5;
    if (mode === "mute") {
      mocks.audio.muted = false;
      mocks.audio.dispatch("volumechange");
    } else if (mode === "zero") {
      mocks.audio.volume = 1;
      mocks.audio.dispatch("volumechange");
    } else if (mode === "unrelated") mocks.audio.dispatch("playing");
    else if (mode === "waiting") mocks.audio.dispatch("playing");
    else {
      player.togglePlay();
      mocks.audio.dispatch("playing");
    }
    vi.advanceTimersByTime(2000);
    mocks.audio.currentTime = 7;
    mocks.audio.dispatch("pause");
    await vi.advanceTimersByTimeAsync(0);
    const { statisticsStore } = await import("../src/statisticsPlayback.js");
    expect(statisticsStore.snapshot().allTime).toMatchObject({
      listeningMs: 4000,
      adSavedMs: mode === "expired" || mode === "unrelated" ? 2000 : 4000,
    });
  });

  it("flushes manual and automatic switches to the previous station and keeps URL recovery in the same bucket", async () => {
    player.selectStation(station({ _streams: ["https://example.test/a.mp3", "https://example.test/b.mp3"] }));
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(3000);
    mocks.audio.currentTime = 3;
    mocks.audio.dispatch("error");
    mocks.audio.currentTime = 0;
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(2000);
    mocks.audio.currentTime = 2;
    player.selectStation(station({ id: "manual", name: "Manual Radio" }));
    mocks.audio.currentTime = 0;
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(4000);
    mocks.audio.currentTime = 4;
    player.selectStation(station({ id: "automatic", name: "Automatic Radio" }), {
      id: "ad",
      kind: "advertisement",
      automatic: true,
    });
    mocks.audio.currentTime = 0;
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(1000);
    mocks.audio.currentTime = 1;
    mocks.audio.dispatch("pause");
    await vi.advanceTimersByTimeAsync(0);
    const { statisticsStore } = await import("../src/statisticsPlayback.js");
    const snapshot = statisticsStore.snapshot();
    expect(snapshot.allTime.listeningMs).toBe(10_000);
    expect(snapshot.allTimeStations).toEqual([
      { id: "test", name: "Test Radio", listeningMs: 5000 },
      { id: "manual", name: "Manual Radio", listeningMs: 4000 },
      { id: "automatic", name: "Automatic Radio", listeningMs: 1000 },
    ]);
    expect(snapshot.allTime.detours).toBe(2);
  });

  it("records successful protective routes only once, and excludes failed playback", async () => {
    player.selectStation(station(), { id: "protection-1", kind: "negativeTrack", automatic: true });
    mocks.audio.dispatch("playing");
    mocks.audio.dispatch("playing");
    await vi.advanceTimersByTimeAsync(0);
    const { statisticsStore } = await import("../src/statisticsPlayback.js");
    expect(statisticsStore.snapshot().allTime).toMatchObject({ negativeMusicAvoided: 1, detours: 1 });
    mocks.audio.play.mockRejectedValueOnce(new Error("connection failed"));
    player.selectStation(station(), { id: "protection-2", kind: "negativeTrack", automatic: true });
    await settleMetadata();
    expect(statisticsStore.snapshot().allTime.negativeMusicAvoided).toBe(1);
  });

  it("records a distinct stream recovery after playing, and no same-URL retry", async () => {
    player.selectStation(station({ _streams: ["https://example.test/a.mp3", "https://example.test/b.mp3"] }));
    mocks.audio.dispatch("playing");
    mocks.audio.dispatch("error");
    const { statisticsStore } = await import("../src/statisticsPlayback.js");
    expect(statisticsStore.snapshot().allTime.detours).toBe(0);
    mocks.audio.dispatch("playing");
    mocks.audio.dispatch("playing");
    await vi.advanceTimersByTimeAsync(0);
    expect(statisticsStore.snapshot().allTime.detours).toBe(1);
    player.selectStation(station());
    mocks.audio.dispatch("error");
    mocks.audio.dispatch("playing");
    await vi.advanceTimersByTimeAsync(0);
    expect(statisticsStore.snapshot().allTime.detours).toBe(1);
  });

  it("records real media advancement and excludes buffering, mute and a manual source reset", async () => {
    player.selectStation(station());
    mocks.audio.dispatch("playing");
    vi.advanceTimersByTime(5000);
    mocks.audio.currentTime = 5;
    mocks.audio.dispatch("timeupdate");
    mocks.audio.dispatch("waiting");
    vi.advanceTimersByTime(5000);
    mocks.audio.dispatch("playing");
    mocks.audio.dispatch("volumechange");
    mocks.audio.muted = true;
    mocks.audio.dispatch("volumechange");
    vi.advanceTimersByTime(5000);
    mocks.audio.currentTime = 10;
    mocks.audio.dispatch("timeupdate");
    player.selectStation(station({ id: "manual" }));
    await vi.advanceTimersByTimeAsync(0);
    const { statisticsStore } = await import("../src/statisticsPlayback.js");
    expect(statisticsStore.snapshot().allTime).toMatchObject({ listeningMs: 5000, detours: 0 });
    expect(statisticsStore.snapshot().allTimeStations).toEqual([{ id: "test", name: "Test Radio", listeningMs: 5000 }]);
  });
});
