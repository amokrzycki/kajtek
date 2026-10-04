import { TIMERS } from "./consts.js";
import { getProvider } from "./providers.js";
import type { MetadataOptions, PlaylistResult, Station } from "./types.js";

export async function parseJsonFromRes(res: Response): Promise<unknown> {
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.contents && typeof json.contents === "string") {
    try {
      return JSON.parse(json.contents);
    } catch (_) {
      return null;
    }
  }
  return json;
}

// Transport and provider parsing only; playback health belongs to player.ts.
export async function fetchMetadata(station: Station, options: MetadataOptions = {}): Promise<PlaylistResult | null> {
  if (!station.apiBaseUrl) return null;
  const provider = getProvider(station);
  const timeout = AbortSignal.timeout(TIMERS.FETCH_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : options.passive || !provider.fetch
      ? timeout
      : undefined;
  signal?.throwIfAborted();
  const result = provider.fetch
    ? await provider.fetch(station, signal ? { ...options, signal } : options)
    : await (async () => {
        const res = await fetch(`${station.apiBaseUrl}/playlist`, { signal: signal ?? timeout });
        const data = await parseJsonFromRes(res);
        return data ? provider.parse(data, station) : null;
      })();
  signal?.throwIfAborted();
  return result;
}
