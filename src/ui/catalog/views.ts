import type { RmfCatalogCache, Station } from "../../types.js";
import { escapeHtml } from "../../utils.js";
import { getErrorMessage, isFetching } from "./refresh.js";
import { createStationRow } from "./row.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const IDXRAIL_SYMBOLS = ["#", ...ALPHABET];

export interface CatalogViewCtx {
  allStations: Station[];
  customIds: Set<string>;
  q: string;
  cache: RmfCatalogCache | null;
}

export interface CatalogViewDeps {
  rerender: () => void;
  onRetry: () => void;
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

// Almost every RMF station name starts with "RMF", which would dump 3/4 of the
// catalog into a single "R" bucket — index by the first significant word instead.
const GENERIC_NAME_PREFIX = /^RMF\s+/i;

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

export function renderAllTab(container: HTMLElement, ctx: CatalogViewCtx, deps: CatalogViewDeps): void {
  const { allStations, customIds, q, cache } = ctx;
  const stations = allStations.filter((s) => matchesQuery(s, q, cache));

  if (stations.length === 0) {
    if (isFetching()) {
      container.appendChild(buildEmptyStateEl("Pobieranie stacji..."));
    } else if (!cache && getErrorMessage()) {
      const empty = document.createElement("div");
      empty.className = "k-catalog-empty";
      empty.innerHTML = `
        <div>Brak zapisanych stacji w pamięci podręcznej.</div>
        <button type="button" class="btn-primary" style="margin-top: 10px;" id="catalog-retry-btn">Spróbuj ponownie</button>
      `;
      container.appendChild(empty);
      empty.querySelector("#catalog-retry-btn")?.addEventListener("click", () => deps.onRetry());
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
  IDXRAIL_SYMBOLS.forEach((letter) => {
    const groupStations = groups.get(letter);
    if (!groupStations) return;
    const head = buildSecHeadEl(letter);
    head.id = `catalog-sec-${letter}`;
    azList.appendChild(head);
    groupStations.forEach((station) => {
      azList.appendChild(
        createStationRow(
          station,
          {
            isCustom: customIds.has(station.id),
            showProviderTag: true,
            showLocalPill: station.cat === "local",
          },
          deps.rerender,
        ),
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

export function renderLocalTab(container: HTMLElement, ctx: CatalogViewCtx, deps: CatalogViewDeps): void {
  const { allStations, q, cache } = ctx;
  const stations = allStations.filter((s) => s.cat === "local").filter((s) => matchesQuery(s, q, cache));

  if (stations.length === 0) {
    container.appendChild(buildEmptyStateEl(q ? "Brak stacji pasujących do wyszukiwania" : "Brak stacji"));
    return;
  }

  container.appendChild(buildSecHeadEl("Stacje lokalne", stations.length));
  stations.forEach((station) => {
    container.appendChild(
      createStationRow(station, { isCustom: false, showProviderTag: false, showLocalPill: true }, deps.rerender),
    );
  });
  container.appendChild(
    buildNoteEl("Stacje oznaczone ręcznie jako lokalne (przy dodawaniu do katalogu), niezależnie od Twojej pozycji."),
  );
}

export function renderCustomTab(container: HTMLElement, ctx: CatalogViewCtx, deps: CatalogViewDeps): void {
  const { allStations, customIds, q, cache } = ctx;
  const stations = allStations.filter((s) => customIds.has(s.id)).filter((s) => matchesQuery(s, q, cache));

  if (stations.length === 0) {
    container.appendChild(buildEmptyStateEl(q ? "Brak stacji pasujących do wyszukiwania" : "Brak stacji"));
    return;
  }

  container.appendChild(buildSecHeadEl("Własne stacje", stations.length));
  stations.forEach((station) => {
    container.appendChild(
      createStationRow(station, { isCustom: true, showProviderTag: false, showLocalPill: false }, deps.rerender),
    );
  });
  container.appendChild(buildNoteEl("Stacje dodane ręcznie przez „+ Własna stacja”."));
}
