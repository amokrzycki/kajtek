import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/consts.js";

vi.mock("../src/catalog.js", () => ({ getEnabledStations: () => [] }));
vi.mock("../src/controls.js", () => ({ isVolAnimating: () => false }));
vi.mock("../src/visualizer.js", () => ({ startVisualizer: vi.fn(), stopVisualizer: vi.fn() }));
vi.mock("../src/ui/favorites.js", () => ({
  applyHistoryTabVisibility: vi.fn(),
  isTrackFavorited: () => false,
  renderFavoritesUI: vi.fn(),
  toggleFavTrack: vi.fn(),
}));
vi.mock("../src/ui/history.js", () => ({
  setHistoryLoadingState: vi.fn(),
  triggerHistorySlideIn: vi.fn(),
  updateHistoryUI: vi.fn(),
}));
vi.mock("../src/ui/smartListening/warning.js", () => ({ renderSmartListeningWarning: vi.fn() }));
vi.mock("../src/ui/stations.js", () => ({ renderStationList: vi.fn() }));
vi.mock("../src/ui/modal.js", () => ({ openModal: vi.fn(), closeModal: vi.fn(), bindModalDismiss: vi.fn() }));
vi.mock("../src/ui/smartListening/modal.js", () => ({ openSmartListeningModal: vi.fn() }));
vi.mock("../src/ui/elements.js", () => ({
  els: elements,
  initVolumeControlUI: vi.fn(),
  initVU: vi.fn(),
  renderVolLadder: vi.fn(),
}));

class ElementStub {
  id = "";
  className = "";
  innerHTML = "";
  textContent = "";
  hidden = false;
  dataset: Record<string, string> = {};
  nodes = new Map<string, ElementStub>();
  attributes = new Map<string, string>();
  events = new Map<string, (event: { target: ElementStub }) => void>();
  classList = { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() };
  style = { setProperty: vi.fn() };
  querySelector(selector: string): ElementStub | null {
    if (selector === ".album-art-img") return null;
    let node = this.nodes.get(selector);
    if (!node) {
      node = new ElementStub();
      this.nodes.set(selector, node);
    }
    return node;
  }
  querySelectorAll(): ElementStub[] {
    return [];
  }
  addEventListener(event: string, handler: (event: { target: ElementStub }) => void): void {
    this.events.set(event, handler);
  }
  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }
  removeAttribute(key: string): void {
    this.attributes.delete(key);
  }
  closest(): ElementStub {
    return this;
  }
}

const elements = Object.fromEntries(
  [
    "darkToggle",
    "vuStrip",
    "reelLeft",
    "reelRight",
    "playBtn",
    "npShortRow",
    "npShort",
    "npStation",
    "npLiveDot",
    "npTrackWrap",
    "npArtist",
    "npTitle",
    "npMetadataState",
    "npStatus",
    "npRetry",
    "albumArt",
    "npFavStar",
    "npBlockBtn",
    "muteBtn",
    "volSlider",
    "volVal",
    "sleepCountLine",
    "sleepCount",
    "smartListeningSwitch",
    "historyToggleBtn",
    "historyPanel",
  ].map((key) => [key, new ElementStub()]),
);
Object.assign(elements, { sleepKeys: [] });
const storage = new Map<string, string>();
const write = vi.fn((key: string, value: string) => storage.set(key, value));
let root: ElementStub;
let modal: ElementStub;

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  write.mockClear();
  root = new ElementStub();
  modal = new ElementStub();
  vi.stubGlobal("DOMParser", class {});
  vi.stubGlobal("Audio", class {});
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false, addEventListener: vi.fn() }) });
  vi.stubGlobal("document", {
    documentElement: root,
    activeElement: null,
    querySelector: () => null,
    createElement: () => modal,
    body: { appendChild: vi.fn() },
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: write,
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function init() {
  const stateModule = await import("../src/state.js");
  const ui = await import("../src/ui.js");
  const refresh = () => ui.updateUI(stateModule.state.liveTrack, vi.fn(), vi.fn());
  stateModule.subscribeState(refresh);
  return { ...stateModule, ...ui, refresh };
}
const caseWrites = () => write.mock.calls.filter(([key]) => key === STORAGE_KEYS.CASE);

describe("case preference presentation and persistence", () => {
  it("does not persist during unrelated global rendering or overwrite a newer tab preference", async () => {
    storage.set(STORAGE_KEYS.CASE, "green");
    const { state, refresh, notifyState } = await init();
    refresh();
    storage.set(STORAGE_KEYS.CASE, "blue");
    state.showHistory = true;
    notifyState();
    expect(caseWrites()).toEqual([]);
    expect(storage.get(STORAGE_KEYS.CASE)).toBe("blue");
    expect(root.dataset.case).toBe("green");
  });

  it("explicit Settings selection persists once, applies visually, and restores after reload", async () => {
    const { state, refresh } = await init();
    refresh();
    write.mockClear();
    const { openSettingsModal } = await import("../src/ui/settings/modal.js");
    openSettingsModal();
    const swatch = new ElementStub();
    swatch.dataset.case = "blue";
    modal.querySelector(".k-settings-swatches")?.events.get("click")?.({ target: swatch });
    expect(caseWrites()).toEqual([[STORAGE_KEYS.CASE, "blue"]]);
    expect(state.case).toBe("blue");
    expect(root.dataset.case).toBe("blue");
    vi.resetModules();
    const reloaded = await init();
    reloaded.refresh();
    expect(reloaded.state.case).toBe("blue");
    expect(caseWrites()).toEqual([[STORAGE_KEYS.CASE, "blue"]]);
  });

  it("playback and metadata refreshes leave the case applied without persisting it", async () => {
    storage.set(STORAGE_KEYS.CASE, "pink");
    const { state, setLiveTrack, setMetadataState, notifyState, refresh, updateNowPlayingTrack } = await init();
    state.station = {
      id: "custom",
      name: "Radio",
      short: "Radio",
      cat: "custom",
      provider: "generic",
      stream: "https://example.test/live",
    };
    state.playing = true;
    notifyState();
    const track = { artist: "Artist", title: "Song" };
    setLiveTrack(track);
    setMetadataState("ready");
    updateNowPlayingTrack(track);
    refresh();
    state.playing = false;
    notifyState();
    expect(caseWrites()).toEqual([]);
    expect(root.dataset.case).toBe("pink");
  });

  it.each([undefined, "bogus", "", "BLUE"])("keeps the red fallback for stored %s without writing", async (stored) => {
    if (stored !== undefined) storage.set(STORAGE_KEYS.CASE, stored);
    const { state, refresh } = await init();
    refresh();
    expect(state.case).toBe("red");
    expect(root.dataset.case).toBe("red");
    expect(caseWrites()).toEqual([]);
  });
});
