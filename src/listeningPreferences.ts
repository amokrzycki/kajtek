import { STORAGE_KEYS } from "./consts.js";

export type PreferenceScope = "artist" | "track";
export type PreferenceValue = "positive" | "neutral" | "negative";
export interface ListeningPreference {
  scope: PreferenceScope;
  artist: string;
  title: string;
  key: string;
  value: Exclude<PreferenceValue, "neutral">;
}
export interface SmartListeningConfig {
  version: 1;
  enabled: boolean;
  content: { advertisement: boolean; news: boolean; otherBreak: boolean };
  preferences: ListeningPreference[];
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const CONFIG_KEY = "kajtek_smart_listening";
export const normalizeArtist = (artist: string): string => artist.trim().toLowerCase();
export const normalizeTrackKey = (artist: string, title: string): string =>
  `${normalizeArtist(artist)}::${title.trim().toLowerCase()}`;
export const preferenceKey = (scope: PreferenceScope, artist: string, title: string): string =>
  scope === "artist" ? `artist:${normalizeArtist(artist)}` : `track:${normalizeTrackKey(artist, title)}`;

function validPreferences(raw: unknown): ListeningPreference[] {
  if (!Array.isArray(raw)) return [];
  const entries = new Map<string, ListeningPreference>();
  for (const item of raw) {
    if (
      !item ||
      typeof item !== "object" ||
      (item.scope !== "artist" && item.scope !== "track") ||
      typeof item.artist !== "string" ||
      !item.artist.trim() ||
      (item.value !== "positive" && item.value !== "negative")
    )
      continue;
    const title = item.scope === "track" && typeof item.title === "string" ? item.title.trim() : "";
    if (item.scope === "track" && !title) continue;
    const key = preferenceKey(item.scope, item.artist, title);
    entries.set(key, { scope: item.scope, artist: item.artist.trim(), title, key, value: item.value });
  }
  return [...entries.values()];
}

export function createSmartListeningStore(storage: Storage) {
  const read = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const parse = (raw: string | null): unknown => {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const oldAds = read(STORAGE_KEYS.AD_SKIP_ENABLED) !== "false";
  const oldBlacklist = read(STORAGE_KEYS.BLACKLIST_ENABLED) !== "false";
  const saved = parse(read(CONFIG_KEY));
  const record = saved && typeof saved === "object" ? (saved as Partial<SmartListeningConfig>) : null;
  let config: SmartListeningConfig = {
    version: 1,
    enabled: typeof record?.enabled === "boolean" ? record.enabled : oldAds || oldBlacklist,
    content: {
      advertisement: typeof record?.content?.advertisement === "boolean" ? record.content.advertisement : oldAds,
      news: record?.content?.news === true,
      otherBreak: record?.content?.otherBreak === true,
    },
    preferences: validPreferences(record?.preferences),
  };
  if (record?.version !== 1) {
    const legacy = parse(read(STORAGE_KEYS.BLACKLIST));
    if (Array.isArray(legacy)) {
      config.preferences = validPreferences([
        ...config.preferences,
        ...legacy
          .filter((item) => item && typeof item === "object")
          .map((item) => ({ ...item, scope: "track", value: "negative" })),
      ]);
    }
  }
  // A unified master must not silently enable music rules the listener previously disabled.
  if (record?.version !== 1 && !oldBlacklist && config.preferences.length > 0) config.enabled = false;
  const listeners = new Set<() => void>();
  const persist = () => {
    try {
      storage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      /* Session state remains usable when storage is denied. */
    }
  };
  if (
    record ||
    read(STORAGE_KEYS.BLACKLIST) ||
    read(STORAGE_KEYS.AD_SKIP_ENABLED) ||
    read(STORAGE_KEYS.BLACKLIST_ENABLED)
  )
    persist();
  const get = (): SmartListeningConfig => ({
    ...config,
    content: { ...config.content },
    preferences: config.preferences.map((entry) => ({ ...entry })),
  });
  const update = (patch: Partial<SmartListeningConfig>): void => {
    config = {
      ...config,
      ...patch,
      version: 1,
      content: { ...config.content, ...patch.content },
      preferences: patch.preferences ? validPreferences(patch.preferences) : config.preferences,
    };
    persist();
    listeners.forEach((listener) => {
      listener();
    });
  };
  return {
    get,
    update,
    setPreference(scope: PreferenceScope, artist: string, title: string, value: PreferenceValue): void {
      if (!artist.trim() || (scope === "track" && !title.trim())) return;
      const key = preferenceKey(scope, artist, title);
      const preferences = config.preferences.filter((entry) => entry.key !== key);
      if (value !== "neutral")
        preferences.unshift({
          key,
          scope,
          artist: artist.trim(),
          title: scope === "artist" ? "" : title.trim(),
          value,
        });
      update({ preferences });
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const storage: Storage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};
let defaultStore: ReturnType<typeof createSmartListeningStore> | null = null;
let storageIdentity: globalThis.Storage | null = null;
function store() {
  let identity: globalThis.Storage | null = null;
  try {
    identity = localStorage;
  } catch {
    /* Use the in-memory store. */
  }
  if (!defaultStore || identity !== storageIdentity) {
    storageIdentity = identity;
    defaultStore = createSmartListeningStore(storage);
  }
  return defaultStore;
}
export const getSmartListeningConfig = (): SmartListeningConfig => store().get();
export const updateSmartListeningConfig = (patch: Partial<SmartListeningConfig>): void => store().update(patch);
export const subscribeSmartListeningConfig = (listener: () => void): (() => void) => store().subscribe(listener);
export const setListeningPreference = (
  scope: PreferenceScope,
  artist: string,
  title: string,
  value: PreferenceValue,
): void => store().setPreference(scope, artist, title, value);
export function musicPreference(track: { artist: string; title: string }, preferences: ListeningPreference[]) {
  const exact =
    preferences.find((entry) => entry.key === preferenceKey("track", track.artist, track.title))?.value ?? "neutral";
  const artist =
    preferences.find((entry) => entry.key === preferenceKey("artist", track.artist, ""))?.value ?? "neutral";
  return { exact, artist, negative: exact === "negative" || artist === "negative" };
}
