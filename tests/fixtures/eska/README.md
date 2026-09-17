# ESKA fixtures

Captured on 2026-09-17 between 15:04 and 15:08 UTC (17:04–17:08 CEST).

- `hls-song.m3u8` and `frag-song.json`: ESKA Warszawa 2380,
  `https://liveradio.eska.pl/2380/playlist.m3u8` and its child playlist. The captured four-segment manifest is raw; the
  fragment objects preserve the fields exposed by hls.js 1.6.16 that KAJTEK consumes.
- `rest-song.json`: ESKA Warszawa 2380,
  `https://front-api.grupazprmedia.pl/music/v2/now_playing/2380/`. It is sanitized to consumed fields and one future.
- `hls-empty-long.m3u8`, `frag-empty.json`, and `rest-null-current.json`: ESKA main 2980 from the equivalent public HLS
  and now-playing URLs. They document an observed long empty ZPR block with `current: null`; they do not prove that the
  block was an advertisement.
- `frag-ad.synthetic.json` and `frag-jingle.synthetic.json` are synthetic protocol examples based on current production
  classification code. Neither title was observed in the capture window, so these fixtures are not production evidence.

Dynamic tracking, publication, image, raw payload, and unused future fields were removed. Segment timing and ZPR payloads
remain unchanged where captured.
