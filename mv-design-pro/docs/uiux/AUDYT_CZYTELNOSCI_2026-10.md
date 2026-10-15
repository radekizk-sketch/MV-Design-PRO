# Audyt czytelności ekranów — 2026-10-15 (po partii integracji 7)

Status: WIĄŻĄCY dla kart naprawczych czytelności (dyrektywa właściciela 2026-07-18 pkt 5:
audyt wielosoczewkowy przed przebudową). Wyzwalacz: ocena właściciela zrzutów partii 7 —
„Nieczytelne!”. Werdykt wizualny po poprawkach należy do właściciela (bramka B-02).

## 1. Metoda

Materiał: zrzuty żywej aplikacji (e2e na realnym backendzie, oba motywy) w pełnej
rozdzielczości 1440×900, nie pomniejszone; pomiar geometrii na żywym DOM (Playwright:
położenie i wymiary dzieci paska tytułowego); pomiar klas defektu w kodzie (grep/AST).
Porównanie z konwencjami interfejsów narzędzi klasy DIgSILENT PowerFactory, ETAP i NEPLAN
— z ich publicznie znanych układów okien (pasek narzędzi ikon z podpowiedziami, siatki
wyników z jednostką w nagłówku i krótkim statusem, osobne okno/pole szczegółów, okna
wykresów z legendą poza obszarem rysowania, stałe palety krzywych). Porównanie dotyczy
konwencji układu, nie zrzutów tych programów (w sesji nie było dostępu do licencji).

Soczewki: projektant sieci SN (tok pracy, gęstość informacji), specjalista zabezpieczeń
(tabela ocen, werdykt), dynamika/OZE (wykresy przebiegów), UX/IA (pasek tytułowy, pasek
kontekstu, kreatory), dostępność (kontrast w obu motywach), wizualizacja danych (paleta,
legenda, walidacja CVD).

## 2. Ustalenia (z pomiarem) i rozstrzygnięcia

| # | Ekran / miejsce | Defekt (pomiar) | Konwencja narzędzi profesjonalnych | Rozstrzygnięcie |
|---|---|---|---|---|
| C-1 | Pasek tytułowy — menu „Widok” | Na żywym DOM `div.mvd-menu` ma x = 14 px, szer. 160 px: blok „Widok” przykrywa logo i nazwę projektu („…jekt: E2E porown…”). Przyczyna: globalna kolizja klasy — `.mvd-menu` z `spaces/obliczenia/przypadki.css` (menu kontekstowe, `position: fixed`) | nazwa projektu zawsze widoczna w pasku okna | klasa defektu zmierzona: 35 klas CSS zdefiniowanych w > 1 pliku, 21 ze sprzeczną treścią — karta KOLIZJE-KLAS-CSS (jedno źródło na klasę + strażnik) |
| C-2 | Pasek tytułowy — przyciski | „Motyw: jasny (techniczny)”, „Zwiń lub rozwiń panel inspektora ⟩” łamią się w dwie linie (wysokość 53 px zamiast 34 px); glif „⟨ ⟩” renderuje się jak nawias | pasek narzędzi jednoliniowy, opis w podpowiedzi | etykiety jednoliniowe („Motyw: jasny”, „Nawigacja”, „Inspektor”), pełny opis w `title`/`aria-label`, stan panelu jako przycisk wciśnięty, `white-space: nowrap` |
| C-3 | Pasek kontekstu procesu | Liczniki „TR”, „Odbiory nN” wypływają POD ikony „Szukaj”, „Katalog” (kontener `flex-1 min-w-0` bez `overflow-hidden`); „Faza projektu:”, „Następny krok:” łamią się w dwie linie | pasek stanu z polami o stałej szerokości | grupa liczników przycina się na swojej granicy, etykiety `nowrap`, odstęp akcji 28 → 16 px |
| C-4 | Panel „Schemat i topologia” — „Następna akcja” | `text-cyan-100` na `bg-cyan-500/10`: w motywie jasnym tekst niewidoczny | kolory stanów z palety motywu | klasa: 19 plików `ui/**` z odcieniami pod tło ciemne — karta KOLORY-ZASZYTE-POD-MOTYW (tokeny `sygnal-*` + strażnik) |
| C-5 | Ocena zabezpieczeń na biegu zwarciowym | Uzasadnienie werdyktu w ostatniej kolumnie (~200 px) = ok. 20 linii na wiersz; nagłówki łamane w 3 linie | siatka wyników: krótki status w komórce, opis w polu szczegółów pod/obok | wiersz danych ze statusem + wiersz uzasadnienia na pełną szerokość (uzasadnienie WIDOCZNE — kontrakt werdyktu wyjaśnialnego), nagłówki jednoliniowe |
| C-6 | Wykres przebiegów dynamiki (E-32) | Paleta 6 kolorów, w tym `--mvd-sel` i `--mvd-muted` — serie prawie niewidoczne na tle; 12 serii = powtórzone kolory; legenda Recharts nad wykresem (11 px, kolor stłumiony) zabiera ok. połowę wysokości pola | okno wykresu: stała paleta krzywych, legenda poza obszarem rysowania | 8-kolorowa paleta kategoryczna `--mvd-seria-1…8` dla obu motywów, zwalidowana skryptem kontroli palet (CVD, rozróżnialność, kontrast); od 9. serii kreska jako drugi kod; legenda HTML pod wykresem, 12 px, tekst w kolorze tekstu |
| C-7 | Kreatory (13) — nagłówek | Nadtytuł i tytuł z tym samym napisem („MODEL SIECI · STACJA SN/nN” dwa razy) | jeden tytuł okna dialogowego | `KreatorRama` pokazuje nadtytuł tylko, gdy różni się od tytułu |
| C-8 | Kreator stacji — karta „Kontrola stacji” | Wartości czcionką o stałej szerokości, pogrubione, zielone, łamane w wąskiej kolumnie | pole właściwości: etykieta / wartość zwykłą czcionką | po scaleniu karty KOLIZJE-KLAS-CSS (te same klasy `mvd-gotowosc*`) |
| C-9 | Zrzuty kreatorów | `kreator_pole_light.png` złapał stan ładowania katalogu (wyszarzony zapis) | — | bramka przed każdym zrzutem czeka na koniec ładowania kreatorów (naprawione, osobny commit) |
| C-10 | Prawy panel inspektora na ekranach wyników | Pusty stan „Zaznacz element na SLD” zajmuje 300 px szerokości obok wąskiej tabeli | panel właściwości zwijany | do decyzji właściciela: zwijanie inspektora bez zaznaczenia na ekranach wyników (istnieje mechanizm `useInspektorZaZawartoscia` — zakres jego działania do ustalenia) |

## 3. Kryterium odbioru

Każde ustalenie C-1…C-9 ma zrzut przed/po (oba motywy) do werdyktu właściciela; C-1 i C-4
mają strażników nawrotu w CI; C-5…C-7 — testy jednostkowe ekranów zielone bez osłabiania
asercji treści (werdykt + uzasadnienie dalej w wierszu oceny).
