import { DEFAULT_BREAK_LABEL, TIMERS } from "../consts.js";
import type { EskaNowPlaying, EskaTrack, PlaylistResult, Provider, Station, TrackInfo } from "../types.js";

function toTrackInfo(item: EskaTrack, order: number): TrackInfo {
  const cover = item.image || item.thumb || "";
  return {
    order,
    artist: (item.artists || []).join(" & "),
    title: item.name || "Utwór",
    ...(cover ? { coverUrl: cover } : {}),
  };
}

export const eskaProvider: Provider = {
  name: "Eska Network Provider",
  parse(): PlaylistResult | null {
    return null; // unused — fetch() below owns this provider's data flow
  },
  async fetch(station: Station): Promise<PlaylistResult | null> {
    // timestamp is mandatory — without it the API answers with a null current.
    const ts = Math.floor(Date.now() / 1000);
    const res = await fetch(`${station.apiBaseUrl}/?timestamp=${ts}`, {
      signal: AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as EskaNowPlaying | null;
    if (!data) return null;

    const pasts = data.pasts || [];
    const all: TrackInfo[] = [
      ...pasts.map((t, i) => toTrackInfo(t, i - pasts.length)),
      ...(data.current ? [toTrackInfo(data.current, 0)] : []),
      ...(data.futures || []).map((t, i) => toTrackInfo(t, i + 1)),
    ];
    if (all.length === 0) return null;

    // ESKA carries no times, so a missing current is the only ad-break signal available here —
    // ponytail: inferred, not observed. The #EXT-X-ZPR chunklist tag reports REKLAMA/JINGLE
    // explicitly and should replace this once the HLS metadata channel is wired up.
    const current: TrackInfo = data.current
      ? toTrackInfo(data.current, 0)
      : { artist: station.name, title: DEFAULT_BREAK_LABEL, isLiveBreak: true };

    return { current, all };
  },
};
