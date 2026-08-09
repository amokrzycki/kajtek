import { getAllKnownStations, getCustomStations, getStoredRmfCatalog } from "../../catalog.js";
import { openBlacklistModal } from "../blacklist/modal.js";
import { animateTabSwitch, bindModalDismiss, closeModal, openModal } from "../modal.js";
import { handleCustomStationSubmit } from "./form.js";
import { CATALOG_MODAL_HTML } from "./markup.js";
import { formatDate, getErrorMessage, refreshCatalog } from "./refresh.js";
import { type CatalogViewDeps, renderAllTab, renderCustomTab, renderLocalTab } from "./views.js";

type CatalogTab = "all" | "local" | "custom";

let modalEl: HTMLElement | null = null;
let searchQuery = "";
let showCustomForm = false;
let previousActiveElement: HTMLElement | null = null;
let activeTab: CatalogTab = "all";
let tabSwitchTimer: number | undefined;

const viewDeps: CatalogViewDeps = {
  rerender: () => renderModalBody(),
  onRetry: () => handleRefreshCatalog(),
};

export function openCatalogModal(): void {
  previousActiveElement = document.activeElement as HTMLElement | null;

  if (!modalEl) {
    createModalElements();
  }
  if (modalEl) openModal(modalEl);

  // Load catalog cache or fetch if missing
  const cache = getStoredRmfCatalog();
  if (!cache) {
    handleRefreshCatalog();
  } else {
    renderModalBody();
  }
}

export function closeCatalogModal(): void {
  if (!modalEl) return;
  closeModal(modalEl, previousActiveElement);
  previousActiveElement = null;
}

function handleRefreshCatalog(): void {
  refreshCatalog(modalEl, renderModalBody);
}

function createModalElements(): void {
  modalEl = document.createElement("div");
  modalEl.id = "catalog-modal-overlay";
  modalEl.className = "k-modal-overlay";
  modalEl.innerHTML = CATALOG_MODAL_HTML;

  document.body.appendChild(modalEl);

  bindModalDismiss(modalEl, closeCatalogModal);

  const closeBtn = modalEl.querySelector("#catalog-modal-close");
  closeBtn?.addEventListener("click", closeCatalogModal);

  const blacklistBtn = modalEl.querySelector("#open-blacklist-btn");
  blacklistBtn?.addEventListener("click", () => openBlacklistModal());

  const searchInput = modalEl.querySelector<HTMLInputElement>("#catalog-search-input");
  searchInput?.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    renderModalBody();
  });

  const refreshBtn = modalEl.querySelector("#catalog-refresh-btn");
  refreshBtn?.addEventListener("click", () => handleRefreshCatalog());

  const customToggleBtn = modalEl.querySelector("#catalog-custom-toggle-btn");
  customToggleBtn?.addEventListener("click", () => {
    showCustomForm = !showCustomForm;
    const formWrap = modalEl?.querySelector<HTMLElement>("#catalog-custom-form-wrap");
    formWrap?.classList.toggle("is-open", showCustomForm);
  });

  const customForm = modalEl.querySelector<HTMLFormElement>("#catalog-custom-form");
  customForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameEl = modalEl?.querySelector<HTMLInputElement>("#custom-name-input");
    const urlEl = modalEl?.querySelector<HTMLInputElement>("#custom-url-input");
    const errEl = modalEl?.querySelector<HTMLElement>("#custom-form-error");

    if (!nameEl || !urlEl) return;
    if (errEl) errEl.style.display = "none";

    handleCustomStationSubmit(
      nameEl.value,
      urlEl.value,
      (msg) => {
        if (errEl) {
          errEl.textContent = msg;
          errEl.style.display = "block";
        }
      },
      () => {
        nameEl.value = "";
        urlEl.value = "";
        showCustomForm = false;
        const formWrap = modalEl?.querySelector<HTMLElement>("#catalog-custom-form-wrap");
        formWrap?.classList.remove("is-open");
        renderModalBody();
      },
    );
  });

  const tabbar = modalEl.querySelector<HTMLElement>(".catalog-tabbar");
  tabbar?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
    const tab = btn?.dataset.tab as CatalogTab | undefined;
    if (tab) setActiveTab(tab);
  });

  const idxrail = modalEl.querySelector<HTMLElement>("#catalog-list-container");
  idxrail?.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(".catalog-idxrail a");
    if (!link) return;
    e.preventDefault();
    const targetId = link.getAttribute("href")?.slice(1);
    if (!targetId) return;
    modalEl?.querySelector(`#${CSS.escape(targetId)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setActiveTab(tab: CatalogTab): void {
  if (tab === activeTab) return;
  activeTab = tab;
  const buttons = modalEl?.querySelectorAll<HTMLButtonElement>(".catalog-tab");
  let activeBtnId = "catalog-tab-all";
  buttons?.forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
    if (isActive) activeBtnId = btn.id;
  });
  modalEl?.querySelector("#catalog-list-container")?.setAttribute("aria-labelledby", activeBtnId);

  const listContainer = modalEl?.querySelector<HTMLElement>("#catalog-list-container");
  const modalBox = modalEl?.querySelector<HTMLElement>(".k-modal");
  if (!listContainer || !modalBox) {
    renderModalBody();
    return;
  }

  tabSwitchTimer = animateTabSwitch(listContainer, modalBox, renderModalBody, tabSwitchTimer);
}

function updateTabCounts(localCount: number, customCount: number): void {
  const localCountEl = modalEl?.querySelector<HTMLElement>('[data-tab="local"] .catalog-tab-count');
  const customCountEl = modalEl?.querySelector<HTMLElement>('[data-tab="custom"] .catalog-tab-count');
  if (localCountEl) localCountEl.textContent = String(localCount);
  if (customCountEl) customCountEl.textContent = String(customCount);
}

function renderModalBody(): void {
  if (!modalEl) return;

  const listContainer = modalEl.querySelector<HTMLElement>("#catalog-list-container");
  const updatedEl = modalEl.querySelector<HTMLElement>("#catalog-updated-time");
  const errorBanner = modalEl.querySelector<HTMLElement>("#catalog-error-banner");

  if (!listContainer) return;

  const cache = getStoredRmfCatalog();

  if (updatedEl) {
    updatedEl.textContent = cache?.fetchedAt ? `Aktualizacja: ${formatDate(cache.fetchedAt)}` : "";
  }

  if (errorBanner) {
    const errorMessage = getErrorMessage();
    if (errorMessage) {
      errorBanner.textContent = errorMessage;
      errorBanner.classList.add("is-visible");
    } else {
      errorBanner.classList.remove("is-visible");
    }
  }

  const allStations = getAllKnownStations();
  const customIds = new Set(getCustomStations().map((c) => c.id));
  updateTabCounts(
    allStations.filter((s) => s.cat === "local").length,
    allStations.filter((s) => customIds.has(s.id)).length,
  );

  const ctx = { allStations, customIds, q: searchQuery.toLowerCase().trim(), cache };
  listContainer.innerHTML = "";

  if (activeTab === "local") {
    renderLocalTab(listContainer, ctx, viewDeps);
  } else if (activeTab === "custom") {
    renderCustomTab(listContainer, ctx, viewDeps);
  } else {
    renderAllTab(listContainer, ctx, viewDeps);
  }
}
