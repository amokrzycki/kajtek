import { getSmartListeningStatus } from "../../smartListening.js";
import type { SmartReason } from "../../smartPolicy.js";
import type { Station } from "../../types.js";
import { escapeHtml } from "../../utils.js";
import { els } from "../elements.js";

const REASONS: Record<SmartReason, string> = {
  advertisement: "Reklamy / przerwa",
  news: "Wiadomości",
  otherBreak: "Przerwa",
  negativeArtist: "Niechciany artysta",
  negativeTrack: "Niechciany utwór",
};
const DESTINATIONS: Record<string, string> = {
  positiveTrack: "lubiany utwór",
  positiveArtist: "lubiany artysta",
  favorite: "ulubiona stacja",
  similar: "podobna stacja",
  safe: "zgodna z regułami",
  unknown: "brak świeżych danych",
};

type PlaybackLabel = "idle" | "connecting" | "playing" | "paused" | "buffering" | "failed";
type ReturnWaitLabel = "metadata" | "unwanted" | "upcoming" | "confirming";

function formatPlaybackState(state: PlaybackLabel): string {
  switch (state) {
    case "failed":
      return "Nie udało się połączyć";
    case "paused":
    case "idle":
      return "Odtwarzanie wstrzymane";
    case "playing":
      return "Gra";
    case "buffering":
      return "Buforowanie";
    default:
      return "Łączenie";
  }
}

function formatReturnWait(wait: ReturnWaitLabel, origin: string): string {
  switch (wait) {
    case "metadata":
      return `Czekamy na aktualne informacje z ${origin}, aby ocenić powrót.`;
    case "unwanted":
      return `Na ${origin} nadal trwa niechciana treść. Czekamy na odpowiedni moment powrotu.`;
    case "upcoming":
      return `Na ${origin} zbliża się niechciana treść. Czekamy na odpowiedni moment powrotu.`;
    default:
      return `Potwierdzamy odpowiednią treść na ${origin}. Wrócimy, gdy warunki powrotu będą spełnione.`;
  }
}

function formatSkipStatus(
  reason: string,
  status: { phase: string; checking: boolean; candidate?: Station | null },
  playback: string,
): string {
  if (status.phase === "warning") {
    if (status.checking) return `${reason}. Sprawdzanie stacji.`;
    return `${reason}. Za chwilę ${status.candidate?.name ?? ""}.`;
  }
  if (status.phase === "unavailable") return `${reason}. Brak odpowiedniej stacji.`;
  return `${reason}. ${playback}: ${status.candidate?.name ?? ""}.`;
}

let contentKey = "";

export function renderSmartListeningWarning(): void {
  const status = getSmartListeningStatus();
  const container = els.smartWarning;
  container.classList.toggle("open", Boolean(status));
  container.inert = !status;
  container.setAttribute("aria-hidden", String(!status));
  if (!status) {
    if (container.contains(document.activeElement)) els.playBtn.focus({ preventScroll: true });
    if (contentKey) els.smartWarningContent.innerHTML = "";
    contentKey = "";
    els.skipStatus.textContent = "";
    return;
  }
  const key = `${status.phase}:${status.trigger.key}:${status.triggerStation.id}:${status.candidate?.id}:${status.candidateReason}:${status.playback}:${status.returnWait}:${status.checking}`;
  const clock = () => (status.phase === "warning" ? `Za ${status.secondsLeft} s` : "");
  if (key === contentKey) {
    const countdown = els.smartWarningContent.querySelector(".bl-warn-clock");
    if (countdown) countdown.textContent = clock();
    return;
  }
  const focused = document.activeElement;
  const focusedAction = focused instanceof HTMLElement && container.contains(focused) ? focused.className : null;
  contentKey = key;
  const reason = `${REASONS[status.trigger.reason]} na ${status.triggerStation.name}`;
  const origin = escapeHtml(status.originStation.name);
  const candidate = status.candidate ? escapeHtml(status.candidate.name) : "";
  const playback = formatPlaybackState(status.playback);
  const returnText = formatReturnWait(status.returnWait, origin);
  const destination =
    status.phase === "detour"
      ? `${playback}: ${candidate}${status.playback === "failed" ? ". Ponów w odtwarzaczu." : ""}`
      : status.phase === "unavailable"
        ? "Brak odpowiedniej stacji w puli. Zostajemy i sprawdzimy ponownie."
        : `Za chwilę: ${candidate} · ${DESTINATIONS[status.candidateReason] ?? "zgodna z regułami"}`;
  els.smartWarningContent.innerHTML = `
    <div class="bl-warn-head"><span>SMART LISTENING</span><span class="k-rule"></span><span class="bl-warn-clock">${clock()}</span></div>
    <div class="bl-warn-info"><div class="bl-warn-title">${escapeHtml(reason)}</div><div class="bl-warn-sub">${destination}</div></div>
    ${status.phase === "detour" || status.originStation.id !== status.triggerStation.id ? `<div class="bl-warn-sub">${status.playback === "paused" ? "Powrót sprawdzimy po wznowieniu odtwarzania." : returnText}</div>` : ""}
    <div class="bl-warn-actions">
      ${status.phase === "warning" ? `<button type="button" class="btn-primary bl-warn-switch" aria-disabled="${status.checking}" aria-busy="${status.checking}">${status.checking ? "Sprawdzanie stacji…" : "Przełącz teraz"}</button>` : ""}
      ${status.phase === "warning" || status.phase === "unavailable" ? '<button type="button" class="bl-warn-link bl-warn-play-anyway">Zostań mimo to</button>' : ""}
      ${status.phase === "detour" || status.originStation.id !== status.triggerStation.id ? '<button type="button" class="bl-warn-link bl-warn-revert">Wróć teraz</button><button type="button" class="bl-warn-link bl-warn-cancel-return">Zostań tutaj</button>' : ""}
    </div>`;
  els.skipStatus.textContent = formatSkipStatus(reason, status, playback);
  if (focusedAction)
    Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.className === focusedAction)
      ?.focus({ preventScroll: true });
  if (focusedAction && !container.contains(document.activeElement))
    (container.querySelector<HTMLButtonElement>("button") ?? els.playBtn).focus({ preventScroll: true });
}
