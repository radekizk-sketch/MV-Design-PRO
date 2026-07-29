# KARTA ZADANIA E8.2 — OKNO WYNIKÓW ZWARCIOWYCH (W-604) NA WZORCU

**Faza:** U3 · **Epik:** E8/E9 · **Wykonawca:** Opus · **Zależność twarda:** E8.1
(wzorzec `ui2/wyniki/wzorzec/**` scalony na gałęzi) · **Wiążące:** `MODEL_INTERAKCJI`
§2 i §2.7 (W-604: tabela punktów zwarciowych, wkłady, każda liczba 2×klik → dowód),
`AUDYT_RADY_SPECJALISTOW` (W-604: Ik", ip, Ith, Sk" zawsze razem; c-factor w założeniach),
`SPEC_POWIAZANIA_WARSTW` §3 (świeżość), CLAUDE.md (WHITE BOX, determinizm, PL-only).

## 1. Cel
Okno „Wyniki zwarciowe" w nowej powłoce — druga konkretyzacja wzorca `EkranAnalizy`:
tabela punktów zwarciowych z kompletem wielkości IEC 60909 oraz sekcją wkładów
gałęziowych dla wybranego punktu. Zero fizyki; wyłącznie prezentacja danych przebiegu.

## 2. Dane (rekonesans wykonany — mapowania wiążące)
- Kształt wiersza: `ShortCircuitRow` — `ui/results-inspector/types.ts:157-167`
  (`target_id`, `element_id?`, `target_name`, `ikss_ka`, `ip_ka`, `ith_ka`, `sk_mva`,
  `fault_type`, `flags`). Pobranie: `fetchShortCircuitResults(runId)` →
  `GET /analysis-runs/{run_id}/results/short-circuit` — `ui/results-inspector/api.ts:107`.
- Etykiety PL wielkości: `TRACE_VALUE_LABELS` — `ui/results-inspector/types.ts:306-333`
  (Ik" = „Prąd zwarciowy początkowy Ik"", ip = „Prąd udarowy ip", Ith = „Prąd cieplny Ith",
  Sk" = „Moc zwarciowa Sk""). `fault_type` mapuj przez słownik PL (sc_3f → „zwarcie
  trójfazowe" — wzór: `ui/workspace/analysisRunContract.ts:138-142`).
- Dowód: ślad `fetchExtendedTrace(runId)` ma `selection_index` i `target_id` per krok
  (`ui/results-inspector/types.ts:194-244`) — `onOtworzDowod(ref)` dostaje
  `target_id`/`element_id`; nawigację do dowodu podłącza zarządca przy scaleniu (callback
  z propsów, jak w E8.1).
- Wkłady gałęziowe: opcjonalne w backendzie (`include_branch_contributions` —
  `backend/src/api/fault_scenarios.py:77`; fronton dziś ich NIE renderuje). Zbadaj kształt
  odpowiedzi scenariuszy zwarciowych (`ui/fault-scenarios/types.ts`, backend
  `fault_scenarios.py`); jeżeli dane wkładów są osiągalne read-only — sekcja „Wkłady do
  zwarcia" (tabela: gałąź/źródło PL, prąd [kA], udział [%] liczony PREZENTACYJNIE jako
  stosunek wartości z danych — bez fizyki); jeżeli nie — sekcja przyjmuje dane przez props
  i powstaje TODO-KARTA delty backendowej (wkłady w tabeli short-circuit przebiegu).

## 3. Pliki (TYLKO `frontend/src/ui2/wyniki/zwarcia/**`)
`EkranZwarc.tsx` (kompozycja na `EkranAnalizy` z `ui2/wyniki/wzorzec`; kolumny
deklaratywne: Punkt zwarcia, Rodzaj zwarcia, Ik" [kA], ip [kA], Ith [kA], Sk" [MVA],
Uwagi(flags→tagi PL); założenia: współczynnik c, czas cieplny, metoda „IEC 60909";
wybór wiersza → sekcja wkładów), `WkladyZwarciowe.tsx`, `zwarciaModel.ts` (typy +
adapter read-only `mapujWierszZwarcia`), `strings.ts`, `zwarcia.css`, `index.ts`,
`__tests__/` (≥ 18 testów; fixture 1:1 z realnym kształtem `ShortCircuitRow`, w tym
wartości `null` → „—" oraz `flags` niepuste → tagi).

## 4. Zasady i kryteria
FreshnessBadge wyłącznie przez wzorzec (import z `ui2/inspector` już w EkranAnalizy —
nie duplikować). Liczby tabular-nums, jednostki zawsze, identyfikatory tylko w trybie
eksperckim. Wykres: opcjonalny słupkowy Ik" per punkt (Recharts, tokeny --mvd-*, dane
z propsów — zero losowości). Kryteria: (1) render 4 sekcji wzorca z danymi zwarciowymi
(stany: pusty/nieaktualny/komplet), (2) sort po każdej kolumnie liczbowej, progi→tagi
zgodnie z API wzorca, (3) 2×klik na wartości z `dowodRef` → `onOtworzDowod`,
(4) wybór punktu → wkłady (lub stan „dane wkładów niedostępne w tym przebiegu" gdy brak),
(5) pełne bramki jak E1.1 §8 (pipefail): type-check, lint --max-warnings 0, pełny vitest
(baza ≥ 7894 + nowe, foreground), guardy codenames/ui_terminology/mojibake.
Commit `feat(ui2/wyniki): okno wyników zwarciowych na wzorcu (E8.2)` BEZ push.
Raport standardowy z mapowaniami plik:linia i samooceną per kryterium.
