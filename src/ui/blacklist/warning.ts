import { getBlacklistWarningState } from "../../blacklistWarning.js";
import { state } from "../../state.js";
import { escapeHtml } from "../../utils.js";
import { els } from "../elements.js";

function formatMMSS(totalSec: number): string {
  const sec = Math.max(0, totalSec);
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function reasonLabel(reason: string): string {
  if (reason === "favorite") return "z ulubionych";
  if (reason === "similar") return "podobna stacja";
  return "inna stacja";
}

function blockedTrackText(track: { artist: string; title: string; label?: string }): string {
  const adText = track.label || track.title;
  return track.artist ? `${escapeHtml(track.artist)} – ${escapeHtml(adText)}` : escapeHtml(adText);
}

function isAutoReturnPending(warning: NonNullable<ReturnType<typeof getBlacklistWarningState>>): boolean {
  return warning.kind === "adSkip" && warning.phase === "switched" && state.adSkipAutoReturnEnabled;
}

function buildMiniWarningHtml(warning: NonNullable<ReturnType<typeof getBlacklistWarningState>>): string {
  return `
    <div class="bl-warn-mini">
      <span class="bl-warn-dot bl-warn-dot-ok"></span>
      <span class="bl-warn-mini-text">Pominięto reklamę na ${escapeHtml(warning.originStation.name)} · gra ${escapeHtml(warning.candidate.name)}</span>
      <span class="bl-warn-mini-clock">wracamy za ${formatMMSS(warning.secondsLeft)}</span>
      <button type="button" class="bl-warn-link bl-warn-revert">wróć</button>
    </div>
  `;
}

function buildWarningHtml(warning: NonNullable<ReturnType<typeof getBlacklistWarningState>>): string {
  if (isAutoReturnPending(warning)) return buildMiniWarningHtml(warning);

  const isAdSkip = warning.kind === "adSkip";
  const blockTag = isAdSkip ? "reklama" : "czarna lista";
  const blockSub = isAdSkip
    ? `na ${escapeHtml(warning.originStation.name)}`
    : `leci teraz na ${escapeHtml(warning.originStation.name)}`;
  const dismissLabel = isAdSkip ? "zostań mimo to" : "zagraj mimo to";

  if (warning.phase === "warning") {
    const reason = reasonLabel(warning.candidateReason);
    return `
      <div class="bl-warn-head"><span>ZA CHWILĘ</span><span class="k-rule"></span><span class="bl-warn-clock">${formatMMSS(warning.secondsLeft)}</span></div>
      <div class="bl-warn-row bl-warn-blocked">
        <span class="bl-warn-tag bl-warn-tag-block">${blockTag}</span>
        <span class="bl-warn-dot"></span>
        <div class="bl-warn-info">
          <div class="bl-warn-title bl-warn-strike">${blockedTrackText(warning.track)}</div>
          <div class="bl-warn-sub">${blockSub}</div>
        </div>
      </div>
      <div class="bl-warn-arrow">↓ kandydat do przełączenia</div>
      <div class="bl-warn-row bl-warn-candidate">
        <span class="bl-warn-tag bl-warn-tag-ok">${escapeHtml(reason)}</span>
        <span class="bl-warn-dot bl-warn-dot-ok"></span>
        <div class="bl-warn-info">
          <div class="bl-warn-title">${escapeHtml(warning.candidate.name)}</div>
          <div class="bl-warn-sub">${escapeHtml(reason)} · bez utworów z czarnej listy</div>
        </div>
      </div>
      <div class="bl-warn-actions">
        <button type="button" class="btn-primary bl-warn-switch">Przełącz teraz</button>
        <button type="button" class="bl-warn-link bl-warn-play-anyway">${dismissLabel}</button>
      </div>
    `;
  }
  const blockedNote = isAdSkip
    ? `Pominięto reklamę na ${escapeHtml(warning.originStation.name)}`
    : `Zablokowano: ${blockedTrackText(warning.track)} (${escapeHtml(warning.originStation.name)})`;
  return `
    <div class="bl-warn-head"><span>ZA CHWILĘ</span><span class="k-rule"></span><span class="bl-warn-clock">0:00</span></div>
    <div class="bl-warn-row bl-warn-candidate">
      <span class="bl-warn-tag bl-warn-tag-ok">przełączono</span>
      <span class="bl-warn-dot bl-warn-dot-ok"></span>
      <div class="bl-warn-info"><div class="bl-warn-title">${escapeHtml(warning.candidate.name)}</div></div>
    </div>
    <div class="bl-warn-blocked-note">${blockedNote}</div>
    <button type="button" class="bl-warn-link bl-warn-revert">wróć do poprzedniej stacji</button>
  `;
}

let lastContentKey: string | null = null;
let swapTimer: number | undefined;

export function renderBlacklistWarning(): void {
  const warning = getBlacklistWarningState();
  const compact = !!warning && isAutoReturnPending(warning);

  // The full-card banner takes over the whole program list, so only hide it there — the
  // compact auto-return chip is meant to sit alongside history, not replace it.
  const hideHistory = !!warning && !compact;
  els.historyList.style.display = hideHistory ? "none" : "";
  els.historyEmpty.style.display = hideHistory ? "none" : els.historyEmpty.style.display;
  els.blacklistWarning.classList.toggle("bl-warn-compact", compact);

  if (!warning) {
    if (lastContentKey !== null) {
      els.blacklistWarning.classList.remove("open");
      if (swapTimer) window.clearTimeout(swapTimer);
      swapTimer = window.setTimeout(() => {
        els.blacklistWarningContent.innerHTML = "";
      }, 240);
    }
    lastContentKey = null;
    return;
  }

  const contentKey = `${warning.phase}:${warning.trackKey}`;
  const isNewContent = contentKey !== lastContentKey;
  const wasOpen = els.blacklistWarning.classList.contains("open");
  lastContentKey = contentKey;

  if (!isNewContent) {
    els.blacklistWarningContent.innerHTML = buildWarningHtml(warning);
    return;
  }

  if (swapTimer) window.clearTimeout(swapTimer);

  if (!wasOpen) {
    els.blacklistWarningContent.innerHTML = buildWarningHtml(warning);
    requestAnimationFrame(() => els.blacklistWarning.classList.add("open"));
    return;
  }

  els.blacklistWarningContent.classList.add("is-switching");
  swapTimer = window.setTimeout(() => {
    els.blacklistWarningContent.innerHTML = buildWarningHtml(warning);
    els.blacklistWarningContent.classList.remove("is-switching");
  }, 140);
}
