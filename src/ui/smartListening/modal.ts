import { getAllKnownStations, getSmartStations, setStationSmartEnabled } from "../../catalog.js";
import { ICONS } from "../../icons.js";
import {
  getSmartListeningConfig,
  setListeningPreference,
  subscribeSmartListeningConfig,
  updateSmartListeningConfig,
} from "../../listeningPreferences.js";
import { notifyState } from "../../state.js";
import type { TrackInfo } from "../../types.js";
import { escapeHtml } from "../../utils.js";
import { bindModalDismiss, closeModal, openModal } from "../modal.js";

type Preference = ReturnType<typeof getSmartListeningConfig>["preferences"][number];
type PreferenceValue = "positive" | "neutral" | "negative";

let modalEl: HTMLElement | null = null;
let previousActiveElement: HTMLElement | null = null;
let unsubscribe: (() => void) | undefined;
let editing: Preference | undefined;
let searchQuery = "";

const VALUE_OPTIONS = `
  <option value="positive">Preferuj</option>
  <option value="neutral">Neutralnie</option>
  <option value="negative">Unikaj</option>
`;

export function openSmartListeningModal(track?: TrackInfo, restoreFocusEl?: HTMLElement | null): void {
  previousActiveElement = restoreFocusEl ?? (document.activeElement as HTMLElement | null);
  if (!modalEl) createModalElements();
  resetPreferenceForm();
  searchQuery = "";
  const search = modalEl?.querySelector<HTMLInputElement>("#smart-station-search");
  if (search) search.value = "";
  renderStations();
  syncConfig();
  unsubscribe?.();
  unsubscribe = subscribeSmartListeningConfig(syncConfig);
  if (!modalEl) return;
  const body = modalEl.querySelector<HTMLElement>(".k-smart-body");
  if (body) body.scrollTop = 0;
  modalEl.querySelectorAll<HTMLDetailsElement>(".k-smart-section").forEach((section) => {
    section.open = Boolean(track) && section.id === "smart-music-section";
  });
  const saved = modalEl.querySelector<HTMLDetailsElement>("#smart-saved-preferences");
  if (saved) saved.open = !track;
  if (track) fillPreferenceForm("track", track.artist, track.title);
  openModal(modalEl, track ? modalEl.querySelector<HTMLSelectElement>("#smart-preference-value") : undefined);
}

export function closeSmartListeningModal(): void {
  if (!modalEl) return;
  unsubscribe?.();
  unsubscribe = undefined;
  closeModal(modalEl, previousActiveElement);
  previousActiveElement = null;
}

function createModalElements(): void {
  modalEl = document.createElement("div");
  modalEl.id = "smart-listening-modal-overlay";
  modalEl.className = "k-modal-overlay";
  modalEl.innerHTML = `
    <div class="k-modal k-smart-modal" role="dialog" aria-modal="true" aria-labelledby="smart-modal-title">
      <div class="k-modal-header">
        <h2 id="smart-modal-title" class="k-modal-title">Smart Listening</h2>
        <button type="button" id="smart-modal-close" class="k-modal-close" aria-label="Zamknij">&times;</button>
      </div>
      <div class="k-smart-body">
        <div class="k-settings-row">
          <div class="k-settings-row-text">
            <span>Włącz Smart Listening</span>
            <span id="smart-enabled-help" class="k-settings-row-sub"></span>
          </div>
          <label class="catalog-toggle-switch">
            <input type="checkbox" id="smart-enabled" class="catalog-checkbox" aria-label="Włącz Smart Listening" aria-describedby="smart-enabled-help" />
          </label>
        </div>
        <p class="k-smart-help">Gdy pojawi się treść do pominięcia, wybiorę stację z Twojej puli. Wrócę, gdy poprzednia stacja znów będzie odpowiednia.</p>
        <details id="smart-stations-section" class="k-smart-section">
          <summary><span>Stacje do przełączania</span><span id="smart-station-count" class="k-smart-summary-count"></span><span class="k-smart-chevron" aria-hidden="true">${ICONS.chevron}</span></summary>
          <div class="k-smart-section-body">
            <p class="k-smart-help">Ta pula jest niezależna od widoczności i ulubionych stacji.</p>
            <div class="search-input-wrap">
              <span class="search-icon" aria-hidden="true">${ICONS.search}</span>
              <input type="search" id="smart-station-search" class="k-input" aria-label="Szukaj stacji do przełączania" placeholder="Szukaj stacji…" autocomplete="off" />
            </div>
            <p id="smart-pool-help" class="k-smart-help" role="status"></p>
            <div id="smart-station-list" class="k-smart-station-list" role="group" aria-label="Stacje do automatycznego przełączania"></div>
            <p id="smart-station-empty" class="k-smart-empty" hidden>Nie znaleziono stacji. Zmień wyszukiwanie.</p>
          </div>
        </details>
        <details id="smart-content-section" class="k-smart-section">
          <summary><span>Treści do pomijania</span><span id="smart-content-count" class="k-smart-summary-count"></span><span class="k-smart-chevron" aria-hidden="true">${ICONS.chevron}</span></summary>
          <div class="k-smart-section-body">
            <p class="k-smart-help">Zaznacz treści, które mam omijać, gdy stacja je rozpozna.</p>
            <label class="k-smart-rule"><input type="checkbox" data-content="advertisement" /><span>Reklamy</span></label>
            <label class="k-smart-rule"><input type="checkbox" data-content="news" /><span>Wiadomości</span></label>
            <label class="k-smart-rule"><input type="checkbox" data-content="otherBreak" /><span>Inne rozpoznane przerwy</span></label>
            <p class="k-smart-help">Audycje pozostają do słuchania. Brak danych nie oznacza przerwy.</p>
          </div>
        </details>
        <details id="smart-music-section" class="k-smart-section">
          <summary><span>Preferencje muzyczne</span><span id="smart-preference-count" class="k-smart-summary-count"></span><span class="k-smart-chevron" aria-hidden="true">${ICONS.chevron}</span></summary>
          <div class="k-smart-section-body">
            <p class="k-smart-help">„Preferuj” pomaga wybrać stację po pominięciu treści. „Unikaj” wywołuje pominięcie. „Neutralnie” usuwa preferencję. Zakładki z gwiazdką pozostają osobno.</p>
            <form id="smart-preference-form" class="k-smart-form">
              <label class="k-field"><span class="k-field-label">Dotyczy</span>
                <select id="smart-preference-scope" class="k-input"><option value="track">Utworu</option><option value="artist">Artysty</option></select>
              </label>
              <label class="k-field"><span class="k-field-label">Preferencja</span>
                <select id="smart-preference-value" class="k-input">${VALUE_OPTIONS}</select>
              </label>
              <label class="k-field"><span class="k-field-label">Artysta</span><input id="smart-preference-artist" class="k-input" type="text" placeholder="np. Maanam" required /></label>
              <label id="smart-title-field" class="k-field"><span class="k-field-label">Tytuł</span><input id="smart-preference-title" class="k-input" type="text" placeholder="np. Krakowski spleen" required /></label>
              <div class="k-smart-form-actions">
                <button id="smart-preference-save" type="submit" class="btn-primary">Zapisz preferencję</button>
                <button id="smart-preference-reset" type="button" class="btn-secondary" hidden>Anuluj edycję</button>
              </div>
            </form>
            <p id="smart-preference-status" class="k-smart-help" role="status" aria-live="polite"></p>
            <details id="smart-saved-preferences" class="k-smart-saved">
              <summary>Zapisane preferencje</summary>
              <div id="smart-preference-list" class="k-smart-preference-list"></div>
            </details>
            <p id="smart-preference-empty" class="k-smart-empty">Nie masz zapisanych preferencji. Dodaj artystę lub utwór powyżej.</p>
          </div>
        </details>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  bindModalDismiss(modalEl, closeSmartListeningModal);
  modalEl.querySelector("#smart-modal-close")?.addEventListener("click", closeSmartListeningModal);
  modalEl.querySelector<HTMLInputElement>("#smart-enabled")?.addEventListener("change", (event) => {
    updateSmartListeningConfig({ enabled: (event.target as HTMLInputElement).checked });
  });
  modalEl.querySelector<HTMLInputElement>("#smart-station-search")?.addEventListener("input", (event) => {
    searchQuery = (event.target as HTMLInputElement).value.trim().toLocaleLowerCase("pl");
    filterStations();
  });
  modalEl.querySelector("#smart-station-list")?.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.station) return;
    setStationSmartEnabled(input.dataset.station, input.checked);
    notifyState();
    syncStationSummary();
  });
  modalEl.querySelectorAll<HTMLInputElement>("[data-content]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.content;
      if (key !== "advertisement" && key !== "news" && key !== "otherBreak") return;
      updateSmartListeningConfig({ content: { ...getSmartListeningConfig().content, [key]: input.checked } });
    });
  });
  modalEl.querySelector("#smart-preference-scope")?.addEventListener("change", syncPreferenceScope);
  modalEl.querySelector("#smart-preference-form")?.addEventListener("submit", savePreference);
  modalEl.querySelector("#smart-preference-reset")?.addEventListener("click", resetPreferenceForm);
  modalEl.querySelector("#smart-preference-list")?.addEventListener("change", (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>("[data-preference-value]");
    const entry = select && findPreference(select);
    if (!entry || !select || !isPreferenceValue(select.value)) return;
    setListeningPreference(entry.scope, entry.artist, entry.title, select.value);
    announcePreference(select.value === "neutral" ? "Usunięto preferencję." : "Zmieniono preferencję.");
  });
  modalEl.querySelector("#smart-preference-list")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-preference-action]");
    const entry = button && findPreference(button);
    if (!entry || !button) return;
    if (button.dataset.preferenceAction === "remove") {
      setListeningPreference(entry.scope, entry.artist, entry.title, "neutral");
      announcePreference("Usunięto preferencję.");
    } else {
      editing = entry;
      fillPreferenceForm(entry.scope, entry.artist, entry.title);
      const select = modalEl?.querySelector<HTMLSelectElement>("#smart-preference-value");
      if (select) select.value = entry.value;
      const reset = modalEl?.querySelector<HTMLButtonElement>("#smart-preference-reset");
      if (reset) reset.hidden = false;
      modalEl?.querySelector<HTMLInputElement>("#smart-preference-artist")?.focus();
    }
  });
}

function isPreferenceValue(value: string): value is PreferenceValue {
  return value === "positive" || value === "neutral" || value === "negative";
}

function findPreference(element: HTMLElement): Preference | undefined {
  const key = element.closest<HTMLElement>("[data-preference-key]")?.dataset.preferenceKey;
  return getSmartListeningConfig().preferences.find((entry) => entry.key === key);
}

function syncConfig(): void {
  const config = getSmartListeningConfig();
  const toggle = modalEl?.querySelector<HTMLInputElement>("#smart-enabled");
  if (toggle) toggle.checked = config.enabled;
  const help = modalEl?.querySelector<HTMLElement>("#smart-enabled-help");
  if (help)
    help.textContent = config.enabled
      ? "Automatyczne omijanie wybranych treści jest włączone"
      : "Wyłączone. Preferencje możesz edytować; nie zmienią teraz stacji.";
  modalEl?.querySelectorAll<HTMLInputElement>("[data-content]").forEach((input) => {
    const key = input.dataset.content;
    if (key === "advertisement" || key === "news" || key === "otherBreak") input.checked = config.content[key];
  });
  const contentCount = modalEl?.querySelector<HTMLElement>("#smart-content-count");
  if (contentCount) contentCount.textContent = `${Object.values(config.content).filter(Boolean).length} z 3`;
  const preferenceCount = modalEl?.querySelector<HTMLElement>("#smart-preference-count");
  if (preferenceCount) preferenceCount.textContent = String(config.preferences.length);
  syncPreferences();
}

function renderStations(): void {
  const list = modalEl?.querySelector<HTMLElement>("#smart-station-list");
  if (!list) return;
  const selected = new Set(getSmartStations().map((station) => station.id));
  list.innerHTML = getAllKnownStations()
    .sort((a, b) => a.name.localeCompare(b.name, "pl"))
    .map(
      (station) => `
      <label class="k-smart-rule" data-station-search="${escapeHtml(`${station.name} ${station.short ?? ""} ${station.provider ?? ""}`.toLocaleLowerCase("pl"))}">
        <input type="checkbox" data-station="${escapeHtml(station.id)}" ${selected.has(station.id) ? "checked" : ""} />
        <span>${escapeHtml(station.name)}</span>
      </label>
    `,
    )
    .join("");
  syncStationSummary();
  filterStations();
}

function syncStationSummary(): void {
  const stations = getAllKnownStations();
  const count = getSmartStations().length;
  const summary = modalEl?.querySelector<HTMLElement>("#smart-station-count");
  if (summary) summary.textContent = `${count} z ${stations.length}`;
  const help = modalEl?.querySelector<HTMLElement>("#smart-pool-help");
  if (help) {
    help.textContent =
      count === 0
        ? "Pula jest pusta. Zaznacz stacje, abym miał gdzie przełączyć."
        : "Gdy żadna wybrana stacja nie będzie odpowiednia, zaczekam na dostępny wybór.";
  }
}

function filterStations(): void {
  let visible = 0;
  modalEl?.querySelectorAll<HTMLElement>("[data-station-search]").forEach((row) => {
    row.hidden = !row.dataset.stationSearch?.includes(searchQuery);
    if (!row.hidden) visible++;
  });
  const empty = modalEl?.querySelector<HTMLElement>("#smart-station-empty");
  if (empty) {
    empty.hidden = visible > 0;
    empty.textContent =
      getAllKnownStations().length === 0
        ? "Brak stacji. Dodaj lub odśwież stacje w katalogu."
        : "Nie znaleziono stacji. Zmień wyszukiwanie.";
  }
}

function syncPreferences(): void {
  const list = modalEl?.querySelector<HTMLElement>("#smart-preference-list");
  if (!list) return;
  const entries = getSmartListeningConfig().preferences;
  const rows = new Map(Array.from(list.children, (child) => [(child as HTMLElement).dataset.preferenceKey, child]));
  let removedFocusedRow = false;
  for (const [key, row] of rows) {
    if (entries.some((entry) => entry.key === key)) continue;
    removedFocusedRow ||= row.contains(document.activeElement);
    row.remove();
  }
  for (const entry of entries) {
    let row = rows.get(entry.key);
    if (!row) {
      row = document.createElement("div");
      row.className = "k-smart-preference-row";
      (row as HTMLElement).dataset.preferenceKey = entry.key;
      row.innerHTML = `
        <div class="k-smart-preference-info"><strong>${escapeHtml(entry.artist)}</strong><span>${entry.scope === "artist" ? "Wszystkie utwory artysty" : escapeHtml(entry.title)}</span></div>
        <select class="k-input" data-preference-value aria-label="Preferencja: ${escapeHtml(entry.artist)}${entry.scope === "track" ? ` – ${escapeHtml(entry.title)}` : ""}">${VALUE_OPTIONS}</select>
        <button type="button" class="btn-secondary" data-preference-action="edit" aria-label="Edytuj preferencję: ${escapeHtml(entry.artist)}">Edytuj</button>
        <button type="button" class="btn-delete-custom" data-preference-action="remove" aria-label="Usuń preferencję: ${escapeHtml(entry.artist)}${entry.scope === "track" ? ` – ${escapeHtml(entry.title)}` : ""}">${ICONS.trash}</button>
      `;
      list.appendChild(row);
    }
    const select = row.querySelector<HTMLSelectElement>("[data-preference-value]");
    if (select) select.value = entry.value;
  }
  const empty = modalEl?.querySelector<HTMLElement>("#smart-preference-empty");
  if (empty) empty.hidden = entries.length > 0;
  const saved = modalEl?.querySelector<HTMLDetailsElement>("#smart-saved-preferences");
  if (saved) saved.hidden = entries.length === 0;
  if (removedFocusedRow) {
    (
      list.querySelector<HTMLSelectElement>("[data-preference-value]") ??
      modalEl?.querySelector<HTMLSelectElement>("#smart-preference-value")
    )?.focus();
  }
}

function fillPreferenceForm(scope: "artist" | "track", artist: string, title: string): void {
  const scopeEl = modalEl?.querySelector<HTMLSelectElement>("#smart-preference-scope");
  const artistEl = modalEl?.querySelector<HTMLInputElement>("#smart-preference-artist");
  const titleEl = modalEl?.querySelector<HTMLInputElement>("#smart-preference-title");
  const valueEl = modalEl?.querySelector<HTMLSelectElement>("#smart-preference-value");
  if (scopeEl) scopeEl.value = scope;
  if (artistEl) artistEl.value = artist;
  if (titleEl) titleEl.value = title;
  if (valueEl) valueEl.value = "neutral";
  syncPreferenceScope();
}

function syncPreferenceScope(): void {
  const artistScope = modalEl?.querySelector<HTMLSelectElement>("#smart-preference-scope")?.value === "artist";
  const title = modalEl?.querySelector<HTMLInputElement>("#smart-preference-title");
  const field = modalEl?.querySelector<HTMLElement>("#smart-title-field");
  if (title) {
    title.disabled = artistScope;
    title.required = !artistScope;
  }
  if (field) field.hidden = artistScope;
  const scope = artistScope ? "artist" : "track";
  const artist = modalEl?.querySelector<HTMLInputElement>("#smart-preference-artist")?.value.trim();
  const trackTitle = title?.value.trim();
  const entry = getSmartListeningConfig().preferences.find(
    (item) =>
      item.scope === scope &&
      item.artist.toLocaleLowerCase("pl") === artist?.toLocaleLowerCase("pl") &&
      (artistScope || item.title.toLocaleLowerCase("pl") === trackTitle?.toLocaleLowerCase("pl")),
  );
  const value = modalEl?.querySelector<HTMLSelectElement>("#smart-preference-value");
  if (value) value.value = entry?.value ?? "neutral";
}

function resetPreferenceForm(): void {
  editing = undefined;
  fillPreferenceForm("track", "", "");
  const reset = modalEl?.querySelector<HTMLButtonElement>("#smart-preference-reset");
  if (reset) reset.hidden = true;
  announcePreference("");
}

function savePreference(event: Event): void {
  event.preventDefault();
  const scope =
    modalEl?.querySelector<HTMLSelectElement>("#smart-preference-scope")?.value === "artist" ? "artist" : "track";
  const artist = modalEl?.querySelector<HTMLInputElement>("#smart-preference-artist")?.value.trim();
  const title = modalEl?.querySelector<HTMLInputElement>("#smart-preference-title")?.value.trim() ?? "";
  const value = modalEl?.querySelector<HTMLSelectElement>("#smart-preference-value")?.value;
  if (!artist || (scope === "track" && !title) || !value || !isPreferenceValue(value)) return;
  if (editing) setListeningPreference(editing.scope, editing.artist, editing.title, "neutral");
  setListeningPreference(scope, artist, title, value);
  editing = undefined;
  const reset = modalEl?.querySelector<HTMLButtonElement>("#smart-preference-reset");
  if (reset) reset.hidden = true;
  announcePreference(value === "neutral" ? "Preferencja neutralna — nie zapisuję reguły." : "Zapisano preferencję.");
}

function announcePreference(message: string): void {
  const status = modalEl?.querySelector<HTMLElement>("#smart-preference-status");
  if (status) status.textContent = message;
}
