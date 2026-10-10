import { ICONS } from "../icons.js";
import { notifyState, persistFavTracks, state } from "../state.js";
import type { FavTrack, Station, TrackInfo } from "../types.js";
import { escapeHtml, formatFavDateTime, getTrackKey } from "../utils.js";
import { els } from "./elements.js";

export function isTrackFavorited(t: TrackInfo): boolean {
  const stationId = state.station?.id ?? "";
  const trackKey = getTrackKey(t);
  return state.favTracks.some(
    (f) => f.stationId === stationId && (f.key === trackKey || f.key === `${stationId}:${trackKey}`),
  );
}

export function toggleFavTrack(t: TrackInfo, station: Station | null): void {
  const stationId = station?.id ?? "";
  const trackKey = getTrackKey(t);
  const key = `${stationId}:${trackKey}`;
  const idx = state.favTracks.findIndex((f) => f.stationId === stationId && (f.key === trackKey || f.key === key));
  if (idx !== -1) {
    state.favTracks.splice(idx, 1);
  } else {
    state.favTracks.unshift({
      key,
      timestamp: t.timestamp ? t.timestamp * 1000 : Date.now(),
      artist: t.artist,
      title: t.title,
      stationTag: station?.name || "",
      stationId,
    });
    state.favTracks.sort((a, b) => b.timestamp - a.timestamp);
  }
  persistFavTracks();
  notifyState();
}

export function removeFavTrackByKey(key: string): void {
  state.favTracks = state.favTracks.filter((f) => f.key !== key);
  persistFavTracks();
  notifyState();
}

function favRowHtml(f: FavTrack): string {
  return `
      <span class="pl-time fav-time">${formatFavDateTime(f.timestamp)}</span>
      <span class="pl-dot fav-dot"></span>
      <div class="pl-track">
        <div class="pl-line">
          <span class="pl-artist">${escapeHtml(f.artist)}</span>
          <span class="pl-sep">·</span>
          <span class="pl-title">${escapeHtml(f.title)}</span>
        </div>
        <span class="fav-station">${escapeHtml(f.stationTag)}</span>
      </div>
      <div class="pl-actions">
        <button type="button" class="fav-goto" data-station-id="${escapeHtml(f.stationId)}" aria-label="Przejdź do stacji ${escapeHtml(f.stationTag)}">${ICONS.chevron}</button>
        <button type="button" class="sc-star fav-star on" data-key="${escapeHtml(f.key)}" aria-label="Usuń z ulubionych: ${escapeHtml(f.artist)} – ${escapeHtml(f.title)}">${ICONS.star(true)}</button>
      </div>
  `;
}

export function renderFavoritesUI(): void {
  els.favTabCount.textContent = String(state.favTracks.length);
  els.favoritesEmpty.style.display = state.favTracks.length ? "none" : "block";
  const list = els.favoritesList;
  const children = Array.from(list.children) as HTMLElement[];
  const existing = new Map(children.map((row) => [row.dataset.favoriteId, row]));
  const focused = document.activeElement;
  const focusedIndex = children.findIndex((row) => row.contains(focused));
  const action = focused instanceof HTMLElement && focused.classList.contains("fav-goto") ? ".fav-goto" : ".fav-star";
  const targets = state.favTracks.map((track) => ({ track, id: JSON.stringify([track.stationId, track.key]) }));
  const keys = new Set(targets.map(({ id }) => id));
  for (const row of children) if (!keys.has(row.dataset.favoriteId ?? "")) row.remove();
  targets.forEach(({ track, id }, index) => {
    let row = existing.get(id);
    if (!row) {
      row = document.createElement("div");
      row.className = "pl-item fav-item";
      row.dataset.key = track.key;
      row.dataset.favoriteId = id;
    }
    const signature = JSON.stringify(track);
    if (row.dataset.signature !== signature) {
      row.innerHTML = favRowHtml(track);
      row.dataset.signature = signature;
    }
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
  });
  if (focusedIndex !== -1 && !list.contains(document.activeElement)) {
    const next = list.children[Math.min(focusedIndex, list.children.length - 1)];
    (next?.querySelector<HTMLButtonElement>(action) ?? els.historyTabFavorites).focus();
  }
}

export function applyHistoryTabVisibility(): void {
  const showProgram = state.historyTab === "program";
  els.historyTabProgram.classList.toggle("active", showProgram);
  els.historyTabFavorites.classList.toggle("active", !showProgram);
  els.historyTabProgram.setAttribute("aria-selected", String(showProgram));
  els.historyTabFavorites.setAttribute("aria-selected", String(!showProgram));
  els.historyTabProgram.tabIndex = showProgram ? 0 : -1;
  els.historyTabFavorites.tabIndex = showProgram ? -1 : 0;
  els.programView.classList.toggle("active", showProgram);
  els.favoritesView.classList.toggle("active", !showProgram);
  els.programView.hidden = !showProgram;
  els.favoritesView.hidden = showProgram;
  els.programView.inert = !showProgram;
  els.favoritesView.inert = showProgram;
  els.programView.tabIndex = showProgram ? 0 : -1;
  els.favoritesView.tabIndex = showProgram ? -1 : 0;
}
