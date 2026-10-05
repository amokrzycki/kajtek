import { getTopStations, type StatisticsTotals } from "../statistics.js";
import { statisticsStore, subscribeStatistics } from "../statisticsPlayback.js";
import { bindModalDismiss, closeModal, openModal } from "./modal.js";

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
        ? "Tyle czasu grało inne radio w trakcie reklam lub przerw o znanym czasie trwania."
        : "Czas reklam pojawi się tutaj, gdy znamy czas trwania przerwy. Nie zgadujemy.",
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
  const trigger = document.getElementById("statistics-toggle");
  if (!trigger) return;
  const section = document.createElement("div");
  section.id = "statistics-modal-overlay";
  section.className = "k-modal-overlay";
  section.setAttribute("aria-hidden", "true");
  section.innerHTML = `
    <div class="k-modal statistics-modal" role="dialog" aria-modal="true" aria-labelledby="recap-title">
      <div class="k-modal-header">
        <h2 id="recap-title" class="k-modal-title">Co Kajtek zrobił dla Ciebie?</h2>
        <button type="button" id="statistics-modal-close" class="k-modal-close" aria-label="Zamknij statystyki">&times;</button>
      </div>
      <div class="recap-body">
        <fieldset class="recap-periods">
          <legend class="sr-only">Okres podsumowania</legend>
          <button type="button" data-recap-period="week" aria-pressed="true">Ten tydzień</button>
          <button type="button" data-recap-period="all" aria-pressed="false">Od początku</button>
        </fieldset>
        <p class="recap-lead"></p>
        <p class="recap-empty"></p>
        <dl class="recap-metrics">
          <div><dt>Zaoszczędzony czas reklam</dt><dd class="recap-ad-saved"></dd></div>
          <div><dt>Ominięcia czarnej listy</dt><dd class="recap-blacklist"></dd></div>
          <div><dt>Automatyczne objazdy</dt><dd class="recap-detours"></dd></div>
          <div><dt>Czas słuchania</dt><dd class="recap-listening"></dd></div>
        </dl>
        <section class="recap-station-section" aria-labelledby="recap-stations-title">
          <h3 id="recap-stations-title">Najdłużej słuchane stacje</h3>
          <ol class="recap-stations" role="list"></ol>
          <p class="recap-stations-empty"></p>
        </section>
        <div class="recap-footer">
            <details class="recap-method">
              <summary>Jak liczymy?</summary>
              <div class="recap-method-copy">
                <p>
                  Reklamy: liczymy czas, gdy gra inne radio, tylko w przedziale przerwy o znanym początku i końcu. ESKA
                  podaje długość bloku reklamowego. W RMF korzystamy z zaplanowanej przerwy w playliście, jeśli znamy jej
                  początek i koniec — to przerwa wg playlisty, a nie potwierdzona reklama. Przerw bez znanego końca,
                  serwisów informacyjnych ani czasu spoza przedziału nie przeliczamy na minuty.
                </p>
                <p>
                  Czarna lista: udane przełączenia z powodu zablokowanego utworu. Jeśli utwór już się zaczął, omijamy
                  jego resztę. Przycisk „Przełącz teraz” też się liczy.
                </p>
                <p>
                  Objazdy: udane automatyczne zmiany stacji z powodu reklam lub czarnej listy oraz zmiany strumienia po
                  awarii. Powrotów i ręcznych zmian nie doliczamy. Ominięty utwór może też być objazdem — te liczby
                  opisują te same działania z dwóch stron.
                </p>
                <p>
                  Słuchanie: tylko odtwarzane, niewyciszone audio. Pauza, buforowanie i samo otwarcie aplikacji nie
                  wydłużają tego czasu. Te same odcinki audio przypisujemy do odtwarzanej stacji. Tydzień zaczyna się w poniedziałek, według czasu na Twoim urządzeniu.
                </p>
                <p>Lista stacji zaczyna się od aktualizacji, która ją wprowadziła. Wcześniejszego słuchania nie przypisujemy do stacji.</p>
              </div>
            </details>
          <p class="recap-storage"></p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(section);
  const close = () => closeModal(section);
  bindModalDismiss(section, close);
  section.querySelector("#statistics-modal-close")?.addEventListener("click", close);
  let allTime = false;
  const setText = (selector: string, value: string) => {
    const element = section.querySelector(selector);
    if (element && element.textContent !== value) element.textContent = value;
  };
  const render = () => {
    const snapshot = statisticsStore.snapshot();
    const totals = allTime ? snapshot.allTime : snapshot.week;
    const copy = recapCopy(totals, allTime);
    setText(".recap-lead", copy.lead);
    setText(".recap-ad-saved", totals.adSavedMs > 0 ? formatListeningTime(totals.adSavedMs) : "Jeszcze bez pomiaru");
    setText(".recap-blacklist", String(totals.blacklistAvoided));
    setText(".recap-detours", String(totals.detours));
    setText(".recap-listening", formatListeningTime(totals.listeningMs));
    setText(
      ".recap-empty",
      allTime
        ? "Wybierz stację i słuchaj jak zwykle. Podsumowanie zaczyna się od teraz."
        : "Wybierz stację i słuchaj jak zwykle. Tutaj zobaczysz, jak Kajtek pomaga Ci w tym tygodniu.",
    );
    section.querySelector(".recap-empty")?.classList.toggle("hidden", !copy.empty);
    section.querySelector(".recap-metrics")?.classList.toggle("hidden", copy.empty);
    const stations = getTopStations(allTime ? snapshot.allTimeStations : snapshot.weekStations);
    const rows = stations.map((station) => {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.className = "recap-station-name";
      name.textContent = station.name;
      const duration = document.createElement("span");
      duration.className = "recap-station-duration";
      duration.textContent = formatListeningTime(station.listeningMs);
      row.append(name, duration);
      return row;
    });
    section.querySelector(".recap-stations")?.replaceChildren(...rows);
    section.querySelector(".recap-stations-empty")?.classList.toggle("hidden", stations.length > 0);
    setText(
      ".recap-stations-empty",
      allTime
        ? "Stacje pojawią się po pierwszym słuchaniu od tej aktualizacji."
        : "Jeszcze bez stacji w tym tygodniu. Lista pojawi się, gdy posłuchasz radia.",
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
  trigger.addEventListener("click", () => {
    render();
    const body = section.querySelector(".recap-body");
    if (body) body.scrollTop = 0;
    openModal(section);
  });
  section.querySelectorAll<HTMLButtonElement>("[data-recap-period]").forEach((button) => {
    button.addEventListener("click", () => {
      allTime = button.dataset.recapPeriod === "all";
      render();
    });
  });
  const refresh = () => {
    if (section.classList.contains("is-open")) render();
  };
  subscribeStatistics(refresh);
  document.addEventListener("visibilitychange", refresh);
  // A recap left open overnight still switches to the new local week.
  window.setInterval(refresh, 60_000);
}
