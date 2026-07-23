function decodeEntities(str) {
  if (!str) return "";
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

export const PROVIDERS = {
  rmf: {
    name: "RMF Network Provider",
    parse(data, station) {
      if (!Array.isArray(data) || data.length === 0) return null;

      const sorted = [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const processed = [];
      const nowSec = Math.floor(Date.now() / 1000);

      for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        const len = Number.parseInt(item.lenght || item.length || "0", 10);
        const endTs = item.timestamp ? item.timestamp + len : null;

        processed.push({
          order: item.order ?? i,
          artist: decodeEntities(item.author || item.artist),
          title: decodeEntities(item.title),
          start: item.start,
          timestamp: item.timestamp,
          endTimestamp: endTs,
          length: len,
        });

        if (i < sorted.length - 1) {
          const nextItem = sorted[i + 1];
          if (item.timestamp && len && nextItem.timestamp) {
            const gapSec = nextItem.timestamp - endTs;
            if (gapSec > 60) {
              const gapMin = Math.round(gapSec / 60);
              processed.push({
                isBreak: true,
                gapSec,
                gapMin,
                label: `Przerwa / Reklamy (~${gapMin} min)`,
              });
            }
          }
        }
      }

      const curItem = sorted.find((item) => item.order === 0) || sorted[0];
      const curLen = Number.parseInt(curItem?.lenght || curItem?.length || "0", 10);
      const curEndTs = curItem?.timestamp ? curItem.timestamp + curLen : null;
      const hasUpcoming = sorted.some((item) => item.order > 0);

      if (!hasUpcoming && curEndTs) {
        const endDate = new Date(curEndTs * 1000);
        const endMin = endDate.getMinutes();
        const endHour = endDate.getHours();
        const nextHourStr = `${String((endHour + (endMin >= 55 ? 1 : 0)) % 24).padStart(2, "0")}:00`;

        const isTopOfHour = endMin >= 55 || endMin <= 3;
        const stationBrand = station?.name || "Stacja";
        const breakLabel = isTopOfHour
          ? `Serwis informacyjny / Fakty ${stationBrand} (~${nextHourStr})`
          : "Przerwa / Serwis informacyjny";

        processed.push({
          isBreak: true,
          isPredicted: true,
          label: breakLabel,
        });
      }

      let activeTrack = null;
      if (curEndTs && nowSec > curEndTs + 15 && !hasUpcoming) {
        activeTrack = {
          artist: station?.name || "Radio",
          title: "📻 Serwis informacyjny / Fakty",
          isLiveBreak: true,
        };
      } else if (curItem) {
        activeTrack = {
          artist: decodeEntities(curItem.author || curItem.artist),
          title: decodeEntities(curItem.title),
        };
      }

      return {
        current: activeTrack,
        all: processed,
      };
    },
  },

  eska: {
    name: "Eska / Radio Time Provider",
    parse(data, station) {
      if (!data) return null;

      let rawTracks = [];
      if (Array.isArray(data)) {
        rawTracks = data;
      } else if (data.current || data.songs || data.tracks || data.now) {
        const cur = data.current || data.now;
        const upcoming = data.upcoming || data.next || data.songs || data.tracks || [];
        if (cur) rawTracks.push({ ...cur, order: 0 });
        if (Array.isArray(upcoming)) {
          upcoming.forEach((t, i) => {
            rawTracks.push({ ...t, order: i + 1 });
          });
        }
      }

      if (rawTracks.length === 0) return null;

      const processed = rawTracks.map((item, idx) => ({
        order: item.order ?? idx,
        artist: decodeEntities(item.artist || item.author || item.name || station?.name),
        title: decodeEntities(item.title || item.song || item.name || "Utwór"),
        start: item.start || item.startTime || null,
      }));

      const active = processed.find((t) => t.order === 0) || processed[0];
      return {
        current: active ? { artist: active.artist, title: active.title } : null,
        all: processed,
      };
    },
  },

  generic: {
    name: "Generic Playlist Provider",
    parse(data, station) {
      if (!data) return null;
      const list = Array.isArray(data) ? data : data.tracks || data.playlist || [data];
      if (list.length === 0) return null;

      const processed = list.map((item, idx) => ({
        order: item.order ?? idx,
        artist: decodeEntities(item.artist || item.author || item.name || station?.name),
        title: decodeEntities(item.title || item.song || "Utwór"),
        start: item.start || null,
      }));

      const cur = processed[0];
      return {
        current: cur ? { artist: cur.artist, title: cur.title } : null,
        all: processed,
      };
    },
  },
};

export function getProvider(station) {
  if (station?.provider && PROVIDERS[station.provider]) {
    return PROVIDERS[station.provider];
  }
  if (station?.playlistUrl?.includes("rmf")) {
    return PROVIDERS.rmf;
  }
  if (station?.playlistUrl?.includes("eska") || station?.playlistUrl?.includes("radioeska")) {
    return PROVIDERS.eska;
  }
  return PROVIDERS.generic;
}
