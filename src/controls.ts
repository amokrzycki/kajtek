import { STORAGE_KEYS } from "./consts.js";
import { notifyState, radioAudio, setSleepInterval, sleepInterval, state } from "./state.js";
import { updateSleepUI } from "./ui.js";
import { isIOS } from "./utils.js";

export function applyAudioVolume(): void {
  // iOS ignores HTMLMediaElement.volume (uses hardware buttons);
  radioAudio.muted = state.muted;
  radioAudio.volume = isIOS() ? 1 : state.vol / 100;
}

export function updateVolume(val: number): void {
  state.vol = val;
  if (state.muted && val > 0) state.muted = false;
  applyAudioVolume();
  notifyState();
}

export function toggleMute(): void {
  state.muted = !state.muted;
  applyAudioVolume();
  notifyState();
}

export function setSleepTimer(minutes: number): void {
  if (state.sleepMin === minutes) {
    cancelSleepTimer();
    return;
  }

  state.sleepMin = minutes;
  state.sleepSec = minutes * 60;
  if (sleepInterval) clearInterval(sleepInterval);

  setSleepInterval(
    setInterval(() => {
      if (state.sleepSec !== null && state.sleepSec <= 0) {
        state.playing = false;
        radioAudio.pause();
        cancelSleepTimer();
        notifyState();
      } else if (state.sleepSec !== null) {
        state.sleepSec--;
        updateSleepUI();
      }
    }, 1000),
  );

  notifyState();
}

export function cancelSleepTimer(): void {
  state.sleepMin = null;
  state.sleepSec = null;
  if (sleepInterval) clearInterval(sleepInterval);
  setSleepInterval(null);
  notifyState();
}

export function toggleFav(id: string): void {
  if (state.favs.has(id)) {
    state.favs.delete(id);
  } else {
    state.favs.add(id);
  }
  localStorage.setItem(STORAGE_KEYS.FAVS, JSON.stringify(Array.from(state.favs)));
  notifyState();
}
