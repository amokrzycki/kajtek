import { setStationFavorite } from "./catalog.js";
import { STORAGE_KEYS } from "./consts.js";
import { ICONS } from "./icons.js";
import { intervals, notifyState, radioAudio, state } from "./state.js";
import { els, renderVolLadder, updateMuteAccessibility, updateSleepUI } from "./ui.js";
import { isIOS, setStoredJSON } from "./utils.js";

const SLEEP_FADE_MS = 8000;

let volAnimFrame: number | null = null;
let sleepFade: ReturnType<typeof setInterval> | null = null;

function stopSleepFade(): void {
  if (sleepFade !== null) clearInterval(sleepFade);
  sleepFade = null;
}

// Interval, not rAF: a locked phone throttles rAF to zero, which is exactly when a sleep timer fires.
function startSleepFade(): void {
  if (isIOS() || state.muted || sleepFade !== null) return;
  const from = radioAudio.volume;
  const start = Date.now();
  sleepFade = setInterval(() => {
    const p = Math.min((Date.now() - start) / SLEEP_FADE_MS, 1);
    radioAudio.volume = from * (1 - p) ** 2;
  }, 100);
}

export function isVolAnimating(): boolean {
  return volAnimFrame !== null;
}

export function cancelVolAnim(): void {
  stopSleepFade();
  if (volAnimFrame !== null) {
    cancelAnimationFrame(volAnimFrame);
    volAnimFrame = null;
  }
}

export function applyAudioVolume(): void {
  // iOS ignores HTMLMediaElement.volume (uses hardware buttons);
  radioAudio.muted = state.muted;
  radioAudio.volume = isIOS() ? 1 : (state.vol / 100) ** 2;
}

export function updateVolume(val: number): void {
  cancelVolAnim();
  state.vol = val;
  if (state.muted && val > 0) state.muted = false;
  applyAudioVolume();
  updateMuteAccessibility();
  setStoredJSON(STORAGE_KEYS.VOLUME, val);
  // update volume UI directly to avoid firing global notifyState & re-rendering station list on every slider frame
  if (els.volSlider) {
    els.volSlider.value = String(val);
    els.volSlider.style.setProperty("--vol", `${val}%`);
  }
  if (els.volVal) {
    els.volVal.textContent = state.muted ? "—" : String(val);
  }
  if (els.muteBtn) {
    els.muteBtn.classList.toggle("muted", state.muted);
    els.muteBtn.innerHTML = ICONS.vol(state.muted, val);
  }
  renderVolLadder(val);
}

export function toggleMute(): void {
  cancelVolAnim();
  const targetMuted = !state.muted;
  state.muted = targetMuted;
  updateMuteAccessibility();

  const startVal = Number(els.volSlider.value);
  const endVal = targetMuted ? 0 : state.vol;
  const startTime = performance.now();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduceMotion ? 1 : 240; // ms

  radioAudio.muted = false;

  function step(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - (1 - progress) ** 3;
    const currentVal = startVal + (endVal - startVal) * ease;

    if (!isIOS()) {
      radioAudio.volume = (currentVal / 100) ** 2;
    }

    if (els.volSlider) {
      els.volSlider.value = String(Math.round(currentVal));
      els.volSlider.style.setProperty("--vol", `${currentVal.toFixed(1)}%`);
    }
    if (els.volVal) {
      els.volVal.textContent = targetMuted && progress > 0.75 ? "—" : String(Math.round(currentVal));
    }
    if (els.muteBtn) {
      els.muteBtn.classList.toggle("muted", targetMuted);
      els.muteBtn.innerHTML = ICONS.vol(targetMuted, Math.round(currentVal));
    }
    renderVolLadder(currentVal);

    if (progress < 1) {
      volAnimFrame = requestAnimationFrame(step);
    } else {
      volAnimFrame = null;
      applyAudioVolume();
      notifyState();
    }
  }

  volAnimFrame = requestAnimationFrame(step);
}

export function setSleepTimer(minutes: number): void {
  if (state.sleepMin === minutes) {
    cancelSleepTimer();
    return;
  }

  state.sleepMin = minutes;
  state.sleepSec = minutes * 60;
  if (intervals.sleep) clearInterval(intervals.sleep);

  intervals.sleep = setInterval(() => {
    if (state.sleepSec !== null && state.sleepSec <= 0) {
      state.playing = false;
      radioAudio.pause();
      cancelSleepTimer();
      notifyState();
    } else if (state.sleepSec !== null) {
      state.sleepSec--;
      if (state.sleepSec === SLEEP_FADE_MS / 1000 && state.playing) startSleepFade();
      updateSleepUI();
    }
  }, 1000);

  notifyState();
}

export function cancelSleepTimer(): void {
  if (sleepFade !== null) {
    stopSleepFade();
    applyAudioVolume();
  }
  state.sleepMin = null;
  state.sleepSec = null;
  if (intervals.sleep) clearInterval(intervals.sleep);
  intervals.sleep = null;
  notifyState();
}

export function setAdSkipEnabled(enabled: boolean): void {
  state.adSkipEnabled = enabled;
  setStoredJSON(STORAGE_KEYS.AD_SKIP_ENABLED, enabled);
  notifyState();
}

export function toggleFav(id: string): void {
  const isFav = state.favs.has(id);
  setStationFavorite(id, !isFav);
  notifyState();
}
