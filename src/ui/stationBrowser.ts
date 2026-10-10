import { getEnabledStations } from "../catalog.js";
import { STORAGE_KEYS } from "../consts.js";
import { ICONS } from "../icons.js";
import { notifyState, state, subscribeState } from "../state.js";
import { sharedSnapshots } from "../stationSnapshots.js";
import type { Station } from "../types.js";
import { setStoredString } from "../utils.js";
import { createBrowserTransition, createLayoutTransition } from "./browserTransition.js";
import { openCatalogModal } from "./catalog/modal.js";
import { els } from "./elements.js";
import { renderNowPlaying } from "./nowPlaying.js";
import { cancelStationLayoutTransition } from "./stations.js";
import { bindTabKeys } from "./tabs.js";

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
  const discoveryLayout = createLayoutTransition(list, ":scope > li[data-id]");
  let lastViewMode = state.viewMode;
  let active = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stationKey = "";
  let lastActivationAt = -Infinity;

  const render = () => {
    if (!active || document.hidden) return;
    const stations = getEnabledStations();
    const snapshots = sharedSnapshots.snapshots(stations);
    const useful = snapshots.filter((snapshot) => snapshot.kind !== "unknown").length;
    const pending = snapshots.filter((snapshot) => snapshot.loading).length;
    status.textContent =
      stations.length === 0
        ? "Brak włączonych stacji"
        : `${useful} z ${stations.length} stacji podaje treść${sharedSnapshots.refreshing ? ` · sprawdzanie ${pending}…` : " · odświeżanie co ok. 15\u00a0s"}`;
    empty.hidden = stations.length > 0 && (useful > 0 || sharedSnapshots.refreshing);
    emptyText.textContent =
      stations.length === 0
        ? "Włącz stacje w katalogu, aby sprawdzić, co gra."
        : "Teraz brak danych o treści. Możesz wybrać stację i posłuchać lub zmienić listę w katalogu.";
    renderNowPlaying(list, snapshots, state.station?.id, onSelect);
  };
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    sharedSnapshots.setDemand("discovery", []);
  };
  const poll = async () => {
    if (!active || document.hidden) return;
    sharedSnapshots.setDemand("discovery", getEnabledStations());
    await sharedSnapshots.refresh();
  };
  const switchMode = (now: boolean) => {
    if (active === now) return;
    active = now;
    cancelStationLayoutTransition();
    discoveryLayout.cancel();
    stationsTab.setAttribute("aria-selected", String(!now));
    nowTab.setAttribute("aria-selected", String(now));
    stationsTab.classList.toggle("active", !now);
    nowTab.classList.toggle("active", now);
    stationsTab.tabIndex = now ? -1 : 0;
    nowTab.tabIndex = now ? 0 : -1;
    stop();
    if (now) {
      render();
      const rapidReentry = Date.now() - lastActivationAt < 1000;
      lastActivationAt = Date.now();
      if (rapidReentry) timer = setTimeout(() => void poll(), 250);
      else void poll();
    }
    transition.switchTo(now ? panel : els.stationListContainer, now ? 1 : -1);
  };
  const tabs = [stationsTab, nowTab];
  tabs.forEach((tab, index) => {
    tab.onclick = () => switchMode(index === 1);
  });
  bindTabKeys(tabs);
  document.getElementById("open-catalog-btn")?.addEventListener("click", openCatalogModal);
  document.getElementById("discovery-catalog")?.addEventListener("click", openCatalogModal);
  document.getElementById("discovery-back")?.addEventListener("click", () => {
    switchMode(false);
    stationsTab.focus();
  });
  const viewButtons = Array.from(view.querySelectorAll<HTMLButtonElement>(".btn-view-toggle"));
  const updateView = () => {
    const play = active && lastViewMode !== state.viewMode ? discoveryLayout.capture() : null;
    lastViewMode = state.viewMode;
    view.dataset.view = state.viewMode;
    els.stationListContainer.classList.toggle("is-grid-view", state.viewMode === "grid");
    panel.classList.toggle("is-grid-view", state.viewMode === "grid");
    viewButtons.forEach((button) => {
      const selected = button.dataset.view === state.viewMode;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    play?.();
  };
  viewButtons.forEach((button, index) => {
    button.innerHTML = button.dataset.view === "list" ? ICONS.viewList : ICONS.viewGrid;
    button.onclick = () => {
      state.viewMode = button.dataset.view === "grid" ? "grid" : "list";
      setStoredString(STORAGE_KEYS.VIEW_MODE, state.viewMode);
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
    cancelStationLayoutTransition();
    discoveryLayout.cancel();
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
  const unsubscribeSnapshots = sharedSnapshots.subscribe(render);
  update();
  return () => {
    active = false;
    transition.cancel();
    cancelStationLayoutTransition();
    discoveryLayout.cancel();
    stop();
    unsubscribe();
    unsubscribeSnapshots();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", stop);
    window.removeEventListener("pageshow", visibility);
  };
}
