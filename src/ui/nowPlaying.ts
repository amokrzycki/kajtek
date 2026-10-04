import type { NowPlayingSnapshot } from "../nowPlaying.js";
import type { Station } from "../types.js";
import { escapeHtml } from "../utils.js";

export function snapshotLabel(snapshot: NowPlayingSnapshot): string {
  const { track, kind, station } = snapshot;
  const content =
    kind === "unknown"
      ? "stację bez danych o utworze"
      : kind === "advertisement"
        ? snapshot.evidence === "explicit"
          ? "przerwę reklamową"
          : "przerwę według playlisty"
        : kind === "news"
          ? "wiadomości"
          : [kind === "track" ? track?.artist : "", track?.title].filter(Boolean).join(" – ");
  return `Odtwórz ${content} na ${station.name}`;
}

export function snapshotHtml(snapshot: NowPlayingSnapshot, selected: boolean): string {
  const { track, kind, flags, station, updatedAt, stale, error, loading } = snapshot;
  const artist =
    kind === "track"
      ? track?.artist || "Nieznany wykonawca"
      : kind === "news"
        ? "Wiadomości"
        : kind === "advertisement"
          ? snapshot.evidence === "explicit"
            ? "Przerwa reklamowa"
            : "Przerwa wg playlisty"
          : kind === "programme"
            ? "Audycja na żywo"
            : loading && updatedAt === null
              ? "Sprawdzanie…"
              : "Brak danych";
  const title = kind === "unknown" ? "Stacja nie podaje teraz utworu" : track?.title || "";
  const badges: string[] = [];
  if (kind === "advertisement")
    badges.push(snapshot.evidence === "explicit" ? "reklama" : "reklama / przerwa (wg playlisty)");
  if (kind === "news") badges.push("wiadomości");
  if (kind === "programme") badges.push("audycja");
  if (kind === "unknown") badges.push("brak danych");
  if (flags.blacklisted) badges.push("czarna lista");
  if (flags.favoriteArtist) badges.push("♥ artysta");
  if (selected) badges.push("wybrana stacja");
  if (stale) badges.push("starsze dane");
  if (error) badges.push("błąd danych");
  const time =
    updatedAt === null
      ? ""
      : new Date(updatedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `<span class="discovery-content"><span class="discovery-artist">${escapeHtml(artist)}</span>
    <span class="discovery-title">${escapeHtml(title)}</span></span>
    <span class="discovery-meta"><span class="discovery-station">${escapeHtml(station.name)}</span>
    <span class="discovery-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</span>
    ${time ? `<time class="discovery-time" datetime="${new Date(updatedAt ?? 0).toISOString()}">stan ${time}</time>` : ""}</span>`;
}

export function renderNowPlaying(
  list: HTMLElement,
  snapshots: NowPlayingSnapshot[],
  selectedId: string | undefined,
  onSelect: (station: Station) => void,
): void {
  const focused = document.activeElement;
  const existing = new Map(Array.from(list.children).map((row) => [(row as HTMLElement).dataset.id, row]));
  snapshots.forEach((snapshot, index) => {
    let row = existing.get(snapshot.station.id);
    let button = row?.querySelector("button");
    if (!row || !button) {
      row = document.createElement("li");
      (row as HTMLElement).dataset.id = snapshot.station.id;
      button = document.createElement("button");
      button.type = "button";
      button.className = "discovery-entry";
      row.appendChild(button);
    }
    const selected = selectedId === snapshot.station.id;
    button.onclick = () => onSelect(snapshot.station);
    button.setAttribute("aria-label", snapshotLabel(snapshot));
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("active", selected);
    button.classList.toggle("is-blacklisted", snapshot.flags.blacklisted);
    const html = snapshotHtml(snapshot, selected);
    if (button.innerHTML !== html) button.innerHTML = html;
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
    existing.delete(snapshot.station.id);
  });
  existing.forEach((row) => {
    row.remove();
  });
  if (focused instanceof HTMLButtonElement && list.contains(focused) && document.activeElement !== focused) {
    focused.focus({ preventScroll: true });
  }
}
