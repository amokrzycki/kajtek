import { radioAudio, setSleepInterval, sleepInterval, state } from "./state.js";
import { updateSleepUI } from "./ui.js";

export function applyAudioVolume() {
  const eff = state.muted ? 0 : state.vol / 100;
  radioAudio.volume = eff;
}

export function updateVolume(val, onUIUpdate) {
  state.vol = val;
  if (state.muted && val > 0) state.muted = false;
  applyAudioVolume();
  onUIUpdate();
}

export function toggleMute(onUIUpdate) {
  state.muted = !state.muted;
  applyAudioVolume();
  onUIUpdate();
}

export function setSleepTimer(minutes, onUIUpdate) {
  if (state.sleepMin === minutes) {
    cancelSleepTimer(onUIUpdate);
    return;
  }

  state.sleepMin = minutes;
  state.sleepSec = minutes * 60;
  if (sleepInterval) clearInterval(sleepInterval);

  setSleepInterval(
    setInterval(() => {
      if (state.sleepSec <= 0) {
        state.playing = false;
        radioAudio.pause();
        cancelSleepTimer(onUIUpdate);
        onUIUpdate();
      } else {
        state.sleepSec--;
        updateSleepUI();
      }
    }, 1000),
  );

  onUIUpdate();
}

export function cancelSleepTimer(onUIUpdate) {
  state.sleepMin = null;
  state.sleepSec = null;
  if (sleepInterval) clearInterval(sleepInterval);
  setSleepInterval(null);
  if (onUIUpdate) onUIUpdate();
}

export function toggleFav(id, onUIUpdate) {
  if (state.favs.has(id)) {
    state.favs.delete(id);
  } else {
    state.favs.add(id);
  }
  localStorage.setItem("kajtek_favs", JSON.stringify(Array.from(state.favs)));
  onUIUpdate();
}
