# RMF fixture

Captured on 2026-09-17 around 15:03 UTC (17:03 CEST) from RMF FM station 5:
`https://api.rmfon.pl/stations/5/playlist`.

`playlist.json` is a sanitized excerpt around the top-of-hour gap. It keeps only fields consumed by the provider;
votes, points, selector, record metadata, and author URLs were removed.

`catalog-stations.json` is a sanitized excerpt from `https://api.rmfon.pl/stations`. It keeps one built-in and one
catalog station plus the consumed category and similar-station fields; malformed list entries and similar IDs are
synthetic mutations.
