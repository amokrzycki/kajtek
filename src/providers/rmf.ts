import { DEFAULT_BREAK_LABEL } from "@/consts";
import { getFactsInfo } from "@/providers";
import type { PlaylistResult, Provider, RawTrack, Station, TrackInfo } from "@/types";
import { decodeEntities, getFactsLabel } from "@/utils";

function formatBreakStart(timestampSec: number, originalStart?: string | null): string {
  const d = new Date(timestampSec * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const hasSeconds = originalStart?.split(":").length === 3 || ss !== "00";
  return hasSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

export const rmfProvider: Provider = {
  name: "RMF Network Provider",
  parse(data: unknown, station?: Station | null): PlaylistResult | null {
    if (!Array.isArray(data) || data.length === 0) return null;

    const sorted = [...(data as RawTrack[])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const processed: TrackInfo[] = [];
    const nowSec = Math.floor(Date.now() / 1000);

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      if (!item) continue;
      const len = Number(item.length ?? item.lenght ?? 0);
      let endTs = item.timestamp ? item.timestamp + len : null;
      let effectiveLen = len;
      let pendingBreak: TrackInfo | null = null;

      if (i < sorted.length - 1) {
        const nextItem = sorted[i + 1];
        if (item.timestamp && len && nextItem?.timestamp && endTs) {
          const gapSec = nextItem.timestamp - endTs;
          if (gapSec > 0) {
            const factsInfo = getFactsInfo(station, endTs);
            // news break requires gapSec >= 60s to ignore short gaps (8s). Ceiling: news updates < 60s missed
            const isFactsBreak = factsInfo.isFacts && gapSec >= 60;
            const isRealBreak = isFactsBreak || gapSec >= 120;

            if (isRealBreak) {
              const gapMin = Math.round(gapSec / 60);
              const breakStartStr = formatBreakStart(endTs, item.start);
              const label = isFactsBreak ? getFactsLabel(factsInfo.targetHourStr) : DEFAULT_BREAK_LABEL;

              pendingBreak = {
                order: item.order ?? i,
                artist: "",
                title: "",
                isBreak: true,
                start: breakStartStr,
                timestamp: endTs,
                endTimestamp: nextItem.timestamp,
                length: gapSec,
                gapSec,
                gapMin,
                label,
              };
            } else {
              endTs = nextItem.timestamp;
              effectiveLen = nextItem.timestamp - item.timestamp;
            }
          }
        }
      }

      const track: TrackInfo = {
        order: item.order ?? i,
        artist: decodeEntities(item.author || item.artist),
        title: decodeEntities(item.title),
        start: item.start || null,
        endTimestamp: endTs,
        length: effectiveLen,
        coverUrl: item.coverBigUrl || item.coverUrl || "",
      };
      if (item.timestamp !== undefined) {
        track.timestamp = item.timestamp;
      }
      processed.push(track);

      if (pendingBreak) {
        processed.push(pendingBreak);
      }
    }

    const curItem = sorted.find((item) => item.order === 0) || sorted[0];
    const curLen = Number(curItem?.length ?? curItem?.lenght ?? 0);
    const curEndTs = curItem?.timestamp ? curItem.timestamp + curLen : null;
    const hasUpcoming = sorted.some((item) => (item.order ?? 0) > 0);

    if (!hasUpcoming && curEndTs) {
      const breakStartStr = formatBreakStart(curEndTs, curItem?.start);
      const factsInfo = getFactsInfo(station, curEndTs);
      const breakLabel = factsInfo.isFacts ? getFactsLabel(factsInfo.targetHourStr) : "Przerwa / Serwis informacyjny";

      processed.push({
        artist: "",
        title: "",
        isBreak: true,
        isPredicted: true,
        start: breakStartStr,
        timestamp: curEndTs,
        label: breakLabel,
      });
    }

    const currentActive = processed.find(
      (t) => t.timestamp && t.timestamp <= nowSec && t.endTimestamp && t.endTimestamp > nowSec,
    );

    let activeTrack: TrackInfo | null = null;
    if (currentActive) {
      if (currentActive.isBreak) {
        const factsInfo = getFactsInfo(station, nowSec);
        const label = factsInfo.isFacts
          ? getFactsLabel(factsInfo.targetHourStr)
          : currentActive.label || DEFAULT_BREAK_LABEL;

        activeTrack = {
          artist: station?.name || "Radio",
          title: label,
          isLiveBreak: true,
          isFacts: factsInfo.isFacts,
        };
      } else {
        activeTrack = {
          artist: currentActive.artist,
          title: currentActive.title,
          coverUrl: currentActive.coverUrl || "",
        };
      }
    } else if (curEndTs && nowSec >= curEndTs) {
      const factsInfo = getFactsInfo(station, nowSec);
      const breakTitle = factsInfo.isFacts ? getFactsLabel(factsInfo.targetHourStr) : DEFAULT_BREAK_LABEL;
      activeTrack = {
        artist: station?.name || "Radio",
        title: breakTitle,
        isLiveBreak: true,
        isFacts: factsInfo.isFacts,
      };
    } else if (curItem) {
      activeTrack = {
        artist: decodeEntities(curItem.author || curItem.artist),
        title: decodeEntities(curItem.title),
        coverUrl: curItem.coverUrl || "",
      };
    }

    return {
      current: activeTrack,
      all: processed,
    };
  },
};
