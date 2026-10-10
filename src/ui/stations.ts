import { getEnabledStations } from "../catalog.js";
import { ICONS } from "../icons.js";
import { state } from "../state.js";
import type { Station } from "../types.js";
import { escapeHtml, renderStationThumbHtml } from "../utils.js";
import { els } from "./elements.js";

let frame: number | null = null;
let pendingPositions: Map<string, DOMRect> | null = null;
let generation = 0;
const animations = new Map<HTMLElement, Animation>();

export function cancelStationLayoutTransition(): void {
  generation++;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  pendingPositions = null;
  animations.forEach((animation, card) => {
    animation.cancel();
    card.style.zIndex = "";
  });
  animations.clear();
}

export function renderStationList(
  onSelect: (s: Station) => void,
  onToggleFav: (id: string) => void,
  layoutOnly = false,
): void {
  const firstPositions = pendingPositions ?? new Map<string, DOMRect>();
  if (!pendingPositions) {
    els.stationListContainer.querySelectorAll<HTMLElement>(".station-card[data-id]").forEach((card) => {
      if (card.dataset.id) firstPositions.set(card.dataset.id, card.getBoundingClientRect());
    });
  }
  cancelStationLayoutTransition();
  els.stationListContainer.classList.toggle("is-grid-view", state.viewMode === "grid");

  if (!layoutOnly) {
    els.stationListContainer.replaceChildren();

    const enabledStations = getEnabledStations();
    const favList = enabledStations.filter((s) => state.favs.has(s.id));
    const otherList = enabledStations.filter((s) => !state.favs.has(s.id));

    const sections = [
      { label: "Ulubione stacje", key: "fav", list: favList },
      { label: "Stacje radiowe", key: "all", list: otherList },
    ];

    sections.forEach((sec) => {
      if (sec.key === "fav" && sec.list.length === 0) return;
      if (sec.key === "all" && favList.length > 0 && sec.list.length === 0) {
        return; // Skip empty section if all enabled stations are favorites
      }

      const secDiv = document.createElement("div");

      const header = document.createElement("h2");
      header.className = "section-header";
      header.innerHTML = `<span class="section-title">${sec.label}</span><span class="k-rule"></span><span class="section-count">${sec.list.length}</span>`;
      secDiv.appendChild(header);

      if (sec.list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "section-empty";
        empty.textContent = "Brak stacji — dodaj z katalogu";
        secDiv.appendChild(empty);
      } else {
        const grid = document.createElement("div");
        grid.className = "station-grid";

        sec.list.forEach((s) => {
          const isSelected = state.station?.id === s.id;
          const isFav = state.favs.has(s.id);

          const safeName = escapeHtml(s.name);
          const logoHtml = renderStationThumbHtml(
            s.coverUrl,
            s.name,
            "sc-thumb",
            "sc-thumb-placeholder",
            s.cat === "custom",
          );

          const card = document.createElement("div");
          card.className = `station-card${isSelected ? " active" : ""}`;
          card.dataset.id = s.id;
          card.innerHTML = `
            <button type="button" class="station-select" aria-pressed="${isSelected}">
              ${logoHtml}
              <div class="sc-main">
                <div class="sc-name" title="${safeName}">${isSelected ? '<span class="sc-led-dot" aria-hidden="true"></span>' : ""}${safeName}</div>
                <div class="sc-meta">
                  <span class="sc-short">${escapeHtml(s.short)}</span>
                </div>
              </div>
            </button>
            <button type="button" class="sc-star${isFav ? " on" : ""}" aria-label="${isFav ? "Usuń z ulubionych" : "Dodaj do ulubionych"}: ${safeName}">
              ${ICONS.star(isFav)}
            </button>
          `;

          card.querySelector(".station-select")?.addEventListener("click", () => onSelect(s));
          const starBtn = card.querySelector(".sc-star");
          if (starBtn) {
            starBtn.addEventListener("click", () => onToggleFav(s.id));
          }

          grid.appendChild(card);
        });

        secDiv.appendChild(grid);
      }

      els.stationListContainer.appendChild(secDiv);
    });
  }

  if (
    !firstPositions.size ||
    els.stationListContainer.hidden ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  const token = generation;
  pendingPositions = firstPositions;
  frame = requestAnimationFrame(() => {
    if (token !== generation) return;
    frame = null;
    pendingPositions = null;
    els.stationListContainer.querySelectorAll<HTMLElement>(".station-card[data-id]").forEach((card) => {
      const firstRect = firstPositions.get(card.dataset.id ?? "");
      if (!firstRect) return;
      const lastRect = card.getBoundingClientRect();
      const deltaX = firstRect.left - lastRect.left;
      const deltaY = firstRect.top - lastRect.top;
      if (!deltaX && !deltaY) return;
      card.style.zIndex = "10";
      const animation = card.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "none" }], {
        duration: 280,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
      animations.set(card, animation);
      void animation.finished
        .catch(() => undefined)
        .finally(() => {
          if (animations.get(card) !== animation) return;
          animations.delete(card);
          card.style.zIndex = "";
        });
    });
  });
}
