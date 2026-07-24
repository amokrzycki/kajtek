import { ALL_STATIONS, type Station, VU_COUNT } from "./data.js";
import { ICONS } from "./icons.js";
import { state, type TrackInfo } from "./state.js";
import { startVisualizer, stopVisualizer } from "./visualizer.js";

export const els = {
  darkToggle: document.getElementById("dark-toggle") as HTMLButtonElement,
  vuStrip: document.getElementById("vu-strip") as HTMLDivElement,
  reelLeft: document.getElementById("reel-left") as HTMLDivElement,
  reelRight: document.getElementById("reel-right") as HTMLDivElement,
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
  muteBtn: document.getElementById("mute-btn") as HTMLButtonElement,
  volSlider: document.getElementById("vol-slider") as HTMLInputElement,
  volVal: document.getElementById("vol-val") as HTMLSpanElement,
  sleepKeys: document.querySelectorAll<HTMLButtonElement>(".sleep-key"),
  sleepCount: document.getElementById("sleep-count") as HTMLDivElement,
  stationListContainer: document.getElementById("station-list-container") as HTMLElement,
};

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

export function updateNowPlayingTrack(track: TrackInfo | null) {
  if (!state.station) return;
  if (!track) {
    els.npTrackWrap.style.display = "none";
    return;
  }
  els.npTrackWrap.style.display = "block";
  if (els.npArtist.textContent === track.artist && els.npTitle.textContent === track.title) {
    return;
  }
  els.npArtist.textContent = track.artist;
  els.npTitle.textContent = track.title;
  els.npTitle.classList.remove("fade-in");
  void els.npTitle.offsetWidth;
  els.npTitle.classList.add("fade-in");
}

export function updateHistoryUI() {
  if (!state.history || state.history.length === 0) {
    els.historyEmpty.style.display = "block";
    els.historyList.innerHTML = "";
    return;
  }

  els.historyEmpty.style.display = "none";
  els.historyList.innerHTML = state.history
    .map((t) => {
      if (t.isBreak) {
        return `
      <div class="history-item history-break">
        <span class="history-dot"></span>
        <span class="history-title">📻 ${t.label}</span>
      </div>
    `;
      }

      const isUpcoming = (t.order ?? 0) > 0;
      const isCurrent = t.order === 0;

      return `
      <div class="history-item${isCurrent ? " history-current" : ""}">
        <span class="history-dot"></span>
        ${t.start ? `<span class="history-time">${t.start}</span><span class="history-sep">·</span>` : ""}
        ${isUpcoming ? `<span class="history-badge upcoming">[ZARAZ]</span>` : ""}
        ${isCurrent ? `<span class="history-badge current">[TERAZ]</span>` : ""}
        <span class="history-artist">${t.artist}</span>
        <span class="history-sep">·</span>
        <span class="history-title">${t.title}</span>
      </div>
    `;
    })
    .join("");
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
    els.npFreq.textContent = `${state.station.freq} FM`;
    els.npStation.textContent = state.station.name;
    els.npStation.classList.remove("empty");
    els.npLiveDot.classList.toggle("on", state.playing);
    if (currentTrack) {
      updateNowPlayingTrack(currentTrack);
    } else {
      els.npTrackWrap.style.display = "none";
    }
  } else {
    els.npFreq.textContent = "— FM";
    els.npStation.textContent = "wybierz stację";
    els.npStation.classList.add("empty");
    els.npTrackWrap.style.display = "none";
    els.npLiveDot.classList.remove("on");
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
