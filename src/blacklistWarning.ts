import { isBlacklisted } from "./blacklist.js";
import { getOrderedStations, getStoredRmfCatalog } from "./catalog.js";
import { SWITCH_RATE_LIMIT } from "./consts.js";
import { selectStation } from "./player.js";
import { notifyState, state } from "./state.js";
import type { Station, TrackInfo } from "./types.js";
import { getTrackKey, withinRateLimit } from "./utils.js";

interface BlacklistWarning {
  phase: "warning" | "switched";
  track: TrackInfo;
  trackKey: string;
  originStation: Station;
  candidate: Station;
  candidateReason: "favorite" | "similar" | "other";
  secondsLeft: number;
  switchedAt?: number;
}

let blacklistWarning: BlacklistWarning | null = null;
let dismissedTrackKey: string | null = null;
let blacklistSwitchTimestamps: number[] = [];

export function getBlacklistWarningState(): BlacklistWarning | null {
  return blacklistWarning;
}

export function resetBlacklistWarningState(): void {
  blacklistWarning = null;
  dismissedTrackKey = null;
}

function pickBlacklistCandidate(
  origin: Station,
): { station: Station; reason: "favorite" | "similar" | "other" } | null {
  const pool = getOrderedStations().filter((s) => s.id !== origin.id);
  if (pool.length === 0) return null;

  if (origin.provider === "rmf") {
    const catalog = getStoredRmfCatalog()?.stations ?? [];
    const raw = catalog.find((r) => r.idname === origin.id || String(r.id) === origin.id);
    const similarNumericIds = new Set(raw?.similar_stations?.id_list.map(String));
    const similarIdnames = new Set(catalog.filter((r) => similarNumericIds.has(String(r.id))).map((r) => r.idname));
    // ponytail: ranking hint only, not a guarantee — doesn't verify the candidate's own live
    // track isn't blacklisted (would need an extra fetch per candidate); the switch-cap below
    // self-corrects on the next detection pass if it turns out bad.
    const similar = pool.find((s) => similarIdnames.has(s.id));
    if (similar) return { station: similar, reason: state.favs.has(similar.id) ? "favorite" : "similar" };
  }

  const fav = pool.find((s) => state.favs.has(s.id));
  if (fav) return { station: fav, reason: "favorite" };

  const first = pool[0];
  return first ? { station: first, reason: "other" } : null;
}

function performBlacklistSwitch(track: TrackInfo, originStation: Station, candidate: Station, reason: string) {
  const rateLimit = withinRateLimit(blacklistSwitchTimestamps, SWITCH_RATE_LIMIT.WINDOW_MS, SWITCH_RATE_LIMIT.MAX);
  blacklistSwitchTimestamps = rateLimit.timestamps;

  if (rateLimit.limited) {
    // avoid switching forever if every candidate keeps landing on another blacklisted song.
    dismissedTrackKey = getTrackKey(track);
    blacklistWarning = null;
    return;
  }

  selectStation(candidate);
  blacklistWarning = {
    phase: "switched",
    track,
    trackKey: getTrackKey(track),
    originStation,
    candidate,
    candidateReason: reason as "favorite" | "similar" | "other",
    secondsLeft: 0,
    switchedAt: Date.now(),
  };
}

function armBlacklistWarning(track: TrackInfo, origin: Station, immediate: boolean) {
  const picked = pickBlacklistCandidate(origin);
  if (!picked) return;

  state.showHistory = true;
  state.historyTab = "program";

  if (immediate) {
    performBlacklistSwitch(track, origin, picked.station, picked.reason);
  } else {
    const nowSec = Math.floor(Date.now() / 1000);
    blacklistWarning = {
      phase: "warning",
      track,
      trackKey: getTrackKey(track),
      originStation: origin,
      candidate: picked.station,
      candidateReason: picked.reason,
      secondsLeft: (track.timestamp ?? nowSec) - nowSec,
    };
  }
  notifyState();
}

export function detectBlacklistedUpcoming() {
  if (!state.station || blacklistWarning) return;

  if (state.liveTrack && (!state.liveTrack.isLiveBreak || state.liveTrack.isFacts) && isBlacklisted(state.liveTrack)) {
    const key = getTrackKey(state.liveTrack);
    if (key !== dismissedTrackKey) armBlacklistWarning(state.liveTrack, state.station, true);
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const upcoming = state.history
    .filter((t) => !t.isBreak && t.artist && t.title && t.timestamp && t.timestamp > nowSec)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0];

  if (upcoming && isBlacklisted(upcoming) && getTrackKey(upcoming) !== dismissedTrackKey) {
    armBlacklistWarning(upcoming, state.station, false);
  }
}

export function switchBlacklistCandidateNow(): void {
  if (blacklistWarning?.phase !== "warning") return;
  performBlacklistSwitch(
    blacklistWarning.track,
    blacklistWarning.originStation,
    blacklistWarning.candidate,
    blacklistWarning.candidateReason,
  );
  notifyState();
}

export function dismissBlacklistWarning(): void {
  if (!blacklistWarning) return;
  dismissedTrackKey = blacklistWarning.trackKey;
  blacklistWarning = null;
  notifyState();
}

export function returnToPreviousStation(): void {
  if (blacklistWarning?.phase !== "switched") return;
  const { originStation, trackKey } = blacklistWarning;
  blacklistWarning = null;
  selectStation(originStation);
  dismissedTrackKey = trackKey;
}

setInterval(() => {
  if (!blacklistWarning) return;

  if (blacklistWarning.phase === "warning") {
    const nowSec = Math.floor(Date.now() / 1000);
    const secondsLeft = (blacklistWarning.track.timestamp ?? nowSec) - nowSec;
    if (secondsLeft <= 0) {
      performBlacklistSwitch(
        blacklistWarning.track,
        blacklistWarning.originStation,
        blacklistWarning.candidate,
        blacklistWarning.candidateReason,
      );
      notifyState();
    } else if (secondsLeft !== blacklistWarning.secondsLeft) {
      blacklistWarning.secondsLeft = secondsLeft;
      notifyState();
    }
  } else if (blacklistWarning.phase === "switched") {
    if (Date.now() - (blacklistWarning.switchedAt ?? 0) > 8000) {
      blacklistWarning = null;
      notifyState();
    }
  }
}, 1000);
