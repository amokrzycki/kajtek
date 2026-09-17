import { ICONS } from "../../icons.js";

export const CATALOG_MODAL_HTML = `
    <div class="k-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-modal-title">
      <div class="k-modal-header">
        <div class="k-modal-title-group">
          <h2 id="catalog-modal-title" class="k-modal-title">Katalog stacji radiowych</h2>
          <div class="k-modal-updated-row">
            <span id="catalog-updated-time" class="k-modal-updated"></span>
          </div>
        </div>
        <button type="button" id="catalog-modal-close" class="k-modal-close" aria-label="Zamknij">&times;</button>
      </div>

      <div class="k-modal-toolbar">
        <div class="search-input-wrap">
          <span class="search-icon">${ICONS.search}</span>
          <input type="search" id="catalog-search-input" class="k-input catalog-search" placeholder="Szukaj stacji…" autocomplete="off" autofocus />
        </div>
        <details class="k-modal-manage">
          <summary class="btn-secondary">
            <span>Opcje stacji</span>
            <span class="k-modal-manage-chevron" aria-hidden="true">${ICONS.chevron}</span>
          </summary>
          <div class="k-modal-actions-row">
            <button type="button" id="catalog-refresh-btn" class="btn-secondary">Odśwież listę</button>
            <button type="button" id="catalog-custom-toggle-btn" class="btn-secondary" aria-expanded="false" aria-controls="catalog-custom-form-wrap">+ Własna stacja</button>
            <button type="button" id="open-blacklist-btn" class="btn-secondary">Czarna lista utworów</button>
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
        </details>
      </div>

      <div class="catalog-tabbar" role="tablist" aria-label="Kategorie stacji">
        <button type="button" id="catalog-tab-all" class="catalog-tab active" role="tab" aria-selected="true" aria-controls="catalog-list-container" data-tab="all">WSZYSTKIE A–Z</button>
        <button type="button" id="catalog-tab-local" class="catalog-tab" role="tab" aria-selected="false" aria-controls="catalog-list-container" data-tab="local">LOKALNE <span class="catalog-tab-count">0</span></button>
        <button type="button" id="catalog-tab-custom" class="catalog-tab" role="tab" aria-selected="false" aria-controls="catalog-list-container" data-tab="custom">WŁASNE <span class="catalog-tab-count">0</span></button>
      </div>

      <div id="catalog-network-chips" class="catalog-chips" role="group" aria-label="Filtr sieci nadawców"></div>

      <div id="catalog-error-banner" class="k-modal-error"></div>

      <div id="catalog-list-container" class="k-modal-list" role="tabpanel" aria-labelledby="catalog-tab-all"></div>
    </div>
  `;
