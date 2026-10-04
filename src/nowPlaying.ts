import { isBlacklisted } from "./blacklist.js";
import { fetchMetadata } from "./metadata.js";
import type { ContentKind, FavTrack, PlaylistResult, Station, TrackInfo } from "./types.js";

export const NOW_PLAYING_TTL_MS = 15_000;
export const NOW_PLAYING_STALE_MS = 30_000;
export const NOW_PLAYING_MAX_AGE_MS = 120_000;
const CONCURRENCY = 4;

export interface NowPlayingSnapshot {
  station: Station;
  track: TrackInfo | null;
  kind: ContentKind;
  evidence: "explicit" | "inferred" | null;
  flags: { blacklisted: boolean; favoriteArtist: boolean };
  updatedAt: number | null;
  stale: boolean;
  error: boolean;
  loading: boolean;
  source: "player" | "passive";
}

export interface ActiveMetadata {
  stationId: string;
  track: TrackInfo;
  updatedAt: number;
}

interface CacheEntry {
  identity: string;
  track: TrackInfo | null;
  updatedAt: number | null;
  attemptedAt: number;
  error: boolean;
}

type FetchMetadata = (station: Station, signal: AbortSignal) => Promise<PlaylistResult | null>;

function stationIdentity(station: Station): string {
  return `${station.provider}:${station.apiBaseUrl ?? ""}`;
}

export function classifyContent(station: Station, track: TrackInfo | null): ContentKind {
  if (!track) return "unknown";
  if (track.isFacts) return "news";
  if (track.contentKind) return track.contentKind;
  if (track.isLiveBreak || track.isBreak) {
    if (station.provider === "trojka") return "programme";
    if (station.provider === "rmf" && !track.isPredicted) return "advertisement";
    return "unknown";
  }
  return track.title.trim() ? "track" : "unknown";
}

export function deriveDiscoveryFlags(track: TrackInfo | null, kind: ContentKind, favorites: FavTrack[]) {
  const artist = track?.artist.trim().toLowerCase() ?? "";
  return {
    blacklisted: kind === "track" && isBlacklisted(track),
    favoriteArtist:
      kind === "track" && artist.length > 0 && favorites.some((fav) => fav.artist.trim().toLowerCase() === artist),
  };
}

export function orderSnapshots(snapshots: NowPlayingSnapshot[]): NowPlayingSnapshot[] {
  const rank = (kind: ContentKind) => (kind === "track" ? 0 : kind === "unknown" ? 2 : 1);
  // The input is catalog order; stable ties never depend on request completion or track names.
  return snapshots
    .map((snapshot, index) => ({ snapshot, index }))
    .sort((a, b) => rank(a.snapshot.kind) - rank(b.snapshot.kind) || a.index - b.index)
    .map(({ snapshot }) => snapshot);
}

export class NowPlayingCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Set<string>();
  private controller: AbortController | null = null;
  private generation = 0;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly onChange: () => void,
    private readonly fetcher: FetchMetadata = (station, signal) => fetchMetadata(station, { passive: true, signal }),
  ) {}

  snapshots(stations: Station[], favorites: FavTrack[], active: ActiveMetadata | null = null): NowPlayingSnapshot[] {
    const now = Date.now();
    return orderSnapshots(
      stations.map((station): NowPlayingSnapshot => {
        const entry = this.cache.get(station.id);
        const cached = entry?.identity === stationIdentity(station) ? entry : undefined;
        const live =
          active?.stationId === station.id &&
          (now - active.updatedAt < NOW_PLAYING_STALE_MS || active.updatedAt >= (cached?.updatedAt ?? 0))
            ? active
            : null;
        const updatedAt = live?.updatedAt ?? cached?.updatedAt ?? null;
        const expired = updatedAt !== null && now - updatedAt >= NOW_PLAYING_MAX_AGE_MS;
        const track = expired ? null : (live?.track ?? cached?.track ?? null);
        const kind = classifyContent(station, track);
        return {
          station,
          track,
          kind,
          evidence: track?.contentEvidence ?? (kind === "advertisement" ? "inferred" : null),
          flags: deriveDiscoveryFlags(track, kind, favorites),
          updatedAt,
          stale: updatedAt !== null && (now - updatedAt >= NOW_PLAYING_STALE_MS || (!live && Boolean(cached?.error))),
          error: !live && Boolean(cached?.error),
          loading: this.pending.has(station.id),
          source: live ? "player" : "passive",
        };
      }),
    );
  }

  get refreshing(): boolean {
    return this.refreshPromise !== null;
  }

  refresh(stations: Station[], active: ActiveMetadata | null = null): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    const enabled = new Set(stations.map((station) => station.id));
    for (const id of this.cache.keys()) if (!enabled.has(id)) this.cache.delete(id);
    const now = Date.now();
    const queue = stations.filter((station) => {
      if (!station.apiBaseUrl) return false;
      if (active?.stationId === station.id && now - active.updatedAt < NOW_PLAYING_STALE_MS) return false;
      const entry = this.cache.get(station.id);
      return !entry || entry.identity !== stationIdentity(station) || now - entry.attemptedAt >= NOW_PLAYING_TTL_MS;
    });
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    queue.forEach((station) => {
      this.pending.add(station.id);
    });
    const worker = async () => {
      while (!controller.signal.aborted) {
        const station = queue.shift();
        if (!station) return;
        const identity = stationIdentity(station);
        try {
          const result = await this.fetcher(station, controller.signal);
          if (generation !== this.generation || controller.signal.aborted) return;
          if (!result) throw new Error("No metadata response");
          const fetchedAt = Date.now();
          this.cache.set(station.id, {
            identity,
            track: result.current,
            updatedAt: fetchedAt,
            attemptedAt: fetchedAt,
            error: false,
          });
        } catch (_) {
          if (generation !== this.generation || controller.signal.aborted) return;
          const previous = this.cache.get(station.id);
          this.cache.set(station.id, {
            identity,
            track: previous?.identity === identity ? previous.track : null,
            updatedAt: previous?.identity === identity ? previous.updatedAt : null,
            attemptedAt: Date.now(),
            error: true,
          });
        }
        this.pending.delete(station.id);
        this.onChange();
      }
    };
    this.refreshPromise = Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)).then(() => {
      if (generation !== this.generation) return;
      this.refreshPromise = null;
      this.controller = null;
      this.onChange();
    });
    this.onChange();
    return this.refreshPromise;
  }

  cancel(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.refreshPromise = null;
    this.pending.clear();
  }
}
