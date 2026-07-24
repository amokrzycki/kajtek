import { VU_COUNT } from "./data.js";
import { radioAudio, state } from "./state.js";
import { els } from "./ui.js";

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let animId = null;
let isConnected = false;
let corsFailed = false;

function initAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return;
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    audioCtx = new AudioContextClass();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;

    sourceNode = audioCtx.createMediaElementSource(radioAudio);
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    isConnected = true;
  } catch (_e) {
    corsFailed = true;
  }
}

export function startVisualizer() {
  initAudioContext();
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  if (animId) cancelAnimationFrame(animId);
  updateFrame();
}

export function stopVisualizer() {
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
  resetVisuals();
}

let currentEqLevels = [4, 4, 4, 4, 4];
let currentVuLevels = new Array(VU_COUNT).fill(3);
// ponytail: simplified AGC using peakTracker exponential decay instead of full RMS sliding window (ceiling: extreme volume transients; upgrade: 50ms windowed RMS)
let peakTracker = 180;

function resetVisuals() {
  currentEqLevels = [4, 4, 4, 4, 4];
  currentVuLevels = new Array(VU_COUNT).fill(3);
  peakTracker = 180;

  const eqBars = els.equalizer.querySelectorAll(".eq-bar");
  eqBars.forEach((bar) => {
    bar.style.height = "4px";
  });

  const vuSegs = els.vuStrip.querySelectorAll(".vu-seg");
  vuSegs.forEach((seg) => {
    seg.style.height = "6px";
    seg.classList.remove("on");
  });
}

function updateFrame() {
  if (!state.playing) {
    resetVisuals();
    return;
  }

  const eqBars = els.equalizer.querySelectorAll(".eq-bar");
  const vuSegs = els.vuStrip.querySelectorAll(".vu-seg");

  let useRealData = isConnected && !corsFailed && !state.muted;

  if (useRealData && analyser) {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let maxBinVal = 0;
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i];
      sum += v;
      if (v > maxBinVal) maxBinVal = v;
    }

    if (sum > 0) {
      peakTracker = Math.max(120, Math.max(peakTracker * 0.96, maxBinVal));

      const binIndices = [2, 6, 14, 24, 36];
      const minH = 4;
      const maxH = 30;

      eqBars.forEach((bar, idx) => {
        const binIndex = binIndices[idx] || idx * 6;
        const val = dataArray[binIndex] || 0;
        const norm = Math.min(1, val / peakTracker);
        const power = norm ** 1.35;
        const targetH = Math.max(minH, Math.round(power * maxH));

        if (targetH > currentEqLevels[idx]) {
          currentEqLevels[idx] = currentEqLevels[idx] * 0.3 + targetH * 0.7;
        } else {
          currentEqLevels[idx] = currentEqLevels[idx] * 0.72 + targetH * 0.28;
        }

        bar.style.height = `${Math.round(currentEqLevels[idx])}px`;
      });

      vuSegs.forEach((seg, idx) => {
        const progress = idx / (VU_COUNT - 1);
        const binIndex = Math.min(46, Math.max(2, Math.floor(progress ** 1.15 * 44) + 2));

        const bandVariation = 1 + Math.sin(idx * 1.8 + binIndex) * 0.1;
        const hfBoost = 1 + progress * 0.35;
        const rawVal = (dataArray[binIndex] || 0) * hfBoost * bandVariation;

        const norm = Math.min(1, rawVal / peakTracker);
        const power = norm ** 1.4;
        const targetH = Math.max(3, Math.round(power * 24));

        if (targetH > currentVuLevels[idx]) {
          currentVuLevels[idx] = currentVuLevels[idx] * 0.25 + targetH * 0.75;
        } else {
          currentVuLevels[idx] = currentVuLevels[idx] * 0.75 + targetH * 0.25;
        }

        const renderH = Math.round(currentVuLevels[idx]);
        seg.style.height = `${renderH}px`;
        seg.classList.toggle("on", renderH > 4);
      });
    } else {
      useRealData = false;
    }
  }

  if (!useRealData) {
    const now = Date.now() / 1000;
    const rawVol = state.muted ? 0 : state.vol / 100;

    if (rawVol === 0) {
      resetVisuals();
    } else {
      const volFactor = 0.4 + rawVol * 0.6;
      const minH = 4;
      const maxH = 30;

      eqBars.forEach((bar, idx) => {
        const speed = [3.2, 4.5, 3.8, 5.1, 4.1][idx];
        const phase = [0, 1.2, 2.4, 3.6, 4.8][idx];
        const val = ((Math.sin(now * speed + phase) + 1) / 2) ** 1.6;
        const targetH = Math.max(minH, Math.round(val * maxH * volFactor));

        currentEqLevels[idx] = currentEqLevels[idx] * 0.7 + targetH * 0.3;
        bar.style.height = `${Math.round(currentEqLevels[idx])}px`;
      });

      vuSegs.forEach((seg, idx) => {
        const speed = 3.6 + (idx % 6) * 0.55;
        const phase = idx * 0.5;
        const wave = ((Math.sin(now * speed + phase) + Math.cos(now * 2.7 - idx * 0.4) + 2) / 4) ** 1.5;
        const targetH = Math.max(3, Math.round(wave * 24 * volFactor));

        if (targetH > currentVuLevels[idx]) {
          currentVuLevels[idx] = currentVuLevels[idx] * 0.3 + targetH * 0.7;
        } else {
          currentVuLevels[idx] = currentVuLevels[idx] * 0.75 + targetH * 0.25;
        }
        const renderH = Math.round(currentVuLevels[idx]);
        seg.style.height = `${renderH}px`;
        seg.classList.toggle("on", renderH > 4);
      });
    }
  }

  animId = requestAnimationFrame(updateFrame);
}
