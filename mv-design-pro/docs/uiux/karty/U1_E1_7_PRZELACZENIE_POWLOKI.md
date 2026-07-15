# KARTA ZADANIA E1.7 — PRZEŁĄCZENIE APLIKACJI NA NOWĄ POWŁOKĘ (finał U1)

**Faza:** U1 (finał) · **Wykonawca:** ZARZĄDCA · **Status:** DO REALIZACJI (następna sesja robocza)

## 1. Decyzja architektoniczna (kluczowa — zapis przed realizacją)
„Stare ginie w tym samym PR" dotyczy FUNKCJI przejmowanej, nie całej aplikacji naraz.
E1.7 przejmuje funkcję POWŁOKI: `AppRoot` (ui2) staje się produkcyjnym wejściem, a stara
powłoka/nawigacja (`ui/shell`, `ui/navigation`, `ui/main-menu`-podobne, stary layout) ginie.
Widoki dziedzinowe starego UI (wyniki, zabezpieczenia, kreator, SLD, …) NIE giną w E1.7 —
zostają zamontowane JAKO WARSZTAT właściwych przestrzeni nowej powłoki przez adapter
`LegacySurface` (most tymczasowy), a giną pojedynczo w kartach U2–U4, gdy nowe okna
przejmują ich funkcje (rejestr okien = lista wygaszania). To utrzymuje: zero utraty funkcji
(macierz pokrycia), zero dwóch powłok, jedną prawdę nawigacji.

## 2. Zakres
1. `frontend/src/App.tsx` / `main.tsx`: wejście = `AppRoot` (ui2); usunięcie starego szkieletu
   powłoki z drzewa renderowania.
2. `ui2/legacy/LegacySurface.tsx`: montaż istniejących powierzchni (z `ui/workspace/surfaces/**`
   i tras App) w środkowym panelu per przestrzeń (mapowanie przestrzeń → stara powierzchnia,
   z rejestrem w jednym pliku — to jest jawna lista długu do wygaszenia).
3. Usunięcie martwych po przełączeniu plików starej powłoki (te, których jedyną funkcją była
   powłoka/nawigacja) — w TYM SAMYM commicie; aktualizacja ich testów.
4. Kanał zdarzeń: selekcja/przypadek działa dla powierzchni legacy przez istniejące store'y
   (magistrala już je tłumaczy — E15.1); brak dodatkowych mostków.
5. E2E krytyczne: przejście dymne przez 7 przestrzeni + stara ścieżka `critical-run-flow`
   musi pozostać zielona (Playwright).

## 3. Bramki (pełne, pipefail)
type-check · lint · PEŁNY vitest · `npm run test:e2e` (mock) · guardy: codenames, terminologia
(z E1.6), forbidden_ui_terms, dead_click, mojibake · przegląd wizualny vs makieta U0.6.
Raport fazowy U1 wg formatu promptu zarządcy po scaleniu.

## 4. Ryzyko i wycofanie
Największa karta styku ze starym kodem w U1. Wycofanie = rewert jednego commita przełączenia.
Realizacja krokami: (a) LegacySurface + mapowanie, (b) przełączenie wejścia, (c) kasacja starej
powłoki, (d) bramki + e2e — commit dopiero po komplecie zieleni.
