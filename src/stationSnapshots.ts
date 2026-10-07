import { fetchMetadata } from "./metadata.js";
import { type ActiveMetadata, NOW_PLAYING_TTL_MS, NowPlayingCache, type NowPlayingSnapshot } from "./nowPlaying.js";
import { getLiveTrackUpdatedAt, state, subscribeLiveTrack, subscribeState } from "./state.js";
import type { PlaylistResult, Station } from "./types.js";

interface MonitorOptions {
  fetcher?: (station: Station, signal: AbortSignal) => Promise<PlaylistResult | null>;
  activeMetadata?: () => ActiveMetadata | null;
  subscribeActive?: (listener: () => void) => () => void;
}

export class StationSnapshotMonitor {
  private readonly demands = new Map<string, Station[]>();
  private readonly listeners = new Set<() => void>();
  private readonly cache: NowPlayingCache;
  private stations: Station[] = [];
  private key = "";
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeActive: (() => void) | null = null;

  constructor(private readonly options: MonitorOptions = {}) {
    this.cache = new NowPlayingCache(
      () => this.emit(),
      options.fetcher ?? ((station, signal) => fetchMetadata(station, { passive: true, signal })),
    );
  }

  setDemand(consumer: string, stations: Station[]): void {
    if (stations.length) this.demands.set(consumer, stations);
    else this.demands.delete(consumer);
    const union = new Map<string, Station>();
    for (const demand of this.demands.values()) for (const station of demand) union.set(station.id, station);
    const next = Array.from(union.values());
    const key = next
      .map((station) => `${station.id}:${station.provider}:${station.apiBaseUrl ?? ""}`)
      .sort()
      .join("|");
    this.stations = next;
    if (key === this.key) return;
    this.key = key;
    this.generation++;
    this.stopTimer();
    this.cache.cancel();
    if (!next.length) {
      this.unsubscribeActive?.();
      this.unsubscribeActive = null;
      this.emit();
      return;
    } else if (!this.unsubscribeActive && this.options.subscribeActive) {
      this.unsubscribeActive = this.options.subscribeActive(() => this.emit());
    }
    void this.refresh();
  }

  snapshots(stations: Station[]): NowPlayingSnapshot[] {
    return this.cache.snapshots(stations, this.options.activeMetadata?.() ?? null);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get refreshing(): boolean {
    return this.cache.refreshing;
  }

  async refresh(): Promise<void> {
    if (!this.stations.length) return;
    const generation = this.generation;
    const active = this.options.activeMetadata?.() ?? null;
    await this.cache.refresh(
      this.stations.filter((station) => station.id !== active?.stationId),
      active,
    );
    if (generation !== this.generation || !this.stations.length) return;
    this.stopTimer();
    this.timer = setTimeout(() => void this.refresh(), NOW_PLAYING_TTL_MS);
  }

  dispose(): void {
    this.generation++;
    this.demands.clear();
    this.stations = [];
    this.key = "";
    this.stopTimer();
    this.cache.clear();
    this.unsubscribeActive?.();
    this.unsubscribeActive = null;
    this.listeners.clear();
  }

  private stopTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const sharedSnapshots = new StationSnapshotMonitor({
  activeMetadata: () =>
    state.playing && state.station
      ? {
          stationId: state.station.id,
          track: state.liveTrack,
          updatedAt: getLiveTrackUpdatedAt(),
          upcoming: state.history,
        }
      : null,
  subscribeActive: (listener) => {
    const unsubscribeState = subscribeState(listener);
    const unsubscribeLive = subscribeLiveTrack(listener);
    return () => {
      unsubscribeState();
      unsubscribeLive();
    };
  },
});
