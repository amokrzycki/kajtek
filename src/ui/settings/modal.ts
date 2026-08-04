import { STORAGE_KEYS } from "../../consts.js";
import { notifyState, state } from "../../state.js";
import { setStoredJSON } from "../../utils.js";
import { bindModalDismiss, closeModal, openModal } from "../modal.js";

const ACCENT_SWATCHES = [
  { label: "Czerwony", hex: "#c4251b" },
  { label: "Niebieski", hex: "oklch(55% 0.19 255)" },
  { label: "Różowy", hex: "oklch(58% 0.20 350)" },
  { label: "Zielony", hex: "oklch(55% 0.16 145)" },
  { label: "Czarny", hex: "oklch(28% 0.01 90)" },
  { label: "Żółty", hex: "oklch(78% 0.16 95)" },
];

let modalEl: HTMLElement | null = null;
let previousActiveElement: HTMLElement | null = null;

export function openSettingsModal(): void {
  previousActiveElement = document.activeElement as HTMLElement | null;

  if (!modalEl) {
    createModalElements();
  } else {
    syncBlacklistToggle();
  }
  if (modalEl) openModal(modalEl);
}

export function closeSettingsModal(): void {
  if (!modalEl) return;
  closeModal(modalEl, previousActiveElement);
  previousActiveElement = null;
}

function swatchesHtml(): string {
  return ACCENT_SWATCHES.map(
    (s) => `
      <div class="k-settings-swatch">
        <span class="k-settings-swatch-dot" style="background:${s.hex};"></span>
        <span class="k-settings-swatch-label">${s.label}</span>
      </div>
    `,
  ).join("");
}

function createModalElements(): void {
  modalEl = document.createElement("div");
  modalEl.id = "settings-modal-overlay";
  modalEl.className = "k-modal-overlay";

  modalEl.innerHTML = `
    <div class="k-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <div class="k-modal-header">
        <div class="k-modal-title-group">
          <h2 id="settings-modal-title" class="k-modal-title">Ustawienia</h2>
        </div>
        <span class="k-rule"></span>
        <button type="button" id="settings-modal-close" class="k-modal-close" aria-label="Zamknij">&times;</button>
      </div>

      <div class="k-settings-body">
        <div class="k-settings-group">
          <div class="k-settings-label">Kolor akcentu</div>
          <div class="k-settings-disabled">
            <div class="k-settings-swatches">${swatchesHtml()}</div>
          </div>
          <span class="k-settings-soon-badge">już wkrótce</span>
        </div>

        <div class="k-settings-group">
          <div class="k-settings-label">Reklamy</div>
          <div class="k-settings-disabled">
            <div class="k-settings-row">
              <div class="k-settings-row-text">
                <span>Pomijaj reklamy</span>
                <span class="k-settings-row-sub">Automatyczne wyciszanie i przewijanie bloków reklamowych</span>
              </div>
              <label class="catalog-toggle-switch">
                <input type="checkbox" class="catalog-checkbox" disabled />
              </label>
            </div>
          </div>
          <span class="k-settings-soon-badge">już wkrótce</span>
        </div>

        <div class="k-settings-group">
          <div class="k-settings-label">Czarna lista</div>
          <div class="k-settings-row">
            <div class="k-settings-row-text">
              <span>Włącz czarną listę</span>
              <span class="k-settings-row-sub">Pomijaj automatycznie zablokowane utwory podczas odtwarzania</span>
            </div>
            <label class="catalog-toggle-switch" id="settings-blacklist-switch">
              <input type="checkbox" id="settings-blacklist-toggle" class="catalog-checkbox" aria-label="Włącz czarną listę" />
            </label>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  bindModalDismiss(modalEl, closeSettingsModal);
  modalEl.querySelector("#settings-modal-close")?.addEventListener("click", closeSettingsModal);

  modalEl.querySelector<HTMLInputElement>("#settings-blacklist-toggle")?.addEventListener("change", (e) => {
    state.blacklistEnabled = (e.target as HTMLInputElement).checked;
    setStoredJSON(STORAGE_KEYS.BLACKLIST_ENABLED, state.blacklistEnabled);
    notifyState();
  });

  syncBlacklistToggle();
}

function syncBlacklistToggle(): void {
  const toggle = modalEl?.querySelector<HTMLInputElement>("#settings-blacklist-toggle");
  const label = modalEl?.querySelector<HTMLLabelElement>("#settings-blacklist-switch");
  if (!toggle || !label) return;
  toggle.checked = state.blacklistEnabled;
  label.title = state.blacklistEnabled ? "Wyłącz czarną listę" : "Włącz czarną listę";
}
