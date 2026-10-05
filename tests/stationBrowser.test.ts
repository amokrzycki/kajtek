import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/consts.js";
import type { NowPlayingSnapshot } from "../src/nowPlaying.js";
import type { Station, TrackInfo } from "../src/types.js";
import { renderNowPlaying } from "../src/ui/nowPlaying.js";

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
vi.hoisted(() => {
  vi.stubGlobal("DOMParser", class {});
});
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
vi.mock("../src/utils.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils.js")>()),
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
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: vi.fn((name: string, on: boolean) => {
      if (on) this.classes.add(name);
      else this.classes.delete(name);
    }),
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
  };
  className = "";
  type = "";
  hidden = false;
  inert = false;
  private markup = "";
  readonly fields = new Map<string, ElementStub>();
  get innerHTML() {
    return this.markup;
  }
  set innerHTML(value: string) {
    this.markup = value;
    this.fields.clear();
    const imageMatch = value.match(/<img src="([^"]+)"/);
    if (imageMatch) {
      const image = new ElementStub();
      image.src = imageMatch[1] ?? "";
      const fallback = value.match(/data-fallback-src="([^"]+)"/);
      if (fallback?.[1]) image.dataset.fallbackSrc = fallback[1];
      this.fields.set("img", image);
      this.fields.set(".discovery-placeholder", new ElementStub());
    }
    if (value.includes('class="discovery-artwork"')) {
      for (const name of ["artwork", "artist", "title", "station", "badges", "time"]) {
        const field = new ElementStub();
        const match = value.match(
          new RegExp(`<(?:span|time) class="discovery-${name}"[^>]*>([\\s\\S]*?)</(?:span|time)>`),
        );
        field.innerHTML = match?.[1] ?? "";
        this.fields.set(`.discovery-${name}`, field);
      }
    }
  }
  textContent = "";
  readonly style: Record<string, string> = {};
  src = "";
  onerror: (() => void) | null = null;
  tabIndex = 0;
  parent: ElementStub | null = null;
  onclick: (() => void) | null = null;
  onkeydown: ((event: { key: string; preventDefault: () => void }) => void) | null = null;
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  getAttribute(name: string) {
    return name === "src" ? this.src : (this.attributes.get(name) ?? null);
  }
  getBoundingClientRect() {
    return { height: 100 };
  }
  querySelector(selector: string) {
    return this.fields.get(selector) ?? this.children[0] ?? null;
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
  readonly animate = vi.fn(() => {
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const animation = { finished, finish, cancel: vi.fn() };
    animations.push(animation);
    return animation;
  });
}
const animations: { finished: Promise<void>; finish: () => void; cancel: ReturnType<typeof vi.fn> }[] = [];
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
  animations.length = 0;
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
    "browser-panels",
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
  element("now-playing-browser").appendChild(element("discovery-list"));
  mocks.els.stationListContainer = element("station-list-container");
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    matchMedia: () => ({ matches: true }),
  });
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
  it("replaces animations on rapid switches and keeps only the final panel interactive", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    cleanup = initStationBrowser(vi.fn());
    element("browser-now").click();
    const old = animations.slice();
    expect(old).toHaveLength(3);
    expect(element("station-list-container").inert).toBe(true);
    expect(element("station-list-container").attributes.get("aria-hidden")).toBe("true");
    expect(element("now-playing-browser").inert).toBe(false);
    element("browser-stations").click();
    old.forEach((animation) => {
      expect(animation.cancel).toHaveBeenCalled();
      animation.finish();
    });
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(element("now-playing-browser").inert).toBe(false);
    expect(element("station-list-container").inert).toBe(true);
    animations.slice(-3).forEach((animation) => {
      animation.finish();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(element("station-list-container").hidden).toBe(true);
    expect(element("now-playing-browser").hidden).toBe(false);
    expect(element("browser-panels").classes.has("is-transitioning")).toBe(false);
  });
  it("keeps polling independent of animation completion and restores focus before disabling the old panel", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    cleanup = initStationBrowser(vi.fn());
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    const button = element("discovery-list").children[0]?.children[0];
    button?.focus();
    element("now-playing-browser").setAttribute("aria-labelledby", "browser-now");
    element("station-list-container").setAttribute("aria-labelledby", "browser-stations");
    element("browser-stations").click();
    expect(documentStub.activeElement).toBe(element("browser-stations"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(element("station-list-container").inert).toBe(false);
    documentStub.hidden = true;
    documentStub.events.get("visibilitychange")?.();
    expect(element("now-playing-browser").hidden).toBe(true);
    expect(element("browser-panels").classes.has("is-transitioning")).toBe(false);
  });
  it("defaults to stations, preserves grid preference and never fetches until discovery is active", async () => {
    cleanup = initStationBrowser(vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.state.viewMode).toBe("grid");
    expect(element("station-view-toggle").dataset.view).toBe("grid");
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(element("station-list-container").hidden).toBe(true);
    expect(element("station-view-toggle").hidden).toBe(false);
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
  it("shares one persisted view preference and applies it to both panels across mode switches", async () => {
    const select = vi.fn();
    cleanup = initStationBrowser(select);
    const [list, grid] = element("station-view-toggle").children;
    const assertView = (mode: string) => {
      expect(mocks.state.viewMode).toBe(mode);
      for (const id of ["station-list-container", "now-playing-browser"])
        expect(element(id).classes.has("is-grid-view")).toBe(mode === "grid");
      expect(element("station-view-toggle").hidden).toBe(false);
    };
    assertView("grid");
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    const button = element("discovery-list").children[0]?.children[0];
    mocks.state.station = station;
    list?.click();
    assertView("list");
    expect(element("discovery-list").children[0]?.children[0]).toBe(button);
    expect(button?.attributes.get("aria-pressed")).toBe("true");
    element("browser-stations").click();
    assertView("list");
    grid?.click();
    assertView("grid");
    element("browser-now").click();
    assertView("grid");
    expect(localStorage.setItem).toHaveBeenCalledTimes(2);
    expect(localStorage.setItem).toHaveBeenNthCalledWith(1, STORAGE_KEYS.VIEW_MODE, "list");
    expect(localStorage.setItem).toHaveBeenNthCalledWith(2, STORAGE_KEYS.VIEW_MODE, "grid");
    expect(button?.attributes.get("aria-pressed")).toBe("true");
    button?.click();
    expect(select).toHaveBeenCalledWith(station);
  });
  it("preserves a failed-image fallback during unchanged renders and view switches", async () => {
    cleanup = initStationBrowser(vi.fn());
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    const button = element("discovery-list").children[0]?.children[0];
    if (!button) throw new Error("Missing discovery button");
    button.innerHTML = "fallback after image failure";
    element("station-view-toggle").children[0]?.click();
    expect(button.innerHTML).toBe("fallback after image failure");
    expect(element("discovery-list").children[0]?.children[0]).toBe(button);
  });
  it("updates observation time without replacing artwork, content or a focused button", async () => {
    const select = vi.fn();
    cleanup = initStationBrowser(select);
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    const button = element("discovery-list").children[0]?.children[0];
    if (!button) throw new Error("Missing button");
    const artwork = button.querySelector(".discovery-artwork");
    const artist = button.querySelector(".discovery-artist");
    const title = button.querySelector(".discovery-title");
    const badges = button.querySelector(".discovery-badges");
    if (!artwork) throw new Error("Missing artwork");
    artwork.innerHTML = "fallback after failure";
    button.focus();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(button.querySelector(".discovery-artwork")).toBe(artwork);
    expect(artwork.innerHTML).toBe("fallback after failure");
    expect(button.querySelector(".discovery-artist")).toBe(artist);
    expect(button.querySelector(".discovery-title")).toBe(title);
    expect(button.querySelector(".discovery-badges")).toBe(badges);
    expect(button.querySelector(".discovery-time")?.textContent).toContain("stan ");
    expect(documentStub.activeElement).toBe(button);
    button.click();
    expect(select).toHaveBeenCalledWith(station);
  });

  it("keeps first entry prompt, cancels requests on exit and debounces repeated immediate re-entry", async () => {
    const signals: AbortSignal[] = [];
    mocks.fetch.mockImplementation((_station: Station, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      return new Promise(() => undefined);
    });
    cleanup = initStationBrowser(vi.fn());
    element("browser-now").click();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    element("browser-stations").click();
    expect(signals[0]?.aborted).toBe(true);
    for (let i = 0; i < 5; i++) {
      element("browser-now").click();
      await vi.advanceTimersByTimeAsync(30);
      element("browser-stations").click();
    }
    element("browser-now").click();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("settles rapid reduced-motion switches immediately and cancels obsolete polling", async () => {
    let signal: AbortSignal | undefined;
    mocks.fetch.mockImplementationOnce((_station: Station, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise(() => undefined);
    });
    cleanup = initStationBrowser(vi.fn());
    element("browser-now").click();
    element("browser-stations").click();
    expect(signal?.aborted).toBe(true);
    element("browser-now").click();
    expect(element("now-playing-browser").hidden).toBe(false);
    expect(element("now-playing-browser").inert).toBe(false);
    expect(element("station-list-container").hidden).toBe(true);
    expect(element("station-list-container").inert).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    element("browser-stations").click();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("routes clicks through the supplied station callback, including blacklisted content", async () => {
    mocks.blacklisted = true;
    const select = vi.fn();
    cleanup = initStationBrowser(select);
    element("browser-now").click();
    await vi.advanceTimersByTimeAsync(0);
    const button = element("discovery-list").children[0]?.children[0];
    expect(button?.attributes.get("aria-label")).toBe("Odtwórz Artist – Song na Radio A");
    expect(button?.querySelector(".discovery-badges")?.innerHTML).toContain("czarna lista");
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

describe("discovery artwork reconciliation", () => {
  it("retains fallback nodes, remembers failures for the session and attempts changed URLs", async () => {
    const snapshot: NowPlayingSnapshot = {
      station: { ...station, coverUrl: "/unit-station.svg" },
      track: { artist: "Artist", title: "Song", coverUrl: "/unit-broken.png" },
      kind: "track",
      evidence: null,
      flags: { blacklisted: false, favoriteArtist: false },
      updatedAt: Date.now(),
      stale: false,
      error: false,
      loading: false,
      source: "passive",
    };
    const list = element("discovery-list");
    const render = () => renderNowPlaying(list as unknown as HTMLElement, [snapshot], undefined, vi.fn());
    render();
    const button = list.children[0]?.children[0];
    const artwork = button?.querySelector(".discovery-artwork");
    const image = artwork?.querySelector("img");
    expect(image?.src).toBe("/unit-broken.png");
    image?.onerror?.();
    expect(image?.src).toBe("/unit-station.svg");
    snapshot.updatedAt = Date.now() + 15_000;
    snapshot.track = { ...snapshot.track, artist: "Changed artist", title: "Changed title" };
    snapshot.stale = true;
    snapshot.error = true;
    render();
    expect(artwork?.querySelector("img")).toBe(image);
    expect(button?.querySelector(".discovery-title")?.textContent).toBe("Changed title");
    renderNowPlaying(list as unknown as HTMLElement, [], undefined, vi.fn());
    render();
    expect(list.children[0]?.children[0]?.querySelector(".discovery-artwork")?.querySelector("img")?.src).toBe(
      "/unit-station.svg",
    );
    snapshot.station = { ...snapshot.station, coverUrl: "/unit-new-station.svg" };
    render();
    const currentArtwork = list.children[0]?.children[0]?.querySelector(".discovery-artwork");
    expect(currentArtwork?.querySelector("img")?.src).toBe("/unit-new-station.svg");
    snapshot.track = { ...snapshot.track, coverUrl: "/unit-new-track.png" };
    render();
    expect(currentArtwork?.querySelector("img")?.src).toBe("/unit-new-track.png");
    currentArtwork?.querySelector("img")?.onerror?.();
    currentArtwork?.querySelector("img")?.onerror?.();
    expect(currentArtwork?.querySelector("img")?.style.display).toBe("none");
    expect(currentArtwork?.querySelector(".discovery-placeholder")?.style.display).toBe("flex");
    expect(localStorage.setItem).not.toHaveBeenCalled();
    vi.resetModules();
    const reloaded = await import("../src/ui/nowPlaying.js");
    reloaded.renderNowPlaying(list as unknown as HTMLElement, [], undefined, vi.fn());
    reloaded.renderNowPlaying(list as unknown as HTMLElement, [snapshot], undefined, vi.fn());
    expect(list.children[0]?.children[0]?.querySelector(".discovery-artwork")?.querySelector("img")?.src).toBe(
      "/unit-new-track.png",
    );
  });
});
