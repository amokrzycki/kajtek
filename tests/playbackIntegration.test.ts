import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackState } from "../src/state.js";
import type { Station } from "../src/types.js";

const catalog = vi.hoisted(() => ({ stations: [] as Station[] }));
vi.mock("../src/catalog.js", () => ({
  getEnabledStations: () => catalog.stations,
  getOrderedStations: () => catalog.stations,
  getSmartStations: () => [...catalog.stations],
  getStoredRmfCatalog: () => null,
  setStationFavorite: vi.fn(),
}));
vi.mock("../src/ui/history.js", () => ({
  setHistoryLoadingState: vi.fn(),
  triggerHistorySlideIn: vi.fn(),
  updateHistoryUI: vi.fn(),
}));
vi.mock("../src/ui/favorites.js", () => ({
  applyHistoryTabVisibility: vi.fn(),
  isTrackFavorited: () => false,
  renderFavoritesUI: vi.fn(),
  toggleFavTrack: vi.fn(),
}));
vi.mock("../src/ui/stations.js", () => ({ renderStationList: vi.fn() }));
vi.mock("../src/visualizer.js", () => ({ startVisualizer: vi.fn(), stopVisualizer: vi.fn() }));

class ElementStub {
  textContent = "";
  innerHTML = "";
  hidden = false;
  inert = false;
  value = "";
  dataset: Record<string, string> = {};
  children: ElementStub[] = [];
  style = { setProperty: vi.fn() };
  private classes = new Set<string>();
  classList = {
    contains: (name: string) => this.classes.has(name),
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, on: boolean) => (on ? this.classes.add(name) : this.classes.delete(name)),
  };
  setAttribute = vi.fn();
  removeAttribute = vi.fn();
  querySelector = () => null;
  contains = () => false;
}

class ControlledAudio extends EventTarget {
  paused = true;
  ended = false;
  error = null;
  currentTime = 0;
  playbackRate = 1;
  crossOrigin = "";
  src = "";
  muted = false;
  volume = 1;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  emit(event: string): void {
    this.dispatchEvent(new Event(event));
  }
}

function station(id: string): Station {
  return {
    id,
    name: id,
    short: id,
    cat: "test",
    provider: "generic",
    stream: `https://test/${id}.mp3`,
    apiBaseUrl: `/${id}`,
  };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

let store: typeof import("../src/state.js");
let player: typeof import("../src/player.js");
let ui: typeof import("../src/ui.js");
let smart: typeof import("../src/smartListening.js");
let snapshots: typeof import("../src/stationSnapshots.js");
let audio: ControlledAudio;
let elements: Map<string, ElementStub>;
const fetchMock = vi.fn<typeof fetch>();
const tracks = new Map<string, string>();
let observed: PlaybackState[];

async function settle(): Promise<void> {
  await vi.dynamicImportSettled();
}
function refreshUI(): void {
  ui.updateUI(store.state.liveTrack, player.selectStation, vi.fn());
}
async function enableSmart(): Promise<void> {
  const preferences = await import("../src/listeningPreferences.js");
  preferences.setListeningPreference("track", "Artist", "Blocked", "negative");
  preferences.updateSmartListeningConfig({ enabled: true });
  smart.initSmartListening();
  await settle();
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  elements = new Map();
  const element = (id: string) => {
    let value = elements.get(id);
    if (!value) {
      value = new ElementStub();
      elements.set(id, value);
    }
    return value;
  };
  vi.stubGlobal("HTMLElement", ElementStub);
  vi.stubGlobal("document", {
    hidden: false,
    activeElement: null,
    documentElement: new ElementStub(),
    getElementById: element,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
  });
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn() }),
    addEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", { userAgent: "test" });
  vi.stubGlobal(
    "DOMParser",
    class {
      parseFromString(text: string) {
        return { documentElement: { textContent: text } };
      }
    },
  );
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("Audio", ControlledAudio);
  tracks.clear();
  catalog.stations = [station("origin"), station("target"), station("manual")];
  fetchMock.mockReset().mockImplementation(async (input) => {
    const id = String(input).split("/")[1] ?? "";
    return Response.json({ artist: "Artist", title: tracks.get(id) ?? "Safe" });
  });
  vi.stubGlobal("fetch", fetchMock);
  store = await import("../src/state.js");
  if (!(store.radioAudio instanceof ControlledAudio)) throw new Error("Expected controlled audio");
  audio = store.radioAudio;
  player = await import("../src/player.js");
  ui = await import("../src/ui.js");
  smart = await import("../src/smartListening.js");
  snapshots = await import("../src/stationSnapshots.js");
  observed = [];
  store.subscribeState(() => {
    observed.push(store.getPlaybackState());
    refreshUI();
  });
});
afterEach(() => {
  snapshots.sharedSnapshots.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("playback status ownership", () => {
  it("renders idle and connecting → buffering → playing without writing authoritative status", async () => {
    refreshUI();
    expect(store.getPlaybackState()).toBe("idle");
    expect(ui.els.npStatus.textContent).toBe("Gotowy");
    player.selectStation(station("origin"));
    await settle();
    expect(store.getPlaybackState()).toBe("connecting");
    expect(ui.els.npStatus.textContent).toBe("Łączenie…");
    audio.emit("waiting");
    expect(store.getPlaybackState()).toBe("buffering");
    expect(ui.els.npLiveDot.classList.contains("buffering")).toBe(true);
    audio.emit("playing");
    expect(store.getPlaybackState()).toBe("playing");
    expect(ui.els.npStatus.textContent).toBe("Na żywo");
    expect(ui.els.npLiveDot.classList.contains("buffering")).toBe(false);
    expect(observed).not.toContain("idle");
    store.setPlaybackState("paused");
    ui.setPlaybackStatus("Pauza");
    refreshUI();
    expect(store.getPlaybackState()).toBe("paused");
    store.state.station = null;
    refreshUI();
    expect(store.getPlaybackState()).toBe("paused");
  });

  it("keeps an idle player idle when a sleep timer expires before station selection", async () => {
    const { setSleepTimer } = await import("../src/controls.js");
    setSleepTimer(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getPlaybackState()).toBe("idle");
    expect(store.state.playing).toBe(false);
    expect(ui.els.npStatus.textContent).toBe("Gotowy");
  });

  it("preserves terminal failure through pause without relying on the failed CSS class", async () => {
    player.selectStation(station("origin"));
    for (let i = 0; i < 4; i++) audio.emit("error");
    await settle();
    expect(store.getPlaybackState()).toBe("failed");
    expect(store.state.playing).toBe(false);
    expect(observed.at(-1)).toBe("failed");
    ui.els.npLiveDot.classList.remove("failed");
    audio.emit("pause");
    expect(store.getPlaybackState()).toBe("failed");
    expect(ui.els.npStatus.textContent).toContain("Nie udało się połączyć");
    for (const event of ["waiting", "stalled", "error", "playing"]) audio.emit(event);
    expect(store.getPlaybackState()).toBe("failed");
    expect(store.state.playing).toBe(false);
  });

  it("publishes rejection before subscribers run and recovers without accepting an obsolete play rejection", async () => {
    audio.play.mockRejectedValueOnce(new Error("decoder failed"));
    player.selectStation(station("origin"));
    await settle();
    expect(store.getPlaybackState()).toBe("failed");
    expect(observed.at(-1)).toBe("failed");
    expect(ui.els.npRetry.hidden).toBe(false);
    const obsolete = deferred<void>();
    audio.play.mockReturnValueOnce(obsolete.promise);
    player.togglePlay();
    expect(store.getPlaybackState()).toBe("connecting");
    player.selectStation(station("target"));
    await settle();
    audio.emit("playing");
    obsolete.reject(new Error("old source failed"));
    await settle();
    expect(store.state.station?.id).toBe("target");
    expect(store.getPlaybackState()).toBe("playing");
    expect(ui.els.npRetry.hidden).toBe(true);
  });

  it("publishes replacement status before live-metadata subscribers observe the new selection", async () => {
    audio.play.mockRejectedValueOnce(new Error("decoder failed"));
    player.selectStation(station("origin"));
    await settle();
    const selection: { station: string | undefined; intent: boolean; status: PlaybackState }[] = [];
    store.subscribeLiveTrack(() =>
      selection.push({
        station: store.state.station?.id,
        intent: store.state.playing,
        status: store.getPlaybackState(),
      }),
    );
    player.selectStation(station("target"));
    expect(selection[0]).toEqual({ station: "target", intent: true, status: "connecting" });
  });

  it.each(["pause", "sleep"])("finalizes %s while connecting even when audio emits no pause event", async (mode) => {
    const pending = deferred<void>();
    audio.play.mockReturnValueOnce(pending.promise);
    player.selectStation(station("origin"));
    expect(audio.paused).toBe(true);
    if (mode === "pause") player.togglePlay();
    else {
      const { setSleepTimer } = await import("../src/controls.js");
      setSleepTimer(0);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(store.state.playing).toBe(false);
    expect(store.getPlaybackState()).toBe("paused");
    expect(audio.paused).toBe(true);
    expect(store.intervals.track).toBeNull();
    expect(ui.els.npStatus.textContent).toBe("Pauza");
    pending.reject(new Error("interrupted"));
    await settle();
    expect(store.getPlaybackState()).toBe("paused");
    player.togglePlay();
    await settle();
    audio.emit("playing");
    const polling = store.intervals.track;
    audio.emit("playing");
    expect(store.intervals.track).toBe(polling);
    expect(store.getPlaybackState()).toBe("playing");
  });
});

describe("Smart Listening runtime joins", () => {
  it("keeps active unknown metadata authoritative when a pending passive rejection arrives after selection", async () => {
    const old = deferred<Response>();
    fetchMock.mockImplementationOnce(() => old.promise);
    snapshots.sharedSnapshots.setDemand("discovery", [station("origin")]);
    fetchMock.mockImplementation(async (input) =>
      Response.json(String(input).startsWith("/origin/") ? [] : { artist: "Artist", title: "Safe" }),
    );
    player.selectStation(station("origin"));
    await enableSmart();
    old.resolve(Response.json({ artist: "Artist", title: "Blocked" }));
    await settle();
    expect(snapshots.sharedSnapshots.snapshots([station("origin")])[0]).toMatchObject({
      source: "player",
      track: null,
    });
    await vi.advanceTimersByTimeAsync(6000);
    expect(store.state.station?.id).toBe("origin");
    expect(smart.getSmartListeningStatus()).toBeNull();
  });

  it.each(["warning", "detour"])("manual selection cancels %s and pending switch-now work", async (phase) => {
    tracks.set("origin", "Blocked");
    player.selectStation(station("origin"));
    await enableSmart();
    expect(smart.getSmartListeningStatus()?.phase).toBe("warning");
    if (phase === "detour") {
      smart.switchSmartNow();
      await settle();
      audio.emit("playing");
      expect(smart.getSmartListeningStatus()?.phase).toBe("detour");
      tracks.set("target", "Blocked");
      await vi.advanceTimersByTimeAsync(5000);
      expect(smart.getSmartListeningStatus()?.phase).toBe("warning");
    }
    const pending = deferred<Response>();
    fetchMock.mockImplementationOnce(() => pending.promise);
    vi.setSystemTime(Date.now() + 15_000);
    const refresh = snapshots.sharedSnapshots.refresh();
    smart.switchSmartNow();
    expect(smart.getSmartListeningStatus()?.checking).toBe(true);
    player.selectStation(station("manual"));
    pending.resolve(Response.json({ artist: "Artist", title: "Safe" }));
    await refresh;
    await settle();
    await vi.advanceTimersByTimeAsync(6000);
    expect(store.state.station?.id).toBe("manual");
    expect(smart.getSmartListeningStatus()).toBeNull();
    tracks.set("manual", "Blocked");
    await vi.advanceTimersByTimeAsync(5000);
    expect(smart.getSmartListeningStatus()?.originStation.id).toBe("manual");
  });

  it("suspends a real detour on pause and resumes return confirmation with coherent presentation", async () => {
    tracks.set("origin", "Blocked");
    player.selectStation(station("origin"));
    await enableSmart();
    const warning = smart.getSmartListeningStatus();
    expect(ui.els.smartWarningContent.innerHTML).toContain("Za chwilę: target");
    refreshUI();
    expect(smart.getSmartListeningStatus()).toEqual(warning);
    smart.switchSmartNow();
    await settle();
    expect(store.state.station?.id).toBe("target");
    expect(ui.els.smartWarningContent.innerHTML).toContain("Łączenie: target");
    audio.emit("playing");
    expect(ui.els.smartWarningContent.innerHTML).toContain("Gra: target");
    player.togglePlay();
    expect(store.getPlaybackState()).toBe("paused");
    expect(smart.getSmartListeningStatus()).toMatchObject({ phase: "detour", playback: "paused" });
    expect(ui.els.smartWarningContent.innerHTML).toContain("Odtwarzanie wstrzymane: target");
    tracks.set("origin", "Safe");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(store.state.station?.id).toBe("target");
    player.togglePlay();
    await settle();
    audio.emit("playing");
    expect(smart.getSmartListeningStatus()).toMatchObject({
      phase: "detour",
      playback: "playing",
      returnWait: "confirming",
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.state.station?.id).toBe("target");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.state.station?.id).toBe("origin");
    expect(smart.getSmartListeningStatus()).toBeNull();
  });
});
