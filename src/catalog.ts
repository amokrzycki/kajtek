import { API_ENDPOINTS, INIT_STATIONS, STORAGE_KEYS, TIMERS } from "./consts.js";
import { LOCAL_STATIONS } from "./localStations.js";
import { state } from "./state.js";
import type { CustomStation, RawRmfStation, RmfCatalogCache, Station, StationPref } from "./types.js";
import { capitalizeFirstLetter, resolveProtocolRelativeUrl } from "./utils.js";

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
  const endpoints = [API_ENDPOINTS.RMF_CATALOG_LOCAL, API_ENDPOINTS.RMF_CATALOG_REMOTE];
  let lastError: Error | null = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS) });
      if (!res.ok) continue;

      const data = await res.json();
      const rawList = Array.isArray(data) ? data : Array.isArray(data?.contents) ? data.contents : null;

      if (Array.isArray(rawList)) {
        const validatedStations: RawRmfStation[] = rawList
          .filter((item): item is Record<string, unknown> & Partial<RawRmfStation> =>
            Boolean(item && typeof item === "object"),
          )
          .map((item) => {
            const rawImg = typeof item.img === "string" ? item.img.trim() : "";
            const img = resolveProtocolRelativeUrl(rawImg, API_ENDPOINTS.RMF_STATIC_BASE);

            const st: RawRmfStation = {
              id: item.id ?? item.idname ?? "",
              name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Stacja RMF",
              idname: String(item.idname ?? item.id ?? ""),
              slug: String(item.slug ?? ""),
              short: capitalizeFirstLetter(String(item.short ?? "")),
              mountpoint_mp3: String(item.mountpoint_mp3 ?? ""),
              mountpoint_aac: String(item.mountpoint_aac ?? ""),
              img,
              in_premium: typeof item.in_premium === "number" ? item.in_premium : 0,
              station_category: Array.isArray(item.station_category) ? item.station_category : [],
              similar_stations: {
                id_list: Array.isArray(item.similar_stations?.id_list)
                  ? item.similar_stations.id_list.map((id) => Number(id)).filter((id) => !Number.isNaN(id))
                  : [],
              },
            };
            if (item.description) st.description = String(item.description);
            if (item.search) st.search = String(item.search);
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
    return Array.isArray(parsed) ? (parsed as CustomStation[]) : [];
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
  if (INIT_STATIONS.some((s) => s.id === id)) {
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
      short: "Własny stream",
      cat: "custom",
      provider: "generic",
      stream: c.stream,
    }),
  );

  const catalog = getStoredRmfCatalog();
  const catalogStations: Station[] = [];

  if (catalog?.stations) {
    const existingIds = new Set([
      ...INIT_STATIONS.map((s) => s.id),
      ...INIT_STATIONS.map((s) => s.apiBaseUrl?.split("/").pop()),
      ...LOCAL_STATIONS.map((s) => s.id),
      ...customStations.map((s) => s.id),
    ]);

    catalog.stations.forEach((raw) => {
      const id = String(raw.id);
      if (existingIds.has(id) || (raw.idname && existingIds.has(raw.idname))) {
        return;
      }
      const st: Station = {
        id: raw.idname,
        name: raw.name,
        short: raw.short || raw.description || "RMF Radio",
        cat: raw.station_category?.[0]?.name || "national",
        provider: "rmf",
        stream: raw.mountpoint_mp3 ? `https://rs202-krk.rmfstream.pl/${raw.mountpoint_mp3}` : "",
        apiBaseUrl: `/api/rmf/stations/${raw.id}`,
      };
      if (raw.img) st.coverUrl = raw.img;
      catalogStations.push(st);
    });
  }

  return [...INIT_STATIONS, ...LOCAL_STATIONS, ...customStations, ...catalogStations];
}

export function getEnabledStations(): Station[] {
  return getAllKnownStations().filter((s) => isStationEnabled(s.id));
}

export function getOrderedStations(): Station[] {
  const enabled = getEnabledStations();
  const favs = enabled.filter((s) => state.favs.has(s.id));
  const others = enabled.filter((s) => !state.favs.has(s.id));
  return [...favs, ...others];
}
