import type { ChangelogEntry } from "../../changelog.js";
import { escapeHtml } from "../../utils.js";
import { bindModalDismiss, closeModal, openModal } from "../modal.js";

let modalEl: HTMLElement | null = null;

function entryHtml(entry: ChangelogEntry): string {
  const intro = entry.intro ? `<p class="k-changelog-intro">${escapeHtml(entry.intro)}</p>` : "";
  const items = entry.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `
    <div class="k-settings-group">
      <div class="k-settings-label">Wersja ${escapeHtml(entry.version)}</div>
      ${intro}
      <ul class="k-changelog-list">${items}</ul>
    </div>
  `;
}

export function openChangelogModal(entries: ChangelogEntry[]): void {
  modalEl = document.createElement("div");
  modalEl.id = "changelog-modal-overlay";
  modalEl.className = "k-modal-overlay";

  modalEl.innerHTML = `
    <div class="k-modal" role="dialog" aria-modal="true" aria-labelledby="changelog-modal-title">
      <div class="k-modal-header">
        <div class="k-modal-title-group">
          <h2 id="changelog-modal-title" class="k-modal-title">Co nowego w Kajtku</h2>
        </div>
        <span class="k-rule"></span>
        <button type="button" id="changelog-modal-close" class="k-modal-close" aria-label="Zamknij">&times;</button>
      </div>

      <div class="k-settings-body">
        ${entries.map(entryHtml).join("")}
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  const close = () => closeChangelogModal();
  bindModalDismiss(modalEl, close);
  modalEl.querySelector("#changelog-modal-close")?.addEventListener("click", close);

  openModal(modalEl);
}

function closeChangelogModal(): void {
  if (!modalEl) return;
  closeModal(modalEl);
  modalEl.remove();
  modalEl = null;
}
