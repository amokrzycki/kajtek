import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SmartListeningConfig } from "../src/listeningPreferences.js";

const mocks = vi.hoisted(() => ({
  config: {
    version: 1,
    enabled: true,
    content: { advertisement: true, news: false, otherBreak: false },
    preferences: [],
  } as SmartListeningConfig,
  listeners: new Set<() => void>(),
  close: vi.fn(),
}));
vi.mock("../src/listeningPreferences.js", () => ({
  getSmartListeningConfig: () => mocks.config,
  subscribeSmartListeningConfig: (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
  updateSmartListeningConfig: (patch: Partial<SmartListeningConfig>) => {
    mocks.config = { ...mocks.config, ...patch };
    mocks.listeners.forEach((listener) => {
      listener();
    });
  },
  setListeningPreference: (
    scope: "artist" | "track",
    artist: string,
    title: string,
    value: "positive" | "neutral" | "negative",
  ) => {
    const key = `${scope}:${artist}:${title}`;
    mocks.config.preferences = mocks.config.preferences.filter((entry) => entry.key !== key);
    if (value !== "neutral") mocks.config.preferences.push({ scope, artist, title, key, value });
    mocks.listeners.forEach((listener) => {
      listener();
    });
  },
}));
vi.mock("../src/catalog.js", () => ({
  getAllKnownStations: () => [],
  getSmartStations: () => [],
  setStationSmartEnabled: vi.fn(),
}));
vi.mock("../src/state.js", () => ({ state: { case: "red" }, setTheme: vi.fn(), notifyState: vi.fn() }));
vi.mock("../src/utils.js", () => ({ escapeHtml: (value: string) => value, getStoredString: () => null }));
vi.mock("../src/ui/modal.js", () => ({
  openModal: vi.fn((_modal: HTMLElement, target?: HTMLElement | null) => target?.focus()),
  closeModal: mocks.close,
  bindModalDismiss: vi.fn(),
}));

class ElementStub {
  id = "";
  className = "";
  innerHTML = "";
  textContent = "";
  value = "";
  checked = false;
  disabled = false;
  hidden = false;
  required = false;
  open = false;
  scrollTop = 0;
  dataset: Record<string, string> = {};
  children: ElementStub[] = [];
  parent: ElementStub | null = null;
  nodes = new Map<string, ElementStub>();
  attributes = new Map<string, string>();
  events = new Map<string, (event: Event) => void>();
  querySelector(selector: string): ElementStub {
    if (selector === "[data-preference-value]" && !this.dataset.preferenceKey) {
      return this.children[0]?.querySelector(selector) as ElementStub;
    }
    let node = this.nodes.get(selector);
    if (!node) {
      node = new ElementStub();
      node.parent = this;
      this.nodes.set(selector, node);
    }
    return node;
  }
  querySelectorAll() {
    return [];
  }
  addEventListener(event: string, handler: (event: Event) => void) {
    this.events.set(event, handler);
  }
  closest(selector: string): ElementStub | null {
    if (selector === "[data-preference-value]") return this;
    if (selector === "[data-preference-key]") return this.parent;
    return null;
  }
  appendChild(child: ElementStub) {
    child.parent = this;
    this.children.push(child);
  }
  contains(element: ElementStub): boolean {
    return this === element || element.parent === this;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this);
  }
  focus() {
    activeElement = this;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  fire(event: string, target: ElementStub = this) {
    this.events.get(event)?.({ target, preventDefault: vi.fn() } as unknown as Event);
  }
}

let activeElement: ElementStub;
let overlays: ElementStub[];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.config = {
    version: 1,
    enabled: true,
    content: { advertisement: true, news: false, otherBreak: false },
    preferences: [],
  };
  mocks.listeners.clear();
  activeElement = new ElementStub();
  overlays = [];
  vi.stubGlobal("document", {
    get activeElement() {
      return activeElement;
    },
    createElement: () => new ElementStub(),
    body: {
      appendChild: (element: ElementStub) => {
        overlays.push(element);
      },
    },
  });
  vi.stubGlobal("HTMLElement", ElementStub);
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Smart Listening configuration", () => {
  it("explains unified protection in help and restores the help trigger after configuration", async () => {
    const trigger = activeElement;
    const { openOnboardingModal } = await import("../src/ui/onboarding/modal.js");
    const { closeSmartListeningModal } = await import("../src/ui/smartListening/modal.js");
    openOnboardingModal(vi.fn());
    const help = overlays[0];
    if (!help) throw new Error("Expected onboarding");
    expect(help.innerHTML).toContain("niezależny od listy pod odtwarzaczem");
    expect(help.innerHTML).toContain("reklamy, wiadomości i inne przerwy");
    expect(help.innerHTML).toContain("preferować lub unikać wykonawców i utworów");
    expect(help.innerHTML).toContain("Powrót zależy");
    activeElement = help.querySelector("#onboarding-smart-configure");
    activeElement.fire("click");
    expect(overlays).toHaveLength(2);
    closeSmartListeningModal();
    expect(mocks.close).toHaveBeenLastCalledWith(overlays[1], trigger);
  });

  it("restores the Settings trigger after handing off to the unified modal", async () => {
    const trigger = activeElement;
    const { openSettingsModal } = await import("../src/ui/settings/modal.js");
    const { closeSmartListeningModal } = await import("../src/ui/smartListening/modal.js");
    openSettingsModal();
    const settings = overlays[0];
    if (!settings) throw new Error("Expected Settings");
    activeElement = settings.querySelector("#settings-smart-configure");
    activeElement.fire("click");
    expect(mocks.close).toHaveBeenCalledWith(settings, trigger);
    closeSmartListeningModal();
    expect(mocks.close).toHaveBeenLastCalledWith(overlays[1], trigger);
    expect(mocks.listeners.size).toBe(0);
  });

  it("opens a track form and keeps it editable with the master disabled", async () => {
    const { openSmartListeningModal, closeSmartListeningModal } = await import("../src/ui/smartListening/modal.js");
    mocks.config.enabled = false;
    openSmartListeningModal({ artist: "Maanam", title: "Krakowski spleen" });
    const modal = overlays[0];
    if (!modal) throw new Error("Expected Smart Listening");
    expect(modal.querySelector("#smart-preference-artist").value).toBe("Maanam");
    expect(modal.querySelector("#smart-preference-title").value).toBe("Krakowski spleen");
    expect(modal.querySelector("#smart-preference-title").disabled).toBe(false);
    expect(modal.querySelector("#smart-enabled-help").textContent).toContain("Wyłączone");
    modal.querySelector("#smart-preference-scope").value = "artist";
    modal.querySelector("#smart-preference-scope").fire("change");
    expect(modal.querySelector("#smart-preference-title").disabled).toBe(true);
    expect(modal.querySelector("#smart-preference-title").required).toBe(false);
    modal.querySelector("#smart-preference-value").value = "negative";
    modal.querySelector("#smart-preference-form").fire("submit");
    expect(mocks.config.preferences).toEqual([
      expect.objectContaining({ scope: "artist", artist: "Maanam", value: "negative" }),
    ]);
    closeSmartListeningModal();
  });

  it("preserves the editing select, then removes neutral rules and restores useful focus", async () => {
    const { openSmartListeningModal, closeSmartListeningModal } = await import("../src/ui/smartListening/modal.js");
    mocks.config.preferences = [
      {
        scope: "track",
        artist: "Maanam",
        title: "Krakowski spleen",
        value: "negative",
        key: "track:Maanam:Krakowski spleen",
      },
    ];
    openSmartListeningModal();
    const modal = overlays[0];
    if (!modal) throw new Error("Expected Smart Listening");
    const list = modal.querySelector("#smart-preference-list");
    const row = list.children[0];
    if (!row) throw new Error("Expected saved preference");
    const select = row.querySelector("[data-preference-value]");
    select.focus();
    select.value = "positive";
    list.fire("change", select);
    expect(list.children[0]).toBe(row);
    expect(activeElement).toBe(select);
    expect(mocks.config.preferences[0]?.value).toBe("positive");
    select.value = "neutral";
    list.fire("change", select);
    expect(mocks.config.preferences).toHaveLength(0);
    expect(list.children).toHaveLength(0);
    expect(activeElement).toBe(modal.querySelector("#smart-preference-value"));
    closeSmartListeningModal();
  });
});
