import { getEnabledStations } from "../catalog.js";
import { ICONS } from "../icons.js";
import { state } from "../state.js";
import type { Station } from "../types.js";
import { openCatalogModal } from "./catalogModal.js";
import { els } from "./elements.js";

export function renderStationList(onSelect: (s: Station) => void, onToggleFav: (id: string) => void): void {
  els.stationListContainer.innerHTML = "";

  const enabledStations = getEnabledStations();

  const favList = enabledStations.filter((s) => state.favs.has(s.id));
  const otherList = enabledStations.filter((s) => !state.favs.has(s.id));

  // Top control bar for catalog popup modal
  const topBar = document.createElement("div");
  topBar.className = "station-list-toolbar";
  topBar.innerHTML = `
    <button type="button" id="open-catalog-btn" class="btn-catalog-trigger">
      📻 Dostosuj listę stacji / Katalog
    </button>
  `;
  els.stationListContainer.appendChild(topBar);

  topBar.querySelector("#open-catalog-btn")?.addEventListener("click", () => openCatalogModal());

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
    header.innerHTML = `<span class="section-title">${sec.label}</span><span class="section-count">${sec.list.length}</span>`;
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

        const card = document.createElement("div");
        card.className = `station-card${isSelected ? " active" : ""}`;
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.innerHTML = `
          <div class="sc-main">
            <div class="sc-name">${isSelected ? '<span class="sc-led-dot" aria-hidden="true"></span>' : ""}${s.name}</div>
            <div class="sc-meta">
              <span class="sc-short">${s.short}</span>
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
}
