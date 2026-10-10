import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { getSmartListeningStatus } from "../src/smartListening.js";

const data = vi.hoisted(() => ({ status: null as ReturnType<typeof getSmartListeningStatus> }));
vi.mock("../src/smartListening.js", () => ({ getSmartListeningStatus: () => data.status }));
vi.mock("../src/utils.js", () => ({ escapeHtml: (text: string) => text }));
const elements = vi.hoisted(() => ({
  smartWarning: { classList: { toggle: vi.fn() }, inert: false, setAttribute: vi.fn(), contains: () => false },
  smartWarningContent: { innerHTML: "", querySelector: () => null },
  skipStatus: { textContent: "" },
  playBtn: { focus: vi.fn() },
}));
vi.mock("../src/ui/elements.js", () => ({ els: elements }));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("document", { activeElement: null });
  vi.stubGlobal("HTMLElement", class {});
  const origin = { id: "origin", name: "RMF FM", short: "O", cat: "test", provider: "rmf", stream: "o" };
  data.status = {
    phase: "detour",
    originStation: origin,
    triggerStation: origin,
    trigger: { reason: "advertisement", track: { artist: "", title: "Przerwa" }, key: "ad", upcoming: false },
    candidate: { ...origin, id: "target", name: "RMF MAXX" },
    candidateReason: "safe",
    secondsLeft: 0,
    playback: "connecting",
    returnWait: "metadata",
    checking: false,
  };
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["connecting", "Łączenie"],
  ["playing", "Gra"],
  ["paused", "Odtwarzanie wstrzymane"],
  ["failed", "Nie udało się połączyć"],
  ["buffering", "Buforowanie"],
] as const)(
  "updates an existing detour to %s without claiming routing intent is playback",
  async (playback, message) => {
    const { renderSmartListeningWarning } = await import("../src/ui/smartListening/warning.js");
    renderSmartListeningWarning();
    if (!data.status) throw new Error("Expected detour");
    data.status.playback = playback;
    renderSmartListeningWarning();
    expect(elements.smartWarningContent.innerHTML).toContain(`${message}: RMF MAXX`);
    expect(elements.skipStatus.textContent).toContain(`${message}: RMF MAXX`);
  },
);

it.each([
  ["metadata", "Czekamy na aktualne informacje"],
  ["unwanted", "nadal trwa niechciana treść"],
  ["upcoming", "zbliża się niechciana treść"],
  ["confirming", "Potwierdzamy odpowiednią treść"],
] as const)("describes the supported %s return condition", async (returnWait, message) => {
  const { renderSmartListeningWarning } = await import("../src/ui/smartListening/warning.js");
  renderSmartListeningWarning();
  if (!data.status) throw new Error("Expected detour");
  data.status.returnWait = returnWait;
  renderSmartListeningWarning();
  expect(elements.smartWarningContent.innerHTML).toContain(message);
});

it("announces a pending check and clears cancelled routing", async () => {
  const { renderSmartListeningWarning } = await import("../src/ui/smartListening/warning.js");
  if (!data.status) throw new Error("Expected detour");
  data.status.phase = "warning";
  data.status.checking = true;
  renderSmartListeningWarning();
  expect(elements.smartWarningContent.innerHTML).toContain("Sprawdzanie stacji…");
  expect(elements.skipStatus.textContent).toContain("Sprawdzanie stacji.");
  data.status = null;
  renderSmartListeningWarning();
  expect(elements.smartWarningContent.innerHTML).toBe("");
  expect(elements.skipStatus.textContent).toBe("");
  expect(elements.smartWarning.inert).toBe(true);
});
