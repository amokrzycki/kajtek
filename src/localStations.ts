import type { Station } from "./types.js";

export const LOCAL_STATIONS: Station[] = [
  {
    id: "trojka",
    name: "Polskie Radio Trójka",
    short: "Trójka",
    cat: "local",
    provider: "generic",
    stream: "https://stream13.polskieradio.pl/pr3/pr3.sdp/playlist.m3u8",
    coverUrl: "/covers/trojka.webp",
  },
];
