import { type ListeningPreference, musicPreference, type SmartListeningConfig } from "./listeningPreferences.js";
import type { ContentKind, Station, TrackInfo } from "./types.js";

export const SMART_WEIGHTS = { track: 4, artist: 2, favorite: 0.5, similar: 0.25 } as const;
export const SAFETY_HORIZON_MS = 15_000;
export const POLICY_FRESH_MS = 30_000;
export type SmartReason = "advertisement" | "news" | "otherBreak" | "negativeTrack" | "negativeArtist";
export interface SmartTrigger {
  reason: SmartReason;
  track: TrackInfo;
  key: string;
  upcoming: boolean;
}
export interface PolicySnapshot {
  station: Station;
  track: TrackInfo | null;
  kind: ContentKind;
  evidence: "explicit" | "inferred" | null;
  updatedAt: number | null;
  stale: boolean;
  error: boolean;
  upcoming?: TrackInfo[];
}
export interface Eligibility {
  eligibility: "rejected" | "eligible" | "fallback";
  score: number;
  reason: "positiveTrack" | "positiveArtist" | "favorite" | "similar" | "safe" | "unknown";
  trigger: SmartTrigger | null;
}

function rejection(track: TrackInfo, kind: ContentKind, config: SmartListeningConfig): SmartReason | null {
  if (track.isPredicted) return null;
  if ((kind === "advertisement" || kind === "news" || kind === "otherBreak") && config.content[kind]) return kind;
  if (kind !== "track") return null;
  const pref = musicPreference(track, config.preferences);
  return pref.exact === "negative" ? "negativeTrack" : pref.artist === "negative" ? "negativeArtist" : null;
}
export function triggerKey(reason: SmartReason, track: TrackInfo): string {
  const content =
    reason === "negativeTrack" || reason === "negativeArtist"
      ? `${track.artist.trim().toLowerCase()}::${track.title.trim().toLowerCase()}`
      : reason;
  return `${reason}:${track.timestamp ?? "live"}:${content}`;
}

export function evaluateSnapshot(
  snapshot: PolicySnapshot | undefined,
  config: SmartListeningConfig,
  now: number,
  favorite = false,
  similar = false,
): Eligibility {
  const fallback: Eligibility = { eligibility: "fallback", score: 0, reason: "unknown", trigger: null };
  if (
    !snapshot ||
    snapshot.stale ||
    snapshot.error ||
    snapshot.updatedAt === null ||
    now - snapshot.updatedAt >= POLICY_FRESH_MS
  )
    return fallback;
  const { track, kind } = snapshot;
  if (track && kind !== "unknown" && !track.isPredicted) {
    const reason = rejection(track, kind, config);
    if (reason)
      return {
        ...fallback,
        eligibility: "rejected",
        trigger: { reason, track, key: triggerKey(reason, track), upcoming: false },
      };
  }
  for (const upcoming of snapshot.upcoming ?? []) {
    if (!upcoming.timestamp || upcoming.isPredicted) continue;
    const startsIn = upcoming.timestamp * 1000 - now;
    if (startsIn < 0 || startsIn > SAFETY_HORIZON_MS) continue;
    const nextKind = upcoming.contentKind ?? "unknown";
    // Timed tracks are a published playlist; inferred gaps and REST queue order do not prove an imminent break.
    if (nextKind !== "track" && upcoming.contentEvidence !== "explicit") continue;
    const reason = rejection(upcoming, nextKind, config);
    if (reason)
      return {
        ...fallback,
        eligibility: "rejected",
        trigger: { reason, track: upcoming, key: triggerKey(reason, upcoming), upcoming: true },
      };
  }
  if (!track || kind === "unknown" || track.isPredicted) return fallback;
  const pref = kind === "track" ? musicPreference(track, config.preferences) : { exact: "neutral", artist: "neutral" };
  const positiveTrack = pref.exact === "positive",
    positiveArtist = pref.artist === "positive";
  return {
    eligibility: "eligible",
    score:
      (positiveTrack ? SMART_WEIGHTS.track : 0) +
      (positiveArtist ? SMART_WEIGHTS.artist : 0) +
      (favorite ? SMART_WEIGHTS.favorite : 0) +
      (similar ? SMART_WEIGHTS.similar : 0),
    reason: positiveTrack
      ? "positiveTrack"
      : positiveArtist
        ? "positiveArtist"
        : favorite
          ? "favorite"
          : similar
            ? "similar"
            : "safe",
    trigger: null,
  };
}

export function rankCandidates(
  snapshots: PolicySnapshot[],
  config: SmartListeningConfig,
  now: number,
  excludeId: string,
  favorites = new Set<string>(),
  similar = new Set<string>(),
  catalogOrder = snapshots.map((snapshot) => snapshot.station.id),
) {
  const order = new Map(catalogOrder.map((id, index) => [id, index]));
  return snapshots
    .filter((snapshot) => snapshot.station.id !== excludeId)
    .map((snapshot) => ({
      snapshot,
      ...evaluateSnapshot(snapshot, config, now, favorites.has(snapshot.station.id), similar.has(snapshot.station.id)),
    }))
    .filter((candidate) => candidate.eligibility !== "rejected")
    .sort(
      (a, b) =>
        Number(b.eligibility === "eligible") - Number(a.eligibility === "eligible") ||
        b.score - a.score ||
        (order.get(a.snapshot.station.id) ?? Infinity) - (order.get(b.snapshot.station.id) ?? Infinity) ||
        a.snapshot.station.id.localeCompare(b.snapshot.station.id),
    );
}

export function negativeMusic(track: TrackInfo, preferences: ListeningPreference[]): boolean {
  return musicPreference(track, preferences).negative;
}
