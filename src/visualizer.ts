import { VU_COUNT } from "./consts.js";
import { radioAudio, state } from "./state.js";
import { els } from "./ui.js";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let animId: number | null = null;
let isConnected = false;
let corsFailed = false;

function initAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {
        // ignore autoplay policy restrictions
      });
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
    audioCtx.resume().catch(() => {
      // ignore autoplay policy restrictions
    });
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

let currentVuLevels: number[] = new Array(VU_COUNT).fill(3);
let peakTracker = 180;

function resetVisuals() {
  currentVuLevels = new Array(VU_COUNT).fill(3);
  peakTracker = 180;

  const vuSegs = els.vuStrip ? els.vuStrip.querySelectorAll(".vu-seg") : [];
  vuSegs.forEach((seg) => {
    (seg as HTMLElement).style.height = "6px";
    seg.classList.remove("on");
  });
}

function updateFrame() {
  if (!state.playing) {
    resetVisuals();
    return;
  }

  const vuSegs = els.vuStrip ? els.vuStrip.querySelectorAll(".vu-seg") : [];

  let useRealData = isConnected && !corsFailed && !state.muted;

  if (useRealData && analyser) {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let maxBinVal = 0;
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i];
      if (v !== undefined) {
        sum += v;
        if (v > maxBinVal) maxBinVal = v;
      }
    }

    if (sum > 0) {
      peakTracker = Math.max(120, Math.max(peakTracker * 0.96, maxBinVal));

      vuSegs.forEach((seg, idx) => {
        const progress = idx / (VU_COUNT - 1);
        const binIndex = Math.min(46, Math.max(2, Math.floor(progress ** 1.15 * 44) + 2));

        const bandVariation = 1 + Math.sin(idx * 1.8 + binIndex) * 0.1;
        const hfBoost = 1 + progress * 0.35;
        const rawVal = (dataArray[binIndex] || 0) * hfBoost * bandVariation;

        const norm = Math.min(1, rawVal / peakTracker);
        const power = norm ** 1.4;
        const targetH = Math.max(3, Math.round(power * 24));

        const curVu = currentVuLevels[idx] ?? 0;
        if (targetH > curVu) {
          currentVuLevels[idx] = curVu * 0.25 + targetH * 0.75;
        } else {
          currentVuLevels[idx] = curVu * 0.75 + targetH * 0.25;
        }

        const renderH = Math.round(currentVuLevels[idx] ?? 0);
        (seg as HTMLElement).style.height = `${renderH}px`;
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

      vuSegs.forEach((seg, idx) => {
        const speed = 3.6 + (idx % 6) * 0.55;
        const phase = idx * 0.5;
        const wave = ((Math.sin(now * speed + phase) + Math.cos(now * 2.7 - idx * 0.4) + 2) / 4) ** 1.5;
        const targetH = Math.max(3, Math.round(wave * 24 * volFactor));

        const curVu = currentVuLevels[idx] ?? 0;
        if (targetH > curVu) {
          currentVuLevels[idx] = curVu * 0.3 + targetH * 0.7;
        } else {
          currentVuLevels[idx] = curVu * 0.75 + targetH * 0.25;
        }
        const renderH = Math.round(currentVuLevels[idx] ?? 0);
        (seg as HTMLElement).style.height = `${renderH}px`;
        seg.classList.toggle("on", renderH > 4);
      });
    }
  }

  animId = requestAnimationFrame(updateFrame);
}
