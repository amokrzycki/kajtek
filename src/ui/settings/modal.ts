import type { CaseSlug } from "../../consts.js";
import { STORAGE_KEYS } from "../../consts.js";
import { ICONS } from "../../icons.js";
import {
  getSmartListeningConfig,
  subscribeSmartListeningConfig,
  updateSmartListeningConfig,
} from "../../listeningPreferences.js";
import { notifyState, setTheme, state } from "../../state.js";
import { getStoredString } from "../../utils.js";
import { bindModalDismiss, closeModal, openModal } from "../modal.js";
import { openSmartListeningModal } from "../smartListening/modal.js";

const CASE_SWATCHES: { slug: CaseSlug; label: string }[] = [
  { slug: "red", label: "Czerwony" },
  { slug: "green", label: "Zielony" },
  { slug: "yellow", label: "Żółty" },
  { slug: "blue", label: "Niebieski" },
  { slug: "pink", label: "Różowy" },
  { slug: "black", label: "Czarny" },
];

let modalEl: HTMLElement | null = null;
let previousActiveElement: HTMLElement | null = null;
let unsubscribe: (() => void) | undefined;

export function openSettingsModal(): void {
  previousActiveElement = document.activeElement as HTMLElement | null;

  if (!modalEl) {
    createModalElements();
  } else {
    syncSmartListening();
    syncCaseSwatches();
    syncSystemThemeToggle();
  }
  unsubscribe?.();
  unsubscribe = subscribeSmartListeningConfig(syncSmartListening);
  if (modalEl) openModal(modalEl);
}

export function closeSettingsModal(): void {
  if (!modalEl) return;
  unsubscribe?.();
  unsubscribe = undefined;
  closeModal(modalEl, previousActiveElement);
  previousActiveElement = null;
}

function swatchesHtml(): string {
  return CASE_SWATCHES.map(
    (s) => `
      <button type="button" class="k-settings-swatch" data-case="${s.slug}" aria-pressed="false">
        <span class="k-settings-swatch-dot"></span>
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
          <div class="k-settings-label">Motyw</div>
          <div class="k-settings-row">
            <div class="k-settings-row-text">
              <span>Zgodny z systemem</span>
              <span class="k-settings-row-sub">Automatycznie zmieniaj jasny i ciemny motyw</span>
            </div>
            <label class="catalog-toggle-switch">
              <input type="checkbox" id="settings-system-theme-toggle" class="catalog-checkbox" aria-label="Motyw zgodny z systemem" />
            </label>
          </div>
        </div>
        <div class="k-settings-group">
          <div class="k-settings-label">Obudowa</div>
          <div class="k-settings-swatches">${swatchesHtml()}</div>
        </div>

        <div class="k-settings-group">
          <div class="k-settings-label">Smart Listening</div>
          <div class="k-settings-row">
            <div class="k-settings-row-text">
              <span>Włącz Smart Listening</span>
              <span id="settings-smart-help" class="k-settings-row-sub">Omijaj wybrane treści i wracaj, gdy znów można słuchać</span>
            </div>
            <label class="catalog-toggle-switch">
              <input type="checkbox" id="settings-smart-toggle" class="catalog-checkbox" aria-label="Włącz Smart Listening" aria-describedby="settings-smart-help" />
            </label>
          </div>
          <button type="button" id="settings-smart-configure" class="k-settings-link">
            <span>Skonfiguruj stacje i preferencje</span>
            <span class="k-settings-link-chevron" aria-hidden="true">${ICONS.chevron}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  bindModalDismiss(modalEl, closeSettingsModal);
  modalEl.querySelector<HTMLInputElement>("#settings-system-theme-toggle")?.addEventListener("change", (e) => {
    setTheme((e.target as HTMLInputElement).checked ? null : state.dark);
  });
  modalEl.querySelector("#settings-modal-close")?.addEventListener("click", closeSettingsModal);
  modalEl.querySelector("#settings-smart-configure")?.addEventListener("click", () => {
    const restoreFocus = previousActiveElement;
    closeSettingsModal();
    openSmartListeningModal(undefined, restoreFocus);
  });
  modalEl.querySelector<HTMLInputElement>("#settings-smart-toggle")?.addEventListener("change", (e) => {
    updateSmartListeningConfig({ enabled: (e.target as HTMLInputElement).checked });
  });

  modalEl.querySelector(".k-settings-swatches")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".k-settings-swatch");
    if (!btn?.dataset.case) return;
    state.case = btn.dataset.case as CaseSlug;
    notifyState();
    syncCaseSwatches();
  });

  syncSmartListening();
  syncCaseSwatches();
  syncSystemThemeToggle();
}

function syncSystemThemeToggle(): void {
  const toggle = modalEl?.querySelector<HTMLInputElement>("#settings-system-theme-toggle");
  const theme = getStoredString(STORAGE_KEYS.THEME);
  if (toggle) toggle.checked = theme !== "dark" && theme !== "light";
}

function syncCaseSwatches(): void {
  modalEl?.querySelectorAll<HTMLButtonElement>(".k-settings-swatch").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.case === state.case));
  });
}

function syncSmartListening(): void {
  const config = getSmartListeningConfig();
  const toggle = modalEl?.querySelector<HTMLInputElement>("#settings-smart-toggle");
  const help = modalEl?.querySelector<HTMLElement>("#settings-smart-help");
  if (toggle) toggle.checked = config.enabled;
  if (help)
    help.textContent = config.enabled
      ? "Omijaj wybrane treści i wracaj, gdy znów można słuchać"
      : "Automatyczne przełączanie wyłączone. Możesz nadal zmieniać preferencje.";
}
