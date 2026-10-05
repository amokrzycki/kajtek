# Changelog

## 0.13.0

Kajtek zbiera statystyki odtwarzania, które możesz sprawdzić w ustawieniach. Pomijanie reklam działa stabilniej.

- Przycisk „Statystyki”, obok pomocy, motywu i ustawień, otwiera podsumowanie czasu pominiętych reklam o znanej długości, utworów ominiętych dzięki czarnej liście, automatycznych przełączeń i czasu słuchania. Dane od teraz zapisują się lokalnie. Możesz przeglądać statystyki z tego tygodnia lub z całego okresu. Lista do pięciu najczęściej słuchanych stacji uwzględnia rzeczywisty czas słuchania. Dotychczasowe statystyki zostają zachowane, a czas dla poszczególnych stacji jest liczony od tej aktualizacji.
- Przyciski „Przełącz teraz” i „Zostań mimo to” nie znikają spod kursora podczas odliczania. Ręczne przełączenie działa niezależnie od limitu automatycznych przełączeń.
- „Co teraz gra?” pokazuje aktualne utwory i audycje na włączonych stacjach, z okładką utworu lub obrazkiem stacji. Widok listy i kafelków jest wspólny dla obu zakładek, a przełączanie między nimi ma krótkie, płynne przejście. Kliknij treść, aby wybrać stację w istniejącym odtwarzaczu. Małe oznaczenia pokazują czarną listę, wykonawców z ulubionych utworów oraz starsze dane; dotychczasowa lista i katalog stacji pozostają dostępne.
- Po przełączeniu Kajtek wraca na poprzednią stację, gdy reklama faktycznie się skończy. Jeśli jej długość jest nieznana, czeka 3 minuty lub do końca bloku reklamowego.
- Czas pominiętych reklam liczy się też dla przerw RMF z zaplanowanym początkiem i końcem w playliście, wyłącznie w ich trakcie. Przerwy bez znanego końca nadal nie są przeliczane na minuty.
- Odrzucone ostrzeżenie o reklamie nie pojawia się ponownie, gdy zacznie się blok reklamowy.

## 0.12.1

Czytelniejsze komunikaty i łatwiejsza obsługa.

- Motyw podąża za ustawieniami systemu, dopóki nie wybierzesz go ręcznie. W ustawieniach możesz wrócić do trybu „Zgodny z systemem”.
- Uspokojono animacje ikon i znaczników oraz rozjaśniono symbol pustej okładki.

- Przyspieszono rozpoczęcie ładowania czcionek odtwarzacza i stron prawnych.

- Czarna obudowa wyraźniej odcina się od tła w ciemnym motywie. Przełączniki mają czytelny stan wyłączony i oznaczenia I/O.

- Powiększono drobne opisy, znaczniki i czasy utworów; ujednolicono rozmiary tekstu także na telefonie.

- Długie nazwy stacji nie rozpychają odtwarzacza ani katalogu; pełną nazwę pokazuje dymek.
- Widok listy ma jedną kolumnę, a widok kafelków pozostaje siatką. Pusta sekcja ulubionych jest ukryta.
- Kliknięcie wiersza katalogu nie zmienia listy stacji — służy do tego przełącznik. Indeks A–Z przygasa przy braku wyników.
- Błąd odtwarzania ma czerwony komunikat i przycisk „Ponów”.
- Dodanie własnej stacji czyści wyszukiwanie, otwiera zakładkę WŁASNE i pokazuje potwierdzenie.
- Panel utworów nazywa się PLAYLISTA. Ujednolicono nazwy własnych stacji.
- Pierwszy start prowadzi od wyboru stacji do rozszerzenia listy w katalogu i wskazuje sześć kolorów obudowy w ustawieniach.
- Przycisk „Wstaw aktualny utwór” uzupełnia formularz czarnej listy.
- Wyłącznik czasowy wyjaśnia, jak go anulować.
- Wyśrodkowano suwak głośności pod nagłówkiem, aby lepiej wypełniał panel obok wyłącznika czasowego.
- Skrócono opisy zmian i uproszczono politykę prywatności.
- Poprawiono opisy dla czytników ekranu, kontrast i fokus klawiatury. Wskaźnik VU uwzględnia ograniczenie ruchu.
- Powiększono pola dotykowe, zmniejszono panel sterowania na telefonie i poprawiono obudowę na wąskich ekranach. Strony prawne zachowują wybrany motyw i kolor obudowy.

## 0.12.0

Wygodniejsza obsługa, zwłaszcza na telefonie.

- Pomijanie reklam jest domyślnie włączone. Zmienisz je przełącznikiem „REKLAMY: GRAJ / POMIŃ” na obudowie.
- Skróty: spacja — odtwarzanie i pauza, ←/→ — zmiana stacji, M — wyciszenie, 1–4 — wyłącznik czasowy. Pełna lista jest w stopce na komputerze.
- Przycisk ? i klawisz ? otwierają pomoc „Jak słuchać”.
- W katalogu możesz odsłuchać stację bez dodawania jej do swojej listy. Łatwiej też wyczyścić wyszukiwanie i zmienić filtry.
- Wyłącznik czasowy ścisza radio przez ostatnie 8 sekund. Miniatury własnych stacji mają kolor obudowy.
- Blokadę utworu można cofnąć. Usunięcie własnej stacji wymaga potwierdzenia.
- Poprawiono katalog, formularze i ustawienia na telefonie oraz obsługę klawiatury i czytników ekranu.
- Formularz własnej stacji ostrzega przed adresem http://. Pomoc wyjaśnia, jak włączyć stacje w katalogu.
- Numer wersji w stopce otwiera listę zmian. Tytuł karty pokazuje utwór i stację.
- Dodano licencję MIT.

## 0.11.3

Dodano politykę prywatności i informacje prawne Kajtka.

## 0.11.2

Naprawiono problem z odtwarzaniem lokalnych stacji radiowych w Kajtku na urządzeniach z systemem iOS.

## 0.11.1

Poprawki błędów i optymalizacje.

- Pauza anuluje oczekujące automatyczne przełączenie stacji, a ulubione utwory z różnych stacji nie kolidują ze sobą.
- Poprawiono bezpieczeństwo danych programu, obsługę uszkodzonych metadanych ESKA i dostępność sterowania okładką oraz głośnością.
- Godziny serwisów RMF i ramówka Trójki są poprawne również poza polską strefą czasową.

## 0.11.0

Usprawnienia w obrębie całego interfejsu Kajtka, poprawki błędów i optymalizacje.

- Płynniejsze wyciszanie przy szybkich kliknięciach oraz blokada przewijania tła w oknach dialogowych.
- Czytelniejszy pierwszy start, widoczny stan połączenia i pełna obsługa katalogu oraz listy stacji klawiaturą.
- Wskaźnik transmisji zmienia kolor podczas buforowania i po błędzie odtwarzania.
- Płynniejsze rozwijanie zarządzania katalogiem, zmiany statusu odtwarzania i wciskanie kart stacji.
- Stan odtwarzania poprawnie reaguje na pauzę wywołaną przez iOS, Androida i systemowe przyciski multimedialne.
- Kajtek pamięta ostatnio wybraną stację bez automatycznego odtwarzania, a zależne ustawienia reklam pokazują swój stan wyraźniej.
- Automatyczny powrót po pominięciu reklamy można anulować bez zmiany stacji.

## 0.10.2

Naprawienie problemów z odtwarzaniem stacji radiowych z sieci ESKA w Kajtku.

## 0.10.1

Poprawione stereo i jakość dźwięku stacji ESKA :)

## 0.10

Sieć ESKA dołącza do Kajtka!

- Radio ESKA dostępne od razu, bez żadnej konfiguracji, 65 kanałów regionalnych i tematycznych (ESKA Do Pracy, K-POP, GORĄCA 100, Impreska i inne)
- Cała sieć ESKA w katalogu stacji: 65 kanałów regionalnych i tematycznych (ESKA Do Pracy, K-POP, GORĄCA 100, Impreska i inne), kliknij „Odśwież listę”
- Filtrowanie katalogu wg sieci nadawców (chipy) w zakładce WSZYSTKIE

## 0.9

Motywy! Kajtek posiada teraz 6 motywów kolorystycznych, które możesz zmieniać w ustawieniach aplikacji!

- Nowe motywy kolorystyczne obudowy: czerwony, zielony, żółty, niebieski, różowy i czarny
- Automatyczny powrót na poprzednią stację po zakończeniu reklam (włączany w ustawieniach)
- Poprawiona niezawodność pomijania reklam, Kajtek nie przełączy Cię już na stację, która akurat gra reklamę lub utwór z czarnej listy
- Masz teraz 5 sekund na reakcję przed automatycznym przełączeniem stacji, jeśli wejdziesz na stację, która gra reklamę lub utwór z czarnej listy
- Aplikacja posiada teraz system pierwszego uruchomienia, który pomoże Ci w konfiguracji Kajtka

## 0.8

Dziękuje bardzo za korzystanie z Kajtka!

- Aplikacja po aktualizacji, będzie pokazywać powiadomienia o nowościach w danej wersji!
- Nowy panel ustawień aplikacji
- Pomijanie reklam, automatyczne przełączanie stacji na czas reklam (dostępne w ustawieniach)
- Czarna lista utworów, automatyczne przełączanie stacji (dostępne w ustawieniach)
- Głośność ustawiona przez Ciebie jest teraz pamiętana
- Płynniejsze przejścia dla ostrzeżeń i timera
- Poprawki błędów i optymalizacje (mam nadzieję)
