import { isBlacklisted, normalizeTrackKey, removeFromBlacklist } from "./blacklist.js";
import { getOrderedStations, getStoredRmfCatalog } from "./catalog.js";
import { DEFAULT_BREAK_LABEL, MIN_SKIP_GRACE_SEC, SWITCH_RATE_LIMIT, TIMERS } from "./consts.js";
import { fetchPlaylist, selectStation } from "./player.js";
import { notifyState, state } from "./state.js";
import { createStatisticsOperationId } from "./statistics.js";
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
  // Epoch ms the break is known to end; null means only the explicit fallback wait applies.
  endsAtMs: number | null;
  // Origin's API can still show the previous track right after we leave, so "not a break" only means "ended" once a break was actually seen.
  sawBreak: boolean;
}

interface Dismissal {
  kind: WarningKind;
  trackKey: string;
  fromTrackKey: string | null;
}

let blacklistWarning: BlacklistWarning | null = null;
let dismissed: Dismissal | null = null;
let blacklistSwitchTimestamps: number[] = [];
let activeAdSkip: ActiveAdSkip | null = null;
let lastAdReturnPollAt = 0;
let arming = false;

export function getBlacklistWarningState(): BlacklistWarning | null {
  return blacklistWarning;
}

export function resetBlacklistWarningState(): void {
  blacklistWarning = null;
  dismissed = null;
  activeAdSkip = null;
  lastAdReturnPollAt = 0;
}

function rememberDismissedTrack(kind: WarningKind, trackKey: string): void {
  dismissed = { kind, trackKey, fromTrackKey: state.liveTrack ? getTrackKey(state.liveTrack) : null };
}

function isAdBreak(track: TrackInfo | null): boolean {
  return track?.isLiveBreak === true && track.title === DEFAULT_BREAK_LABEL;
}

function expireDismissedTrack(): void {
  if (!dismissed) return;
  const liveTrackKey = state.liveTrack ? getTrackKey(state.liveTrack) : null;
  if (liveTrackKey === dismissed.trackKey || liveTrackKey === dismissed.fromTrackKey) return;
  if (dismissed.kind === "adSkip") {
    // An ad dismissed once stays dismissed for the whole break: the upcoming item and the live break carry different keys, and metadata can flap in between.
    if (isAdBreak(state.liveTrack)) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const { trackKey } = dismissed;
    if (
      state.history.some(
        (t) => t.isBreak && getTrackKey(t) === trackKey && (t.endTimestamp ?? t.timestamp ?? 0) > nowSec,
      )
    )
      return;
  }
  dismissed = null;
}

interface KnownAdWindow {
  // Null when only the end is known (ESKA ZPR timing); the break is then already running.
  startsAtMs: number | null;
  endsAtMs: number;
}

// The one authoritative interval for a skipped break: auto-return and saved-ad statistics must agree on it.
function knownAdWindow(track: TrackInfo): KnownAdWindow | null {
  if (track.adEndsAt !== undefined) return { startsAtMs: null, endsAtMs: track.adEndsAt };
  const nowSec = Math.floor(Date.now() / 1000);
  const scheduled =
    track.isBreak && track.label === DEFAULT_BREAK_LABEL
      ? track
      : state.history.find(
          (t) =>
            t.isBreak &&
            t.label === DEFAULT_BREAK_LABEL &&
            (t.timestamp ?? Infinity) <= nowSec &&
            (t.endTimestamp ?? 0) > nowSec,
        );
  if (!scheduled?.endTimestamp) return null;
  return {
    startsAtMs: scheduled.timestamp ? scheduled.timestamp * 1000 : null,
    endsAtMs: scheduled.endTimestamp * 1000,
  };
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
  automatic = true,
) {
  if (automatic) {
    const rateLimit = withinRateLimit(blacklistSwitchTimestamps, SWITCH_RATE_LIMIT.WINDOW_MS, SWITCH_RATE_LIMIT.MAX);
    blacklistSwitchTimestamps = rateLimit.timestamps;

    if (rateLimit.limited) {
      // avoid switching forever if every candidate keeps landing on another blocked track/break; an explicit click is never throttled.
      rememberDismissedTrack(kind, getTrackKey(track));
      blacklistWarning = null;
      return;
    }
  }

  const adWindow = kind === "adSkip" ? knownAdWindow(track) : null;
  const endsAtMs = adWindow?.endsAtMs ?? null;
  selectStation(candidate, {
    id: createStatisticsOperationId(),
    kind,
    automatic,
    ...(adWindow ? { adEndsAt: adWindow.endsAtMs } : {}),
    ...(adWindow?.startsAtMs != null ? { adStartsAt: adWindow.startsAtMs } : {}),
  });
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
    activeAdSkip = {
      originStation,
      trackKey,
      startedAt: Date.now(),
      endsAtMs,
      sawBreak: track.isLiveBreak === true,
    };
    lastAdReturnPollAt = Date.now();
  }
}

async function armSwitchWarning(kind: WarningKind, track: TrackInfo, origin: Station, immediate: boolean) {
  if (arming) return;
  arming = true;
  try {
    const picked = await pickSwitchCandidate(origin, kind);
    if (!picked || !state.playing || state.station?.id !== origin.id) return;

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
  expireDismissedTrack();
  if (!state.station || blacklistWarning || !state.blacklistEnabled) return;

  if (state.liveTrack && (!state.liveTrack.isLiveBreak || state.liveTrack.isFacts) && isBlacklisted(state.liveTrack)) {
    const key = getTrackKey(state.liveTrack);
    if (key !== dismissed?.trackKey) void armSwitchWarning("blacklist", state.liveTrack, state.station, true);
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const upcoming = state.history
    .filter((t) => !t.isBreak && t.artist && t.title && t.timestamp && t.timestamp > nowSec)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0];

  if (upcoming && isBlacklisted(upcoming) && getTrackKey(upcoming) !== dismissed?.trackKey) {
    void armSwitchWarning("blacklist", upcoming, state.station, false);
  }
}

export function detectUpcomingAdBreak() {
  expireDismissedTrack();
  if (!state.station || blacklistWarning || !state.adSkipEnabled) return;

  if (isAdBreak(state.liveTrack) && state.liveTrack) {
    if (dismissed?.kind !== "adSkip") void armSwitchWarning("adSkip", state.liveTrack, state.station, true);
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const nextUp = state.history
    .filter((t) => t.timestamp && t.timestamp > nowSec)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0];

  if (nextUp?.isBreak && nextUp.label === DEFAULT_BREAK_LABEL && getTrackKey(nextUp) !== dismissed?.trackKey) {
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
    false,
  );
  notifyState();
}

export function dismissBlacklistWarning(): void {
  if (!blacklistWarning) return;
  rememberDismissedTrack(blacklistWarning.kind, blacklistWarning.trackKey);
  blacklistWarning = null;
  notifyState();
}

export function undoBlacklistBlock(): void {
  if (blacklistWarning?.kind !== "blacklist") return;
  const { track, phase } = blacklistWarning;
  removeFromBlacklist(normalizeTrackKey(track.artist, track.title));
  if (phase === "switched") returnToPreviousStation();
  else dismissBlacklistWarning();
  notifyState();
}

export function returnToPreviousStation(): void {
  if (blacklistWarning?.phase !== "switched") return;
  const { kind, originStation, trackKey } = blacklistWarning;
  blacklistWarning = null;
  activeAdSkip = null;
  selectStation(originStation);
  rememberDismissedTrack(kind, trackKey);
}

export function cancelAdSkipAutoReturn(): void {
  if (!activeAdSkip) return;
  activeAdSkip = null;
  blacklistWarning = null;
  notifyState();
}

function adReturnAtMs(session: ActiveAdSkip): number {
  return session.endsAtMs ?? session.startedAt + TIMERS.AD_RETURN_FALLBACK_MS;
}

function returnFromAdSkip(session: ActiveAdSkip): void {
  if (activeAdSkip !== session) return;
  activeAdSkip = null;
  blacklistWarning = null;
  selectStation(session.originStation);
  rememberDismissedTrack("adSkip", session.trackKey);
  notifyState();
}

async function pollAdBreakEnded(session: ActiveAdSkip): Promise<void> {
  const data = await fetchPlaylist(session.originStation);
  // The user may have cancelled, returned or started another skip while the request was in flight.
  if (!state.playing || activeAdSkip !== session) return;
  if (data?.current == null) return;
  if (data.current.isLiveBreak) session.sawBreak = true;
  else if (session.sawBreak) returnFromAdSkip(session);
}

setInterval(() => {
  if (!state.playing) {
    if (blacklistWarning || activeAdSkip) {
      resetBlacklistWarningState();
      notifyState();
    }
    return;
  }

  if (activeAdSkip) {
    // A known end is authoritative: the origin API is not consulted, so a stale or break-less response cannot end the skip early.
    if (Date.now() >= adReturnAtMs(activeAdSkip)) {
      returnFromAdSkip(activeAdSkip);
      return;
    }
    if (activeAdSkip.endsAtMs === null && Date.now() - lastAdReturnPollAt >= TIMERS.TRACK_POLL_MS) {
      lastAdReturnPollAt = Date.now();
      void pollAdBreakEnded(activeAdSkip);
    }
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
      const remainingMs = adReturnAtMs(activeAdSkip) - Date.now();
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
