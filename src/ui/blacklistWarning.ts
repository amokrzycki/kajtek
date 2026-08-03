import { getBlacklistWarningState } from "@/player.js";
import { escapeHtml } from "@/utils.js";
import { els } from "./elements.js";

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

export function renderBlacklistWarning(): void {
  const w = getBlacklistWarningState();

  els.historyList.style.display = w ? "none" : "";
  els.historyEmpty.style.display = w ? "none" : els.historyEmpty.style.display;

  if (!w) {
    els.blacklistWarning.style.display = "none";
    els.blacklistWarning.innerHTML = "";
    return;
  }

  els.blacklistWarning.style.display = "block";

  if (w.phase === "warning") {
    const reason = reasonLabel(w.candidateReason);
    els.blacklistWarning.innerHTML = `
      <div class="bl-warn-head"><span>ZA CHWILĘ</span><span class="k-rule"></span><span class="bl-warn-clock">${formatMMSS(w.secondsLeft)}</span></div>
      <div class="bl-warn-row bl-warn-blocked">
        <span class="bl-warn-tag bl-warn-tag-block">czarna lista</span>
        <span class="bl-warn-dot"></span>
        <div class="bl-warn-info">
          <div class="bl-warn-title bl-warn-strike">${escapeHtml(w.track.artist)} – ${escapeHtml(w.track.title)}</div>
          <div class="bl-warn-sub">leci teraz na ${escapeHtml(w.originStation.name)}</div>
        </div>
      </div>
      <div class="bl-warn-arrow">↓ kandydat do przełączenia</div>
      <div class="bl-warn-row bl-warn-candidate">
        <span class="bl-warn-tag bl-warn-tag-ok">${escapeHtml(reason)}</span>
        <span class="bl-warn-dot bl-warn-dot-ok"></span>
        <div class="bl-warn-info">
          <div class="bl-warn-title">${escapeHtml(w.candidate.name)}</div>
          <div class="bl-warn-sub">${escapeHtml(reason)} · bez utworów z czarnej listy</div>
        </div>
      </div>
      <div class="bl-warn-actions">
        <button type="button" class="btn-primary bl-warn-switch">Przełącz teraz</button>
        <button type="button" class="bl-warn-link bl-warn-play-anyway">zagraj mimo to</button>
      </div>
    `;
  } else {
    els.blacklistWarning.innerHTML = `
      <div class="bl-warn-head"><span>ZA CHWILĘ</span><span class="k-rule"></span><span class="bl-warn-clock">0:00</span></div>
      <div class="bl-warn-row bl-warn-candidate">
        <span class="bl-warn-tag bl-warn-tag-ok">przełączono</span>
        <span class="bl-warn-dot bl-warn-dot-ok"></span>
        <div class="bl-warn-info"><div class="bl-warn-title">${escapeHtml(w.candidate.name)}</div></div>
      </div>
      <div class="bl-warn-blocked-note">Zablokowano: ${escapeHtml(w.track.artist)} – ${escapeHtml(w.track.title)} (${escapeHtml(w.originStation.name)})</div>
      <button type="button" class="bl-warn-link bl-warn-revert">wróć do poprzedniej stacji</button>
    `;
  }
}
