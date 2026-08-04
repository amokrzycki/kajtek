import { STORAGE_KEYS } from "./consts.js";
import { getStoredJSON, setStoredJSON } from "./utils.js";

export interface BlacklistEntry {
  key: string;
  artist: string;
  title: string;
}

export function normalizeTrackKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

export function getBlacklist(): BlacklistEntry[] {
  return getStoredJSON<BlacklistEntry[]>(STORAGE_KEYS.BLACKLIST, [], Array.isArray);
}

function saveBlacklist(list: BlacklistEntry[]): void {
  setStoredJSON(STORAGE_KEYS.BLACKLIST, list);
}

export function isBlacklisted(t: { artist?: string; title?: string } | null | undefined): boolean {
  if (!t?.artist || !t.title) return false;
  const key = normalizeTrackKey(t.artist, t.title);
  return getBlacklist().some((e) => e.key === key);
}

export function addToBlacklist(artist: string, title: string): void {
  const key = normalizeTrackKey(artist, title);
  const list = getBlacklist();
  if (list.some((e) => e.key === key)) return;
  list.unshift({ key, artist: artist.trim(), title: title.trim() });
  saveBlacklist(list);
}

export function removeFromBlacklist(key: string): void {
  saveBlacklist(getBlacklist().filter((e) => e.key !== key));
}
