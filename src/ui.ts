import { ALL_STATIONS, type Station, VU_COUNT } from "./data.js";
import { ICONS } from "./icons.js";
import { isIOS } from "./platform.js";
import { state, type TrackInfo } from "./state.js";
import { startVisualizer, stopVisualizer } from "./visualizer.js";

const ART_V: Record<string, string> = {
  rmf: "0",
  "rmf-maxxx": "1",
  "rmf-classic": "2",
};

export const els = {
  darkToggle: document.getElementById("dark-toggle") as HTMLButtonElement,
  vuStrip: document.getElementById("vu-strip") as HTMLDivElement,
  reelLeft: document.getElementById("reel-left") as HTMLDivElement,
  reelRight: document.getElementById("reel-right") as HTMLDivElement,
  albumArt: document.getElementById("album-art") as HTMLDivElement,
  npFreq: document.getElementById("np-freq") as HTMLSpanElement,
  npLiveDot: document.getElementById("np-live-dot") as HTMLSpanElement,
  npStation: document.getElementById("np-station") as HTMLDivElement,
  npTrackWrap: document.getElementById("np-track") as HTMLDivElement,
  npArtist: document.getElementById("np-artist") as HTMLDivElement,
  npTitle: document.getElementById("np-title") as HTMLSpanElement,
  equalizer: document.getElementById("equalizer") as HTMLDivElement,
  playBtn: document.getElementById("play-btn") as HTMLButtonElement,
  historyToggleBtn: document.getElementById("history-toggle-btn") as HTMLButtonElement,
  historyArrow: document.getElementById("history-arrow") as HTMLSpanElement,
  historyPanel: document.getElementById("history-panel") as HTMLDivElement,
  historyEmpty: document.getElementById("history-empty") as HTMLDivElement,
  historyList: document.getElementById("history-list") as HTMLDivElement,
  volumePanel: document.getElementById("volume-panel") as HTMLDivElement,
  muteBtn: document.getElementById("mute-btn") as HTMLButtonElement,
  volSlider: document.getElementById("vol-slider") as HTMLInputElement,
  volVal: document.getElementById("vol-val") as HTMLSpanElement,
  sleepKeys: document.querySelectorAll<HTMLButtonElement>(".sleep-key"),
  sleepCount: document.getElementById("sleep-count") as HTMLDivElement,
  stationListContainer: document.getElementById("station-list-container") as HTMLElement,
};

export function initVolumeControlUI() {
  if (!isIOS()) return;
  // Hide panel on iOS; volume slider ignored, hardware controls take over.
  state.vol = 100;
  els.volumePanel.classList.add("hidden");
}

export function initVU() {
  els.vuStrip.innerHTML = "";
  for (let i = 0; i < VU_COUNT; i++) {
    const seg = document.createElement("div");
    seg.className = "vu-seg";
    els.vuStrip.appendChild(seg);
  }
}

export function renderStationList(onSelect: (s: Station) => void, onToggleFav: (id: string) => void) {
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

export function updateSleepUI() {
  if (state.sleepMin !== null && state.sleepSec !== null) {
    const m = Math.floor(state.sleepSec / 60);
    const s = String(state.sleepSec % 60).padStart(2, "0");
    els.sleepCount.style.display = "block";
    els.sleepCount.innerHTML = `wyłącza się za <strong>${m}:${s}</strong>`;
  } else {
    els.sleepCount.style.display = "none";
  }
  els.sleepKeys.forEach((btn) => {
    btn.classList.toggle("active", state.sleepMin === Number(btn.getAttribute("data-min")));
  });
}

export function triggerFade(el: HTMLElement, newText: string) {
  if (el.textContent === newText) return;
  el.textContent = newText;
  el.classList.remove("fade-in");
  void el.offsetWidth;
  el.classList.add("fade-in");
}

let slideTimer: number | undefined;

export function triggerHistorySlideIn() {
  if (slideTimer) window.clearTimeout(slideTimer);
  els.historyPanel.classList.remove("slide-in");
  void els.historyPanel.offsetWidth;
  els.historyPanel.classList.add("slide-in");
  slideTimer = window.setTimeout(() => {
    els.historyPanel.classList.remove("slide-in");
  }, 700);
}

export function updateNowPlayingTrack(track: TrackInfo | null) {
  if (!state.station) return;

  if (!track && state.station.playlistUrl) {
    els.npTrackWrap.classList.remove("visible");
    return;
  }

  els.npTrackWrap.classList.add("visible");

  const artistText = track?.artist || state.station.name;
  const titleText = track?.title || "Audycja na żywo";

  triggerFade(els.npArtist, artistText);
  triggerFade(els.npTitle, titleText);
}

export function updateAlbumArt(coverUrl: string | undefined) {
  const art = els.albumArt;
  let img = art.querySelector<HTMLImageElement>(".album-art-img");
  const initial = art.querySelector<HTMLElement>(".album-art-initial");
  const label = art.querySelector<HTMLElement>(".album-art-label");

  if (coverUrl) {
    if (!img) {
      img = document.createElement("img");
      img.className = "album-art-img";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      art.prepend(img);
    }
    if (img.dataset.src !== coverUrl) {
      img.dataset.src = coverUrl;
      img.style.opacity = "0";
      img.onload = () => {
        if (!img) return;
        img.style.opacity = "1";
      };
      img.onerror = () => {
        if (!img) return;
        img.style.display = "none";
      };
      img.style.display = "";
      img.src = coverUrl;
    }
    if (initial) initial.style.opacity = "0";
    if (label) label.style.opacity = "0";
  } else {
    if (img) {
      img.style.display = "none";
      img.src = "";
      img.dataset.src = "";
    }
    if (initial) initial.style.opacity = "";
    if (label) label.style.opacity = "";
  }
}

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function getTrackKey(t: TrackInfo): string {
  return t.timestamp ? `ts_${t.timestamp}` : `key_${t.start || ""}_${t.artist}_${t.title}_${t.label || ""}`;
}

function getTrackItemInnerHTML(t: TrackInfo, isCurrent: boolean, isNext: boolean): string {
  if (t.isBreak) {
    const breakDur = t.gapSec
      ? t.gapSec >= 60
        ? `${Math.floor(t.gapSec / 60)}m${t.gapSec % 60 ? ` ${t.gapSec % 60}s` : ""}`
        : `${t.gapSec}s`
      : t.gapMin
        ? `${t.gapMin} min`
        : "";
    return `
      <span class="pl-time">${t.start || ""}</span>
      <span class="pl-dot"></span>
      <span class="pl-break-label">
        <span class="pl-tape-icon">${ICONS.tape}</span>
        ${t.label}
      </span>
      <span class="pl-dur">${breakDur}</span>
    `;
  }

  const durStr = formatDuration(t.length);
  const hasTag = isCurrent || isNext;

  return `
    <span class="pl-time">${t.start || ""}</span>
    <span class="pl-dot"></span>
    <div class="pl-track">
      ${
        hasTag
          ? `<div class="pl-tags"><span class="pl-tag ${isCurrent ? "tag-current" : "tag-next"}">${isCurrent ? "TERAZ" : "ZARAZ"}</span></div>`
          : ""
      }
      <div class="pl-line">
        <span class="pl-artist">${t.artist}</span>
        <span class="pl-sep">·</span>
        <span class="pl-title">${t.title}</span>
      </div>
    </div>
    <span class="pl-dur">${durStr}</span>
  `;
}

export function updateHistoryUI(animateSlideIn = false) {
  const isPanelOpen = state.showHistory && els.historyPanel.classList.contains("open");
  const prevHeight = isPanelOpen ? els.historyList.getBoundingClientRect().height : 0;

  if (!state.history || state.history.length === 0) {
    if (els.historyList.dataset.signature !== "empty") {
      els.historyEmpty.style.display = "block";
      els.historyList.innerHTML = "";
      els.historyList.dataset.signature = "empty";
    }
    els.historyList.classList.remove("is-loading");
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const filtered = state.history.filter((t) => {
    const isPast = t.endTimestamp ? nowSec >= t.endTimestamp : (t.order ?? 0) < 0;
    if (t.isBreak && isPast && t.gapSec && t.gapSec < 150) {
      return false;
    }
    return true;
  });

  const activeIdx = filtered.findIndex((t) => {
    if (t.timestamp && t.endTimestamp) {
      return nowSec >= t.timestamp && nowSec < t.endTimestamp;
    }
    if (t.timestamp && t.length) {
      return nowSec >= t.timestamp && nowSec < t.timestamp + t.length;
    }
    return false;
  });

  const renderedItems = filtered.map((t, idx) => {
    let isCurrent = false;
    let isNext = false;
    let isUpcoming = false;
    let isPast = false;

    if (activeIdx !== -1) {
      if (idx === activeIdx) {
        isCurrent = true;
      } else if (idx < activeIdx) {
        isPast = true;
      } else if (idx === activeIdx + 1) {
        isNext = true;
      } else {
        isUpcoming = true;
      }
    } else {
      if (t.timestamp && t.endTimestamp) {
        if (nowSec >= t.endTimestamp) isPast = true;
        else if (nowSec < t.timestamp) isUpcoming = true;
      } else if (t.order !== undefined) {
        if (t.order < 0) {
          isPast = true;
        } else if (t.order === 0) {
          if (state.liveTrack?.isLiveBreak || (t.endTimestamp && nowSec >= t.endTimestamp)) {
            isPast = true;
          } else {
            isCurrent = true;
          }
        } else if (t.order === 1) {
          isNext = true;
        } else {
          isUpcoming = true;
        }
      }
    }

    return { t, idx, isCurrent, isNext, isUpcoming, isPast };
  });

  const signature = JSON.stringify(
    renderedItems.map(({ t, isCurrent, isNext, isPast }) => [
      t.artist,
      t.title,
      t.start,
      t.isBreak,
      t.label,
      isCurrent,
      isNext,
      isPast,
    ]),
  );

  if (els.historyList.dataset.signature === signature) {
    return;
  }
  els.historyList.dataset.signature = signature;

  const targetItems = renderedItems.map((item) => {
    let statusCls = "is-past";
    if (item.isCurrent) statusCls = "is-current";
    else if (item.isNext) statusCls = "is-next";
    else if (item.isUpcoming) statusCls = "is-upcoming";
    else if (item.isPast) statusCls = "is-past";

    const key = getTrackKey(item.t);
    return { ...item, statusCls, key };
  });

  const reconcile = () => {
    els.historyEmpty.style.display = "none";

    const targetKeys = new Set(targetItems.map((item) => item.key));
    const currentChildren = Array.from(els.historyList.children) as HTMLElement[];

    // Remove old items
    currentChildren.forEach((child) => {
      const key = child.getAttribute("data-key");
      if (!key || !targetKeys.has(key)) {
        child.remove();
      }
    });

    // Update or append items
    targetItems.forEach((item, idx) => {
      let child = els.historyList.querySelector(`[data-key="${CSS.escape(item.key)}"]`) as HTMLElement | null;
      const vtName = `vt-${item.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      const delayStr = `${idx * 35}ms`;
      if (!child) {
        child = document.createElement("div");
        child.setAttribute("data-key", item.key);
        child.style.viewTransitionName = vtName;
        child.style.animationDelay = delayStr;
        child.className = `pl-item ${item.statusCls}${item.t.isBreak ? " is-break" : ""}`;
        child.innerHTML = getTrackItemInnerHTML(item.t, item.isCurrent, item.isNext);

        const currentNodes = Array.from(els.historyList.children);
        if (idx < currentNodes.length && currentNodes[idx]) {
          els.historyList.insertBefore(child, currentNodes[idx]);
        } else {
          els.historyList.appendChild(child);
        }
      } else {
        child.style.viewTransitionName = vtName;
        child.style.animationDelay = delayStr;

        const newClass = `pl-item ${item.statusCls}${item.t.isBreak ? " is-break" : ""}`;
        if (child.className !== newClass) {
          child.className = newClass;
        }

        const newInner = getTrackItemInnerHTML(item.t, item.isCurrent, item.isNext);
        if (child.innerHTML !== newInner) {
          child.innerHTML = newInner;
        }

        const currentNodes = Array.from(els.historyList.children);
        if (currentNodes[idx] !== child) {
          if (idx < currentNodes.length && currentNodes[idx]) {
            els.historyList.insertBefore(child, currentNodes[idx]);
          } else {
            els.historyList.appendChild(child);
          }
        }
      }
    });
  };

  const doc = document as unknown as {
    startViewTransition?: (cb: () => void) => void;
  };

  if (isPanelOpen && typeof doc.startViewTransition === "function" && els.historyList.children.length > 0) {
    doc.startViewTransition(reconcile);
  } else {
    reconcile();
  }

  els.historyList.classList.remove("is-loading");

  if (isPanelOpen && prevHeight > 0) {
    const newHeight = els.historyList.getBoundingClientRect().height;
    if (newHeight > 0 && Math.abs(prevHeight - newHeight) > 2) {
      els.historyList.style.height = `${prevHeight}px`;
      els.historyList.style.overflow = "hidden";
      els.historyList.style.transition = "height 320ms cubic-bezier(0.2, 0, 0, 1)";
      requestAnimationFrame(() => {
        els.historyList.style.height = `${newHeight}px`;
      });
      setTimeout(() => {
        els.historyList.style.height = "";
        els.historyList.style.overflow = "";
        els.historyList.style.transition = "";
      }, 340);
    }
  }

  if (animateSlideIn && state.showHistory) {
    triggerHistorySlideIn();
  }
}

export function updateUI(
  currentTrack: TrackInfo | null,
  onSelect: (s: Station) => void,
  onToggleFav: (id: string) => void,
) {
  applyTheme();

  els.vuStrip.classList.toggle("active", state.playing);
  els.reelLeft.classList.toggle("spinning", state.playing);
  els.reelRight.classList.toggle("spinning", state.playing);
  els.equalizer.classList.toggle("active", state.playing);

  if (state.playing) {
    startVisualizer();
  } else {
    stopVisualizer();
  }

  els.playBtn.disabled = !state.station;
  els.playBtn.classList.toggle("playing", state.playing);
  els.playBtn.innerHTML = state.playing ? ICONS.pause : ICONS.play;

  if (state.station) {
    const freqText = `${state.station.freq} FM`;
    triggerFade(els.npFreq, freqText);
    if (els.npStation.textContent !== state.station.name) {
      els.npStation.classList.remove("empty");
    }
    triggerFade(els.npStation, state.station.name);
    els.npLiveDot.classList.toggle("on", state.playing);
    updateNowPlayingTrack(currentTrack);
    // album art
    const v = ART_V[state.station.id] ?? "0";
    els.albumArt.dataset.v = v;
    const initial = els.albumArt.querySelector(".album-art-initial");
    const label = els.albumArt.querySelector(".album-art-label");
    if (initial) initial.textContent = state.station.name.charAt(0);
    if (label) label.textContent = state.station.name;
    updateAlbumArt(currentTrack?.coverUrl);
  } else {
    els.npFreq.textContent = "— FM";
    els.npStation.textContent = "wybierz stację";
    els.npStation.classList.add("empty");
    els.npTrackWrap.classList.remove("visible");
    els.npLiveDot.classList.remove("on");
    // album art reset
    els.albumArt.dataset.v = "0";
    const initial = els.albumArt.querySelector(".album-art-initial");
    const label = els.albumArt.querySelector(".album-art-label");
    if (initial) initial.textContent = "?";
    if (label) label.textContent = "— —";
  }

  els.muteBtn.classList.toggle("muted", state.muted);
  els.muteBtn.innerHTML = ICONS.vol(state.muted, state.vol);
  const dispVol = state.muted ? 0 : state.vol;
  els.volSlider.value = String(dispVol);
  els.volSlider.style.setProperty("--vol", `${dispVol}%`);
  els.volVal.textContent = state.muted ? "—" : String(state.vol);

  updateSleepUI();

  els.historyToggleBtn.setAttribute("aria-expanded", String(state.showHistory));
  els.historyArrow.textContent = state.showHistory ? "▲" : "▼";
  els.historyPanel.classList.toggle("open", state.showHistory);
  updateHistoryUI();

  renderStationList(onSelect, onToggleFav);
}

function applyTheme() {
  document.documentElement.classList.toggle("dark", state.dark);
  els.darkToggle.classList.toggle("on", state.dark);
  localStorage.setItem("kajtek_theme", state.dark ? "dark" : "light");
}
