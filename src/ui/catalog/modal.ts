import {
  deleteCustomStation,
  fetchRmfCatalog,
  getAllKnownStations,
  getCustomStations,
  getStoredRmfCatalog,
  isStationEnabled,
  isStationFavorite,
  setStationEnabled,
  setStationFavorite,
} from "@/catalog";
import { ICONS } from "@/icons";
import { notifyState } from "@/state";
import { handleCustomStationSubmit } from "./form";

let modalEl: HTMLElement | null = null;
let searchQuery = "";
let isFetching = false;
let errorMessage: string | null = null;
let showCustomForm = false;
let previousActiveElement: HTMLElement | null = null;

export function openCatalogModal(): void {
  previousActiveElement = document.activeElement as HTMLElement | null;

  if (!modalEl) {
    createModalElements();
  }
  if (modalEl) {
    modalEl.removeAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      modalEl?.classList.add("is-open");
    });
  }

  // Load catalog cache or fetch if missing
  const cache = getStoredRmfCatalog();
  if (!cache) {
    handleRefreshCatalog();
  } else {
    renderModalBody();
  }
}

export function closeCatalogModal(): void {
  if (modalEl?.classList.contains("is-open")) {
    if (document.activeElement && modalEl.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
    if (previousActiveElement && typeof previousActiveElement.focus === "function") {
      previousActiveElement.focus();
      previousActiveElement = null;
    }

    modalEl.classList.remove("is-open");
    modalEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
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
          <span id="catalog-updated-time" class="k-modal-updated"></span>
        </div>
        <button type="button" id="catalog-modal-close" class="k-modal-close" aria-label="Zamknij">&times;</button>
      </div>

      <div class="k-modal-toolbar">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input type="search" id="catalog-search-input" class="k-input catalog-search" placeholder="Szukaj stacji (nazwa, gatunek, tag)..." autocomplete="off" />
        </div>
        <div class="k-modal-actions">
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

      <div id="catalog-error-banner" class="k-modal-error" style="display: none;"></div>

      <div id="catalog-list-container" class="k-modal-list"></div>
    </div>
  `;

  document.body.appendChild(modalEl);

  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeCatalogModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl && modalEl.classList.contains("is-open")) {
      closeCatalogModal();
    }
  });

  const closeBtn = modalEl.querySelector("#catalog-modal-close");
  closeBtn?.addEventListener("click", closeCatalogModal);

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

  listContainer.innerHTML = "";

  const allStations = getAllKnownStations();
  const q = searchQuery.toLowerCase().trim();

  // Filter stations by name or search tags
  const filtered = allStations.filter((s) => {
    if (!q) return true;
    if (s.name.toLowerCase().includes(q)) return true;
    if (s.short.toLowerCase().includes(q)) return true;

    if (cache?.stations) {
      const raw = cache.stations.find((r) => String(r.id) === s.id);
      if (raw?.search) {
        const keywords = raw.search
          .toLowerCase()
          .split(",")
          .map((k) => k.trim());
        if (keywords.some((k) => k.includes(q))) return true;
      }
    }
    return false;
  });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "k-catalog-empty";
    if (isFetching) {
      empty.textContent = "Pobieranie stacji...";
    } else if (!cache && errorMessage) {
      empty.innerHTML = `
        <div>Brak zapisanych stacji w pamięci podręcznej.</div>
        <button type="button" class="btn-primary" style="margin-top: 10px;" id="catalog-retry-btn">Spróbuj ponownie</button>
      `;
      setTimeout(() => {
        empty.querySelector("#catalog-retry-btn")?.addEventListener("click", () => handleRefreshCatalog());
      }, 0);
    } else {
      empty.textContent = q ? "Brak stacji pasujących do wyszukiwania" : "Brak stacji";
    }
    listContainer.appendChild(empty);
    return;
  }

  const customStations = getCustomStations();
  const customIds = new Set(customStations.map((c) => c.id));

  filtered.forEach((station) => {
    const enabled = isStationEnabled(station.id);
    const favorite = isStationFavorite(station.id);
    const isCustom = customIds.has(station.id);

    const row = document.createElement("div");
    row.className = `k-catalog-row${enabled ? " enabled" : ""}`;

    const logoHtml = station.coverUrl
      ? `<img src="${station.coverUrl}" alt="" class="catalog-thumb" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';" /><div class="catalog-thumb-placeholder" style="display:none;">${station.name.charAt(0)}</div>`
      : `<div class="catalog-thumb-placeholder">${station.name.charAt(0)}</div>`;

    row.innerHTML = `
      <div class="catalog-col-info">
        ${logoHtml}
        <div class="catalog-details">
          <div class="catalog-name">
            ${station.name}
            ${isCustom ? '<span class="badge-custom">custom</span>' : ""}
          </div>
          <div class="catalog-sub">${station.short}</div>
        </div>
      </div>

      <div class="catalog-col-actions">
        ${
          isCustom
            ? `<button type="button" class="btn-delete-custom" title="Usuń własną stację" aria-label="Usuń">🗑️</button>`
            : ""
        }
        <label class="catalog-toggle-wrap">
          <input type="checkbox" class="catalog-checkbox" ${enabled ? "checked" : ""} />
          <span class="catalog-toggle-label">Lista</span>
        </label>
        <button type="button" class="sc-star catalog-star ${favorite ? "on" : ""}" ${!enabled ? "disabled title='Włącz stację, aby dodać do ulubionych'" : ""}>
          ${ICONS.star(favorite)}
        </button>
      </div>
    `;

    const checkbox = row.querySelector<HTMLInputElement>(".catalog-checkbox");
    checkbox?.addEventListener("change", (e) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      setStationEnabled(station.id, isChecked);
      notifyState();
      renderModalBody();
    });

    const starBtn = row.querySelector<HTMLButtonElement>(".catalog-star");
    starBtn?.addEventListener("click", () => {
      if (!enabled) return;
      setStationFavorite(station.id, !favorite);
      notifyState();
      renderModalBody();
    });

    const deleteBtn = row.querySelector<HTMLButtonElement>(".btn-delete-custom");
    deleteBtn?.addEventListener("click", () => {
      if (confirm(`Czy na pewno chcesz usunąć stację "${station.name}"?`)) {
        deleteCustomStation(station.id);
        notifyState();
        renderModalBody();
      }
    });

    listContainer.appendChild(row);
  });
}
