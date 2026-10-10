import { STORAGE_KEYS } from "../../consts.js";
import { ICONS } from "../../icons.js";
import { getStoredString } from "../../utils.js";
import { bindModalDismiss, closeModal, openModal } from "../modal.js";
import { openSmartListeningModal } from "../smartListening/modal.js";

const FEATURES: { icon: string; title: string; desc: string }[] = [
  {
    icon: ICONS.viewList,
    title: "1. Kliknij stację",
    desc: "Wybierz ją z listy pod odtwarzaczem. Gra od razu.",
  },
  {
    icon: ICONS.plus,
    title: "2. Dodaj więcej stacji",
    desc: "Otwórz Katalog stacji. Przełącznikiem dodasz wybrane stacje do listy pod odtwarzaczem.",
  },
  {
    icon: ICONS.adSkip,
    title: "Smart Listening",
    desc: "Smart Listening może na chwilę przełączyć radio, gdy rozpozna niechcianą treść. Wybierasz osobny zestaw stacji do przełączeń, niezależny od listy pod odtwarzaczem, oraz reklamy, wiadomości i inne przerwy do pomijania. Możesz też preferować lub unikać wykonawców i utworów. Powrót zależy od odpowiedniej treści na poprzedniej stacji i wystarczająco aktualnych informacji.",
  },
  {
    icon: ICONS.radio,
    title: "Kolor obudowy",
    desc: "W Ustawieniach, w sekcji Obudowa, wybierzesz jeden z sześciu kolorów Kajtka.",
  },
];

let modalEl: HTMLElement | null = null;

export function shouldShowOnboarding(): boolean {
  return Object.values(STORAGE_KEYS).every((key) => getStoredString(key) === null);
}

function featureHtml(f: { icon: string; title: string; desc: string }): string {
  return `
    <div class="k-onboarding-item">
      <span class="k-onboarding-item-icon">${f.icon}</span>
      <div class="k-onboarding-item-text">
        <div class="k-onboarding-item-title">${f.title}</div>
        <div class="k-onboarding-item-desc">${f.desc}</div>
        ${f.title === "Smart Listening" ? '<button type="button" id="onboarding-smart-configure" class="btn-secondary k-onboarding-configure">Ustaw Smart Listening</button>' : ""}
      </div>
    </div>
  `;
}

export function openOnboardingModal(onChooseStation: () => void): void {
  const restoreFocus =
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : document.getElementById("help-btn");
  modalEl = document.createElement("div");
  modalEl.id = "onboarding-modal-overlay";
  modalEl.className = "k-modal-overlay";

  modalEl.innerHTML = `
    <div class="k-modal k-onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-modal-title">
      <button type="button" id="onboarding-modal-close" class="k-modal-close k-onboarding-close" aria-label="Zamknij">&times;</button>

      <div class="k-onboarding-body">
        <span class="k-onboarding-icon">${ICONS.tape}</span>
        <h2 id="onboarding-modal-title" class="k-onboarding-title">WITAJ W KAJTKU</h2>
        <p class="k-onboarding-subtitle">Kliknij stację i radio gra</p>

        <div class="k-onboarding-list">${FEATURES.map(featureHtml).join("")}</div>

        <button type="button" id="onboarding-choose-stations-btn" class="btn-primary k-onboarding-cta">
          WYBIERAM STACJĘ ${ICONS.chevron}
        </button>
        <button type="button" id="onboarding-skip-btn" class="btn-secondary k-onboarding-skip">zrobię to później</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  const close = () => closeOnboardingModal();
  bindModalDismiss(modalEl, close);
  modalEl.querySelector("#onboarding-modal-close")?.addEventListener("click", close);
  modalEl.querySelector("#onboarding-skip-btn")?.addEventListener("click", close);
  modalEl.querySelector("#onboarding-smart-configure")?.addEventListener("click", () => {
    close();
    openSmartListeningModal(undefined, restoreFocus);
  });
  modalEl.querySelector("#onboarding-choose-stations-btn")?.addEventListener("click", () => {
    close();
    onChooseStation();
  });

  openModal(modalEl);
}

function closeOnboardingModal(): void {
  if (!modalEl) return;
  closeModal(modalEl);
  modalEl.remove();
  modalEl = null;
}
