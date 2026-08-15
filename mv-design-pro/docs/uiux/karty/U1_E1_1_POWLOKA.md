# KARTA ZADANIA E1.1 — POWŁOKA APLIKACJI (W-110) + FUNDAMENT TOKENÓW

**Faza:** U1 · **Epik:** E1 · **Okna:** W-110 (powłoka), zalążek W-105 (wyszukiwarka — sam skrót i szkielet)
**Wykonawca sugerowany:** Opus · **Status:** GOTOWA DO DELEGACJI (pierwsza karta programu)
**Backlog pozostałych kart U1 (kolejność):** E1.2 nawigacja+drzewa kontekstowe · E1.3 inspektor
(zakładki/akordeon/pinezka) · E1.4 panel dolny + pasek stanu · E1.5 wyszukiwarka poleceń (W-105)
· E15.1 magistrala zdarzeń · E15.2 selekcja globalna + kontrakt świeżości · E2.1 pulpit projektu
(W-101) · E2.2 nowy/otwórz projekt (W-102) · E1.6 rozszerzenie ui_terminology_guard (U0.9).

---

## 1. Cel
Nowa powłoka aplikacji (clean-room): kontener trzech paneli z paskiem tytułowym, paskiem
aktywnego przypadku i paskiem stanu — zgodna 1:1 z zatwierdzoną makietą U0.6 (v6) i
`SPEC_UKLAD_PANELI_2026-07.md`. Persona: każda (powłoka wspólna).

## 2. Pliki
**Wejściowe (czytać, nie zmieniać):** `frontend/src/ui/shell/**`, `ui/navigation/**`,
`ui/layout/**`, `ui/status-bar/**`, `ui/workspace/**`, `ui/mode-gate/**`, `ui/app-state/**`
(stan zastany = inspiracja i zakres); makieta: artefakt U0.6 v6.
**Wyjściowe (nowe):** `frontend/src/ui2/shell/` — `AppShell.tsx`, `TitleBar.tsx`,
`CaseBar.tsx`, `PanelLayout.tsx` (grid 3 paneli + uchwyty + zwijanie), `StatusBar.tsx`,
`ModeSwitch.tsx`; `frontend/src/ui2/theme/tokens.css` (tokeny `--mvd-*`, oba motywy),
`frontend/src/ui2/theme/themeMode.ts`; testy w `frontend/src/ui2/shell/__tests__/`.
**Zasada przejęcia:** moduł `ui2/` to tymczasowy korzeń nowej powłoki NA CZAS U1; przełączenie
aplikacji na nową powłokę i usunięcie starej = karta E1.7 (stare ginie w tym samym PR co
przełączenie — do tego czasu stara powłoka pozostaje jedyną produkcyjną; `ui2` nie jest
importowane z produkcyjnego wejścia). Bez shadow-state: `ui2` używa istniejących store'ów.

## 3. Kontrakt danych
Powłoka NIE woła API bezpośrednio. Konsumuje istniejące store'y: aktywny przypadek
(`app-state`), tryb (`mode-gate`), status backendu (istniejący klient health). Rewizja modelu
i statusy pasków: z istniejącego snapshot store (tylko odczyt). Zero nowych endpointów.

## 4. Stany UI
Powłoka: ładowanie (szkielet), gotowa, brak projektu (pasek przypadku pokazuje „—" + akcja
„Otwórz projekt"), błąd połączenia (pasek stanu: wskaźnik czerwony + polski komunikat
z akcją „Połącz ponownie"). Panele: pełny/zwinięty (lewy do listwy ikon 48 px; prawy chowany).

## 4a. Kontrakt interakcji (MODEL_INTERAKCJI §2 + SPEC_UKLAD_PANELI §3)
Klawisze 1–7 = przestrzenie; `Ctrl+B`/`Ctrl+I` = zwiń lewy/prawy; `Ctrl+K` = szkielet
wyszukiwarki (pełna w E1.5); 2× klik na krawędzi panelu = zwiń/rozwiń; przeciągnięcie
krawędzi = szerokość (lewy 200–320, prawy 280–560); `Esc` zamyka menu/dolny panel; klik
pozycji paska stanu → zdarzenie otwarcia panelu dolnego (obsługa w E1.4). Tryb (Podstawowy/
Rozszerzony/Ekspercki) ukrywa elementy oznaczone trybem — bez przeładowania widoku.

## 5. Etykiety PL (dokładne stringi)
„Projekt", „Model sieci", „Schemat (SLD)", „Gotowość", „Obliczenia", „Wyniki i dowody",
„Dokumentacja"; „Aktywny przypadek", „Przypadków: {n}", „Model: rew. {n}", „Przebieg: {czas}",
„Wersja modelu" (odcisk SHA-256 migawki — K6/H-6 R4; dawniej „Odcisk wyników SHA-256",
chip nie miał żywego dostawcy), „Tryb", „Podstawowy", „Rozszerzony", „Ekspercki", „Zapisz",
„Przelicz aktywny przypadek", „Połącz ponownie", „Otwórz projekt", „Przywróć układ domyślny".
Zakaz identyfikatorów kodowych w tekstach pierwszoplanowych (MODEL_INTERAKCJI §2.7).

## 6. Granice
NIE dotykać: `ui/sld/**`, `ui/sld-editor/**`, `engine/sld-layout/**`, backendu, Result API,
istniejącej powłoki produkcyjnej (poza odczytem). Tokeny SLD (`--sld-*`) nie są duplikowane —
powłoka definiuje wyłącznie `--mvd-*` (karta koordynacyjna SLD-01). Nazwy trybów motywu:
`dark_scada`/`light_technical` (tylko w tokenach; w UI etykiety „ciemny (dyspozytorski)" /
„jasny (techniczny)").

## 7. Kryteria akceptacji (testowalne)
1. `panelLayout.test.tsx`: zwijanie/rozwijanie obu paneli (przyciski + skróty + 2× klik),
   granice szerokości, listwa ikon 48 px z dymkami, trwałość układu (mock storage) per
   użytkownik × przestrzeń, „Przywróć układ domyślny".
2. `modeSwitch.test.tsx`: 3 tryby; elementy `min-tryb` ukryte/odsłonięte bez remount
   (zachowany stan wewnętrzny); tryb nie zmienia store'ów danych.
3. `caseBar.test.tsx`: chip przypadku zawsze widoczny; stany modelu/gotowości/wyników z store;
   stan „brak projektu".
4. `tokens.test.ts`: wszystkie kolory komponentów powłoki przez `--mvd-*` (zero literałów hex
   w tsx); oba motywy definiują identyczny zbiór tokenów (parytet kluczy).
5. `shellA11y.test.tsx`: pełna ścieżka Tab przez powłokę, widoczny fokus, role ARIA
   (nav/main/complementary/status), kontrast tokenów ≥ AA (test progowy na parach tło/tekst).
6. Render wizualny: artefakt porównany z makietą U0.6 v6 (samoocena w raporcie wykonawcy).

## 8. Bramki (pełne, przed commitem)
`npm run type-check` · `npm run lint` · pełny `npx vitest run --no-file-parallelism` ·
`npm run guard:codenames` · `python scripts/forbidden_ui_terms_guard.py` ·
`python scripts/ui_terminology_guard.py` · `python scripts/dead_click_guard.py` ·
`python scripts/utf8_mojibake_guard.py`. Commit na gałąź `claude/uiux-e1-1-powloka`,
diff wraca do zarządcy (zarządca uruchamia bramki niezależnie przed integracją).

## 9. Recenzja rady specjalistów
Perspektywy: projektant sieci (przepływ 7 przestrzeni odpowiada pracy projektowej),
eksploatacja (pasek przypadku i stanu czytelne bez szkolenia), audytor WHITE BOX (rewizja
i odcisk widoczne; zero danych pochodnych bez rewizji), dostępność (checklista A11y §7.5).
Powiązania (SPEC_POWIAZANIA §5): subskrybuje `przypadek-aktywny`, `gotowość-zmieniona`,
`model-zmieniony(rev)`, `wyniki-nieaktualne/gotowe` (paski); emituje `przestrzeń-aktywna`,
żądanie otwarcia panelu dolnego. Deklaracja obowiązkowa w kodzie karty.
