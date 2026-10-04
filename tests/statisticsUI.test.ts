import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStatisticsStore } from "../src/statistics.js";
import { formatListeningTime, initStatisticsUI, recapCopy } from "../src/ui/statistics.js";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  subscribe: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("../src/statisticsPlayback.js", () => ({
  statisticsStore: { snapshot: mocks.snapshot },
  subscribeStatistics: mocks.subscribe,
}));
vi.mock("../src/ui/modal.js", () => ({
  openModal: mocks.open,
  closeModal: mocks.close,
  bindModalDismiss: mocks.dismiss,
}));

const totals = { listeningMs: 0, adSavedMs: 0, blacklistAvoided: 0, detours: 0 };

describe("recap presentation", () => {
  it("formats station listening durations without zero-minute entries", () => {
    expect(formatListeningTime(1000)).toBe("mniej niż minuta");
    expect(formatListeningTime(4 * 3_600_000 + 12 * 60_000)).toBe("4 godz. 12 min");
  });
  it("presents exact-hour listening with one sentence terminator", () => {
    const copy = recapCopy({ ...totals, listeningMs: 7_200_000 }, false);
    expect(copy.listening).not.toMatch(/\.{2}/);
  });

  it("distinguishes no measured ad saving from positive sub-minute saving", () => {
    expect(recapCopy(totals, false).empty).toBe(true);
    const copy = recapCopy({ ...totals, adSavedMs: 30_000, listeningMs: 30_000 }, false);
    expect(copy.empty).toBe(false);
    expect(copy.lead).not.toMatch(/\b0\b/);
    expect(copy.lead).not.toContain("30");
  });
});

class ElementStub {
  scrollTop = 0;
  textContent = "";
  innerHTML = "";
  className = "";
  id = "";
  readonly dataset: { recapPeriod?: string } = {};
  readonly attributes = new Map<string, string>();
  readonly nodes = new Map<string, ElementStub>();
  readonly children: ElementStub[] = [];
  readonly events = new Map<string, () => void>();
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, force: boolean) => (force ? this.classes.add(name) : this.classes.delete(name)),
  };
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  querySelector(selector: string) {
    return this.nodes.get(selector) ?? null;
  }
  querySelectorAll() {
    return [week, all];
  }
  addEventListener(event: string, listener: () => void) {
    this.events.set(event, listener);
  }
  append(...children: ElementStub[]) {
    this.children.push(...children);
  }
  replaceChildren(...children: ElementStub[]) {
    this.children.splice(0, this.children.length, ...children);
  }
  click() {
    this.events.get("click")?.();
  }
}

let week: ElementStub;
let all: ElementStub;
let trigger: ElementStub;
let modal: ElementStub;
const now = new Date(2026, 9, 5).getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  week = new ElementStub();
  week.dataset.recapPeriod = "week";
  all = new ElementStub();
  all.dataset.recapPeriod = "all";
  trigger = new ElementStub();
  modal = new ElementStub();
  for (const selector of [
    ".recap-lead",
    ".recap-body",
    ".recap-ad-saved",
    ".recap-blacklist",
    ".recap-detours",
    ".recap-listening",
    ".recap-empty",
    ".recap-metrics",
    ".recap-storage",
    ".recap-stations",
    ".recap-stations-empty",
    "#statistics-modal-close",
  ])
    modal.nodes.set(selector, new ElementStub());
  vi.stubGlobal("document", {
    getElementById: () => trigger,
    createElement: (tag: string) => (tag === "div" ? modal : new ElementStub()),
    body: { appendChild: vi.fn() },
    addEventListener: vi.fn(),
  });
  vi.stubGlobal("window", { setInterval: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("statistics surface", () => {
  it("opens on demand using the shared modal and renders the selected period's Top 5", () => {
    const store = createStatisticsStore({ getItem: () => null, setItem: () => undefined }, now - 100_000);
    store.duration(now - 10_000, now, 10_000, 0, { id: "old", name: "Old Radio" });
    store.duration(now, now + 5000, 5000, 0, { id: "new", name: "New Radio" });
    mocks.snapshot.mockImplementation(() => store.snapshot(now));
    initStatisticsUI();
    expect(mocks.open).not.toHaveBeenCalled();
    trigger.click();
    expect(mocks.open).toHaveBeenCalledWith(modal);
    expect(mocks.dismiss).toHaveBeenCalledWith(modal, expect.any(Function));
    expect(modal.nodes.get(".recap-stations")?.children.map((row) => row.children[0]?.textContent)).toEqual([
      "New Radio",
    ]);
    all.click();
    expect(all.attributes.get("aria-pressed")).toBe("true");
    expect(week.attributes.get("aria-pressed")).toBe("false");
    expect(modal.nodes.get(".recap-stations")?.children.map((row) => row.children[0]?.textContent)).toEqual([
      "Old Radio",
      "New Radio",
    ]);
    week.click();
    expect(week.attributes.get("aria-pressed")).toBe("true");
    modal.nodes.get("#statistics-modal-close")?.click();
    expect(mocks.close).toHaveBeenCalledWith(modal);
    const body = modal.nodes.get(".recap-body");
    if (!body) throw new Error("Expected recap body");
    body.scrollTop = 500;
    trigger.click();
    expect(body.scrollTop).toBe(0);
  });

  it("renders safe historical names, caps the list, and provides an intentional empty state", () => {
    const store = createStatisticsStore({ getItem: () => null, setItem: () => undefined }, now);
    mocks.snapshot.mockImplementation(() => store.snapshot(now));
    initStatisticsUI();
    trigger.click();
    expect(modal.nodes.get(".recap-stations-empty")?.classes.has("hidden")).toBe(false);
    expect(modal.nodes.get(".recap-empty")?.textContent).toContain("Wybierz stację");
    for (let index = 0; index < 7; index++)
      store.duration(now, now + 1000, 1000, 0, { id: String(index), name: "<img src=x>" });
    all.click();
    const rows = modal.nodes.get(".recap-stations")?.children;
    expect(rows).toHaveLength(5);
    expect(rows?.[0]?.children[0]?.textContent).toBe("<img src=x>");
    expect(modal.nodes.get(".recap-stations-empty")?.classes.has("hidden")).toBe(true);
  });
});
