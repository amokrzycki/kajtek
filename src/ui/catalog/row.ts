import { deleteCustomStation, isStationEnabled, setStationEnabled } from "../../catalog.js";
import { ICONS } from "../../icons.js";
import { notifyState } from "../../state.js";
import type { Station } from "../../types.js";
import { escapeHtml, renderStationThumbHtml } from "../../utils.js";

export const PROVIDER_LABELS: Record<string, string> = {
  rmf: "RMF",
  eska: "ESKA",
};

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
  const logoHtml = renderStationThumbHtml(station.coverUrl, station.name, "catalog-thumb", "catalog-thumb-placeholder");
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
      ${
        opts.isCustom
          ? `<button type="button" class="btn-delete-custom" title="Usuń własną stację" aria-label="Usuń ${safeName}">${ICONS.trash}</button>`
          : ""
      }
      <label class="catalog-toggle-switch" title="${enabled ? "Wyłącz stację" : "Włącz stację"}">
        <input type="checkbox" class="catalog-checkbox" ${enabled ? "checked" : ""} aria-label="Włącz stację" />
      </label>
    </div>
  `;

  const checkbox = row.querySelector<HTMLInputElement>(".catalog-checkbox");
  const toggleSwitch = row.querySelector<HTMLLabelElement>(".catalog-toggle-switch");

  checkbox?.addEventListener("change", (e) => {
    const isChecked = (e.target as HTMLInputElement).checked;
    setStationEnabled(station.id, isChecked);
    notifyState();
    if (toggleSwitch) {
      toggleSwitch.title = isChecked ? "Wyłącz stację" : "Włącz stację";
    }
  });

  const deleteBtn = row.querySelector<HTMLButtonElement>(".btn-delete-custom");
  deleteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm(`Czy na pewno chcesz usunąć stację "${station.name}"?`)) {
      deleteCustomStation(station.id);
      notifyState();
      rerender();
    }
  });

  row.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".catalog-toggle-switch, .btn-delete-custom")) return;
    checkbox?.click();
  });

  return row;
}
