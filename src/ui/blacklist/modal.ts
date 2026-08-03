import { addToBlacklist, getBlacklist, removeFromBlacklist } from "@/blacklist.js";
import { ICONS } from "@/icons.js";
import { currentTrack } from "@/player.js";
import { escapeHtml } from "@/utils.js";
import { bindModalDismiss, closeModal, openModal } from "../modal.js";

type BlacklistTab = "list" | "add";

let modalEl: HTMLElement | null = null;
let previousActiveElement: HTMLElement | null = null;
let activeTab: BlacklistTab = "list";
let tabSwitchTimer: number | undefined;

export function openBlacklistModal(): void {
  previousActiveElement = document.activeElement as HTMLElement | null;

  if (!modalEl) {
    createModalElements();
  }
  if (modalEl) openModal(modalEl);

  renderModalBody();
}

export function closeBlacklistModal(): void {
  if (!modalEl) return;
  closeModal(modalEl, previousActiveElement);
  previousActiveElement = null;
}

function setActiveTab(tab: BlacklistTab): void {
  if (tab === activeTab) return;
  activeTab = tab;
  modalEl?.querySelectorAll<HTMLButtonElement>(".catalog-tab").forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  const listContainer = modalEl?.querySelector<HTMLElement>("#blacklist-body");
  const modalBox = modalEl?.querySelector<HTMLElement>(".k-modal");
  if (!listContainer || !modalBox) {
    renderModalBody();
    return;
  }

  if (tabSwitchTimer) window.clearTimeout(tabSwitchTimer);
  const prevHeight = modalBox.getBoundingClientRect().height;
  listContainer.classList.add("is-switching");

  tabSwitchTimer = window.setTimeout(() => {
    renderModalBody();

    const newHeight = modalBox.getBoundingClientRect().height;
    if (Math.abs(newHeight - prevHeight) > 1) {
      modalBox.style.height = `${prevHeight}px`;
      modalBox.style.transition = "height 220ms cubic-bezier(0.2, 0, 0, 1)";
      requestAnimationFrame(() => {
        modalBox.style.height = `${newHeight}px`;
      });
      window.setTimeout(() => {
        modalBox.style.height = "";
        modalBox.style.transition = "";
      }, 240);
    }

    requestAnimationFrame(() => listContainer.classList.remove("is-switching"));
  }, 140);
}

function createModalElements(): void {
  modalEl = document.createElement("div");
  modalEl.id = "blacklist-modal-overlay";
  modalEl.className = "k-modal-overlay";

  modalEl.innerHTML = `
    <div class="k-modal" role="dialog" aria-modal="true" aria-labelledby="blacklist-modal-title">
      <div class="k-modal-header">
        <div class="k-modal-title-group">
          <h2 id="blacklist-modal-title" class="k-modal-title">Blacklista utworów</h2>
        </div>
        <button type="button" id="blacklist-modal-close" class="k-modal-close" aria-label="Zamknij">&times;</button>
      </div>

      <div class="catalog-tabbar" role="tablist" aria-label="Zakładki blacklisty">
        <button type="button" class="catalog-tab active" role="tab" aria-selected="true" aria-controls="blacklist-body" data-tab="list">ZABLOKOWANE <span class="catalog-tab-count">0</span></button>
        <button type="button" class="catalog-tab" role="tab" aria-selected="false" aria-controls="blacklist-body" data-tab="add">DODAJ</button>
      </div>

      <div id="blacklist-body" class="k-modal-list" role="tabpanel"></div>
    </div>
  `;

  document.body.appendChild(modalEl);

  bindModalDismiss(modalEl, closeBlacklistModal);

  modalEl.querySelector("#blacklist-modal-close")?.addEventListener("click", closeBlacklistModal);

  const tabbar = modalEl.querySelector<HTMLElement>(".catalog-tabbar");
  tabbar?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
    const tab = btn?.dataset.tab as BlacklistTab | undefined;
    if (tab) setActiveTab(tab);
  });

  const body = modalEl.querySelector<HTMLElement>("#blacklist-body");

  body?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    const deleteBtn = target.closest<HTMLButtonElement>(".btn-delete-custom");
    if (deleteBtn) {
      const key = deleteBtn.dataset.key;
      if (key) {
        removeFromBlacklist(key);
        renderModalBody();
      }
      return;
    }

    if (target.closest("#blacklist-quick-add")) {
      const track = currentTrack();
      if (!track) return;
      const artistEl = modalEl?.querySelector<HTMLInputElement>("#blacklist-artist-input");
      const titleEl = modalEl?.querySelector<HTMLInputElement>("#blacklist-title-input");
      if (artistEl) artistEl.value = track.artist;
      if (titleEl) titleEl.value = track.title;
    }
  });

  body?.addEventListener("submit", (e) => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>("#blacklist-add-form");
    if (!form) return;
    e.preventDefault();
    const artistEl = form.querySelector<HTMLInputElement>("#blacklist-artist-input");
    const titleEl = form.querySelector<HTMLInputElement>("#blacklist-title-input");
    if (!artistEl?.value.trim() || !titleEl?.value.trim()) return;
    addToBlacklist(artistEl.value, titleEl.value);
    setActiveTab("list");
  });
}

function updateTabCount(): void {
  const countEl = modalEl?.querySelector<HTMLElement>('[data-tab="list"] .catalog-tab-count');
  if (countEl) countEl.textContent = String(getBlacklist().length);
}

function renderListTab(container: HTMLElement): void {
  const entries = getBlacklist();

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "k-catalog-empty";
    empty.textContent = "Brak zablokowanych utworów";
    container.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "k-catalog-row enabled";
    row.innerHTML = `
      <div class="catalog-col-info">
        <div class="catalog-details">
          <div class="catalog-name">${escapeHtml(entry.artist)}</div>
          <div class="catalog-sub">${escapeHtml(entry.title)}</div>
        </div>
      </div>
      <div class="catalog-col-actions">
        <button type="button" class="btn-delete-custom" data-key="${escapeHtml(entry.key)}" title="Usuń z blacklisty" aria-label="Usuń ${escapeHtml(entry.artist)} – ${escapeHtml(entry.title)}">${ICONS.trash}</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function renderAddTab(container: HTMLElement): void {
  const track = currentTrack();
  const wrap = document.createElement("div");
  wrap.className = "k-custom-form";
  wrap.innerHTML = `
    <form id="blacklist-add-form" class="k-form-row">
      <input type="text" id="blacklist-artist-input" class="k-input" placeholder="Artysta" required />
      <input type="text" id="blacklist-title-input" class="k-input" placeholder="Tytuł" required />
      <button type="submit" class="btn-primary">Zablokuj</button>
    </form>
    ${
      track
        ? `<button type="button" id="blacklist-quick-add" class="btn-secondary" style="margin-top: 0.6rem;">Zablokuj aktualnie odtwarzany utwór (${escapeHtml(track.artist)} – ${escapeHtml(track.title)})</button>`
        : ""
    }
  `;
  container.appendChild(wrap);
}

function renderModalBody(): void {
  if (!modalEl) return;
  const container = modalEl.querySelector<HTMLElement>("#blacklist-body");
  if (!container) return;

  updateTabCount();
  container.innerHTML = "";

  if (activeTab === "add") {
    renderAddTab(container);
  } else {
    renderListTab(container);
  }
}
