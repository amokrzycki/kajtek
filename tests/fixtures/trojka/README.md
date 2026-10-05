# Trójka fixtures

Captured on 2026-10-05 during the integration investigation (schedule at 13:19:31 UTC, refreshed playlist at 13:23:31 UTC / 15:19–15:23 CEST):

- `ramowka.json`: sanitized excerpt of `https://video.onnetwork.tv/livePR2.php`, retaining the antenna-object wrapper, a `Jedynka` record and the `Trójka` window from 06:05 through 09:30 local time. Schedule `startTime` and `endTime` are Unix **seconds**; `fullStartTime` and `fullEndTime` are offset-free Europe/Warsaw wall times. The source has no program ID. `subprogram` is retained as captured.
- `playlista.json`: sanitized excerpt of `https://trojka.polskieradio.pl/playlist?date=2026-10-05` (also checked with a refresh query during capture), retaining `{ data: [...] }` and two broadcasts of `Zapraszamy do Trójki - ranek`. Playlist block and song start/stop times are offset-free Europe/Warsaw wall times; song `duration` is in **seconds**. Fractional seconds are preserved.

Titles, artists, IDs used by the playlist schema, timestamps and durations are unchanged. Descriptions, hosts, photos, covers, media URLs, unrelated identifiers and records outside the tested window were removed. Tests construct additional synthetic boundary/error cases separately; fixtures remain captured data. No homepage/Next build ID fixture is needed by the repaired provider.
