import { STORAGE_KEYS } from "../../consts.js";
import { ICONS } from "../../icons.js";
import { openCatalogModal } from "../catalog/modal.js";
import { bindModalDismiss, closeModal, openModal } from "../modal.js";

const FEATURES: { icon: string; title: string; desc: string }[] = [
  { icon: ICONS.play, title: "Duży przycisk PLAY", desc: "Włącza i zatrzymuje aktualnie wybraną stację." },
  { icon: ICONS.star(true), title: "Gwiazdka przy stacji", desc: "Dodaje ją do ulubionych, trafia na górę listy." },
  { icon: ICONS.radio, title: "Motywy Kajtka", desc: "Dostosuj dźwięk do swojego stylu." },
  {
    icon: ICONS.ban,
    title: "PROGRAM i czarna lista",
    desc: "Historia utworów stacji jest pod odtwarzaczem. Utwór, którego już nie chcesz słyszeć, zablokujesz jednym przyciskiem.",
  },
  { icon: ICONS.plus, title: "Katalog stacji", desc: "Włączaj kolejne stacje albo dodaj własny stream." },
  {
    icon: ICONS.adSkip,
    title: "Pomijanie reklam",
    desc: "Włącz w ustawieniach, automatycznie ominie blok reklamowy i wróci do audycji.",
  },
];

let modalEl: HTMLElement | null = null;

export function shouldShowOnboarding(): boolean {
  return Object.values(STORAGE_KEYS).every((key) => localStorage.getItem(key) === null);
}

function featureHtml(f: { icon: string; title: string; desc: string }): string {
  return `
    <div class="k-onboarding-item">
      <span class="k-onboarding-item-icon">${f.icon}</span>
      <div class="k-onboarding-item-text">
        <div class="k-onboarding-item-title">${f.title}</div>
        <div class="k-onboarding-item-desc">${f.desc}</div>
      </div>
    </div>
  `;
}

export function openOnboardingModal(): void {
  modalEl = document.createElement("div");
  modalEl.id = "onboarding-modal-overlay";
  modalEl.className = "k-modal-overlay";

  modalEl.innerHTML = `
    <div class="k-modal k-onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-modal-title">
      <button type="button" id="onboarding-modal-close" class="k-modal-close k-onboarding-close" aria-label="Zamknij">&times;</button>

      <div class="k-onboarding-body">
        <span class="k-onboarding-icon">${ICONS.tape}</span>
        <h2 id="onboarding-modal-title" class="k-onboarding-title">WITAJ W KAJTKU</h2>
        <p class="k-onboarding-subtitle">Zanim zaczniesz, krótka ściągawka</p>

        <div class="k-onboarding-list">${FEATURES.map(featureHtml).join("")}</div>

        <div class="k-onboarding-note">
          Na start włączyliśmy tylko 3 stacje, żeby lista była czytelna. Resztę znajdziesz i włączysz w katalogu, zrobisz to raz.
        </div>

        <button type="button" id="onboarding-choose-stations-btn" class="btn-primary k-onboarding-cta">
          ROZUMIEM, WYBIERAM STACJE ${ICONS.chevron}
        </button>
        <button type="button" id="onboarding-skip-btn" class="k-onboarding-skip">zrobię to później</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  const close = () => closeOnboardingModal();
  bindModalDismiss(modalEl, close);
  modalEl.querySelector("#onboarding-modal-close")?.addEventListener("click", close);
  modalEl.querySelector("#onboarding-skip-btn")?.addEventListener("click", close);
  modalEl.querySelector("#onboarding-choose-stations-btn")?.addEventListener("click", () => {
    close();
    openCatalogModal();
  });

  openModal(modalEl);
}

function closeOnboardingModal(): void {
  if (!modalEl) return;
  closeModal(modalEl);
  modalEl.remove();
  modalEl = null;
}
