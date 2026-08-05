import type { CaseSlug } from "../../consts.js";
import { STORAGE_KEYS } from "../../consts.js";
import { notifyState, state } from "../../state.js";
import { setStoredJSON } from "../../utils.js";
import { bindModalDismiss, closeModal, openModal } from "../modal.js";

const CASE_SWATCHES: { slug: CaseSlug; label: string; hex: string }[] = [
  { slug: "red", label: "Czerwony", hex: "#c4221a" },
  { slug: "green", label: "Zielony", hex: "#7f9e1c" },
  { slug: "yellow", label: "Żółty", hex: "#e6a608" },
  { slug: "blue", label: "Niebieski", hex: "#4d88c6" },
  { slug: "pink", label: "Różowy", hex: "#e88fa2" },
  { slug: "black", label: "Czarny", hex: "#1d1b19" },
];

let modalEl: HTMLElement | null = null;
let previousActiveElement: HTMLElement | null = null;

export function openSettingsModal(): void {
  previousActiveElement = document.activeElement as HTMLElement | null;

  if (!modalEl) {
    createModalElements();
  } else {
    syncBlacklistToggle();
    syncAdSkipToggle();
    syncCaseSwatches();
  }
  if (modalEl) openModal(modalEl);
}

export function closeSettingsModal(): void {
  if (!modalEl) return;
  closeModal(modalEl, previousActiveElement);
  previousActiveElement = null;
}

function swatchesHtml(): string {
  return CASE_SWATCHES.map(
    (s) => `
      <button type="button" class="k-settings-swatch" data-case="${s.slug}" aria-pressed="false">
        <span class="k-settings-swatch-dot" style="background:${s.hex};"></span>
        <span class="k-settings-swatch-label">${s.label}</span>
      </button>
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
          <div class="k-settings-swatches">${swatchesHtml()}</div>
        </div>

        <div class="k-settings-group">
          <div class="k-settings-label">Reklamy</div>
          <div class="k-settings-row">
            <div class="k-settings-row-text">
              <span>Pomijaj reklamy</span>
              <span class="k-settings-row-sub">Automatyczne wykrywanie i pomijanie reklam</span>
            </div>
            <label class="catalog-toggle-switch" id="settings-adskip-switch">
              <input type="checkbox" id="settings-adskip-toggle" class="catalog-checkbox" aria-label="Pomijaj reklamy" />
            </label>
          </div>
          <div class="k-settings-row">
            <div class="k-settings-row-text">
              <span>Automatyczny powrót po reklamie</span>
              <span class="k-settings-row-sub">Wróć na poprzednią stację, gdy blok reklamowy się skończy</span>
            </div>
            <label class="catalog-toggle-switch" id="settings-adskip-autoreturn-switch">
              <input
                type="checkbox"
                id="settings-adskip-autoreturn-toggle"
                class="catalog-checkbox"
                aria-label="Automatyczny powrót po reklamie"
              />
            </label>
          </div>
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

  modalEl.querySelector<HTMLInputElement>("#settings-adskip-toggle")?.addEventListener("change", (e) => {
    state.adSkipEnabled = (e.target as HTMLInputElement).checked;
    setStoredJSON(STORAGE_KEYS.AD_SKIP_ENABLED, state.adSkipEnabled);
    notifyState();
  });

  modalEl.querySelector<HTMLInputElement>("#settings-adskip-autoreturn-toggle")?.addEventListener("change", (e) => {
    state.adSkipAutoReturnEnabled = (e.target as HTMLInputElement).checked;
    setStoredJSON(STORAGE_KEYS.AD_SKIP_AUTO_RETURN, state.adSkipAutoReturnEnabled);
    notifyState();
  });

  modalEl.querySelector(".k-settings-swatches")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".k-settings-swatch");
    if (!btn?.dataset.case) return;
    state.case = btn.dataset.case as CaseSlug;
    notifyState();
    syncCaseSwatches();
  });

  syncBlacklistToggle();
  syncAdSkipToggle();
  syncCaseSwatches();
}

function syncCaseSwatches(): void {
  modalEl?.querySelectorAll<HTMLButtonElement>(".k-settings-swatch").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.case === state.case));
  });
}

function syncBlacklistToggle(): void {
  const toggle = modalEl?.querySelector<HTMLInputElement>("#settings-blacklist-toggle");
  const label = modalEl?.querySelector<HTMLLabelElement>("#settings-blacklist-switch");
  if (!toggle || !label) return;
  toggle.checked = state.blacklistEnabled;
  label.title = state.blacklistEnabled ? "Wyłącz czarną listę" : "Włącz czarną listę";
}

function syncAdSkipToggle(): void {
  const toggle = modalEl?.querySelector<HTMLInputElement>("#settings-adskip-toggle");
  const label = modalEl?.querySelector<HTMLLabelElement>("#settings-adskip-switch");
  if (toggle && label) {
    toggle.checked = state.adSkipEnabled;
    label.title = state.adSkipEnabled ? "Wyłącz pomijanie reklam" : "Włącz pomijanie reklam";
  }

  const autoReturnToggle = modalEl?.querySelector<HTMLInputElement>("#settings-adskip-autoreturn-toggle");
  const autoReturnLabel = modalEl?.querySelector<HTMLLabelElement>("#settings-adskip-autoreturn-switch");
  if (!autoReturnToggle || !autoReturnLabel) return;
  autoReturnToggle.checked = state.adSkipAutoReturnEnabled;
  autoReturnLabel.title = state.adSkipAutoReturnEnabled ? "Wyłącz automatyczny powrót" : "Włącz automatyczny powrót";
}
