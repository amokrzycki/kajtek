import { getSmartStations, getStoredRmfCatalog } from "./catalog.js";
import { selectStation } from "./player.js";
import { evaluateSnapshot } from "./smartPolicy.js";
import { type SmartRouteCommand, SmartRouteController, type SmartRouteInput } from "./smartRoute.js";
import { getPlaybackState, notifyState, radioAudio, state, subscribeState } from "./state.js";
import { sharedSnapshots } from "./stationSnapshots.js";
import { createStatisticsOperationId, type ProtectiveRoute } from "./statistics.js";
import { listeningStatistics } from "./statisticsPlayback.js";

const route = new SmartRouteController();
let evaluating = false;
let started = false;
let pendingManualSwitch = false;
let originAdWindow: ProtectiveRoute["originAdWindow"];

export function getSmartListeningStatus() {
  const status = route.status;
  if (!status) return null;
  const media = getPlaybackState();
  const playback =
    media === "playing" && (!state.playing || radioAudio.paused || radioAudio.ended || radioAudio.error)
      ? "paused"
      : media;
  const origin = sharedSnapshots.snapshots([status.originStation])[0];
  const evaluation = evaluateSnapshot(origin, state.smartListening, Date.now());
  const returnWait =
    evaluation.eligibility === "fallback"
      ? "metadata"
      : evaluation.eligibility === "rejected"
        ? evaluation.trigger?.upcoming
          ? "upcoming"
          : "unwanted"
        : "confirming";
  return { ...status, playback, returnWait, checking: pendingManualSwitch };
}

function input(): SmartRouteInput {
  const pool = getSmartStations();
  const stations = [...pool];
  for (const station of [state.station, route.status?.originStation]) {
    if (station && !stations.some((item) => item.id === station.id)) stations.push(station);
  }
  const catalog = getStoredRmfCatalog()?.stations ?? [];
  const origin = route.status?.originStation ?? state.station;
  const raw = catalog.find(
    (item) => item.idname === origin?.id || String(item.id) === origin?.apiBaseUrl?.split("/").pop(),
  );
  const similarIds = new Set(raw?.similar_stations.id_list.map(String));
  const similar = new Set(catalog.filter((item) => similarIds.has(String(item.id))).map((item) => item.idname));
  return {
    now: Date.now(),
    enabled: state.smartListening.enabled,
    playing: state.playing,
    station: state.station,
    config: state.smartListening,
    snapshots: sharedSnapshots.snapshots(stations),
    pool,
    favorites: state.favs,
    similar,
  };
}

function execute(command: SmartRouteCommand | null): void {
  if (!command) return;
  const track = command.trigger?.track;
  const isAd = command.trigger?.reason === "advertisement";
  const endsAt = isAd ? (track?.adEndsAt ?? (track?.endTimestamp ? track.endTimestamp * 1000 : undefined)) : undefined;
  const startsAt = isAd && track?.timestamp ? track.timestamp * 1000 : undefined;
  if (command.returning) originAdWindow = undefined;
  else if (endsAt !== undefined && route.status?.triggerStation.id === route.status?.originStation.id) {
    originAdWindow = { ...(startsAt !== undefined ? { startsAt } : {}), endsAt };
  }
  selectStation(
    command.destination,
    {
      id: createStatisticsOperationId(),
      kind: command.returning ? "return" : (command.trigger?.reason ?? "return"),
      automatic: command.automatic,
      ...(originAdWindow ? { originAdWindow } : {}),
      ...(endsAt !== undefined ? { adEndsAt: endsAt } : {}),
      ...(startsAt !== undefined && endsAt !== undefined ? { adStartsAt: startsAt } : {}),
    },
    true,
  );
}

export function evaluateSmartListening(): void {
  if (evaluating) return;
  evaluating = true;
  try {
    const active = state.smartListening.enabled && state.playing && state.station;
    const stations = active ? getSmartStations() : [];
    if (active) {
      for (const station of [state.station, route.status?.originStation]) {
        if (station && !stations.some((item) => item.id === station.id)) stations.push(station);
      }
    }
    sharedSnapshots.setDemand("smart", stations);
    if (active && sharedSnapshots.refreshing) return;
    const previous = JSON.stringify(route.status);
    if (!state.smartListening.enabled && route.status) {
      endStatisticsRoute();
      originAdWindow = undefined;
    }
    if (!active) pendingManualSwitch = false;
    const next = input();
    execute(pendingManualSwitch ? route.switchNow(next) : route.step(next));
    pendingManualSwitch = false;
    if (previous !== JSON.stringify(route.status)) notifyState();
  } finally {
    evaluating = false;
  }
}

export function resetSmartListening(): void {
  pendingManualSwitch = false;
  route.reset();
  originAdWindow = undefined;
}
export function switchSmartNow(): void {
  if (route.status?.phase !== "warning") return;
  if (sharedSnapshots.refreshing) {
    pendingManualSwitch = true;
    notifyState();
    return;
  }
  execute(route.switchNow(input()));
  notifyState();
}
export function staySmartAnyway(): void {
  pendingManualSwitch = false;
  route.dismiss();
  notifyState();
}
export function returnSmartManually(): void {
  pendingManualSwitch = false;
  execute(route.manualReturn());
  notifyState();
}
function endStatisticsRoute(): void {
  listeningStatistics.sample(
    radioAudio.currentTime,
    Date.now(),
    !radioAudio.muted && radioAudio.volume > 0,
    radioAudio.playbackRate,
  );
  listeningStatistics.endRoute();
}
export function cancelSmartReturn(): void {
  pendingManualSwitch = false;
  originAdWindow = undefined;
  endStatisticsRoute();
  route.cancelReturn();
  notifyState();
}
export function initSmartListening(): void {
  if (started) return;
  started = true;
  subscribeState(evaluateSmartListening);
  sharedSnapshots.subscribe(evaluateSmartListening);
  radioAudio.addEventListener("playing", () => {
    evaluateSmartListening();
    notifyState();
  });
  setInterval(evaluateSmartListening, 1000);
  evaluateSmartListening();
}
