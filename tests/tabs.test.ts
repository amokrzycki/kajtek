import { expect, it, vi } from "vitest";
import { bindTabKeys } from "../src/ui/tabs.js";

it.each([
  [0, "ArrowRight", 1],
  [0, "ArrowLeft", 2],
  [2, "ArrowRight", 0],
  [1, "Home", 0],
  [0, "End", 2],
] as const)("activates and focuses tab %s with %s", (index, key, target) => {
  const tabs = Array.from({ length: 3 }, () => ({
    click: vi.fn(),
    focus: vi.fn(),
    onkeydown: null,
  })) as unknown as HTMLButtonElement[];
  bindTabKeys(tabs);
  const preventDefault = vi.fn();
  tabs[index]?.onkeydown?.call(tabs[index], { key, preventDefault } as unknown as KeyboardEvent);
  expect(tabs[target]?.click).toHaveBeenCalledOnce();
  expect(tabs[target]?.focus).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
});

it("leaves Tab and vertical arrows to native navigation in horizontal tablists", () => {
  const tab = { click: vi.fn(), focus: vi.fn(), onkeydown: null } as unknown as HTMLButtonElement;
  bindTabKeys([tab]);
  const preventDefault = vi.fn();
  for (const key of ["Tab", "ArrowDown", "Enter"])
    tab.onkeydown?.call(tab, { key, preventDefault } as unknown as KeyboardEvent);
  expect(preventDefault).not.toHaveBeenCalled();
  expect(tab.click).not.toHaveBeenCalled();
});
