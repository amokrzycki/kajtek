import { STATIONS_WITH_FACTS } from "./consts.js";
import { eskaProvider } from "./providers/eska.js";
import { rmfProvider } from "./providers/rmf.js";
import { trojkaProvider } from "./providers/trojka.js";
import type { PlaylistResult, Provider, RawTrack, Station, TrackInfo } from "./types.js";
import { decodeEntities } from "./utils.js";

function getRmfFactsTimeInfo(timestamp: number): { isFacts: boolean; targetHourStr: string } {
  const d = new Date(timestamp * 1000);
  const hour = d.getHours();
  const min = d.getMinutes();

  const isTopOfHour = min >= 55 || min <= 3;
  if (!isTopOfHour) {
    return { isFacts: false, targetHourStr: "" };
  }

  const targetHour = (hour + (min >= 55 ? 1 : 0)) % 24;
  const isFacts = targetHour >= 6 && targetHour <= 23;
  const targetHourStr = `${String(targetHour).padStart(2, "0")}:00`;

  return { isFacts, targetHourStr };
}

export function getFactsInfo(
  station: Station | null | undefined,
  timestamp: number,
): { isFacts: boolean; targetHourStr: string } {
  return station?.id && STATIONS_WITH_FACTS.includes(station.id)
    ? getRmfFactsTimeInfo(timestamp)
    : { isFacts: false, targetHourStr: "" };
}

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
      const len = Number(item.length ?? item.lenght ?? 0);
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
  trojka: trojkaProvider,
};

export function getProvider(station?: Station | null): Provider {
  const provider = station?.provider && PROVIDERS[station.provider];
  if (provider) {
    return provider;
  }
  if (station?.apiBaseUrl?.includes("rmf")) {
    return rmfProvider;
  }
  return genericProvider;
}
