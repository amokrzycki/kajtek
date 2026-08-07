import { DEFAULT_BREAK_LABEL, TIMERS } from "../consts.js";
import type { EskaNowPlaying, EskaTrack, PlaylistResult, Provider, Station, TrackInfo } from "../types.js";

/**
 * ESKA's encoder writes a private #EXT-X-ZPR tag before every segment of every chunklist
 * (ZPR = Grupa ZPR Media, the network owner it is their pipeline extension, not a standard).
 * It carries the current block's title, its target length and how far into it we are, which is
 * everything the REST now_playing endpoint lacks. hls.js routes unknown #EXT-X-* lines into
 * frag.tagList, and FRAG_CHANGED fires as playback *enters* a fragment, so this is synced to
 * what the listener hears rather than to the live edge of the manifest.
 */
interface ZprState {
  title: string;
  stationId: string;
  blockStartSec: number | null;
  timeoutMs: number | null;
  updatedAt: number;
}

interface ZprTag {
  data?: { title?: string; encoding?: string; timeout?: number | null };
  duration?: number;
  expired?: unknown;
}

// Only one stream ever plays, so a single slot beats a per-station map.
let zprState: ZprState | null = null;
// A paused or stalled stream must not pin a dead title on screen.
const ZPR_STALE_MS = 30_000;
// How long an empty title is treated as a transition rather than a block in its own right.
const ZPR_EMPTY_GRACE_MS = 2_000;

function decodeZprTitle(raw: string, encoding?: string): string {
  if (encoding !== "base64") return raw;
  // atob alone returns a per-byte binary string, which mangles the Polish diacritics
  // these titles carry ("WIKTOR DYDUŁA - Tam Słońce Gdzie My").
  return new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)));
}

/** Returns true when this fragment starts a new block, i.e. the caller should refresh now. */
export function readZprTag(frag: { tagList: string[][]; programDateTime: number | null }, stationId: string): boolean {
  const raw = frag.tagList.find((t) => t[0] === "EXT-X-ZPR")?.[1];
  if (!raw) return false;

  let tag: ZprTag;
  try {
    tag = JSON.parse(raw) as ZprTag;
  } catch (_) {
    return false;
  }

  if (tag.expired != null) console.warn("[ZPR] non-null expired", tag.expired);

  // Short transition segments carry an empty title, so hold the previous block for a moment rather
  // than flickering. But empty blocks also run for minutes on live/talk programming (measured 8+
  // min simultaneously across the national stations), and there the last song's time must not
  // stick to whatever REST reports next — drop it and let REST stand alone.
  if (!tag.data?.title) {
    if (!zprState || Date.now() - zprState.updatedAt <= ZPR_EMPTY_GRACE_MS) return false;
    zprState = null;
    return true;
  }

  const title = decodeZprTitle(tag.data.title, tag.data.encoding);
  const changed = zprState?.title !== title || zprState.stationId !== stationId;

  // Derive the block start from the tag, never from Date.now(): both terms advance by one segment
  // length per poll, so their difference is constant for the whole block. A drifting value would
  // rewrite t.start every tick and thrash the history signature and its view transitions.
  const blockStartSec =
    frag.programDateTime === null ? null : Math.round((frag.programDateTime - (tag.duration || 0)) / 1000);

  zprState = {
    title,
    stationId,
    blockStartSec,
    timeoutMs: tag.data.timeout ?? null,
    updatedAt: Date.now(),
  };
  return changed;
}

function getZprState(stationId: string): ZprState | null {
  if (!zprState || zprState.stationId !== stationId) return null;
  return Date.now() - zprState.updatedAt > ZPR_STALE_MS ? null : zprState;
}

export function resetZprState(): void {
  zprState = null;
}

const loggedOddTitles = new Set<string>();

function classifyZpr(title: string): "ad" | "jingle" | "song" {
  if (/^reklama\b/i.test(title)) return "ad";
  if (/^jingle$/i.test(title)) return "jingle";

  if (!title.includes(" - ") && !loggedOddTitles.has(title)) {
    loggedOddTitles.add(title);
    console.warn("[ZPR] unrecognised block title", title);
  }
  return "song";
}

function toTrackInfo(item: EskaTrack, order: number): TrackInfo {
  const cover = item.image || item.thumb || "";
  return {
    order,
    artist: (item.artists || []).join(" & "),
    title: item.name || "Utwór",
    ...(cover ? { coverUrl: cover } : {}),
  };
}

// ZPR knows a song is playing but REST has no name for it. Artist comes out uppercase.
function zprFallbackTrack(title: string): TrackInfo {
  const sep = title.indexOf(" - ");
  return sep === -1
    ? { order: 0, artist: "", title }
    : { order: 0, artist: title.slice(0, sep), title: title.slice(sep + 3) };
}

export const eskaProvider: Provider = {
  name: "Eska Network Provider",
  parse(): PlaylistResult | null {
    return null; // unused, fetch() below owns this provider's data flow
  },
  async fetch(station: Station): Promise<PlaylistResult | null> {
    // timestamp is mandatory, without it the API answers with a null current.
    const ts = Math.floor(Date.now() / 1000);
    const res = await fetch(`${station.apiBaseUrl}/?timestamp=${ts}`, {
      signal: AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as EskaNowPlaying | null;
    if (!data) return null;

    const pasts = data.pasts || [];
    const all: TrackInfo[] = [
      ...pasts.map((t, i) => toTrackInfo(t, i - pasts.length)),
      ...(data.current ? [toTrackInfo(data.current, 0)] : []),
      ...(data.futures || []).map((t, i) => toTrackInfo(t, i + 1)),
    ];
    if (all.length === 0) return null;

    // Only the playing station has an HLS session, candidate polling (blacklistWarning) and
    // ad-break-ended polling both hit stations that don't, and must fall back to REST alone.
    const zpr = getZprState(station.id);
    const kind = zpr ? classifyZpr(zpr.title) : null;

    // A real signal, replacing the old "current == null means ads" guess. Jingles are ~7s station
    // idents, treating them as breaks would make Ad Skip switch stations over an ident.
    if (kind === "ad") {
      return { current: { artist: station.name, title: DEFAULT_BREAK_LABEL, isLiveBreak: true }, all };
    }

    const restCurrent = all.find((t) => t.order === 0);

    // REST owns the display names (ZPR uppercases the artist and " - " is ambiguous for tracks
    // that contain a dash); ZPR owns the timing, since it is the one synced to the audio.
    if (kind === "song" && zpr && restCurrent) {
      if (zpr.blockStartSec) restCurrent.start = new Date(zpr.blockStartSec * 1000).toLocaleTimeString("pl-PL");
      if (zpr.timeoutMs) restCurrent.length = Math.round(zpr.timeoutMs / 1000);
    }

    if (restCurrent) return { current: restCurrent, all };
    if (kind === "song" && zpr) return { current: zprFallbackTrack(zpr.title), all };

    // No ZPR (not playing, stale, or a jingle) and no REST current — the original inference.
    return { current: { artist: station.name, title: DEFAULT_BREAK_LABEL, isLiveBreak: true }, all };
  },
};
