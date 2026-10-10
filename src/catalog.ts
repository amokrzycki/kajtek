import { API_ENDPOINTS, INIT_STATIONS, STORAGE_KEYS, TIMERS } from "./consts.js";
import { LOCAL_STATIONS } from "./localStations.js";
import { state } from "./state.js";
import type {
  CustomStation,
  EskaCatalogCache,
  RawEskaStation,
  RawRmfStation,
  RmfCatalogCache,
  Station,
  StationPref,
} from "./types.js";
import { capitalizeFirstLetter, getStoredJSON, resolveProtocolRelativeUrl, setStoredJSON } from "./utils.js";

function isStoredRmfStation(
  value: unknown,
): value is Pick<RawRmfStation, "id" | "idname" | "name"> & Partial<RawRmfStation> {
  if (!value || typeof value !== "object") return false;
  const station = value as Partial<RawRmfStation>;
  return (
    (typeof station.id === "string" || (typeof station.id === "number" && Number.isFinite(station.id))) &&
    typeof station.idname === "string" &&
    typeof station.name === "string" &&
    ["slug", "short", "mountpoint_mp3", "mountpoint_aac", "img", "description", "search"].every(
      (key) => !(key in station) || typeof (station as Record<string, unknown>)[key] === "string",
    ) &&
    (station.in_premium === undefined ||
      (typeof station.in_premium === "number" && Number.isFinite(station.in_premium))) &&
    (station.station_category === undefined ||
      (Array.isArray(station.station_category) &&
        station.station_category.every(
          (category) =>
            category &&
            typeof category.name === "string" &&
            (category.slug === undefined || typeof category.slug === "string"),
        ))) &&
    (station.similar_stations === undefined ||
      (Array.isArray(station.similar_stations?.id_list) &&
        station.similar_stations.id_list.every((id) => typeof id === "number" && Number.isFinite(id))))
  );
}

function isStoredEskaStation(
  value: unknown,
): value is Pick<RawEskaStation, "uid" | "name" | "stream_url"> & Partial<RawEskaStation> {
  if (!value || typeof value !== "object") return false;
  const station = value as Partial<RawEskaStation>;
  return (
    typeof station.uid === "string" &&
    typeof station.name === "string" &&
    typeof station.stream_url === "string" &&
    ["now_playing_url", "dedicated_name", "cover", "stream_ic"].every(
      (key) => !(key in station) || typeof (station as Record<string, unknown>)[key] === "string",
    ) &&
    (station.sort === undefined || (typeof station.sort === "number" && Number.isFinite(station.sort)))
  );
}

export function getStoredRmfCatalog(): RmfCatalogCache | null {
  const cache = getStoredJSON<{ fetchedAt: number; stations: unknown[] } | null>(
    STORAGE_KEYS.RMF_CATALOG_CACHE,
    null,
    (v) =>
      typeof (v as Partial<RmfCatalogCache>)?.fetchedAt === "number" &&
      Array.isArray((v as Partial<RmfCatalogCache>)?.stations),
  );
  if (!cache) return null;
  return {
    ...cache,
    stations: cache.stations.filter(isStoredRmfStation).map((station) => ({
      slug: "",
      short: "",
      mountpoint_mp3: "",
      mountpoint_aac: "",
      img: "",
      in_premium: 0,
      similar_stations: { id_list: [] },
      ...station,
      station_category: (station.station_category ?? []).map((category) => ({
        ...category,
        slug: category.slug ?? "",
      })),
    })),
  };
}

function eskaStationId(uid: string): string {
  return `eska_${uid}`;
}

export function getStoredEskaCatalog(): EskaCatalogCache | null {
  const cache = getStoredJSON<{ fetchedAt: number; stations: unknown[] } | null>(
    STORAGE_KEYS.ESKA_CATALOG_CACHE,
    null,
    (v) =>
      typeof (v as Partial<EskaCatalogCache>)?.fetchedAt === "number" &&
      Array.isArray((v as Partial<EskaCatalogCache>)?.stations),
  );
  if (!cache) return null;
  return {
    ...cache,
    stations: cache.stations.filter(isStoredEskaStation).map((station) => ({
      now_playing_url: "",
      dedicated_name: "",
      cover: "",
      stream_ic: "",
      sort: 0,
      ...station,
    })),
  };
}

export async function fetchEskaCatalog(): Promise<EskaCatalogCache> {
  const res = await fetch(API_ENDPOINTS.ESKA_CATALOG, { signal: AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error("Nie udało się pobrać listy stacji ESKA");

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Nieoczekiwana odpowiedź serwera stacji ESKA");

  const stations: RawEskaStation[] = data
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .filter((item) => typeof item.uid === "string" && typeof item.stream_url === "string")
    .map((item) => ({
      uid: String(item.uid),
      now_playing_url: String(item.now_playing_url ?? ""),
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Stacja ESKA",
      dedicated_name: typeof item.dedicated_name === "string" ? item.dedicated_name.trim() : "",
      cover: typeof item.cover === "string" ? item.cover : "",
      stream_url: String(item.stream_url),
      stream_ic: typeof item.stream_ic === "string" ? item.stream_ic : "",
      sort: typeof item.sort === "number" ? item.sort : 0,
    }));

  const cache: EskaCatalogCache = { fetchedAt: Date.now(), stations };
  setStoredJSON(STORAGE_KEYS.ESKA_CATALOG_CACHE, cache);
  return cache;
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

        setStoredJSON(STORAGE_KEYS.RMF_CATALOG_CACHE, cache);
        return cache;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("Nie udało się pobrać listy stacji");
}

export function getCustomStations(): CustomStation[] {
  return getStoredJSON<unknown[]>(STORAGE_KEYS.CUSTOM_STATIONS, [], Array.isArray).filter(
    (value): value is CustomStation => {
      if (!value || typeof value !== "object") return false;
      const station = value as Partial<CustomStation>;
      return typeof station.id === "string" && typeof station.name === "string" && typeof station.stream === "string";
    },
  );
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
    throw new Error("Podaj poprawny adres strumienia zaczynający się od https:// lub http://");
  }

  const list = getCustomStations();
  const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const newStation: CustomStation = {
    id,
    name: trimmedName,
    stream: trimmedUrl,
  };

  list.push(newStation);
  setStoredJSON(STORAGE_KEYS.CUSTOM_STATIONS, list);

  setStationEnabled(id, true);
  return newStation;
}

export function deleteCustomStation(id: string): void {
  const list = getCustomStations().filter((s) => s.id !== id);
  setStoredJSON(STORAGE_KEYS.CUSTOM_STATIONS, list);

  const prefs = getStationPrefs();
  delete prefs[id];
  setStoredJSON(STORAGE_KEYS.STATION_PREFS, prefs);

  if (state.favs.has(id)) {
    state.favs.delete(id);
    setStoredJSON(STORAGE_KEYS.FAVS, Array.from(state.favs));
  }
}

export function getStationPrefs(): Record<string, StationPref> {
  const stored = getStoredJSON<Record<string, StationPref>>(STORAGE_KEYS.STATION_PREFS, {});
  const prefs = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  let migrated = false;
  for (const [id, pref] of Object.entries(prefs)) {
    if (!pref || typeof pref !== "object" || typeof pref.enabled !== "boolean") {
      delete prefs[id];
      migrated = true;
      continue;
    }
    if (typeof pref.smartEnabled !== "boolean") {
      pref.smartEnabled = pref.enabled;
      migrated = true;
    }
  }
  if (migrated) setStoredJSON(STORAGE_KEYS.STATION_PREFS, prefs);
  return prefs;
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

  const smartEnabled = isStationSmartEnabled(id);
  prefs[id] = { ...prefs[id], id, enabled, favorite: fav, smartEnabled };
  setStoredJSON(STORAGE_KEYS.STATION_PREFS, prefs);

  if (!enabled && state.favs.has(id)) {
    state.favs.delete(id);
    setStoredJSON(STORAGE_KEYS.FAVS, Array.from(state.favs));
  }
}

export function setStationFavorite(id: string, favorite: boolean): void {
  if (favorite) {
    setStationEnabled(id, true);
    state.favs.add(id);
  } else {
    state.favs.delete(id);
  }
  setStoredJSON(STORAGE_KEYS.FAVS, Array.from(state.favs));

  const prefs = getStationPrefs();
  prefs[id] = { ...prefs[id], id, enabled: isStationEnabled(id), favorite, smartEnabled: isStationSmartEnabled(id) };
  setStoredJSON(STORAGE_KEYS.STATION_PREFS, prefs);
}

export function isStationSmartEnabled(id: string): boolean {
  const prefs = getStationPrefs();
  const explicit = prefs[id]?.smartEnabled;
  if (typeof explicit === "boolean") return explicit;
  const enabled = isStationEnabled(id);
  prefs[id] = { id, enabled, favorite: state.favs.has(id), smartEnabled: enabled };
  setStoredJSON(STORAGE_KEYS.STATION_PREFS, prefs);
  return enabled;
}

export function setStationSmartEnabled(id: string, smartEnabled: boolean): void {
  const prefs = getStationPrefs();
  prefs[id] = { ...prefs[id], id, enabled: isStationEnabled(id), favorite: state.favs.has(id), smartEnabled };
  setStoredJSON(STORAGE_KEYS.STATION_PREFS, prefs);
}

export function getSmartStations(): Station[] {
  const stations = getAllKnownStations();
  const prefs = getStationPrefs();
  let initialized = false;
  for (const station of stations) {
    if (typeof prefs[station.id]?.smartEnabled === "boolean") continue;
    const enabled = prefs[station.id]?.enabled ?? initialStationEnabled(station);
    prefs[station.id] = { id: station.id, enabled, favorite: state.favs.has(station.id), smartEnabled: enabled };
    initialized = true;
  }
  if (initialized) setStoredJSON(STORAGE_KEYS.STATION_PREFS, prefs);
  return stations.filter((station) => prefs[station.id]?.smartEnabled);
}

function initialStationEnabled(station: Station): boolean {
  return station.cat === "custom" || INIT_STATIONS.some((initial) => initial.id === station.id);
}

export function getAllKnownStations(): Station[] {
  const customStations = getCustomStations().map(
    (c): Station => ({
      id: c.id,
      name: c.name,
      short: "Własna stacja",
      cat: "custom",
      provider: "generic",
      stream: c.stream,
    }),
  );

  const catalog = getStoredRmfCatalog();
  const catalogStations: Station[] = [];

  const existingIds = new Set([
    ...INIT_STATIONS.map((s) => s.id),
    ...INIT_STATIONS.map((s) => s.apiBaseUrl?.split("/").pop()),
    ...LOCAL_STATIONS.map((s) => s.id),
    ...customStations.map((s) => s.id),
  ]);

  if (catalog?.stations) {
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

  // Keyed by uid, not station_id: ESKA deliberately publishes one regional stream under several, city labels (2220 is Śląsk/Sosnowiec/Chorzów/Katowice), and collapsing them would break searching for your own city.
  const eskaStations: Station[] = (getStoredEskaCatalog()?.stations ?? [])
    .filter((raw) => !existingIds.has(eskaStationId(raw.uid)))
    .sort((a, b) => a.sort - b.sort)
    .map((raw): Station => {
      const st: Station = {
        id: eskaStationId(raw.uid),
        name: raw.dedicated_name || raw.name,
        short: raw.name,
        cat: "national",
        provider: "eska",
        stream: raw.stream_ic || raw.stream_url,
        apiBaseUrl: `${API_ENDPOINTS.ESKA_NOW_PLAYING_BASE}/${raw.now_playing_url}`,
      };
      // hls.js/MSE degrades the stereo HE-AAC stream published by ZPR; use the direct AAC mount first.
      if (raw.stream_ic) st._streams = [raw.stream_ic, raw.stream_url];
      if (raw.cover) st.coverUrl = raw.cover;
      return st;
    });

  return [...INIT_STATIONS, ...LOCAL_STATIONS, ...customStations, ...catalogStations, ...eskaStations];
}

export function getEnabledStations(): Station[] {
  const stations = getAllKnownStations();
  const prefs = getStationPrefs();
  return stations.filter((station) => prefs[station.id]?.enabled ?? initialStationEnabled(station));
}

export function getOrderedStations(): Station[] {
  const enabled = getEnabledStations();
  const favs = enabled.filter((s) => state.favs.has(s.id));
  const others = enabled.filter((s) => !state.favs.has(s.id));
  return [...favs, ...others];
}
