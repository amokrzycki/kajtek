import { TIMERS } from "@/consts.js";
import { ICONS } from "@/icons.js";
import { state } from "@/state.js";
import type { TrackInfo } from "@/types.js";
import { formatDuration, getTrackKey } from "@/utils.js";
import { els } from "./elements.js";
import { isTrackFavorited } from "./favorites.js";

let slideTimer: number | undefined;
let clearTimer: number | undefined;

function clearHistoryContent(): void {
  if (els.historyList.dataset.signature !== "empty") {
    els.historyEmpty.style.display = "block";
    els.historyList.innerHTML = "";
    els.historyList.dataset.signature = "empty";
  }
  els.historyList.classList.remove("is-loading");
}

export function triggerHistorySlideIn(): void {
  if (slideTimer) window.clearTimeout(slideTimer);
  els.historyPanel.classList.remove("slide-in");
  void els.historyPanel.offsetWidth;
  els.historyPanel.classList.add("slide-in");
  slideTimer = window.setTimeout(() => {
    els.historyPanel.classList.remove("slide-in");
  }, TIMERS.HISTORY_SLIDE_MS);
}

export function setHistoryLoadingState(loading: boolean): void {
  els.historyList.classList.toggle("is-loading", loading);
}

function getTrackItemInnerHTML(t: TrackInfo, isCurrent: boolean, isNext: boolean, isPast: boolean): string {
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
        <span class="pl-break-text">${t.label}</span>
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
    ${
      isPast || isCurrent
        ? `<div class="pl-actions">
            <span class="pl-dur">${durStr}</span>
            <button type="button" class="sc-star pl-fav-star${isTrackFavorited(t) ? " on" : ""}" data-key="${getTrackKey(t)}" aria-label="${isTrackFavorited(t) ? "Usuń z ulubionych" : "Dodaj do ulubionych"}">${ICONS.star(isTrackFavorited(t))}</button>
          </div>`
        : `<span class="pl-dur">${durStr}</span>`
    }
  `;
}

export function updateHistoryUI(animateSlideIn = false): void {
  if (clearTimer) {
    window.clearTimeout(clearTimer);
    clearTimer = undefined;
  }

  const isPanelOpen = state.showHistory && els.historyPanel.classList.contains("open");
  const prevHeight = isPanelOpen ? els.historyList.getBoundingClientRect().height : 0;

  if (!state.history || state.history.length === 0) {
    const hasRenderedItems = els.historyList.children.length > 0;
    const isPanelVisibleOrClosing = !state.showHistory || els.historyPanel.classList.contains("open");
    if (isPanelVisibleOrClosing && hasRenderedItems) {
      clearTimer = window.setTimeout(() => {
        clearHistoryContent();
      }, 320);
    } else {
      clearHistoryContent();
    }
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
      t.gapSec,
      t.label,
      isCurrent,
      isNext,
      isPast,
      isPast || isCurrent ? isTrackFavorited(t) : false,
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
      const breakCls = item.t.isBreak ? " is-break" : "";

      if (!child) {
        child = document.createElement("div");
        child.setAttribute("data-key", item.key);
        child.style.viewTransitionName = vtName;
        child.style.animationDelay = delayStr;
        child.className = `pl-item ${item.statusCls}${breakCls}`;
        child.innerHTML = getTrackItemInnerHTML(item.t, item.isCurrent, item.isNext, item.isPast);

        const currentNodes = Array.from(els.historyList.children);
        if (idx < currentNodes.length && currentNodes[idx]) {
          els.historyList.insertBefore(child, currentNodes[idx]);
        } else {
          els.historyList.appendChild(child);
        }
      } else {
        child.style.viewTransitionName = vtName;
        child.style.animationDelay = delayStr;

        const newClass = `pl-item ${item.statusCls}${breakCls}`;
        if (child.className !== newClass) {
          child.className = newClass;
        }

        const newInner = getTrackItemInnerHTML(item.t, item.isCurrent, item.isNext, item.isPast);
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
