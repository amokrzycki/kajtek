import type { RmfCatalogCache, Station } from "../../types.js";
import { escapeHtml } from "../../utils.js";
import { getErrorMessage, isFetching } from "./refresh.js";
import { createStationRow, PROVIDER_LABELS } from "./row.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const IDXRAIL_SYMBOLS = ["#", ...ALPHABET];

export interface CatalogViewCtx {
  allStations: Station[];
  customIds: Set<string>;
  q: string;
  network: string | null;
  cache: RmfCatalogCache | null;
}

export interface CatalogViewDeps {
  rerender: () => void;
  onRetry: () => void;
}

function searchHaystack(station: Station, cache: RmfCatalogCache | null): string {
  const raw = cache?.stations?.find((r) => String(r.id) === station.id);
  return `${station.name} ${station.short} ${raw?.search ?? ""}`.toLowerCase();
}

function matchesQuery(station: Station, q: string, cache: RmfCatalogCache | null): boolean {
  return !q || searchHaystack(station, cache).includes(q);
}
function stationsWord(n: number): string {
  if (n === 1) return "stacja";
  const last = n % 10;
  const teen = n % 100 >= 12 && n % 100 <= 14;
  return !teen && last >= 2 && last <= 4 ? "stacje" : "stacji";
}

export function countByNetwork(stations: Station[]): Map<string, number> {
  const counts = new Map<string, number>();
  stations.forEach((s) => {
    if (!PROVIDER_LABELS[s.provider]) return;
    counts.set(s.provider, (counts.get(s.provider) ?? 0) + 1);
  });
  return counts;
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

export function applyAllTabFilters(container: HTMLElement, q: string, network: string | null): void {
  const azList = container.querySelector<HTMLElement>(".catalog-az-list");
  if (!azList) return;

  const visiblePerLetter = new Map<string, number>();
  let head: HTMLElement | null = null;
  let headCount = 0;
  let total = 0;

  const closeSection = () => {
    if (head) {
      head.classList.toggle("is-filtered-out", headCount === 0);
      visiblePerLetter.set(head.dataset.letter ?? "", headCount);
    }
  };

  Array.from(azList.children).forEach((child) => {
    const el = child as HTMLElement;
    if (el.dataset.letter) {
      closeSection();
      head = el;
      headCount = 0;
      return;
    }
    if (!el.classList.contains("k-catalog-row")) return;

    const visible = (!q || (el.dataset.search ?? "").includes(q)) && (!network || el.dataset.provider === network);
    el.classList.toggle("is-filtered-out", !visible);
    if (visible) {
      headCount++;
      total++;
    }
  });
  closeSection();

  container.querySelectorAll<HTMLElement>(".catalog-idxrail span[data-letter]").forEach((span) => {
    span.classList.toggle("has", (visiblePerLetter.get(span.dataset.letter ?? "") ?? 0) > 0);
  });

  const empty = azList.querySelector<HTMLElement>("[data-empty]");
  if (empty) {
    empty.hidden = total > 0;
    empty.textContent = q || network ? "Brak stacji pasujących do filtrów" : "Brak stacji";
  }

  const countEl = container.querySelector<HTMLElement>(".catalog-result-count");
  if (countEl) {
    const scope = network ? `Sieć ${PROVIDER_LABELS[network] ?? network}` : "Wszystkie sieci";
    countEl.textContent = `${scope} · ${total} ${stationsWord(total)}`;
  }
}

export function renderAllTab(container: HTMLElement, ctx: CatalogViewCtx, deps: CatalogViewDeps): void {
  const { allStations, customIds, q, network, cache } = ctx;
  const stations = [...allStations];

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
      container.appendChild(buildEmptyStateEl("Brak stacji"));
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
    head.dataset.letter = letter;
    azList.appendChild(head);
    groupStations.forEach((station) => {
      const row = createStationRow(
        station,
        {
          isCustom: customIds.has(station.id),
          showProviderTag: true,
          showLocalPill: station.cat === "local",
        },
        deps.rerender,
      );
      row.dataset.provider = station.provider;
      row.dataset.search = searchHaystack(station, cache);
      azList.appendChild(row);
    });
  });

  const empty = buildEmptyStateEl("Brak stacji");
  empty.dataset.empty = "";
  empty.hidden = true;
  azList.appendChild(empty);

  const idxrail = document.createElement("div");
  idxrail.className = "catalog-idxrail";
  idxrail.setAttribute("aria-label", "Indeks alfabetyczny");
  IDXRAIL_SYMBOLS.forEach((letter) => {
    const span = document.createElement("span");
    span.dataset.letter = letter;
    if (groups.has(letter)) {
      span.innerHTML = `<a href="#catalog-sec-${letter}">${letter}</a>`;
    } else {
      span.textContent = letter;
    }
    idxrail.appendChild(span);
  });

  const countEl = document.createElement("div");
  countEl.className = "catalog-result-count";
  container.appendChild(countEl);

  azPanel.appendChild(azList);
  azPanel.appendChild(idxrail);
  container.appendChild(azPanel);

  applyAllTabFilters(container, q, network);
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
