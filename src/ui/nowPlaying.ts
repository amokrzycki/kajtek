import type { NowPlayingSnapshot } from "../nowPlaying.js";
import type { Station } from "../types.js";
import { escapeHtml, renderStationThumbHtml } from "../utils.js";

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

const failedArtwork = new Set<string>();

function snapshotFields(snapshot: NowPlayingSnapshot, selected: boolean) {
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
  const trackCover = kind === "track" ? track?.coverUrl?.trim() : undefined;
  const stationCover = station.coverUrl?.trim();
  const cover = trackCover && !trackCover.includes("/assets/images/logo200x200.png") ? trackCover : stationCover;
  return { artist, title, badges, time, cover, stationCover };
}

function artworkHtml(snapshot: NowPlayingSnapshot, index: number): string {
  const { cover, stationCover } = snapshotFields(snapshot, false);
  const availableCover = cover && !failedArtwork.has(cover) ? cover : stationCover;
  return renderStationThumbHtml(
    availableCover && !failedArtwork.has(availableCover) ? availableCover : undefined,
    snapshot.station.name,
    "discovery-image",
    "discovery-placeholder",
    false,
    {
      ...(stationCover && !failedArtwork.has(stationCover) ? { fallbackUrl: stationCover } : {}),
      loading: index < 3 ? "eager" : "lazy",
    },
  );
}

function badgesHtml(badges: string[]): string {
  return badges
    .map(
      (badge) => `<span${badge === "czarna lista" ? ' class="discovery-blacklist"' : ""}>${escapeHtml(badge)}</span>`,
    )
    .join("");
}

export function snapshotHtml(snapshot: NowPlayingSnapshot, selected: boolean, index = 0): string {
  const { artist, title, badges, time } = snapshotFields(snapshot, selected);
  return `<span class="discovery-artwork" aria-hidden="true">${artworkHtml(snapshot, index)}</span>
    <span class="discovery-content"><span class="discovery-artist">${escapeHtml(artist)}</span>
    <span class="discovery-title">${escapeHtml(title)}</span></span>
    <span class="discovery-meta"><span class="discovery-station">${escapeHtml(snapshot.station.name)}</span>
    <span class="discovery-badges">${badgesHtml(badges)}</span>
    <time class="discovery-time"${time ? ` datetime="${new Date(snapshot.updatedAt ?? 0).toISOString()}"` : " hidden"}>${time ? `stan ${time}` : ""}</time></span>`;
}

function reconcileSnapshot(button: HTMLButtonElement, snapshot: NowPlayingSnapshot, selected: boolean, index: number) {
  const { artist, title, badges, time, cover, stationCover } = snapshotFields(snapshot, selected);
  for (const [selector, value] of [
    [".discovery-artist", artist],
    [".discovery-title", title],
    [".discovery-station", snapshot.station.name],
    [".discovery-time", time ? `stan ${time}` : ""],
  ]) {
    if (!selector || value === undefined) continue;
    const field = button.querySelector<HTMLElement>(selector);
    if (field && field.textContent !== value) field.textContent = value;
  }
  const clock = button.querySelector<HTMLTimeElement>(".discovery-time");
  if (clock) {
    clock.hidden = !time;
    if (snapshot.updatedAt !== null) clock.setAttribute("datetime", new Date(snapshot.updatedAt).toISOString());
  }
  const tags = button.querySelector<HTMLElement>(".discovery-badges");
  const badgeMarkup = badgesHtml(badges);
  if (tags && tags.dataset.html !== badgeMarkup) {
    tags.innerHTML = badgeMarkup;
    tags.dataset.html = badgeMarkup;
  }
  const artwork = button.querySelector<HTMLElement>(".discovery-artwork");
  // Authored URLs stay distinct from the image's current fallback URL.
  const artworkKey = JSON.stringify([cover, stationCover, snapshot.station.name]);
  if (artwork && artwork.dataset.key !== artworkKey) {
    artwork.innerHTML = artworkHtml(snapshot, index);
    artwork.dataset.key = artworkKey;
    const image = artwork.querySelector("img");
    if (image) {
      image.onerror = () => {
        const failed = image.getAttribute("src");
        if (failed) failedArtwork.add(failed);
        const fallback = image.dataset.fallbackSrc;
        delete image.dataset.fallbackSrc;
        if (fallback && !failedArtwork.has(fallback)) image.src = fallback;
        else {
          image.style.display = "none";
          const placeholder = artwork.querySelector<HTMLElement>(".discovery-placeholder");
          if (placeholder) placeholder.style.display = "flex";
        }
      };
    }
  }
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
      button.innerHTML = `<span class="discovery-artwork" aria-hidden="true"></span>
        <span class="discovery-content"><span class="discovery-artist"></span><span class="discovery-title"></span></span>
        <span class="discovery-meta"><span class="discovery-station"></span><span class="discovery-badges"></span>
        <time class="discovery-time" hidden></time></span>`;
      row.appendChild(button);
    }
    const selected = selectedId === snapshot.station.id;
    button.onclick = () => onSelect(snapshot.station);
    button.setAttribute("aria-label", snapshotLabel(snapshot));
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("active", selected);
    button.classList.toggle("is-blacklisted", snapshot.flags.blacklisted);
    reconcileSnapshot(button, snapshot, selected, index);
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
