import { bindModalDismiss, closeModal, openModal } from "../modal.js";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Spacja"], label: "Odtwarzaj / pauza" },
  { keys: ["←", "→"], label: "Poprzednia / następna stacja" },
  { keys: ["M"], label: "Wycisz / włącz dźwięk" },
  { keys: ["1", "2", "3", "4"], label: "Wyłącznik czasowy: 15 / 30 / 60 / 90 min" },
  { keys: ["?"], label: "Ta ściągawka" },
  { keys: ["Esc"], label: "Zamknij okno" },
];

let modalEl: HTMLElement | null = null;

function rowHtml({ keys, label }: (typeof SHORTCUTS)[number]): string {
  return `
    <li class="k-shortcut-row">
      <span class="k-shortcut-label">${label}</span>
      <span class="k-shortcut-keys">${keys.map((k) => `<kbd class="k-kbd">${k}</kbd>`).join("")}</span>
    </li>
  `;
}

export function openShortcutsModal(): void {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.id = "shortcuts-modal-overlay";
  modalEl.className = "k-modal-overlay";

  modalEl.innerHTML = `
    <div class="k-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-modal-title">
      <div class="k-modal-header">
        <div class="k-modal-title-group">
          <h2 id="shortcuts-modal-title" class="k-modal-title">Skróty klawiszowe</h2>
        </div>
        <span class="k-rule"></span>
        <button type="button" id="shortcuts-modal-close" class="k-modal-close" aria-label="Zamknij">&times;</button>
      </div>

      <div class="k-settings-body">
        <ul class="k-shortcut-list">${SHORTCUTS.map(rowHtml).join("")}</ul>
        <p class="k-changelog-intro">Skróty nie działają, gdy piszesz w polu tekstowym lub masz otwarte okno.</p>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  bindModalDismiss(modalEl, closeShortcutsModal);
  modalEl.querySelector("#shortcuts-modal-close")?.addEventListener("click", closeShortcutsModal);
  openModal(modalEl);
}

function closeShortcutsModal(): void {
  if (!modalEl) return;
  closeModal(modalEl);
  modalEl.remove();
  modalEl = null;
}
