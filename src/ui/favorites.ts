import { ICONS } from "@/icons.js";
import { notifyState, persistFavTracks, state } from "@/state.js";
import type { FavTrack, Station, TrackInfo } from "@/types.js";
import { escapeHtml, formatFavDateTime, getTrackKey } from "@/utils.js";
import { els } from "./elements.js";

export function isTrackFavorited(t: TrackInfo): boolean {
  const key = getTrackKey(t);
  return state.favTracks.some((f) => f.key === key);
}

export function toggleFavTrack(t: TrackInfo, station: Station | null): void {
  const key = getTrackKey(t);
  const idx = state.favTracks.findIndex((f) => f.key === key);
  if (idx !== -1) {
    state.favTracks.splice(idx, 1);
  } else {
    state.favTracks.unshift({
      key,
      timestamp: t.timestamp ? t.timestamp * 1000 : Date.now(),
      artist: t.artist,
      title: t.title,
      stationTag: station?.name || "",
      stationId: station?.id || "",
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
    <div class="pl-item fav-item" data-key="${f.key}">
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
        <button type="button" class="sc-star fav-star on" data-key="${f.key}" aria-label="Usuń z ulubionych">${ICONS.star(true)}</button>
      </div>
    </div>
  `;
}

export function renderFavoritesUI(): void {
  els.favTabCount.textContent = String(state.favTracks.length);
  els.favoritesEmpty.style.display = state.favTracks.length ? "none" : "block";
  els.favoritesList.innerHTML = state.favTracks.map(favRowHtml).join("");
}

export function applyHistoryTabVisibility(): void {
  const showProgram = state.historyTab === "program";
  els.historyTabProgram.classList.toggle("active", showProgram);
  els.historyTabFavorites.classList.toggle("active", !showProgram);
  els.programView.classList.toggle("active", showProgram);
  els.favoritesView.classList.toggle("active", !showProgram);
}
