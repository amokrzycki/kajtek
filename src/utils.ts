import type { TrackInfo } from "./types.js";

// reuse static DOMParser instance instead of allocating DOM elements per string parse
const parser = new DOMParser();

export function decodeEntities(str?: string | null): string {
  if (!str) return "";
  const doc = parser.parseFromString(str, "text/html");
  return doc.documentElement.textContent || "";
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function triggerFade(el: HTMLElement, newText: string): void {
  if (el.textContent === newText) return;
  el.textContent = newText;
  el.classList.remove("fade-in");
  void el.offsetWidth;
  el.classList.add("fade-in");
}

export const getFactsLabel = (targetHourStr: string) => `Serwis informacyjny (~${targetHourStr})`;

export const capitalizeFirstLetter = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export function escapeHtml(str: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return str.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

const PL_MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

export function formatFavDateTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  const day = d.getDate();
  const month = PL_MONTHS[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${hh}:${mm}`;
}

export function getTrackKey(t: TrackInfo): string {
  return t.timestamp ? `ts_${t.timestamp}` : `key_${t.start || ""}_${t.artist}_${t.title}_${t.label || ""}`;
}

export function resolveProtocolRelativeUrl(url: string, base: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${base}${url}`;
  return url;
}

export function renderStationThumbHtml(
  coverUrl: string | undefined,
  name: string,
  thumbClass: string,
  placeholderClass: string,
): string {
  const initial = escapeHtml(name.charAt(0));
  if (!coverUrl) return `<div class="${placeholderClass}">${initial}</div>`;
  return `<img src="${escapeHtml(coverUrl)}" alt="" class="${thumbClass}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';" /><div class="${placeholderClass}" style="display:none;">${initial}</div>`;
}
