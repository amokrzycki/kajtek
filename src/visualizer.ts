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

// Classic Winamp analyzer feel: chunky low-rate sampling, instant attack, gravity-accelerated fall.
const CELL_PX = 4; // must match the LED pitch baked into the .vu-fill background in player.css
const SAMPLE_INTERVAL_MS = 40; // ~25fps target refresh, not 60fps smoothness
const BAR_GRAVITY = 130; // cells / s^2
const PEAK_GRAVITY = 70; // cells / s^2 — peak dot falls slower than the bar itself
const PEAK_HOLD_MS = 300;

let cellCount = 10;
let targetCells: number[] = new Array(VU_COUNT).fill(0);
let currentCells: number[] = new Array(VU_COUNT).fill(0);
let fallVelocity: number[] = new Array(VU_COUNT).fill(0);
let peakCells: number[] = new Array(VU_COUNT).fill(0);
let peakVelocity: number[] = new Array(VU_COUNT).fill(0);
let peakHoldUntil: number[] = new Array(VU_COUNT).fill(0);
let peakTracker = 180;
let lastFrameTime = 0;
let lastSampleTime = 0;

function resetVisuals() {
  targetCells = new Array(VU_COUNT).fill(0);
  currentCells = new Array(VU_COUNT).fill(0);
  fallVelocity = new Array(VU_COUNT).fill(0);
  peakCells = new Array(VU_COUNT).fill(0);
  peakVelocity = new Array(VU_COUNT).fill(0);
  peakHoldUntil = new Array(VU_COUNT).fill(0);
  peakTracker = 180;
  lastFrameTime = 0;
  lastSampleTime = 0;

  const fills = els.vuStrip ? els.vuStrip.querySelectorAll<HTMLElement>(".vu-fill") : [];
  const caps = els.vuStrip ? els.vuStrip.querySelectorAll<HTMLElement>(".vu-cap") : [];
  fills.forEach((fill) => {
    fill.style.setProperty("--vu-level", "0%");
  });
  caps.forEach((cap) => {
    cap.style.transform = "translateY(0)";
  });
}

function getCellCount(): number {
  const col = els.vuStrip ? els.vuStrip.querySelector<HTMLElement>(".vu-col") : null;
  const h = col?.clientHeight ?? 0;
  return h > 0 ? Math.max(4, Math.round(h / CELL_PX)) : cellCount;
}

function sampleTargets(totalCount: number) {
  cellCount = getCellCount();
  const useRealData = isConnected && !corsFailed && !state.muted && !!analyser;

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

      for (let idx = 0; idx < totalCount; idx++) {
        const progress = totalCount > 1 ? idx / (totalCount - 1) : 0;
        const binIndex = Math.min(46, Math.max(2, Math.floor(progress ** 1.15 * 44) + 2));

        const bandVariation = 1 + Math.sin(idx * 1.8 + binIndex) * 0.1;
        const hfBoost = 1 + progress * 0.35;
        const rawVal = (dataArray[binIndex] || 0) * hfBoost * bandVariation;

        const norm = Math.min(1, rawVal / peakTracker);
        const power = norm ** 1.4;
        targetCells[idx] = Math.round(power * cellCount);
      }
      return;
    }
  }

  const rawVol = state.muted ? 0 : state.vol / 100;
  if (rawVol === 0) {
    targetCells = new Array(VU_COUNT).fill(0);
    return;
  }

  const nowS = Date.now() / 1000;
  const volFactor = 0.4 + rawVol * 0.6;
  for (let idx = 0; idx < totalCount; idx++) {
    const speed = 3.6 + (idx % 6) * 0.55;
    const phase = idx * 0.5;
    const wave = ((Math.sin(nowS * speed + phase) + Math.cos(nowS * 2.7 - idx * 0.4) + 2) / 4) ** 1.5;
    targetCells[idx] = Math.round(wave * cellCount * volFactor);
  }
}

function applyPhysics(
  fills: NodeListOf<HTMLElement> | HTMLElement[],
  caps: NodeListOf<HTMLElement> | HTMLElement[],
  now: number,
  dt: number,
) {
  fills.forEach((fill, idx) => {
    const target = targetCells[idx] ?? 0;
    const cur = currentCells[idx] ?? 0;

    if (target >= cur) {
      currentCells[idx] = target;
      fallVelocity[idx] = 0;
    } else {
      fallVelocity[idx] = (fallVelocity[idx] ?? 0) + BAR_GRAVITY * dt;
      currentCells[idx] = Math.max(target, cur - (fallVelocity[idx] ?? 0) * dt);
    }

    const renderCell = currentCells[idx] ?? 0;
    const steppedCell = Math.floor(renderCell);
    fill.style.setProperty("--vu-level", `${(steppedCell / cellCount) * 100}%`);

    const cap = caps[idx];
    if (!cap) return;

    const curPeak = peakCells[idx] ?? 0;
    if (renderCell >= curPeak) {
      peakCells[idx] = renderCell;
      peakVelocity[idx] = 0;
      peakHoldUntil[idx] = now + PEAK_HOLD_MS;
    } else if (now > (peakHoldUntil[idx] ?? 0)) {
      peakVelocity[idx] = (peakVelocity[idx] ?? 0) + PEAK_GRAVITY * dt;
      peakCells[idx] = Math.max(renderCell, curPeak - (peakVelocity[idx] ?? 0) * dt);
    }
    const steppedPeak = Math.floor(peakCells[idx] ?? 0);
    cap.style.transform = `translateY(-${steppedPeak * CELL_PX}px)`;
  });
}

function updateFrame() {
  if (!state.playing) {
    resetVisuals();
    return;
  }

  const fills = els.vuStrip ? els.vuStrip.querySelectorAll<HTMLElement>(".vu-fill") : [];
  const caps = els.vuStrip ? els.vuStrip.querySelectorAll<HTMLElement>(".vu-cap") : [];
  const totalCount = fills.length || VU_COUNT;

  const now = performance.now();
  const dt = lastFrameTime ? Math.min(0.1, (now - lastFrameTime) / 1000) : 0;
  lastFrameTime = now;

  if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = now;
    sampleTargets(totalCount);
  }

  applyPhysics(fills, caps, now, dt);

  animId = requestAnimationFrame(updateFrame);
}
