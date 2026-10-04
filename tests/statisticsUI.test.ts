import { describe, expect, it } from "vitest";
import { recapCopy } from "../src/ui/statistics.js";

const totals = { listeningMs: 0, adSavedMs: 0, blacklistAvoided: 0, detours: 0 };

describe("recap presentation", () => {
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
