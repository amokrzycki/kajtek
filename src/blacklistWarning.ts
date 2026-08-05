import { isBlacklisted } from "./blacklist.js";
import { getOrderedStations, getStoredRmfCatalog } from "./catalog.js";
import { DEFAULT_BREAK_LABEL, MIN_SKIP_GRACE_SEC, SWITCH_RATE_LIMIT, TIMERS } from "./consts.js";
import { fetchPlaylist, selectStation } from "./player.js";
import { notifyState, state } from "./state.js";
import type { Station, TrackInfo } from "./types.js";
import { getTrackKey, withinRateLimit } from "./utils.js";

type WarningKind = "blacklist" | "adSkip";

interface BlacklistWarning {
  kind: WarningKind;
  phase: "warning" | "switched";
  track: TrackInfo;
  trackKey: string;
  originStation: Station;
  candidate: Station;
  candidateReason: "favorite" | "similar" | "other";
  secondsLeft: number;
  deadlineSec?: number;
  switchedAt?: number;
}

interface ActiveAdSkip {
  originStation: Station;
  trackKey: string;
  startedAt: number;
}

let blacklistWarning: BlacklistWarning | null = null;
let dismissedTrackKey: string | null = null;
let blacklistSwitchTimestamps: number[] = [];
let activeAdSkip: ActiveAdSkip | null = null;
let lastAdReturnPollAt = 0;
let arming = false;

export function getBlacklistWarningState(): BlacklistWarning | null {
  return blacklistWarning;
}

export function resetBlacklistWarningState(): void {
  blacklistWarning = null;
  dismissedTrackKey = null;
  activeAdSkip = null;
}

async function candidateCurrentlyBlocked(candidate: Station, kind: WarningKind): Promise<boolean> {
  if (!candidate.apiBaseUrl) return false;
  const data = await fetchPlaylist(candidate);
  const current = data?.current;
  if (!current) return false;
  return kind === "adSkip"
    ? current.isLiveBreak === true && current.title === DEFAULT_BREAK_LABEL
    : isBlacklisted(current);
}

async function pickSwitchCandidate(
  origin: Station,
  kind: WarningKind,
): Promise<{ station: Station; reason: "favorite" | "similar" | "other" } | null> {
  const pool = getOrderedStations().filter((s) => s.id !== origin.id);
  if (pool.length === 0) return null;

  let similarIdnames = new Set<string>();
  if (origin.provider === "rmf") {
    const catalog = getStoredRmfCatalog()?.stations ?? [];
    const raw = catalog.find((r) => r.idname === origin.id || String(r.id) === origin.id);
    const similarNumericIds = new Set(raw?.similar_stations?.id_list.map(String));
    similarIdnames = new Set(catalog.filter((r) => similarNumericIds.has(String(r.id))).map((r) => r.idname));
  }

  const ordered = [
    ...pool.filter((s) => similarIdnames.has(s.id)),
    ...pool.filter((s) => state.favs.has(s.id) && !similarIdnames.has(s.id)),
    ...pool.filter((s) => !similarIdnames.has(s.id) && !state.favs.has(s.id)),
  ];

  for (const station of ordered) {
    if (await candidateCurrentlyBlocked(station, kind)) continue;
    const reason = similarIdnames.has(station.id) ? "similar" : state.favs.has(station.id) ? "favorite" : "other";
    return { station, reason };
  }
  return null;
}

function performStationSwitch(
  kind: WarningKind,
  track: TrackInfo,
  originStation: Station,
  candidate: Station,
  reason: string,
) {
  const rateLimit = withinRateLimit(blacklistSwitchTimestamps, SWITCH_RATE_LIMIT.WINDOW_MS, SWITCH_RATE_LIMIT.MAX);
  blacklistSwitchTimestamps = rateLimit.timestamps;

  if (rateLimit.limited) {
    // avoid switching forever if every candidate keeps landing on another blocked track/break.
    dismissedTrackKey = getTrackKey(track);
    blacklistWarning = null;
    return;
  }

  selectStation(candidate);
  const trackKey = getTrackKey(track);
  blacklistWarning = {
    kind,
    phase: "switched",
    track,
    trackKey,
    originStation,
    candidate,
    candidateReason: reason as "favorite" | "similar" | "other",
    secondsLeft: 0,
    switchedAt: Date.now(),
  };
  if (kind === "adSkip" && state.adSkipAutoReturnEnabled) {
    activeAdSkip = { originStation, trackKey, startedAt: Date.now() };
  }
}

async function armSwitchWarning(kind: WarningKind, track: TrackInfo, origin: Station, immediate: boolean) {
  if (arming) return;
  arming = true;
  try {
    const picked = await pickSwitchCandidate(origin, kind);
    if (!picked || state.station?.id !== origin.id) return;

    state.showHistory = true;
    state.historyTab = "program";

    // Even when we're already mid-break (no future track.timestamp to count down from), give the
    // user a visible grace window instead of switching the instant it's detected.
    const nowSec = Math.floor(Date.now() / 1000);
    const deadlineSec = immediate ? nowSec + MIN_SKIP_GRACE_SEC : (track.timestamp ?? nowSec);
    blacklistWarning = {
      kind,
      phase: "warning",
      track,
      trackKey: getTrackKey(track),
      originStation: origin,
      candidate: picked.station,
      candidateReason: picked.reason,
      secondsLeft: deadlineSec - nowSec,
      deadlineSec,
    };
    notifyState();
  } finally {
    arming = false;
  }
}

export function detectBlacklistedUpcoming() {
  if (!state.station || blacklistWarning || !state.blacklistEnabled) return;

  if (state.liveTrack && (!state.liveTrack.isLiveBreak || state.liveTrack.isFacts) && isBlacklisted(state.liveTrack)) {
    const key = getTrackKey(state.liveTrack);
    if (key !== dismissedTrackKey) void armSwitchWarning("blacklist", state.liveTrack, state.station, true);
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const upcoming = state.history
    .filter((t) => !t.isBreak && t.artist && t.title && t.timestamp && t.timestamp > nowSec)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0];

  if (upcoming && isBlacklisted(upcoming) && getTrackKey(upcoming) !== dismissedTrackKey) {
    void armSwitchWarning("blacklist", upcoming, state.station, false);
  }
}

export function detectUpcomingAdBreak() {
  if (!state.station || blacklistWarning || !state.adSkipEnabled) return;

  if (state.liveTrack?.isLiveBreak && state.liveTrack.title === DEFAULT_BREAK_LABEL) {
    const key = getTrackKey(state.liveTrack);
    if (key !== dismissedTrackKey) void armSwitchWarning("adSkip", state.liveTrack, state.station, true);
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const nextUp = state.history
    .filter((t) => t.timestamp && t.timestamp > nowSec)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0];

  if (nextUp?.isBreak && nextUp.label === DEFAULT_BREAK_LABEL && getTrackKey(nextUp) !== dismissedTrackKey) {
    void armSwitchWarning("adSkip", nextUp, state.station, false);
  }
}

export function switchBlacklistCandidateNow(): void {
  if (blacklistWarning?.phase !== "warning") return;
  performStationSwitch(
    blacklistWarning.kind,
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
  activeAdSkip = null;
  selectStation(originStation);
  dismissedTrackKey = trackKey;
}

async function checkAdBreakEnded(): Promise<void> {
  if (!activeAdSkip) return;
  const { originStation, trackKey, startedAt } = activeAdSkip;
  const timedOut = Date.now() - startedAt >= TIMERS.AD_RETURN_MAX_WAIT_MS;
  const data = await fetchPlaylist(originStation);
  if (!activeAdSkip) return;
  // Give up waiting past the cap even if the origin still reports a break — a stuck/misreporting
  // station API would otherwise poll forever and never bring us back.
  if (!timedOut && (data?.current == null || data.current.isLiveBreak)) return;

  activeAdSkip = null;
  blacklistWarning = null;
  selectStation(originStation);
  dismissedTrackKey = trackKey;
  notifyState();
}

setInterval(() => {
  if (activeAdSkip && Date.now() - lastAdReturnPollAt >= TIMERS.TRACK_POLL_MS) {
    lastAdReturnPollAt = Date.now();
    void checkAdBreakEnded();
  }

  if (!blacklistWarning) return;

  if (blacklistWarning.phase === "warning") {
    const nowSec = Math.floor(Date.now() / 1000);
    const secondsLeft = (blacklistWarning.deadlineSec ?? nowSec) - nowSec;
    if (secondsLeft <= 0) {
      performStationSwitch(
        blacklistWarning.kind,
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
    if (blacklistWarning.kind === "adSkip" && activeAdSkip) {
      const remainingMs = TIMERS.AD_RETURN_MAX_WAIT_MS - (Date.now() - activeAdSkip.startedAt);
      const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
      if (secondsLeft !== blacklistWarning.secondsLeft) {
        blacklistWarning.secondsLeft = secondsLeft;
        notifyState();
      }
    } else if (Date.now() - (blacklistWarning.switchedAt ?? 0) > 8000) {
      blacklistWarning = null;
      notifyState();
    }
  }
}, 1000);
