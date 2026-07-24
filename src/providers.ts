import type { Station } from "./data.js";
import type { TrackInfo } from "./state.js";

function decodeEntities(str?: string | null): string {
  if (!str) return "";
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

interface RawTrack {
  order?: number;
  lenght?: string | number;
  length?: string | number;
  timestamp?: number;
  author?: string;
  artist?: string;
  title?: string;
  start?: string;
  startTime?: string;
  name?: string;
  song?: string;
  current?: RawTrack;
  now?: RawTrack;
  upcoming?: RawTrack[];
  next?: RawTrack[];
  songs?: RawTrack[];
  tracks?: RawTrack[];
  playlist?: RawTrack[];
}

export interface PlaylistResult {
  current: TrackInfo | null;
  all: TrackInfo[];
}

export interface Provider {
  name: string;
  parse(data: unknown, station?: Station | null): PlaylistResult | null;
}

export const rmfProvider: Provider = {
  name: "RMF Network Provider",
  parse(data: unknown, station?: Station | null): PlaylistResult | null {
    if (!Array.isArray(data) || data.length === 0) return null;

    const sorted = [...(data as RawTrack[])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const processed: TrackInfo[] = [];
    const nowSec = Math.floor(Date.now() / 1000);

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      if (!item) continue;
      const len = Number.parseInt(String(item.lenght || item.length || "0"), 10);
      const endTs = item.timestamp ? item.timestamp + len : null;

      const track: TrackInfo = {
        order: item.order ?? i,
        artist: decodeEntities(item.author || item.artist),
        title: decodeEntities(item.title),
        start: item.start || null,
        endTimestamp: endTs,
        length: len,
      };
      if (item.timestamp !== undefined) {
        track.timestamp = item.timestamp;
      }
      processed.push(track);

      if (i < sorted.length - 1) {
        const nextItem = sorted[i + 1];
        if (item.timestamp && len && nextItem?.timestamp && endTs) {
          const gapSec = nextItem.timestamp - endTs;
          if (gapSec >= 15) {
            const gapMin = Math.round(gapSec / 60);
            const d = new Date(endTs * 1000);
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            const ss = String(d.getSeconds()).padStart(2, "0");
            const hasSeconds = item.start?.split(":").length === 3 || ss !== "00";
            const breakStartStr = hasSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;

            const label = gapSec >= 120 ? `Przerwa / Reklamy` : `Wejście DJ / Dżingel`;
            processed.push({
              order: item.order ?? i,
              artist: "",
              title: "",
              isBreak: true,
              start: breakStartStr,
              timestamp: endTs,
              endTimestamp: nextItem.timestamp,
              length: gapSec,
              gapSec,
              gapMin,
              label,
            });
          }
        }
      }
    }

    const curItem = sorted.find((item) => item.order === 0) || sorted[0];
    const curLen = Number.parseInt(String(curItem?.lenght || curItem?.length || "0"), 10);
    const curEndTs = curItem?.timestamp ? curItem.timestamp + curLen : null;
    const hasUpcoming = sorted.some((item) => (item.order ?? 0) > 0);

    if (!hasUpcoming && curEndTs) {
      const endDate = new Date(curEndTs * 1000);
      const endMin = endDate.getMinutes();
      const endHour = endDate.getHours();
      const endSec = endDate.getSeconds();
      const hasSeconds = curItem?.start?.split(":").length === 3 || endSec !== 0;
      const breakStartStr = hasSeconds
        ? `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:${String(endSec).padStart(2, "0")}`
        : `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;

      const nextHourStr = `${String((endHour + (endMin >= 55 ? 1 : 0)) % 24).padStart(2, "0")}:00`;

      const isTopOfHour = endMin >= 55 || endMin <= 3;
      const stationBrand = station?.name || "Stacja";
      const breakLabel = isTopOfHour
        ? `Serwis informacyjny / Fakty ${stationBrand} (~${nextHourStr})`
        : "Przerwa / Serwis informacyjny";

      processed.push({
        artist: "",
        title: "",
        isBreak: true,
        isPredicted: true,
        start: breakStartStr,
        timestamp: curEndTs,
        label: breakLabel,
      });
    }

    const currentActive = processed.find(
      (t) => t.timestamp && t.timestamp <= nowSec && t.endTimestamp && t.endTimestamp > nowSec,
    );

    let activeTrack: TrackInfo | null = null;
    if (currentActive) {
      if (currentActive.isBreak) {
        activeTrack = {
          artist: station?.name || "Radio",
          title: `📻 ${currentActive.label || "Przerwa / Reklamy"}`,
          isLiveBreak: true,
        };
      } else {
        activeTrack = {
          artist: currentActive.artist,
          title: currentActive.title,
        };
      }
    } else if (curEndTs && nowSec >= curEndTs) {
      const isTopOfHour =
        new Date(nowSec * 1000).getMinutes() >= 55 || new Date(nowSec * 1000).getMinutes() <= 3;
      const breakTitle = isTopOfHour
        ? `📻 Serwis informacyjny / Fakty ${station?.name || ""}`.trim()
        : "📻 Przerwa / Reklamy";
      activeTrack = {
        artist: station?.name || "Radio",
        title: breakTitle,
        isLiveBreak: true,
      };
    } else if (curItem) {
      activeTrack = {
        artist: decodeEntities(curItem.author || curItem.artist),
        title: decodeEntities(curItem.title),
      };
    }

    return {
      current: activeTrack,
      all: processed,
    };
  },
};

export const eskaProvider: Provider = {
  name: "Eska / Radio Time Provider",
  parse(data: unknown, station?: Station | null): PlaylistResult | null {
    if (!data) return null;
    const payload = data as RawTrack;

    let rawTracks: RawTrack[] = [];
    if (Array.isArray(data)) {
      rawTracks = data as RawTrack[];
    } else if (payload.current || payload.songs || payload.tracks || payload.now) {
      const cur = payload.current || payload.now;
      const upcoming = payload.upcoming || payload.next || payload.songs || payload.tracks || [];
      if (cur) rawTracks.push({ ...cur, order: 0 });
      if (Array.isArray(upcoming)) {
        upcoming.forEach((t: RawTrack, i: number) => {
          rawTracks.push({ ...t, order: i + 1 });
        });
      }
    }

    if (rawTracks.length === 0) return null;

    const processed: TrackInfo[] = rawTracks.map((item, idx) => {
      const len = Number.parseInt(String(item.lenght || item.length || "0"), 10);
      return {
        order: item.order ?? idx,
        artist: decodeEntities(item.artist || item.author || item.name || station?.name),
        title: decodeEntities(item.title || item.song || item.name || "Utwór"),
        start: item.start || item.startTime || null,
        ...(len > 0 ? { length: len } : {}),
      };
    });

    const active = processed.find((t) => t.order === 0) || processed[0];
    return {
      current: active ? { artist: active.artist, title: active.title } : null,
      all: processed,
    };
  },
};

export const genericProvider: Provider = {
  name: "Generic Playlist Provider",
  parse(data: unknown, station?: Station | null): PlaylistResult | null {
    if (!data) return null;
    const payload = data as RawTrack;
    const list: RawTrack[] = Array.isArray(data)
      ? (data as RawTrack[])
      : payload.tracks || payload.playlist || [payload];
    if (list.length === 0) return null;

    const processed: TrackInfo[] = list.map((item: RawTrack, idx: number) => {
      const len = Number.parseInt(String(item.lenght || item.length || "0"), 10);
      return {
        order: item.order ?? idx,
        artist: decodeEntities(item.artist || item.author || item.name || station?.name),
        title: decodeEntities(item.title || item.song || "Utwór"),
        start: item.start || null,
        ...(len > 0 ? { length: len } : {}),
      };
    });

    const cur = processed[0];
    return {
      current: cur ? { artist: cur.artist, title: cur.title } : null,
      all: processed,
    };
  },
};

export const PROVIDERS: Record<string, Provider> = {
  rmf: rmfProvider,
  eska: eskaProvider,
  generic: genericProvider,
};

export function getProvider(station?: Station | null): Provider {
  if (station?.provider && PROVIDERS[station.provider]) {
    const prov = PROVIDERS[station.provider];
    if (prov) return prov;
  }
  if (station?.playlistUrl?.includes("rmf")) {
    return rmfProvider;
  }
  if (station?.playlistUrl?.includes("eska") || station?.playlistUrl?.includes("radioeska")) {
    return eskaProvider;
  }
  return genericProvider;
}
