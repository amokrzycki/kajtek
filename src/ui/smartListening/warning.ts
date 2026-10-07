import { getSmartListeningStatus } from "../../smartListening.js";
import type { SmartReason } from "../../smartPolicy.js";
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
  const key = `${status.phase}:${status.trigger.key}:${status.triggerStation.id}:${status.candidate?.id}:${status.candidateReason}:${status.connected}:${status.checking}`;
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
  const destination =
    status.phase === "detour"
      ? `${status.connected ? "Gra" : "Łączenie"}: ${candidate}`
      : status.phase === "unavailable"
        ? "Brak odpowiedniej stacji w puli. Zostajemy i sprawdzimy ponownie."
        : `Za chwilę: ${candidate} · ${DESTINATIONS[status.candidateReason] ?? "zgodna z regułami"}`;
  els.smartWarningContent.innerHTML = `
    <div class="bl-warn-head"><span>SMART LISTENING</span><span class="k-rule"></span><span class="bl-warn-clock">${clock()}</span></div>
    <div class="bl-warn-info"><div class="bl-warn-title">${escapeHtml(reason)}</div><div class="bl-warn-sub">${destination}</div></div>
    ${status.phase === "detour" || status.originStation.id !== status.triggerStation.id ? `<div class="bl-warn-sub">Wrócimy, gdy ${origin} będzie zgodne z regułami i poda świeże dane.</div>` : ""}
    <div class="bl-warn-actions">
      ${status.phase === "warning" ? `<button type="button" class="btn-primary bl-warn-switch" aria-disabled="${status.checking}" aria-busy="${status.checking}">${status.checking ? "Sprawdzanie stacji…" : "Przełącz teraz"}</button>` : ""}
      ${status.phase === "warning" || status.phase === "unavailable" ? '<button type="button" class="bl-warn-link bl-warn-play-anyway">Zostań mimo to</button>' : ""}
      ${status.phase === "detour" || status.originStation.id !== status.triggerStation.id ? '<button type="button" class="bl-warn-link bl-warn-revert">Wróć teraz</button><button type="button" class="bl-warn-link bl-warn-cancel-return">Zostań tutaj</button>' : ""}
    </div>`;
  els.skipStatus.textContent = `${reason}. ${status.phase === "warning" ? `Za chwilę ${status.candidate?.name ?? ""}.` : status.phase === "unavailable" ? "Brak odpowiedniej stacji." : `Stacja tymczasowa. Czekamy na bezpieczny powrót do ${status.originStation.name}.`}`;
  if (focusedAction)
    Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.className === focusedAction)
      ?.focus({ preventScroll: true });
  if (focusedAction && !container.contains(document.activeElement))
    (container.querySelector<HTMLButtonElement>("button") ?? els.playBtn).focus({ preventScroll: true });
}
