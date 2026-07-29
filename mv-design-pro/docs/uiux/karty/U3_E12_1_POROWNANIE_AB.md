# KARTA ZADANIA E12.1 — PORÓWNANIE PRZEBIEGÓW A/B (W-609) NA WZORCU: ROZPŁYW

**Faza:** U3 · **Epik:** E12 · **Wykonawca:** Opus · **Zależność:** wzorzec E8.1 + delta
wyboru wiersza (scalenie U3 #4) scalone. **Wiążące:** `MODEL_INTERAKCJI` §2.7 i rejestr
W-609, `AUDYT_RADY_SPECJALISTOW` (porównania: delta zawsze z wartościami źródłowymi A i B,
ranking odchyleń), CLAUDE.md (NOT-A-SOLVER — porównanie liczy backend; determinizm).

## 1. Cel
Okno „Porównanie przebiegów" w nowej powłoce — konkretyzacja wzorca dla porównania A/B
rozpływu mocy: wybór dwóch zakończonych przebiegów rozpływu, uruchomienie porównania
w backendzie, prezentacja: podsumowanie (zbieżność A/B, straty A/B i delta, maks. delta
napięcia/kąta, liczby problemów wg wagi), tabela delt szyn, tabela delt gałęzi, ranking
problemów. Fronton NICZEGO nie liczy — całość z odpowiedzi backendu.

## 2. Dane (rekonesans wykonany — mapowania wiążące)
- Kontrakt API (istnieje): `ui/power-flow-comparison/api.ts` —
  `POST /power-flow-comparisons` (`api.ts:39`), pobranie wyniku (`api.ts:68,90`),
  lista przebiegów rozpływu `fetchPowerFlowRuns` (`api.ts:111`). NIE tworzyć własnego
  klienta — REUŻYĆ importem.
- Kształty 1:1: `PowerFlowComparisonResult` (`ui/power-flow-comparison/types.ts:174-186`:
  bus_diffs, branch_diffs, ranking, summary, input_hash),
  `PowerFlowComparisonSummary` (`types.ts:149-165`), wiersze diff
  (`PowerFlowBusDiffRow`/`PowerFlowBranchDiffRow`/`PowerFlowRankingIssue` — zbadaj
  dokładne pola w `types.ts` przed kodowaniem; fixtures 1:1).
- Stary widok (wzór, NIE modyfikować): `ui/power-flow-comparison/PowerFlowComparisonPage.tsx`.
- Rejestr przebiegów do wyboru A/B: `useExecutionRunsStore.runs` filtrowane
  LOAD_FLOW/DONE (`ui/study-cases/runStore.ts:40`, typy `types.ts:234-243`) LUB
  `fetchPowerFlowRuns` — zbadaj, które źródło niesie komplet (etykieta PL = data +
  przypadek); wybierz jedno i uzasadnij w raporcie.

## 3. Pliki (TYLKO `frontend/src/ui2/wyniki/porownanie/**` + re-eksport w `ui2/wyniki/index.ts`)
`EkranPorownania.tsx` (kompozycja: wybór A/B [dwa selecty z przebiegami PL + przycisk
„Porównaj przebiegi"; stany: w trakcie/błąd/wynik], podsumowanie jako ZAŁOŻENIA wzorca
[każda pozycja: wartość A, wartość B, delta], zakładki wewnętrzne Szyny/Gałęzie/Ranking
— trzy tabele na `EkranAnalizy`/`TabelaWynikow` z progami→tagi wg wag problemów),
`porownanieModel.ts` (typy + czyste adaptery `naWierszeSzynDiff`/`naWierszeGalezi`/
`naWierszeRankingu`/`naZalozeniaPorownania`; kolumny delta: wartość A, wartość B, Δ
z `sortKey`), `strings.ts` (PL, formatery deterministyczne przecinek PL), `porownanie.css`
(tylko tokeny --mvd-*), `index.ts`, `__tests__/` (≥ 22 testy; fixtures 1:1 z realnym
`PowerFlowComparisonResult`; API mockowane `vi.mock`).

## 4. Zasady i kryteria
Identyfikatory (run id, comparison_id, input_hash) tylko w trybie eksperckim. Wagi
problemów → tagi PL (krytyczny/poważny/umiarkowany/drobny — sprawdź dokładne wartości
enum w types.ts, mapuj słownikiem PL). Kryteria: (1) wybór A/B tylko spośród zakończonych
przebiegów rozpływu + jawny bieg porównania (zero automatyzmu), (2) podsumowanie: A, B
i delta zawsze razem; delta z tagiem przy niezerowych problemach, (3) tabele diff:
sort po Δ, progi→tagi wg wag z backendu, wybór wiersza rankingu → szczegół problemu
(opis PL), (4) stany puste/błąd/w trakcie uczciwe, (5) pełne bramki jak E1.1 §8
(pipefail; pełny vitest foreground ZERO failed; guardy codenames/terminologia/mojibake).
Commit `feat(ui2/wyniki): porównanie przebiegów A/B rozpływu na wzorcu (E12.1)` BEZ push.
Raport standardowy z mapowaniami plik:linia i TODO-KARTA (m.in. porównanie zwarć =
osobna karta; nakładka delta na schemacie = wątek SLD przez kartę koordynacyjną).
