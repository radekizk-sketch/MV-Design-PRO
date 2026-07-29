# KARTA ZADANIA P47 — PULPIT INSTALACJI OZE (kokpit specjalisty OZE)

**Faza:** U4 (strumień OZE, po P39) · **Epik:** E11 · **Wykonawca:** Opus · **Wiążące:**
`PROPOZYCJE_ROZSZERZEN` P47 (agregacja, bez delty backendowej rdzenia),
`MODEL_INTERAKCJI` §2.7, `AUDYT_RADY_SPECJALISTOW` (specjalista OZE), CLAUDE.md
(NOT-A-SOLVER, read-only, zero zgadywania, PL-only).

## 1. Cel
Jeden ekran per źródło wytwórcze (PV/BESS/FW): kokpit specjalisty OZE agregujący
ISTNIEJĄCE dane — bez własnych obliczeń i bez nowych końcówek API. Lewa kolumna: lista
modułów projektu (z klasą i statusem zgodności po biegu). Prawa: karta wybranego modułu.

## 2. Sekcje karty modułu (zakres wiążący)
1. **Dane modułu** (read-only z modelu/katalogu): rodzaj, moc znamionowa, napięcie
   przyłączenia (przez `rozwiazNapiecieKv` z P39 — stan „brak danych" gdy nieoznaczalne),
   strona przyłączenia, odnośniki katalogowe. Źródło: `useStationDerStore`/`selectAllDers`
   (`ui/network-build/station-der/store.ts:88,245`) + adaptery P39
   (`ui2/oze/macierz/macierzModel.ts` — REUŻYJ `zbudujModuly`, NIE duplikuj).
2. **Zgodność NC RfG**: podsumowanie per moduł (X/Y wymaganych spełnionych, klasa modułu
   A/B/C/D z `module_type` wyniku) + lista testów niespełnionych z akcjami naprawczymi.
   WYMAGA wspólnego stanu biegu: wyciągnij stan biegu NC RfG (katalog, operator, wynik,
   status) z lokalnego stanu `MacierzNcRfg` do lekkiego store'a `ui2/oze/ncRfgStore.ts`
   (zustand; akcje `zaladujKatalog`/`przeprowadzTesty` wołające ISTNIEJĄCEGO klienta
   `ui/ncrfg-tests/api.ts` — logika przeniesiona 1:1, macierz przełączona na store;
   zero zmiany zachowania macierzy — testy macierzy muszą przejść bez zmian intencji).
3. **Praca magazynu** (tylko BESS): parametry magazynu dostępne w danych DER (zbadaj
   realny kształt `StationDerConnection` — pojemność/moc, jeśli dane istnieją; brak →
   sekcja pominięta, nie pusta atrapa).
4. **Zdolność punktu przyłączenia** i **Jakość energii**: moduły analizy
   `analysis/grid_strength` i `analysis/reactive_adequacy` NIE mają końcówek API ani
   frontonu (rekonesans zarządcy 2026-07-16) — sekcje renderują JAWNY stan „analiza
   dostępna w silniku, niewpięta do interfejsu" + TODO-KARTA delty backendowej
   (wpięcie API tych analiz = osobna karta; NIE wpinaj w tej karcie).
5. **Dokumenty**: odnośnik „przejdź do dokumentacji" (callback `onNawiguj` z propsów;
   bez implementacji dokumentów w tej karcie).

## 3. Pliki (TYLKO `frontend/src/ui2/oze/pulpit/**` + `ui2/oze/ncRfgStore.ts` + korekta macierzy + re-eksport `ui2/oze/index.ts`)
`PulpitOze.tsx` (lista modułów + karta), `KartaModulu.tsx`, `SekcjaZgodnosci.tsx`,
`pulpitModel.ts` (czyste adaptery nad `zbudujModuly` + wynikiem NC RfG), `strings.ts`,
`pulpit.css` (tokeny --mvd-*), `index.ts`, `__tests__/` (≥ 22 testy; w tym testy
`ncRfgStore` i regresyjne macierzy po przełączeniu na store).

## 4. Zasady i kryteria
Identyfikatory tylko w trybie eksperckim; werdykty/klasy wyłącznie z odpowiedzi backendu.
Kryteria: (1) lista modułów z klasą i statusem po biegu (bez biegu — stan „testy
nieprzeprowadzone" + przycisk), (2) karta modułu: sekcje 1–5 wg §2 (uczciwe stany),
(3) macierz NC RfG działa na wspólnym store bez zmiany zachowania (jej testy zielone),
(4) bieg przeprowadzony w pulpicie widoczny w macierzy i odwrotnie (jeden stan),
(5) pełne bramki jak E1.1 §8 (pipefail; pełny vitest ZERO failed; guardy).
Commit `feat(ui2/oze): pulpit instalacji OZE (P47)` BEZ push. Raport standardowy
z mapowaniami plik:linia i TODO-KARTA.
