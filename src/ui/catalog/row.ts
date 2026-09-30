import { deleteCustomStation, isStationEnabled, setStationEnabled } from "../../catalog.js";
import { ICONS } from "../../icons.js";
import { selectStation, togglePlay } from "../../player.js";
import { notifyState, state, subscribeState } from "../../state.js";
import type { Station } from "../../types.js";
import { escapeHtml, renderStationThumbHtml } from "../../utils.js";

export const PROVIDER_LABELS: Record<string, string> = {
  rmf: "RMF",
  eska: "ESKA",
};

function isPreviewing(id: string): boolean {
  return state.playing && state.station?.id === id;
}

function syncPreviewButton(btn: HTMLButtonElement): void {
  const on = isPreviewing(btn.dataset.id ?? "");
  if (btn.firstChild && btn.classList.contains("on") === on) return;
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", String(on));
  btn.title = on ? "Zatrzymaj podgląd" : "Posłuchaj";
  btn.innerHTML = on ? ICONS.previewPause : ICONS.previewPlay;
}

subscribeState(() => document.querySelectorAll<HTMLButtonElement>(".btn-preview").forEach(syncPreviewButton));

export interface StationRowOpts {
  isCustom: boolean;
  showProviderTag: boolean;
  showLocalPill: boolean;
}

export function createStationRow(station: Station, opts: StationRowOpts, rerender: () => void): HTMLElement {
  const enabled = isStationEnabled(station.id);
  const row = document.createElement("div");
  row.className = `k-catalog-row${enabled ? " enabled" : ""}`;

  const safeName = escapeHtml(station.name);
  const logoHtml = renderStationThumbHtml(
    station.coverUrl,
    station.name,
    "catalog-thumb",
    "catalog-thumb-placeholder",
    opts.isCustom,
  );
  const label = PROVIDER_LABELS[station.provider];
  const providerLabel =
    opts.showProviderTag && !opts.isCustom && label && !new RegExp(`\\b${label}\\b`, "i").test(station.name)
      ? label
      : undefined;
  const localPillHtml = opts.showLocalPill ? '<span class="catalog-local-pill">● lokalna</span> ' : "";

  row.innerHTML = `
    <div class="catalog-col-info">
      ${logoHtml}
      <div class="catalog-details">
        <div class="catalog-name">
          ${safeName}
          ${opts.isCustom ? '<span class="badge-custom">Własna</span>' : ""}
          ${providerLabel ? `<span class="catalog-provider-tag">${escapeHtml(providerLabel)}</span>` : ""}
        </div>
        <div class="catalog-sub">${localPillHtml}${escapeHtml(station.short)}</div>
      </div>
    </div>

    <div class="catalog-col-actions">
      <button type="button" class="btn-preview" data-id="${escapeHtml(station.id)}" aria-pressed="false" aria-label="Posłuchaj: ${safeName}"></button>
      ${
        opts.isCustom
          ? `<button type="button" class="btn-delete-custom" title="Usuń własną stację" aria-label="Usuń ${safeName}">${ICONS.trash}</button>
      <span class="catalog-delete-confirm" role="group" aria-label="Usunąć ${safeName}?" hidden>
        <button type="button" class="btn-delete-yes">Usuń</button>
        <button type="button" class="btn-delete-no">Anuluj</button>
      </span>`
          : ""
      }
      <label class="catalog-toggle-switch" title="${enabled ? "Ukryj z mojej listy" : "Pokaż na mojej liście"}">
        <input type="checkbox" class="catalog-checkbox" ${enabled ? "checked" : ""} aria-label="Pokaż na mojej liście: ${safeName}" />
      </label>
    </div>
  `;

  const previewBtn = row.querySelector<HTMLButtonElement>(".btn-preview");
  previewBtn?.addEventListener("click", () => {
    if (state.station?.id === station.id) togglePlay();
    else selectStation(station);
  });
  if (previewBtn) syncPreviewButton(previewBtn);

  const checkbox = row.querySelector<HTMLInputElement>(".catalog-checkbox");
  const toggleSwitch = row.querySelector<HTMLLabelElement>(".catalog-toggle-switch");

  checkbox?.addEventListener("change", (e) => {
    const isChecked = (e.target as HTMLInputElement).checked;
    setStationEnabled(station.id, isChecked);
    notifyState();
    if (toggleSwitch) {
      toggleSwitch.title = isChecked ? "Ukryj z mojej listy" : "Pokaż na mojej liście";
    }
  });

  const deleteBtn = row.querySelector<HTMLButtonElement>(".btn-delete-custom");
  const confirmEl = row.querySelector<HTMLElement>(".catalog-delete-confirm");
  const setConfirming = (on: boolean) => {
    if (!deleteBtn || !confirmEl || !toggleSwitch) return;
    deleteBtn.hidden = on;
    if (previewBtn) previewBtn.hidden = on;
    toggleSwitch.hidden = on;
    confirmEl.hidden = !on;
    (on ? confirmEl.querySelector<HTMLButtonElement>(".btn-delete-no") : deleteBtn)?.focus();
  };
  deleteBtn?.addEventListener("click", () => setConfirming(true));
  row.querySelector(".btn-delete-no")?.addEventListener("click", () => setConfirming(false));
  row.querySelector(".btn-delete-yes")?.addEventListener("click", () => {
    deleteCustomStation(station.id);
    notifyState();
    rerender();
  });

  row.addEventListener("click", (e) => {
    if (
      (e.target as HTMLElement).closest(
        ".catalog-toggle-switch, .btn-preview, .btn-delete-custom, .catalog-delete-confirm",
      )
    )
      return;
    checkbox?.click();
  });

  return row;
}
