# KARTA ZADANIA E8.3 — TABELA GAŁĘZI ROZPŁYWU + STRATY (dopełnienie W-603)

**Faza:** U3 · **Epik:** E8 · **Wykonawca:** Sonnet · **Zależność:** wzorzec E8.1 +
delta wyboru wiersza (#4) scalone. **Wiążące:** `MODEL_INTERAKCJI` §2.7 i rejestr W-603
(wyniki rozpływu: tabele + profil — dziś w nowej powłoce jest TYLKO tabela szyn),
CLAUDE.md (NOT-A-SOLVER, determinizm, PL-only).

## 1. Cel
Dopełnienie okna rozpływu w nowej powłoce: tabela GAŁĘZI (przepływy mocy z obu końców,
straty) jako druga tabela zakładki „Rozpływ mocy" — przełączana podzakładką
Szyny/Gałęzie wewnątrz istniejącej `TabelaSzyn` (przemianowanie kompozycji na
`EkranRozplywu` z zachowaniem eksportu `TabelaSzyn` dla zgodności lub czysta
rozbudowa — decyzja wykonawcy, intencja testów istniejących MUSI być zachowana).

## 2. Dane (mapowania wiążące)
- Kształt 1:1: `PowerFlowBranchResult` — `ui/power-flow-results/types.ts:75-83`
  (branch_id, p_from_mw, q_from_mvar, p_to_mw, q_to_mvar, losses_p_mw, losses_q_mvar).
- Źródło read-only: `usePowerFlowResultsStore.results.branch_results` (store już
  wpięty przez `useWpiecieWynikow` — NIE dodawaj ładowań).
- Kolumny: Gałąź, P początek [MW], Q początek [Mvar], P koniec [MW], Q koniec [Mvar],
  Straty P [kW] (przelicz prezentacyjnie MW→kW z komentarzem — to skalowanie jednostki,
  nie fizyka), Straty Q [kvar]. `sortKey` liczbowy; identyfikator gałęzi w kolumnie
  głównej (etykieta = branch_id — kontrakt nie niesie nazwy PL; pokaż branch_id jako
  etykietę pierwszoplanową TYLKO jeśli jest ludzka nazwa… ZBADAJ: jeśli branch_id to
  surowy identyfikator, kolumna główna w trybach podstawowych pokazuje go bez zmian —
  identyfikatory gałęzi są oznaczeniami elementów sieci (jak oznaczenia katalogowe),
  dopuszczone §2.7; odnotuj decyzję w raporcie).
- Suma strat: wiersz podsumowania POD tabelą (Σ strat P i Q z danych — arytmetyka
  prezentacji z komentarzem, nie fizyka).
- ZAŁOŻENIA: te same co tabela szyn (`naZalozeniaRozplywu` — reużyj).

## 3. Pliki (TYLKO `frontend/src/ui2/wyniki/rozplyw/**`)
Rozbudowa: `TabelaGalezi.tsx` (na `EkranAnalizy` lub `TabelaWynikow` — spójnie z szynami),
adapter w `adapters/rozplywAdapter.ts` (`naWierszeGalezi`, `KOLUMNY_GALEZI` — czyste),
podzakładka w kompozycji, `strings.ts` (+etykiety), `__tests__/` (≥ 14 nowych testów,
fixture 1:1 rozszerzony o branch_results; istniejące testy szyn zielone bez zmiany
intencji).

## 4. Zasady i kryteria
Kryteria: (1) podzakładki Szyny/Gałęzie (roving tabindex jak zakładki warsztatu),
(2) tabela gałęzi: sort po każdej kolumnie liczbowej, suma strat pod tabelą,
(3) stany puste uczciwe (wynik bez gałęzi), (4) testy szyn bez regresji, (5) pełne
bramki jak E1.1 §8 (pipefail; pełny vitest ZERO failed; guardy codenames/terminologia/
mojibake). Commit `feat(ui2/wyniki): tabela gałęzi rozpływu ze stratami (E8.3)` BEZ push.
Raport standardowy.
