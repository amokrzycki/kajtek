import { ALL_STATIONS, VU_COUNT } from "./data.js";
import { ICONS } from "./icons.js";
import { state } from "./state.js";
import { startVisualizer, stopVisualizer } from "./visualizer.js";

export const els = {
  darkToggle: document.getElementById("dark-toggle"),
  vuStrip: document.getElementById("vu-strip"),
  reelLeft: document.getElementById("reel-left"),
  reelRight: document.getElementById("reel-right"),
  npFreq: document.getElementById("np-freq"),
  npLiveDot: document.getElementById("np-live-dot"),
  npStation: document.getElementById("np-station"),
  npTrackWrap: document.getElementById("np-track"),
  npArtist: document.getElementById("np-artist"),
  npTitle: document.getElementById("np-title"),
  equalizer: document.getElementById("equalizer"),
  playBtn: document.getElementById("play-btn"),
  historyToggleBtn: document.getElementById("history-toggle-btn"),
  historyArrow: document.getElementById("history-arrow"),
  historyPanel: document.getElementById("history-panel"),
  historyEmpty: document.getElementById("history-empty"),
  historyList: document.getElementById("history-list"),
  muteBtn: document.getElementById("mute-btn"),
  volSlider: document.getElementById("vol-slider"),
  volVal: document.getElementById("vol-val"),
  sleepKeys: document.querySelectorAll(".sleep-key"),
  sleepCount: document.getElementById("sleep-count"),
  stationListContainer: document.getElementById("station-list-container"),
};

export function initVU() {
  els.vuStrip.innerHTML = "";
  for (let i = 0; i < VU_COUNT; i++) {
    const seg = document.createElement("div");
    seg.className = "vu-seg";
    els.vuStrip.appendChild(seg);
  }
}

export function renderStationList(onSelect, onToggleFav) {
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
            <div class="sc-name">${s.name}</div>
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
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter") onSelect(s);
        });
        card.querySelector(".sc-star").addEventListener("click", (e) => {
          e.stopPropagation();
          onToggleFav(s.id);
        });

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

export function updateNowPlayingTrack(track) {
  if (!state.station) return;
  if (!track) {
    els.npTrackWrap.style.display = "none";
    return;
  }
  els.npTrackWrap.style.display = "block";
  els.npArtist.textContent = track.artist;
  els.npTitle.textContent = track.title;
  els.npTitle.classList.remove("fade-in");
  void els.npTitle.offsetWidth;
  els.npTitle.classList.add("fade-in");
}

export function updateHistoryUI() {
  if (state.history.length === 0) {
    els.historyEmpty.style.display = "block";
    els.historyList.innerHTML = "";
  } else {
    els.historyEmpty.style.display = "none";
    els.historyList.innerHTML = state.history
      .slice(0, 3)
      .map(
        (t) => `
      <div class="history-item">
        <span class="history-dot"></span>
        ${t.start ? `<span class="history-time" style="font-family: var(--k-font-mono); font-size: 0.65rem; color: var(--k-accent); opacity: 0.85;">${t.start}</span><span class="history-sep">·</span>` : ""}
        <span class="history-artist">${t.artist}</span>
        <span class="history-sep">·</span>
        <span class="history-title">${t.title}</span>
      </div>
    `,
      )
      .join("");
  }
}

export function updateUI(currentTrack, onSelect, onToggleFav) {
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
  els.volSlider.value = dispVol;
  els.volSlider.style.setProperty("--vol", `${dispVol}%`);
  els.volVal.textContent = state.muted ? "—" : state.vol;

  updateSleepUI();

  els.historyToggleBtn.setAttribute("aria-expanded", state.showHistory);
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
