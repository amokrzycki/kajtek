import { ALL_STATIONS } from "../consts.js";
import { ICONS } from "../icons.js";
import { state } from "../state.js";
import type { Station } from "../types.js";
import { els } from "./elements.js";

export function renderStationList(onSelect: (s: Station) => void, onToggleFav: (id: string) => void): void {
  els.stationListContainer.innerHTML = "";

  const sections = [
    { label: "Ulubione", key: "fav", list: ALL_STATIONS.filter((s) => state.favs.has(s.id)) },
    { label: "Ogólnopolskie", key: "national", list: ALL_STATIONS.filter((s) => s.cat === "national") },
  ];

  sections.forEach((sec) => {
    const secDiv = document.createElement("div");

    const header = document.createElement("div");
    header.className = "section-header";
    header.innerHTML = `<span class="section-title">${sec.label}</span><span class="section-count">${sec.list.length}</span>`;
    secDiv.appendChild(header);

    if (sec.list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "section-empty";
      empty.textContent = sec.key === "fav" ? "Brak ulubionych — kliknij ★ przy dowolnej stacji" : "Brak stacji";
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
              <span class="sc-freq">${s.freq} FM</span>
              <span class="sc-genre">${s.genre}</span>
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
