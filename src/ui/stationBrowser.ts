import { getEnabledStations } from "../catalog.js";
import { STORAGE_KEYS } from "../consts.js";
import { ICONS } from "../icons.js";
import { type ActiveMetadata, NOW_PLAYING_TTL_MS, NowPlayingCache } from "../nowPlaying.js";
import { getLiveTrackUpdatedAt, notifyState, state, subscribeLiveTrack, subscribeState } from "../state.js";
import type { Station } from "../types.js";
import { createBrowserTransition } from "./browserTransition.js";
import { openCatalogModal } from "./catalog/modal.js";
import { els } from "./elements.js";
import { renderNowPlaying } from "./nowPlaying.js";

export function initStationBrowser(onSelect: (station: Station) => void): () => void {
  const stationsTab = document.querySelector<HTMLButtonElement>("#browser-stations");
  const nowTab = document.querySelector<HTMLButtonElement>("#browser-now");
  const panel = document.getElementById("now-playing-browser");
  const list = document.getElementById("discovery-list");
  const status = document.getElementById("discovery-status");
  const empty = document.getElementById("discovery-empty");
  const emptyText = document.getElementById("discovery-empty-text");
  const view = document.getElementById("station-view-toggle");
  const panels = document.getElementById("browser-panels");
  if (!stationsTab || !nowTab || !panel || !list || !status || !empty || !emptyText || !view || !panels)
    return () => undefined;
  const transition = createBrowserTransition(panels, [els.stationListContainer, panel]);
  let active = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stationKey = "";
  let lifecycle = 0;

  const activeMetadata = (): ActiveMetadata | null =>
    state.playing && state.station && state.liveTrack
      ? {
          stationId: state.station.id,
          track: state.liveTrack,
          updatedAt: getLiveTrackUpdatedAt(),
        }
      : null;

  const render = () => {
    if (!active || document.hidden) return;
    const stations = getEnabledStations();
    const snapshots = cache.snapshots(stations, state.favTracks, activeMetadata());
    const useful = snapshots.filter((snapshot) => snapshot.kind !== "unknown").length;
    const pending = snapshots.filter((snapshot) => snapshot.loading).length;
    status.textContent =
      stations.length === 0
        ? "Brak włączonych stacji"
        : `${useful} z ${stations.length} stacji podaje treść${cache.refreshing ? ` · sprawdzanie ${pending}…` : " · odświeżanie co ok. 15\u00a0s"}`;
    empty.hidden = stations.length > 0 && (useful > 0 || cache.refreshing);
    emptyText.textContent =
      stations.length === 0
        ? "Włącz stacje w katalogu, aby sprawdzić, co gra."
        : "Teraz brak danych o treści. Możesz wybrać stację i posłuchać lub zmienić listę w katalogu.";
    renderNowPlaying(list, snapshots, state.station?.id, onSelect);
  };
  const cache = new NowPlayingCache(render);
  const stop = () => {
    lifecycle++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    cache.cancel();
  };
  const poll = async () => {
    if (!active || document.hidden) return;
    const generation = lifecycle;
    await cache.refresh(getEnabledStations(), activeMetadata());
    if (generation !== lifecycle || !active || document.hidden) return;
    timer = setTimeout(() => {
      void poll();
    }, NOW_PLAYING_TTL_MS);
  };
  const switchMode = (now: boolean) => {
    if (active === now) return;
    active = now;
    stationsTab.setAttribute("aria-selected", String(!now));
    nowTab.setAttribute("aria-selected", String(now));
    stationsTab.classList.toggle("active", !now);
    nowTab.classList.toggle("active", now);
    stationsTab.tabIndex = now ? -1 : 0;
    nowTab.tabIndex = now ? 0 : -1;
    stop();
    if (now) {
      render();
      void poll();
    }
    transition.switchTo(now ? panel : els.stationListContainer, now ? 1 : -1);
  };
  const tabs = [stationsTab, nowTab];
  tabs.forEach((tab, index) => {
    tab.onclick = () => switchMode(index === 1);
    tab.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? stationsTab : event.key === "End" ? nowTab : tabs[1 - index];
      next?.click();
      next?.focus();
    };
  });
  document.getElementById("open-catalog-btn")?.addEventListener("click", openCatalogModal);
  document.getElementById("discovery-catalog")?.addEventListener("click", openCatalogModal);
  document.getElementById("discovery-back")?.addEventListener("click", () => {
    switchMode(false);
    stationsTab.focus();
  });
  const viewButtons = Array.from(view.querySelectorAll<HTMLButtonElement>(".btn-view-toggle"));
  const updateView = () => {
    view.dataset.view = state.viewMode;
    els.stationListContainer.classList.toggle("is-grid-view", state.viewMode === "grid");
    panel.classList.toggle("is-grid-view", state.viewMode === "grid");
    viewButtons.forEach((button) => {
      const selected = button.dataset.view === state.viewMode;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  };
  viewButtons.forEach((button, index) => {
    button.innerHTML = button.dataset.view === "list" ? ICONS.viewList : ICONS.viewGrid;
    button.onclick = () => {
      state.viewMode = button.dataset.view === "grid" ? "grid" : "list";
      localStorage.setItem(STORAGE_KEYS.VIEW_MODE, state.viewMode);
      notifyState();
    };
    button.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      viewButtons[1 - index]?.click();
      viewButtons[1 - index]?.focus();
    };
  });
  const update = () => {
    updateView();
    const key = getEnabledStations()
      .map((station) => `${station.id}:${station.provider}:${station.apiBaseUrl ?? ""}`)
      .join("|");
    if (key !== stationKey) {
      stationKey = key;
      stop();
      if (active) void poll();
    }
    render();
  };
  const visibility = () => {
    transition.cancel();
    stop();
    if (active && !document.hidden) {
      render();
      void poll();
    }
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", visibility);
  const unsubscribe = subscribeState(update);
  const unsubscribeLive = subscribeLiveTrack(render);
  update();
  return () => {
    active = false;
    transition.cancel();
    stop();
    unsubscribe();
    unsubscribeLive();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", stop);
    window.removeEventListener("pageshow", visibility);
  };
}
