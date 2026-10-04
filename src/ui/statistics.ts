import type { StatisticsTotals } from "../statistics.js";
import { statisticsStore, subscribeStatistics } from "../statisticsPlayback.js";

export function formatListeningTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes === 0) return milliseconds > 0 ? "mniej niż minuta" : "jeszcze bez słuchania";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} godz.` : `${hours} godz. ${remaining} min`;
}

function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  return count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? few : many;
}

export function recapCopy(totals: StatisticsTotals, allTime: boolean) {
  const period = allTime ? "Od początku" : "W tym tygodniu";
  const minutes = Math.floor(totals.adSavedMs / 60_000);
  const saved = minutes > 0 ? `${minutes} min` : "mniej niż minutę";
  const protectedPlayback = totals.blacklistAvoided > 0 || totals.detours > 0;
  return {
    lead:
      totals.adSavedMs > 0
        ? `${period} Kajtek oszczędził Ci ${saved} reklam.`
        : protectedPlayback
          ? totals.blacklistAvoided > 0
            ? `${period} Kajtek ominął ${totals.blacklistAvoided} ${plural(totals.blacklistAvoided, "utwór", "utwory", "utworów")} z Twojej czarnej listy.`
            : "Kajtek zadbał o ciągłość Twojego radia."
          : "Twoje radio. Kajtek czuwa nad resztą.",
    adNote:
      totals.adSavedMs > 0
        ? "Tyle czasu grało inne radio w trakcie reklam o znanym czasie trwania."
        : "Czas reklam pojawi się tutaj, gdy stacja poda ich długość. Nie zgadujemy.",
    blacklist:
      totals.blacklistAvoided > 0
        ? `Kajtek ominął ${totals.blacklistAvoided} ${plural(totals.blacklistAvoided, "utwór", "utwory", "utworów")} z Twojej czarnej listy.`
        : "Żaden utwór z czarnej listy nie wymagał ominięcia.",
    detours:
      totals.detours > 0
        ? `${totals.detours} ${plural(totals.detours, "automatyczny objazd", "automatyczne objazdy", "automatycznych objazdów")} — żeby ominąć przerwę lub odzyskać połączenie.`
        : "Radio nie wymagało automatycznych objazdów.",
    listening:
      totals.listeningMs > 0
        ? `Czas słuchania: ${formatListeningTime(totals.listeningMs).replace(/\.$/, "")}.`
        : "Słuchanie jeszcze się nie zaczęło.",
    empty: totals.listeningMs === 0 && !protectedPlayback && totals.adSavedMs === 0,
  };
}

export function initStatisticsUI(): void {
  const section = document.getElementById("listening-recap");
  if (!section) return;
  let allTime = false;
  const setText = (selector: string, value: string) => {
    const element = section.querySelector(selector);
    if (element && element.textContent !== value) element.textContent = value;
  };
  const render = () => {
    const snapshot = statisticsStore.snapshot();
    const copy = recapCopy(allTime ? snapshot.allTime : snapshot.week, allTime);
    setText(".recap-lead", copy.lead);
    setText(".recap-ad-note", copy.adNote);
    setText(".recap-blacklist", copy.blacklist);
    setText(".recap-detours", copy.detours);
    setText(".recap-listening", copy.listening);
    setText(
      ".recap-empty",
      allTime
        ? "Wybierz stację i słuchaj jak zwykle. Podsumowanie zaczyna się od teraz."
        : "Wybierz stację i słuchaj jak zwykle. Tutaj zobaczysz, jak Kajtek pomaga Ci w tym tygodniu.",
    );
    section.querySelector(".recap-empty")?.classList.toggle("hidden", !copy.empty);
    section.querySelector(".recap-activity")?.classList.toggle("hidden", copy.empty);
    section
      .querySelector(".recap-blacklist")
      ?.classList.toggle(
        "hidden",
        (allTime ? snapshot.allTime : snapshot.week).adSavedMs === 0 &&
          (allTime ? snapshot.allTime : snapshot.week).blacklistAvoided > 0,
      );
    const since = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" }).format(
      snapshot.startedAt,
    );
    setText(
      ".recap-storage",
      snapshot.persistent
        ? `Zapisywane tylko w tej przeglądarce · od ${since}`
        : "Przeglądarka nie pozwala zapisać podsumowania. Te dane znikną po zamknięciu.",
    );
    section.querySelectorAll<HTMLButtonElement>("[data-recap-period]").forEach((button) => {
      button.setAttribute("aria-pressed", String((button.dataset.recapPeriod === "all") === allTime));
    });
  };
  section.querySelectorAll<HTMLButtonElement>("[data-recap-period]").forEach((button) => {
    button.addEventListener("click", () => {
      allTime = button.dataset.recapPeriod === "all";
      render();
    });
  });
  subscribeStatistics(render);
  document.addEventListener("visibilitychange", render);
  // A recap left open overnight still switches to the new local week.
  window.setInterval(render, 60_000);
  render();
}
