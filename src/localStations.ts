import type { Station } from "./types.js";

export const LOCAL_STATIONS: Station[] = [
  {
    id: "trojka",
    name: "Polskie Radio Trójka",
    short: "Trójka",
    cat: "local",
    provider: "trojka",
    stream: "https://stream13.polskieradio.pl/pr3/pr3.sdp/playlist.m3u8",
    apiBaseUrl: "/api/trojka",
    coverUrl: "/covers/trojka.webp",
  },
  {
    id: "rzeszow",
    name: "Polskie Radio Rzeszów",
    short: "Rzeszów",
    cat: "local",
    provider: "generic",
    stream: "https://streaming.g-news.pl:8040/rzeszow",
    coverUrl: "/covers/rzeszow.webp",
  },
  {
    id: "leliwa",
    name: "Radio Leliwa",
    short: "Leliwa",
    cat: "local",
    provider: "generic",
    stream: "http://streaming.g-news.pl:8050/leliwa",
    coverUrl: "/covers/leliwa.webp",
  },
];
