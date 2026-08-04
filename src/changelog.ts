import rawChangelog from "../CHANGELOG.md";
import { STORAGE_KEYS } from "./consts.js";
import { state } from "./state.js";

export interface ChangelogEntry {
  version: string;
  intro?: string;
  items: string[];
}

function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const sections = md.split(/^##\s+/m).slice(1);

  for (const section of sections) {
    const [versionLine, ...rest] = section.split("\n");
    const version = versionLine?.trim();
    if (!version) continue;

    const lines = rest.map((l) => l.trim()).filter((l) => l.length > 0);
    const introLines = lines.filter((l) => !l.startsWith("- "));
    const items = lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());

    const intro = introLines.join(" ");
    entries.push({ version, ...(intro && { intro }), items });
  }

  return entries;
}

const CHANGELOG: ChangelogEntry[] = parseChangelog(rawChangelog);

function parseVersion(v: string): number[] {
  return v.split(".").map((n) => Number(n) || 0);
}

function isNewerVersion(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

const RETURNING_USER_SIGNAL_KEYS = Object.values(STORAGE_KEYS).filter(
  (key) => key !== STORAGE_KEYS.LAST_SEEN_VERSION && key !== STORAGE_KEYS.THEME,
);

function isReturningUser(): boolean {
  return RETURNING_USER_SIGNAL_KEYS.some((key) => localStorage.getItem(key) !== null);
}

export function checkForNewChangelog(): ChangelogEntry[] | null {
  const lastSeen = localStorage.getItem(STORAGE_KEYS.LAST_SEEN_VERSION);

  const returning = isReturningUser();
  localStorage.setItem(STORAGE_KEYS.LAST_SEEN_VERSION, state.version);

  if (lastSeen === state.version) return null;
  // unknown history (no lastSeen at all) — announce only the latest release, not
  // everything ever shipped, since we have no idea how far back this user goes.
  if (!lastSeen) return returning ? CHANGELOG.slice(0, 1) : null;

  const newEntries = CHANGELOG.filter((e) => isNewerVersion(e.version, lastSeen));
  return newEntries.length > 0 ? newEntries : null;
}
