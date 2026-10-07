import { afterEach, expect, it, vi } from "vitest";

vi.hoisted(() => vi.stubGlobal("DOMParser", class {}));

import { getStoredJSON, getStoredString, setStoredJSON, setStoredString } from "../src/utils.js";

afterEach(() => vi.unstubAllGlobals());
it("retains JSON and string settings in this session when storage rejects writes and reads", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("blocked");
    },
    setItem: () => {
      throw Error("blocked");
    },
  });
  setStoredJSON("smart-pool", { smartEnabled: false });
  setStoredString("station", "rmf");
  expect(getStoredJSON("smart-pool", {})).toEqual({ smartEnabled: false });
  expect(getStoredString("station")).toBe("rmf");
});
it("uses session pool choices when storage stays readable but quota blocks writes", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => '{"smartEnabled":true}',
    setItem: () => {
      throw Error("quota");
    },
  });
  setStoredJSON("quota-pool", { smartEnabled: false });
  expect(getStoredJSON("quota-pool", {})).toEqual({ smartEnabled: false });
});
