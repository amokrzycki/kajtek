import { ALL_STATIONS, STORAGE_KEYS, TIMERS } from "./consts.js";
import { state } from "./state.js";
import type { CustomStation, RawRmfStation, RmfCatalogCache, Station, StationPref } from "./types.js";

export function getStoredRmfCatalog(): RmfCatalogCache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RMF_CATALOG_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.fetchedAt === "number" && Array.isArray(parsed?.stations)) {
      return parsed as RmfCatalogCache;
    }
  } catch (_) {
    // Ignore cache parse error
  }
  return null;
}

export async function fetchRmfCatalog(): Promise<RmfCatalogCache> {
  const endpoints = ["/api/rmf/stations", "https://api.rmfon.pl/stations"];
  let lastError: Error | null = null;

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMERS.FETCH_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) continue;

      const data = await res.json();
      const rawList = Array.isArray(data) ? data : Array.isArray(data?.contents) ? data.contents : null;

      if (Array.isArray(rawList)) {
        const validatedStations: RawRmfStation[] = rawList
          .filter((item): item is RawRmfStation => Boolean(item && typeof item === "object"))
          .map((item) => {
            const st: RawRmfStation = {
              id: item.id ?? item.idname ?? Math.random().toString(36).slice(2),
              name: typeof item.name === "string" && item.name.trim().length > 0 ? item.name.trim() : "Stacja RMF",
            };
            if (typeof item.idname === "string") st.idname = item.idname;
            if (typeof item.slug === "string") st.slug = item.slug;
            if (typeof item.short === "string") st.short = item.short;
            if (typeof item.mountpoint_mp3 === "string") st.mountpoint_mp3 = item.mountpoint_mp3;
            if (typeof item.mountpoint_aac === "string") st.mountpoint_aac = item.mountpoint_aac;
            if (typeof item.description === "string") st.description = item.description;
            if (typeof item.img === "string" && item.img.startsWith("http")) st.img = item.img;
            if (typeof item.search === "string") st.search = item.search;
            if (typeof item.in_premium === "number") st.in_premium = item.in_premium;
            if (Array.isArray(item.station_category)) st.station_category = item.station_category;
            return st;
          });

        const cache: RmfCatalogCache = {
          fetchedAt: Date.now(),
          stations: validatedStations,
        };

        localStorage.setItem(STORAGE_KEYS.RMF_CATALOG_CACHE, JSON.stringify(cache));
        return cache;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("Nie udało się pobrać listy stacji");
}

export function getCustomStations(): CustomStation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_STATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (c): c is CustomStation =>
          Boolean(c && typeof c.id === "string" && typeof c.name === "string" && typeof c.stream === "string"),
      );
    }
  } catch (_) {
    // Ignore JSON parse error
  }
  return [];
}

export function addCustomStation(name: string, streamUrl: string): CustomStation {
  const trimmedName = name.trim();
  const trimmedUrl = streamUrl.trim();

  if (!trimmedName) {
    throw new Error("Nazwa stacji jest wymagana");
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error();
    }
  } catch (_) {
    throw new Error("Podaj poprawny URL streamu (http:// lub https://)");
  }

  const list = getCustomStations();
  const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const newStation: CustomStation = {
    id,
    name: trimmedName,
    stream: trimmedUrl,
  };

  list.push(newStation);
  localStorage.setItem(STORAGE_KEYS.CUSTOM_STATIONS, JSON.stringify(list));

  setStationEnabled(id, true);
  return newStation;
}

export function deleteCustomStation(id: string): void {
  const list = getCustomStations().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEYS.CUSTOM_STATIONS, JSON.stringify(list));

  const prefs = getStationPrefs();
  delete prefs[id];
  localStorage.setItem(STORAGE_KEYS.STATION_PREFS, JSON.stringify(prefs));

  if (state.favs.has(id)) {
    state.favs.delete(id);
    localStorage.setItem(STORAGE_KEYS.FAVS, JSON.stringify(Array.from(state.favs)));
  }
}

export function getStationPrefs(): Record<string, StationPref> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATION_PREFS);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StationPref>;
  } catch (_) {
    return {};
  }
}

export function isStationEnabled(id: string): boolean {
  const prefs = getStationPrefs();
  if (prefs[id] !== undefined) {
    return prefs[id].enabled;
  }
  if (ALL_STATIONS.some((s) => s.id === id)) {
    return true;
  }
  if (getCustomStations().some((s) => s.id === id)) {
    return true;
  }
  return false;
}

export function isStationFavorite(id: string): boolean {
  return state.favs.has(id) && isStationEnabled(id);
}

export function setStationEnabled(id: string, enabled: boolean): void {
  const prefs = getStationPrefs();
  const fav = enabled ? state.favs.has(id) : false;

  prefs[id] = { id, enabled, favorite: fav };
  localStorage.setItem(STORAGE_KEYS.STATION_PREFS, JSON.stringify(prefs));

  if (!enabled && state.favs.has(id)) {
    state.favs.delete(id);
    localStorage.setItem(STORAGE_KEYS.FAVS, JSON.stringify(Array.from(state.favs)));
  }
}

export function setStationFavorite(id: string, favorite: boolean): void {
  if (favorite) {
    setStationEnabled(id, true);
    state.favs.add(id);
  } else {
    state.favs.delete(id);
  }
  localStorage.setItem(STORAGE_KEYS.FAVS, JSON.stringify(Array.from(state.favs)));

  const prefs = getStationPrefs();
  prefs[id] = { id, enabled: isStationEnabled(id), favorite };
  localStorage.setItem(STORAGE_KEYS.STATION_PREFS, JSON.stringify(prefs));
}

export function getAllKnownStations(): Station[] {
  const customStations = getCustomStations().map(
    (c): Station => ({
      id: c.id,
      name: c.name,
      freq: "CUSTOM",
      genre: "Własny stream",
      cat: "custom",
      provider: "generic",
      stream: c.stream,
    }),
  );

  const catalog = getStoredRmfCatalog();
  const catalogStations: Station[] = [];

  if (catalog?.stations) {
    const existingIds = new Set([
      ...ALL_STATIONS.map((s) => s.id),
      ...ALL_STATIONS.map((s) => s.apiBaseUrl?.split("/").pop()),
      ...customStations.map((s) => s.id),
    ]);

    catalog.stations.forEach((raw) => {
      const id = String(raw.id);
      if (existingIds.has(id) || (raw.idname && existingIds.has(raw.idname))) {
        return;
      }
      const st: Station = {
        id,
        name: raw.name,
        freq: raw.short || "RMF",
        genre: raw.short || "Pop",
        cat: raw.station_category?.[0]?.name || "national",
        provider: "rmf",
        stream: raw.mountpoint_mp3 ? `https://rs202-krk.rmfstream.pl/${raw.mountpoint_mp3}` : "",
        apiBaseUrl: `/api/rmf/stations/${raw.id}`,
      };
      if (raw.img) st.coverUrl = raw.img;
      catalogStations.push(st);
    });
  }

  return [...ALL_STATIONS, ...customStations, ...catalogStations];
}

export function getEnabledStations(): Station[] {
  return getAllKnownStations().filter((s) => isStationEnabled(s.id));
}
