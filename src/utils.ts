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

export function formatFavDateTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  const day = d.getDate();
  const month = Intl.DateTimeFormat("pl-PL", { month: "short" }).format(d);
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
  tinted = false,
  options: { fallbackUrl?: string; loading?: "eager" | "lazy" } = {},
): string {
  if (tinted) placeholderClass += " is-custom";
  const initial = escapeHtml(name.charAt(0));
  if (!coverUrl) return `<div class="${placeholderClass}">${initial}</div>`;
  const fallback =
    options.fallbackUrl && options.fallbackUrl !== coverUrl
      ? ` data-fallback-src="${escapeHtml(options.fallbackUrl)}"`
      : "";
  return `<img src="${escapeHtml(coverUrl)}" alt="" class="${thumbClass}" decoding="async" loading="${options.loading ?? "eager"}"${fallback} onerror="if(this.dataset.fallbackSrc){const src=this.dataset.fallbackSrc;delete this.dataset.fallbackSrc;this.src=src;}else{this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';}" /><div class="${placeholderClass}" style="display:none;">${initial}</div>`;
}

const sessionStorageFallback = new Map<string, string>();
const failedStorageWrites = new Set<string>();
export function getStoredString(key: string): string | null {
  if (failedStorageWrites.has(key)) return sessionStorageFallback.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return sessionStorageFallback.get(key) ?? null;
  }
}
export function setStoredString(key: string, value: string): void {
  sessionStorageFallback.set(key, value);
  try {
    localStorage.setItem(key, value);
    failedStorageWrites.delete(key);
  } catch {
    failedStorageWrites.add(key);
    /* Keep settings for this session. */
  }
}
export function removeStoredItem(key: string): void {
  sessionStorageFallback.delete(key);
  try {
    localStorage.removeItem(key);
    failedStorageWrites.delete(key);
  } catch {
    failedStorageWrites.add(key);
    /* Storage may be unavailable. */
  }
}
export function getStoredJSON<T>(key: string, fallback: T, validate?: (value: unknown) => boolean): T {
  try {
    const raw = getStoredString(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate && !validate(parsed) ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}
export function setStoredJSON(key: string, value: unknown): void {
  setStoredString(key, JSON.stringify(value));
}

export function withinRateLimit(
  timestamps: number[],
  windowMs: number,
  max: number,
): { timestamps: number[]; limited: boolean } {
  const now = Date.now();
  const recent = timestamps.filter((t) => now - t < windowMs);
  if (recent.length >= max) return { timestamps: recent, limited: true };
  return { timestamps: [...recent, now], limited: false };
}
