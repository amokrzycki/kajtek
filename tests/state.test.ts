import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils.js", () => ({
  getStoredJSON: (_key: string, fallback: unknown) => fallback,
  setStoredJSON: vi.fn(),
}));

const storage = new Map<string, string>();
const systemTheme = { matches: false, addEventListener: vi.fn() };

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  systemTheme.matches = false;
  systemTheme.addEventListener.mockReset();
  vi.stubGlobal("window", { matchMedia: () => systemTheme });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("Audio", class {});
  vi.stubGlobal("navigator", {});
});

afterEach(() => vi.unstubAllGlobals());

describe("theme preference", () => {
  it("follows OS changes without saving a manual preference, including after reload", async () => {
    const { state, subscribeState } = await import("../src/state.js");
    const listener = vi.fn();
    subscribeState(listener);
    expect(state.dark).toBe(false);
    systemTheme.matches = true;
    systemTheme.addEventListener.mock.calls[0]?.[1]();
    expect(state.dark).toBe(true);
    expect(listener).toHaveBeenCalledWith(state);
    expect(storage.get("kajtek_theme")).toBeUndefined();
    vi.resetModules();
    expect((await import("../src/state.js")).state.dark).toBe(true);
  });

  it.each([true, false])("preserves manual dark=%s across OS changes and reloads", async (dark) => {
    const { setTheme, state } = await import("../src/state.js");
    setTheme(dark);
    systemTheme.matches = !dark;
    systemTheme.addEventListener.mock.calls[0]?.[1]();
    expect(state.dark).toBe(dark);
    expect(storage.get("kajtek_theme")).toBe(dark ? "dark" : "light");
    vi.resetModules();
    expect((await import("../src/state.js")).state.dark).toBe(dark);
  });

  it("restores OS following when the saved preference is cleared", async () => {
    storage.set("kajtek_theme", "light");
    systemTheme.matches = true;
    const { setTheme, state } = await import("../src/state.js");
    expect(state.dark).toBe(false);
    setTheme(null);
    expect(state.dark).toBe(true);
    expect(storage.get("kajtek_theme")).toBeUndefined();
    systemTheme.matches = false;
    systemTheme.addEventListener.mock.calls[0]?.[1]();
    expect(state.dark).toBe(false);
  });
});

describe("view mode preference", () => {
  it.each([
    ["grid", "grid"],
    ["list", "list"],
    ["bogus", "list"],
    [undefined, "list"],
  ])("restores stored %s as %s so the shared toggle always has a valid selection", async (stored, expected) => {
    if (stored) storage.set("kajtek_view_mode", stored);
    expect((await import("../src/state.js")).state.viewMode).toBe(expected);
  });
});
