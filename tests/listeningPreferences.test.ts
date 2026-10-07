import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSmartListeningStore } from "../src/listeningPreferences.js";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};
beforeEach(() => values.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Smart Listening storage", () => {
  it("migrates every blacklist entry once without converting bookmarks", () => {
    values.set("kajtek_blacklist", JSON.stringify([{ artist: " Artist ", title: " Song ", key: "artist::song" }]));
    values.set("kajtek_fav_tracks", JSON.stringify([{ artist: "Bookmarked", title: "Song" }]));
    const store = createSmartListeningStore(storage);
    expect(store.get().preferences).toEqual([
      { scope: "track", artist: "Artist", title: "Song", key: "track:artist::song", value: "negative" },
    ]);
    store.setPreference("track", "Artist", "Song", "neutral");
    expect(createSmartListeningStore(storage).get().preferences).toEqual([]);
  });
  it("migrates disabled old masters and content rules conservatively", () => {
    values.set("kajtek_ad_skip_enabled", "false");
    values.set("kajtek_blacklist_enabled", "false");
    const store = createSmartListeningStore(storage);
    expect(store.get()).toMatchObject({
      enabled: false,
      content: { advertisement: false, news: false, otherBreak: false },
    });
  });
  it("uses one explicit preference per scope and neutral removes only that scope", () => {
    const store = createSmartListeningStore(storage);
    store.setPreference("artist", " ARTIST ", "ignored", "negative");
    store.setPreference("track", "Artist", "Song", "positive");
    store.setPreference("track", "artist", "song", "neutral");
    expect(store.get().preferences).toEqual([
      { scope: "artist", artist: "ARTIST", title: "", key: "artist:artist", value: "negative" },
    ]);
  });
  it("retains session choices with unavailable storage", () => {
    const broken = {
      getItem: () => {
        throw Error("denied");
      },
      setItem: () => {
        throw Error("denied");
      },
    };
    const store = createSmartListeningStore(broken);
    store.update({ enabled: false });
    store.setPreference("artist", "A", "", "positive");
    expect(store.get().enabled).toBe(false);
    expect(store.get().preferences).toHaveLength(1);
  });
  it("validates malformed entries and returns defensive copies", () => {
    values.set(
      "kajtek_smart_listening",
      JSON.stringify({
        version: 1,
        enabled: true,
        content: { advertisement: true },
        preferences: [null, { scope: "oops" }, { scope: "track", artist: "A", title: "T", value: "negative" }],
      }),
    );
    const store = createSmartListeningStore(storage);
    const copy = store.get();
    expect(copy.preferences).toHaveLength(1);
    copy.preferences.length = 0;
    expect(store.get().preferences).toHaveLength(1);
  });
});
it("retains disabled legacy blacklist data without silently activating it through the old ad master", () => {
  values.set("kajtek_ad_skip_enabled", "true");
  values.set("kajtek_blacklist_enabled", "false");
  values.set("kajtek_blacklist", JSON.stringify([{ artist: "A", title: "T", key: "a::t" }]));
  const store = createSmartListeningStore(storage);
  expect(store.get().preferences).toHaveLength(1);
  expect(store.get().enabled).toBe(false);
});
