import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Station, TrackInfo } from "../src/types.js";

const mocks = vi.hoisted(() => ({
  stations: [] as Station[],
  state: {
    playing: false,
    station: null as Station | null,
    liveTrack: null as TrackInfo | null,
    favTracks: [],
    viewMode: "grid",
  },
  els: {} as { stationListContainer?: unknown },
  listeners: new Set<() => void>(),
  liveListeners: new Set<() => void>(),
  fetch: vi.fn(),
  catalog: vi.fn(),
  blacklisted: false,
}));
vi.mock("../src/catalog.js", () => ({ getEnabledStations: () => mocks.stations }));
vi.mock("../src/metadata.js", () => ({ fetchMetadata: mocks.fetch }));
vi.mock("../src/ui/elements.js", () => ({ els: mocks.els }));
vi.mock("../src/ui/catalog/modal.js", () => ({ openCatalogModal: mocks.catalog }));
vi.mock("../src/state.js", () => ({
  state: mocks.state,
  getLiveTrackUpdatedAt: () => Date.now(),
  notifyState: () => {
    mocks.listeners.forEach((listener) => {
      listener();
    });
  },
  subscribeState: (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
  subscribeLiveTrack: (listener: () => void) => {
    mocks.liveListeners.add(listener);
    return () => mocks.liveListeners.delete(listener);
  },
}));
vi.mock("../src/utils.js", () => ({
  escapeHtml: (value: string) => value,
  getStoredJSON: (key: string, fallback: unknown) =>
    mocks.blacklisted && key === "kajtek_blacklist"
      ? [{ key: "artist::song", artist: "Artist", title: "Song" }]
      : fallback,
}));

import { initStationBrowser } from "../src/ui/stationBrowser.js";

class ElementStub {
  readonly children: ElementStub[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly events = new Map<string, () => void>();
  readonly classList = { toggle: vi.fn() };
  className = "";
  type = "";
  hidden = false;
  innerHTML = "";
  textContent = "";
  tabIndex = 0;
  parent: ElementStub | null = null;
  onclick: (() => void) | null = null;
  onkeydown: ((event: { key: string; preventDefault: () => void }) => void) | null = null;
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  querySelector() {
    return this.children[0] ?? null;
  }
  querySelectorAll() {
    return this.children;
  }
  addEventListener(event: string, listener: () => void) {
    this.events.set(event, listener);
  }
  appendChild(child: ElementStub) {
    child.parent = this;
    this.children.push(child);
  }
  insertBefore(child: ElementStub, before: ElementStub | null) {
    child.remove();
    child.parent = this;
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, child);
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  contains(child: ElementStub): boolean {
    return this.children.some((item) => item === child || item.contains(child));
  }
  click() {
    this.onclick?.();
    this.events.get("click")?.();
  }
  focus() {
    documentStub.activeElement = this;
  }
}
const documentStub = {
  hidden: false,
  activeElement: null as ElementStub | null,
  getElementById: (id: string) => elements.get(id) ?? null,
  querySelector: (selector: string) => elements.get(selector.slice(1)) ?? null,
  createElement: () => new ElementStub(),
  events: new Map<string, () => void>(),
  addEventListener: (event: string, listener: () => void) => {
    documentStub.events.set(event, listener);
  },
  removeEventListener: (event: string) => {
    documentStub.events.delete(event);
  },
};
const elements = new Map<string, ElementStub>();
const station: Station = {
  id: "a",
  name: "Radio A",
  short: "A",
  provider: "rmf",
  cat: "test",
  stream: "/audio",
  apiBaseUrl: "/api/a",
};
let cleanup: (() => void) | undefined;
const element = (id: string) => {
  const value = elements.get(id);
  if (!value) throw new Error(id);
  return value;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  vi.clearAllMocks();
  elements.clear();
  documentStub.events.clear();
  documentStub.hidden = false;
  documentStub.activeElement = null;
  mocks.listeners.clear();
  mocks.liveListeners.clear();
  mocks.stations = [station];
  mocks.state.playing = false;
  mocks.state.station = null;
  mocks.state.liveTrack = null;
  mocks.state.viewMode = "grid";
  mocks.blacklisted = false;
  mocks.fetch.mockResolvedValue({ current: { artist: "Artist", title: "Song" }, all: [] });
  for (const id of [
    "browser-stations",
    "browser-now",
    "now-playing-browser",
    "discovery-list",
    "discovery-status",
    "discovery-empty",
    "discovery-empty-text",
    "station-view-toggle",
    "station-list-container",
    "open-catalog-btn",
    "discovery-back",
    "discovery-catalog",
  ])
    elements.set(id, new ElementStub());
  for (const mode of ["list", "grid"]) {
    const button = new ElementStub();
    button.dataset.view = mode;
    element("station-view-toggle").appendChild(button);
  }
  element("now-playing-browser").hidden = true;
  mocks.els.stationListContainer = element("station-list-container");
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("HTMLButtonElement", ElementStub);
  vi.stubGlobal("localStorage", { setItem: vi.fn() });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("station browser wiring and lifecycle", () => {
  it("defaults to stations, preserves grid preference and never fetches until discovery is active", async () => {
    cleanup = initStationBrowser(vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.state.viewMode).toBe("grid");
    expect(element("station-view-toggle").dataset.view).toBe("grid");
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(element("station-list-container").hidden).toBe(true);
    expect(element("station-view-toggle").hidden).toBe(true);
    expect(element("now-playing-browser").hidden).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    element("browser-stations").click();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.state.viewMode).toBe("grid");
    expect(element("station-list-container").hidden).toBe(false);
  });
  it("routes clicks through the supplied station callback, including blacklisted content", async () => {
    mocks.blacklisted = true;
    const select = vi.fn();
    cleanup = initStationBrowser(select);
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    const button = element("discovery-list").children[0]?.children[0];
    expect(button?.attributes.get("aria-label")).toBe("Odtwórz Artist – Song na Radio A");
    expect(button?.innerHTML).toContain("czarna lista");
    button?.click();
    expect(select).toHaveBeenCalledWith(station);
    expect(mocks.state.playing).toBe(false);
  });
  it("stops while hidden, resumes once visible, and cleans up subscriptions", async () => {
    cleanup = initStationBrowser(vi.fn());
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    documentStub.hidden = true;
    documentStub.events.get("visibilitychange")?.();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    documentStub.hidden = false;
    documentStub.events.get("visibilitychange")?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    cleanup();
    cleanup = undefined;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.listeners.size).toBe(0);
    expect(mocks.liveListeners.size).toBe(0);
  });
  it("reconciles enabled stations without letting an obsolete reply restore disabled results", async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    cleanup = initStationBrowser(vi.fn());
    element("browser-now").click();
    mocks.stations = [];
    mocks.listeners.forEach((listener) => {
      listener();
    });
    finish({ current: { artist: "Old", title: "Late" }, all: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(element("discovery-list").children).toHaveLength(0);
    expect(element("discovery-empty").hidden).toBe(false);
    expect(element("discovery-empty-text").textContent).toContain("Włącz stacje");
  });
  it("uses arrow-key tabs without changing playback and keeps catalog accessible in both modes", async () => {
    cleanup = initStationBrowser(vi.fn());
    const preventDefault = vi.fn();
    element("browser-stations").onkeydown?.({ key: "ArrowRight", preventDefault });
    await vi.advanceTimersByTimeAsync(0);
    expect(element("browser-now").attributes.get("aria-selected")).toBe("true");
    expect(documentStub.activeElement).toBe(element("browser-now"));
    expect(mocks.state.playing).toBe(false);
    element("open-catalog-btn").click();
    element("discovery-catalog").click();
    expect(mocks.catalog).toHaveBeenCalledTimes(2);
    element("discovery-back").click();
    expect(documentStub.activeElement).toBe(element("browser-stations"));
  });
  it("reuses new active tracks immediately and preserves the focused result during refresh", async () => {
    cleanup = initStationBrowser(vi.fn());
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    const button = element("discovery-list").children[0]?.children[0];
    button?.focus();
    mocks.state.station = station;
    mocks.state.playing = true;
    mocks.state.liveTrack = { artist: "Live", title: "Current" };
    mocks.liveListeners.forEach((listener) => {
      listener();
    });
    expect(button?.attributes.get("aria-label")).toBe("Odtwórz Live – Current na Radio A");
    expect(documentStub.activeElement).toBe(button);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
