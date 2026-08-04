import { getEnabledStations } from "@/catalog.js";
import { STORAGE_KEYS } from "@/consts.js";
import { ICONS } from "@/icons.js";
import { state } from "@/state.js";
import type { Station } from "@/types.js";
import { escapeHtml, renderStationThumbHtml } from "@/utils.js";
import { openCatalogModal } from "./catalog/modal.js";
import { els } from "./elements.js";

export function renderStationList(onSelect: (s: Station) => void, onToggleFav: (id: string) => void): void {
  // FIRST: Record positions of existing cards BEFORE updating viewMode / DOM
  const firstPositions = new Map<string, DOMRect>();
  const oldCards = els.stationListContainer.querySelectorAll<HTMLElement>(".station-card[data-id]");
  oldCards.forEach((card) => {
    const id = card.dataset.id;
    if (id) {
      firstPositions.set(id, card.getBoundingClientRect());
    }
  });

  // Toggle grid view modifier class on main station list container AFTER recording initial positions
  els.stationListContainer.classList.toggle("is-grid-view", state.viewMode === "grid");

  let topBar = els.stationListContainer.querySelector<HTMLElement>(".station-list-toolbar");
  if (!topBar) {
    topBar = document.createElement("div");
    topBar.className = "station-list-toolbar";
    topBar.innerHTML = `
      <button type="button" id="open-catalog-btn" class="btn-catalog-trigger">
        ${ICONS.radio} Katalog stacji
      </button>
      <div class="view-toggle-group" data-view="${state.viewMode}" role="radiogroup" aria-label="Przełącznik widoku">
        <span class="view-toggle-indicator" aria-hidden="true"></span>
        <button type="button" class="btn-view-toggle${state.viewMode === "list" ? " active" : ""}" data-view="list" title="Widok listy" aria-label="Widok listy">
          ${ICONS.viewList}
        </button>
        <button type="button" class="btn-view-toggle${state.viewMode === "grid" ? " active" : ""}" data-view="grid" title="Widok kafelków" aria-label="Widok kafelków">
          ${ICONS.viewGrid}
        </button>
      </div>
    `;

    topBar.querySelector("#open-catalog-btn")?.addEventListener("click", () => openCatalogModal());

    topBar.querySelectorAll<HTMLButtonElement>(".btn-view-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.view as "list" | "grid";
        if (mode && state.viewMode !== mode) {
          state.viewMode = mode;
          localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode);
          renderStationList(onSelect, onToggleFav);
        }
      });
    });
  }

  const toggleGroup = topBar.querySelector(".view-toggle-group");
  if (toggleGroup) {
    toggleGroup.setAttribute("data-view", state.viewMode);
    toggleGroup.querySelectorAll<HTMLButtonElement>(".btn-view-toggle").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === state.viewMode);
    });
  }

  // Remove existing content except topBar
  Array.from(els.stationListContainer.children).forEach((child) => {
    if (child !== topBar) child.remove();
  });

  if (!topBar.parentElement) {
    els.stationListContainer.appendChild(topBar);
  }

  const enabledStations = getEnabledStations();
  const favList = enabledStations.filter((s) => state.favs.has(s.id));
  const otherList = enabledStations.filter((s) => !state.favs.has(s.id));

  const sections = [
    { label: "Ulubione", key: "fav", list: favList },
    { label: "Stacje radiowe", key: "all", list: otherList },
  ];

  sections.forEach((sec) => {
    if (sec.key === "all" && favList.length > 0 && sec.list.length === 0) {
      return; // Skip empty section if all enabled stations are favorites
    }

    const secDiv = document.createElement("div");

    const header = document.createElement("div");
    header.className = "section-header";
    header.innerHTML = `<span class="section-title">${sec.label}</span><span class="k-rule"></span><span class="section-count">${sec.list.length}</span>`;
    secDiv.appendChild(header);

    if (sec.list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "section-empty";
      empty.textContent =
        sec.key === "fav" ? "Brak ulubionych — kliknij ★ przy dowolnej stacji" : "Brak stacji — dodaj z katalogu";
      secDiv.appendChild(empty);
    } else {
      const grid = document.createElement("div");
      grid.className = "station-grid";

      sec.list.forEach((s) => {
        const isSelected = state.station && state.station.id === s.id;
        const isFav = state.favs.has(s.id);

        const safeName = escapeHtml(s.name);
        const logoHtml = renderStationThumbHtml(s.coverUrl, s.name, "sc-thumb", "sc-thumb-placeholder");

        const card = document.createElement("div");
        card.className = `station-card${isSelected ? " active" : ""}`;
        card.dataset.id = s.id;
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.innerHTML = `
          ${logoHtml}
          <div class="sc-main">
            <div class="sc-name">${isSelected ? '<span class="sc-led-dot" aria-hidden="true"></span>' : ""}${safeName}</div>
            <div class="sc-meta">
              <span class="sc-short">${escapeHtml(s.short)}</span>
            </div>
          </div>
          <button class="sc-star${isFav ? " on" : ""}" aria-label="${isFav ? "Usuń z ulubionych" : "Dodaj do ulubionych"}">
            ${ICONS.star(isFav)}
          </button>
        `;

        card.addEventListener("click", () => onSelect(s));
        card.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") onSelect(s);
        });
        const starBtn = card.querySelector(".sc-star");
        if (starBtn) {
          starBtn.addEventListener("click", (e: Event) => {
            e.stopPropagation();
            onToggleFav(s.id);
          });
        }

        grid.appendChild(card);
      });

      secDiv.appendChild(grid);
    }

    els.stationListContainer.appendChild(secDiv);
  });

  // LAST, INVERT, PLAY: Animate cards smoothly from old position to new position
  if (firstPositions.size > 0) {
    requestAnimationFrame(() => {
      const newCards = els.stationListContainer.querySelectorAll<HTMLElement>(".station-card[data-id]");
      newCards.forEach((card) => {
        const id = card.dataset.id;
        if (!id) return;

        const firstRect = firstPositions.get(id);
        if (firstRect) {
          const lastRect = card.getBoundingClientRect();
          const deltaX = firstRect.left - lastRect.left;
          const deltaY = firstRect.top - lastRect.top;

          if (deltaX !== 0 || deltaY !== 0) {
            card.style.zIndex = "10";
            const anim = card.animate(
              [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "none" }],
              { duration: 280, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
            );
            anim.finished
              .catch(() => {})
              .finally(() => {
                card.style.zIndex = "";
              });
          }
        }
      });
    });
  }
}
