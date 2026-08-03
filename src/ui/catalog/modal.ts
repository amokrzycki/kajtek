import {
  deleteCustomStation,
  fetchRmfCatalog,
  getAllKnownStations,
  getCustomStations,
  getStoredRmfCatalog,
  isStationEnabled,
  setStationEnabled,
} from "@/catalog.js";
import { ICONS } from "@/icons.js";
import { notifyState } from "@/state.js";
import type { RmfCatalogCache, Station } from "@/types.js";
import { escapeHtml, renderStationThumbHtml } from "@/utils.js";
import { openBlacklistModal } from "../blacklist/modal.js";
import { bindModalDismiss, closeModal, openModal } from "../modal.js";
import { handleCustomStationSubmit } from "./form.js";

type CatalogTab = "all" | "local" | "custom";

const PROVIDER_LABELS: Record<string, string> = {
  rmf: "RMF",
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const IDXRAIL_SYMBOLS = ["#", ...ALPHABET];

let modalEl: HTMLElement | null = null;
let searchQuery = "";
let isFetching = false;
let errorMessage: string | null = null;
let showCustomForm = false;
let previousActiveElement: HTMLElement | null = null;
let activeTab: CatalogTab = "all";
let tabSwitchTimer: number | undefined;

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

function createModalElements(): void {
  modalEl = document.createElement("div");
  modalEl.id = "catalog-modal-overlay";
  modalEl.className = "k-modal-overlay";

  modalEl.innerHTML = `
    <div class="k-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-modal-title">
      <div class="k-modal-header">
        <div class="k-modal-title-group">
          <h2 id="catalog-modal-title" class="k-modal-title">Katalog stacji radiowych</h2>
          <div class="k-modal-updated-row">
            <span id="catalog-updated-time" class="k-modal-updated"></span>
            <button type="button" id="open-blacklist-btn" class="k-modal-icon-btn" title="Blacklista utworów" aria-label="Blacklista utworów">${ICONS.ban}</button>
          </div>
        </div>
        <button type="button" id="catalog-modal-close" class="k-modal-close" aria-label="Zamknij">&times;</button>
      </div>

      <div class="k-modal-toolbar">
        <div class="search-input-wrap">
          <span class="search-icon">${ICONS.search}</span>
          <input type="search" id="catalog-search-input" class="k-input catalog-search" placeholder="Szukaj stacji…" autocomplete="off" />
        </div>
        <div class="k-modal-actions-row">
          <button type="button" id="catalog-refresh-btn" class="btn-secondary">
            Odśwież listę
          </button>
          <button type="button" id="catalog-custom-toggle-btn" class="btn-secondary">
            + Własna stacja
          </button>
        </div>
      </div>

      <div id="catalog-custom-form-wrap" class="k-custom-form-wrap">
        <div class="k-custom-form-inner">
          <form id="catalog-custom-form" class="k-custom-form">
            <div class="k-form-row">
              <input type="text" id="custom-name-input" class="k-input" placeholder="Nazwa stacji (np. Radio Rzeszów)" required />
              <input type="url" id="custom-url-input" class="k-input" placeholder="URL streamu (http:// lub https://)" required />
              <button type="submit" class="btn-primary">Dodaj</button>
            </div>
            <div id="custom-form-error" class="k-form-error" style="display: none;"></div>
          </form>
        </div>
      </div>

      <div class="catalog-tabbar" role="tablist" aria-label="Kategorie stacji">
        <button type="button" id="catalog-tab-all" class="catalog-tab active" role="tab" aria-selected="true" aria-controls="catalog-list-container" data-tab="all">WSZYSTKIE A–Z</button>
        <button type="button" id="catalog-tab-local" class="catalog-tab" role="tab" aria-selected="false" aria-controls="catalog-list-container" data-tab="local">LOKALNE <span class="catalog-tab-count">0</span></button>
        <button type="button" id="catalog-tab-custom" class="catalog-tab" role="tab" aria-selected="false" aria-controls="catalog-list-container" data-tab="custom">WŁASNE <span class="catalog-tab-count">0</span></button>
      </div>

      <div id="catalog-error-banner" class="k-modal-error" style="display: none;"></div>

      <div id="catalog-list-container" class="k-modal-list" role="tabpanel" aria-labelledby="catalog-tab-all"></div>
    </div>
  `;

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

async function handleRefreshCatalog(): Promise<void> {
  if (isFetching) return;
  isFetching = true;
  errorMessage = null;

  const refreshBtn = modalEl?.querySelector<HTMLButtonElement>("#catalog-refresh-btn");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Pobieranie...";
  }

  try {
    await fetchRmfCatalog();
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Błąd połączenia z serwerem stacji";
  } finally {
    isFetching = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Odśwież listę";
    }
    renderModalBody();
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function matchesQuery(station: Station, q: string, cache: RmfCatalogCache | null): boolean {
  if (!q) return true;
  if (station.name.toLowerCase().includes(q)) return true;
  if (station.short.toLowerCase().includes(q)) return true;

  if (cache?.stations) {
    const raw = cache.stations.find((r) => String(r.id) === station.id);
    if (raw?.search) {
      const keywords = raw.search
        .toLowerCase()
        .split(",")
        .map((k) => k.trim());
      if (keywords.some((k) => k.includes(q))) return true;
    }
  }
  return false;
}

// Almost every RMF station name starts with "RMF" or "Radio", which would dump 3/4 of the
// catalog into a single "R" bucket — index by the first significant word instead.
const GENERIC_NAME_PREFIX = /^(RMF|Radio)\s+/i;

// Ł doesn't decompose under NFD, so it needs an explicit swap before diacritics are stripped.
function indexLetter(name: string): string {
  const trimmed = name.trim();
  const significant = trimmed.replace(GENERIC_NAME_PREFIX, "") || trimmed;
  const first = significant.charAt(0).toUpperCase().replace(/Ł/g, "L");
  const stripped = first.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return /[A-Z]/.test(stripped) ? stripped : "#";
}

function buildSecHeadEl(title: string, count?: number): HTMLElement {
  const head = document.createElement("div");
  head.className = "catalog-sec-head";
  head.innerHTML = `<span class="catalog-sec-title">${escapeHtml(title)}</span><span class="catalog-sec-rule"></span>${
    count !== undefined ? `<span class="catalog-sec-count">${count}</span>` : ""
  }`;
  return head;
}

function buildEmptyStateEl(message: string): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "k-catalog-empty";
  empty.textContent = message;
  return empty;
}

function buildNoteEl(text: string): HTMLElement {
  const note = document.createElement("p");
  note.className = "catalog-empty-note";
  note.textContent = text;
  return note;
}

function createStationRow(
  station: Station,
  opts: { isCustom: boolean; showProviderTag: boolean; showLocalPill: boolean },
): HTMLElement {
  const enabled = isStationEnabled(station.id);
  const row = document.createElement("div");
  row.className = `k-catalog-row${enabled ? " enabled" : ""}`;

  const safeName = escapeHtml(station.name);
  const logoHtml = renderStationThumbHtml(station.coverUrl, station.name, "catalog-thumb", "catalog-thumb-placeholder");
  const providerLabel = opts.showProviderTag && !opts.isCustom ? PROVIDER_LABELS[station.provider] : undefined;
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
      renderModalBody();
    }
  });

  row.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".catalog-toggle-switch, .btn-delete-custom")) return;
    checkbox?.click();
  });

  return row;
}

function renderAllTab(
  container: HTMLElement,
  allStations: Station[],
  customIds: Set<string>,
  q: string,
  cache: RmfCatalogCache | null,
): void {
  const stations = allStations.filter((s) => s.cat !== "local").filter((s) => matchesQuery(s, q, cache));

  if (stations.length === 0) {
    if (isFetching) {
      container.appendChild(buildEmptyStateEl("Pobieranie stacji..."));
    } else if (!cache && errorMessage) {
      const empty = document.createElement("div");
      empty.className = "k-catalog-empty";
      empty.innerHTML = `
        <div>Brak zapisanych stacji w pamięci podręcznej.</div>
        <button type="button" class="btn-primary" style="margin-top: 10px;" id="catalog-retry-btn">Spróbuj ponownie</button>
      `;
      container.appendChild(empty);
      empty.querySelector("#catalog-retry-btn")?.addEventListener("click", () => handleRefreshCatalog());
    } else {
      container.appendChild(buildEmptyStateEl(q ? "Brak stacji pasujących do wyszukiwania" : "Brak stacji"));
    }
    return;
  }

  stations.sort((a, b) => a.name.localeCompare(b.name, "pl"));

  const groups = new Map<string, Station[]>();
  stations.forEach((s) => {
    const letter = indexLetter(s.name);
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)?.push(s);
  });

  const azPanel = document.createElement("div");
  azPanel.className = "catalog-az-panel";

  const azList = document.createElement("div");
  azList.className = "catalog-az-list";
  groups.forEach((groupStations, letter) => {
    const head = buildSecHeadEl(letter);
    head.id = `catalog-sec-${letter}`;
    azList.appendChild(head);
    groupStations.forEach((station) => {
      azList.appendChild(
        createStationRow(station, {
          isCustom: customIds.has(station.id),
          showProviderTag: true,
          showLocalPill: false,
        }),
      );
    });
  });

  const idxrail = document.createElement("div");
  idxrail.className = "catalog-idxrail";
  idxrail.setAttribute("aria-label", "Indeks alfabetyczny");
  IDXRAIL_SYMBOLS.forEach((letter) => {
    const span = document.createElement("span");
    if (groups.has(letter)) {
      span.className = "has";
      span.innerHTML = `<a href="#catalog-sec-${letter}">${letter}</a>`;
    } else {
      span.textContent = letter;
    }
    idxrail.appendChild(span);
  });

  azPanel.appendChild(azList);
  azPanel.appendChild(idxrail);
  container.appendChild(azPanel);
}

function renderLocalTab(
  container: HTMLElement,
  allStations: Station[],
  q: string,
  cache: RmfCatalogCache | null,
): void {
  const stations = allStations.filter((s) => s.cat === "local").filter((s) => matchesQuery(s, q, cache));

  if (stations.length === 0) {
    container.appendChild(buildEmptyStateEl(q ? "Brak stacji pasujących do wyszukiwania" : "Brak stacji"));
    return;
  }

  container.appendChild(buildSecHeadEl("Stacje lokalne", stations.length));
  stations.forEach((station) => {
    container.appendChild(createStationRow(station, { isCustom: false, showProviderTag: false, showLocalPill: true }));
  });
  container.appendChild(
    buildNoteEl("Stacje oznaczone ręcznie jako lokalne (przy dodawaniu do katalogu), niezależnie od Twojej pozycji."),
  );
}

function renderCustomTab(
  container: HTMLElement,
  allStations: Station[],
  customIds: Set<string>,
  q: string,
  cache: RmfCatalogCache | null,
): void {
  const stations = allStations.filter((s) => customIds.has(s.id)).filter((s) => matchesQuery(s, q, cache));

  if (stations.length === 0) {
    container.appendChild(buildEmptyStateEl(q ? "Brak stacji pasujących do wyszukiwania" : "Brak stacji"));
    return;
  }

  container.appendChild(buildSecHeadEl("Własne stacje", stations.length));
  stations.forEach((station) => {
    container.appendChild(createStationRow(station, { isCustom: true, showProviderTag: false, showLocalPill: false }));
  });
  container.appendChild(buildNoteEl("Stacje dodane ręcznie przez „+ Własna stacja”."));
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
    if (errorMessage) {
      errorBanner.textContent = errorMessage;
      errorBanner.style.display = "block";
    } else {
      errorBanner.style.display = "none";
    }
  }

  const allStations = getAllKnownStations();
  const customIds = new Set(getCustomStations().map((c) => c.id));
  updateTabCounts(
    allStations.filter((s) => s.cat === "local").length,
    allStations.filter((s) => customIds.has(s.id)).length,
  );

  const q = searchQuery.toLowerCase().trim();
  listContainer.innerHTML = "";

  if (activeTab === "local") {
    renderLocalTab(listContainer, allStations, q, cache);
  } else if (activeTab === "custom") {
    renderCustomTab(listContainer, allStations, customIds, q, cache);
  } else {
    renderAllTab(listContainer, allStations, customIds, q, cache);
  }
}
