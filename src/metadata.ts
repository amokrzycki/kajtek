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
async function fetchProviderMetadata(station: Station, options: MetadataOptions): Promise<PlaylistResult | null> {
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

const passiveRequests = new Map<
  string,
  { controller: AbortController; promise: Promise<PlaylistResult | null>; consumers: number }
>();

export function fetchMetadata(station: Station, options: MetadataOptions = {}): Promise<PlaylistResult | null> {
  if (!options.passive) return fetchProviderMetadata(station, options);
  const signal = options.signal;
  if (signal?.aborted) return Promise.reject(signal.reason);
  const key = JSON.stringify([station.id, station.provider, station.apiBaseUrl]);
  let request = passiveRequests.get(key);
  if (!request) {
    const controller = new AbortController();
    request = {
      controller,
      promise: fetchProviderMetadata(station, { passive: true, signal: controller.signal }),
      consumers: 0,
    };
    passiveRequests.set(key, request);
  }
  const shared = request;
  shared.consumers++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const release = () => {
      if (settled) return false;
      settled = true;
      signal?.removeEventListener("abort", abort);
      shared.consumers--;
      if (!shared.consumers) {
        if (passiveRequests.get(key) === shared) passiveRequests.delete(key);
        shared.controller.abort();
      }
      return true;
    };
    const abort = () => {
      if (release()) reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    void shared.promise.then(
      (result) => {
        if (release()) resolve(result);
      },
      (error: unknown) => {
        if (release()) reject(error);
      },
    );
  });
}
