/** biome-ignore-all lint/style/noNonNullAssertion: Test files */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Station } from "../src/types.js";

const mocks = vi.hoisted(() => {
  return {
    notifyState: vi.fn(),
    playbackState: "idle" as string,
    metadataState: "idle" as string,
  };
});

const state = vi.hoisted(() => ({
  favs: new Set<string>(),
  station: null as Station | null,
  playing: false,
}));

const stored = vi.hoisted(() => new Map<string, unknown>());
const documentEvents = vi.hoisted(() => new Map<string, () => void>());

vi.stubGlobal("window", { addEventListener: vi.fn() });
vi.stubGlobal("document", {
  hidden: false,
  addEventListener: (event: string, handler: () => void) => {
    documentEvents.set(event, handler);
  },
});

vi.mock("../src/utils.js", () => ({
  capitalizeFirstLetter: (value: string) => value.charAt(0).toUpperCase() + value.slice(1),
  getStoredJSON: vi.fn(<T>(key: string, fallback: T) => (stored.has(key) ? stored.get(key) : fallback) as T),
  resolveProtocolRelativeUrl: (url: string, base: string) => {
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `${base}${url}`;
    return url;
  },
  setStoredJSON: vi.fn((key: string, value: unknown) => stored.set(key, value)),
  withinRateLimit: vi.fn(() => ({ limited: false, timestamps: [] })),
}));

vi.mock("../src/state.js", () => ({
  state,
  notifyState: mocks.notifyState,
  radioAudio: {
    currentTime: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    paused: false,
    addEventListener: vi.fn(),
  },
  getPlaybackState: () => mocks.playbackState,
  setPlaybackState: (value: string) => {
    mocks.playbackState = value;
  },
  getMetadataState: () => mocks.metadataState,
  setMetadataState: (value: string) => {
    mocks.metadataState = value;
  },
  setLiveTrack: vi.fn(),
  getLiveTrackUpdatedAt: () => Date.now(),
  intervals: { track: null, sleep: null },
}));

vi.mock("../src/ui.js", () => ({
  setPlaybackStatus: vi.fn(),
  resolveAlbumCoverUrl: vi.fn(() => ""),
  setHistoryLoadingState: vi.fn(),
  updateAlbumArt: vi.fn(),
  updateHistoryUI: vi.fn(),
  updateNowPlayingTrack: vi.fn(),
}));

vi.mock("../src/controls.js", () => ({
  applyAudioVolume: vi.fn(),
}));

vi.mock("../src/providers/eska.js", () => ({
  readZprTag: vi.fn(() => false),
  startEskaSession: vi.fn(),
}));

vi.mock("../src/providers/rmf.js", () => ({
  rmfProvider: { name: "RMF", parse: vi.fn() },
}));

vi.mock("../src/providers/trojka.js", () => ({
  trojkaProvider: { name: "Trojka", parse: vi.fn() },
}));

vi.mock("../src/providers.js", () => ({
  getProvider: vi.fn((station?: Station | null) => {
    if (station?.provider === "rmf") return { name: "RMF", parse: vi.fn() };
    if (station?.provider === "trojka") return { name: "Trojka", parse: vi.fn() };
    if (station?.provider === "eska") return { name: "ESKA", parse: vi.fn() };
    return { name: "Generic", parse: vi.fn() };
  }),
}));

vi.mock("../src/smartListening.js", () => ({
  evaluateSmartListening: vi.fn(),
  resetSmartListening: vi.fn(),
}));

vi.mock("../src/statisticsPlayback.js", () => ({
  bindListeningStatistics: vi.fn(),
  listeningStatistics: {
    suspend: vi.fn(),
    route: vi.fn(),
    selectStation: vi.fn(),
    recovery: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock("hls.js", () => ({
  default: class FakeHls {
    static Events = { ERROR: "error", FRAG_LOADED: "fragLoaded", FRAG_CHANGED: "fragChanged" };
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
    static isSupported() {
      return true;
    }
    destroy = vi.fn();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    on = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
  },
}));

beforeEach(() => {
  stored.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Station Runtime Ownership (F5)", () => {
  describe("Runtime consistency across reselection", () => {
    it("maintains consistent runtime state for built-in stations across A → B → A", async () => {
      const { getAllKnownStations } = await import("../src/catalog.js");
      const { getStationRuntime } = await import("../src/player.js");

      const stations = getAllKnownStations();
      const stationA = stations.find((s) => s.id === "rmf")!;
      const stationB = stations.find((s) => s.id === "trojka")!;

      // First selection of A
      const runtime1 = getStationRuntime(stationA);
      runtime1.streams = ["https://stream1.mp3", "https://stream2.mp3"];
      runtime1.currentStreamIndex = 1;
      runtime1.streamsFetched = true;

      // Switch to B
      getStationRuntime(stationB);

      // Switch back to A - should get the same runtime object
      const stations2 = getAllKnownStations();
      const stationA2 = stations2.find((s) => s.id === "rmf")!;
      const runtime2 = getStationRuntime(stationA2);

      expect(runtime2.streams).toEqual(["https://stream1.mp3", "https://stream2.mp3"]);
      expect(runtime2.currentStreamIndex).toBe(1);
      expect(runtime2.streamsFetched).toBe(true);
    });

    it("maintains consistent runtime state for catalog-derived stations across A → B → A", async () => {
      // Setup ESKA catalog
      stored.set("kajtek_eska_catalog", {
        fetchedAt: Date.now(),
        stations: [
          {
            uid: "test-1",
            name: "Test ESKA 1",
            stream_url: "https://stream1.mp3",
            stream_ic: "https://ic1.aac",
            now_playing_url: "2980",
            cover: "",
            sort: 1,
          },
          {
            uid: "test-2",
            name: "Test ESKA 2",
            stream_url: "https://stream2.mp3",
            now_playing_url: "2981",
            cover: "",
            sort: 2,
          },
        ],
      });

      const { getAllKnownStations } = await import("../src/catalog.js");
      const { getStationRuntime } = await import("../src/player.js");

      const stations1 = getAllKnownStations();
      const stationA1 = stations1.find((s) => s.id === "eska_test-1")!;
      const stationB1 = stations1.find((s) => s.id === "eska_test-2")!;

      // First selection of A
      const runtime1 = getStationRuntime(stationA1);
      runtime1.streams = ["https://resolved1.mp3", "https://resolved2.mp3"];
      runtime1.currentStreamIndex = 1;
      runtime1.streamsFetched = true;

      // Switch to B
      getStationRuntime(stationB1);

      // Get fresh catalog objects (simulating reselection)
      const stations2 = getAllKnownStations();
      const stationA2 = stations2.find((s) => s.id === "eska_test-1")!;
      const stationB2 = stations2.find((s) => s.id === "eska_test-2")!;

      // Switch back to A
      const runtime2 = getStationRuntime(stationA2);

      // Should maintain runtime state even though station object is different
      expect(runtime2.streams).toEqual(["https://resolved1.mp3", "https://resolved2.mp3"]);
      expect(runtime2.currentStreamIndex).toBe(1);
      expect(runtime2.streamsFetched).toBe(true);

      // B should have its own runtime
      const runtimeB = getStationRuntime(stationB2);
      expect(runtimeB.streams).toBeUndefined();
    });

    it("maintains consistent runtime state for custom stations across A → B → A", async () => {
      stored.set("kajtek_custom_stations", [
        { id: "custom_1", name: "Custom 1", stream: "https://custom1.mp3" },
        { id: "custom_2", name: "Custom 2", stream: "https://custom2.mp3" },
      ]);

      const { getAllKnownStations } = await import("../src/catalog.js");
      const { getStationRuntime } = await import("../src/player.js");

      const stations1 = getAllKnownStations();
      const stationA1 = stations1.find((s) => s.id === "custom_1")!;
      const stationB1 = stations1.find((s) => s.id === "custom_2")!;

      // First selection of A
      const runtime1 = getStationRuntime(stationA1);
      runtime1.streams = ["https://resolved.mp3"];
      runtime1.currentStreamIndex = 0;

      // Switch to B
      getStationRuntime(stationB1);

      // Get fresh catalog objects
      const stations2 = getAllKnownStations();
      const stationA2 = stations2.find((s) => s.id === "custom_1")!;

      // Switch back to A
      const runtime2 = getStationRuntime(stationA2);

      expect(runtime2.streams).toEqual(["https://resolved.mp3"]);
      expect(runtime2.currentStreamIndex).toBe(0);
    });
  });

  describe("Configuration invalidation", () => {
    it("invalidates runtime when station stream URL changes", async () => {
      stored.set("kajtek_custom_stations", [{ id: "custom_1", name: "Custom 1", stream: "https://original.mp3" }]);

      const { getAllKnownStations } = await import("../src/catalog.js");
      const { getStationRuntime } = await import("../src/player.js");

      const stations1 = getAllKnownStations();
      const station1 = stations1.find((s) => s.id === "custom_1")!;

      const runtime1 = getStationRuntime(station1);
      runtime1.streams = ["https://resolved.mp3"];
      runtime1.currentStreamIndex = 1;

      // Change the stream URL
      stored.set("kajtek_custom_stations", [{ id: "custom_1", name: "Custom 1", stream: "https://changed.mp3" }]);

      const stations2 = getAllKnownStations();
      const station2 = stations2.find((s) => s.id === "custom_1")!;

      const runtime2 = getStationRuntime(station2);

      // Runtime should be invalidated and reset
      expect(runtime2.streams).toBeUndefined();
      expect(runtime2.currentStreamIndex).toBeUndefined();
    });

    it("invalidates runtime when station _streams configuration changes", async () => {
      // Setup initial ESKA catalog
      stored.set("kajtek_eska_catalog", {
        fetchedAt: Date.now(),
        stations: [
          {
            uid: "test-1",
            name: "Test ESKA",
            stream_url: "https://stream1.mp3",
            stream_ic: "https://ic1.aac",
            now_playing_url: "2980",
            cover: "",
            sort: 1,
          },
        ],
      });

      const { getAllKnownStations } = await import("../src/catalog.js");
      const { getStationRuntime } = await import("../src/player.js");

      const stations1 = getAllKnownStations();
      const station1 = stations1.find((s) => s.id === "eska_test-1")!;

      const runtime1 = getStationRuntime(station1);
      runtime1.streams = ["https://resolved.mp3"];
      runtime1.currentStreamIndex = 1;

      // Change the catalog (simulating catalog refresh with different streams)
      stored.set("kajtek_eska_catalog", {
        fetchedAt: Date.now(),
        stations: [
          {
            uid: "test-1",
            name: "Test ESKA",
            stream_url: "https://stream2.mp3", // Changed
            stream_ic: "https://ic2.aac", // Changed
            now_playing_url: "2980",
            cover: "",
            sort: 1,
          },
        ],
      });

      const stations2 = getAllKnownStations();
      const station2 = stations2.find((s) => s.id === "eska_test-1")!;

      const runtime2 = getStationRuntime(station2);

      // Runtime should be invalidated and recreated with new config
      expect(runtime2.streams).toEqual(["https://ic2.aac", "https://stream2.mp3"]);
      expect(runtime2.currentStreamIndex).toBeUndefined();
    });

    it("preserves runtime when only display metadata changes", async () => {
      stored.set("kajtek_custom_stations", [{ id: "custom_1", name: "Original Name", stream: "https://stream.mp3" }]);

      const { getAllKnownStations } = await import("../src/catalog.js");
      const { getStationRuntime } = await import("../src/player.js");

      const stations1 = getAllKnownStations();
      const station1 = stations1.find((s) => s.id === "custom_1")!;

      const runtime1 = getStationRuntime(station1);
      runtime1.streams = ["https://resolved.mp3"];
      runtime1.currentStreamIndex = 1;

      // Change only the name (display metadata)
      stored.set("kajtek_custom_stations", [{ id: "custom_1", name: "Changed Name", stream: "https://stream.mp3" }]);

      const stations2 = getAllKnownStations();
      const station2 = stations2.find((s) => s.id === "custom_1")!;

      const runtime2 = getStationRuntime(station2);

      // Runtime should be preserved (stream URL unchanged)
      expect(runtime2.streams).toEqual(["https://resolved.mp3"]);
      expect(runtime2.currentStreamIndex).toBe(1);
    });
  });

  describe("Explicit lifetime management", () => {
    it("clears failure state on station selection", async () => {
      const { getStationRuntime, clearStationRuntime } = await import("../src/player.js");

      const station: Station = {
        id: "test",
        name: "Test",
        short: "TST",
        cat: "test",
        provider: "generic",
        stream: "https://stream.mp3",
      };

      const runtime = getStationRuntime(station);
      runtime.consecutiveFailures = 5;
      runtime.apiFailed = true;

      clearStationRuntime(station.id);

      const runtime2 = getStationRuntime(station);
      expect(runtime2.consecutiveFailures).toBeUndefined();
      expect(runtime2.apiFailed).toBeUndefined();
      // Stream state should remain undefined until actual resolution occurs
      expect(runtime2.streams).toBeUndefined();
    });

    it("invalidates entire runtime when explicitly requested", async () => {
      const { getStationRuntime, invalidateStationRuntime } = await import("../src/player.js");

      const station: Station = {
        id: "test",
        name: "Test",
        short: "TST",
        cat: "test",
        provider: "generic",
        stream: "https://stream.mp3",
      };

      const runtime1 = getStationRuntime(station);
      runtime1.streams = ["https://resolved.mp3"];
      runtime1.currentStreamIndex = 1;
      runtime1.streamsFetched = true;

      invalidateStationRuntime(station.id);

      const runtime2 = getStationRuntime(station);
      // All state should be cleared
      expect(runtime2.streams).toBeUndefined();
      expect(runtime2.currentStreamIndex).toBeUndefined();
      expect(runtime2.streamsFetched).toBeUndefined();
    });
  });

  describe("Stream resolution behavior", () => {
    it("seeds runtime streams from station._streams when available", async () => {
      const { getStationRuntime } = await import("../src/player.js");

      const station: Station = {
        id: "test",
        name: "Test",
        short: "TST",
        cat: "test",
        provider: "generic",
        stream: "https://primary.mp3",
        _streams: ["https://primary.mp3", "https://backup.mp3"],
      };

      const runtime = getStationRuntime(station);

      expect(runtime.streams).toEqual(["https://primary.mp3", "https://backup.mp3"]);
    });

    it("does not seed runtime streams when _streams not available", async () => {
      const { getStationRuntime } = await import("../src/player.js");

      const station: Station = {
        id: "test",
        name: "Test",
        short: "TST",
        cat: "test",
        provider: "generic",
        stream: "https://stream.mp3",
      };

      const runtime = getStationRuntime(station);

      // Runtime streams should be undefined until actual resolution occurs
      expect(runtime.streams).toBeUndefined();
    });
  });
});
