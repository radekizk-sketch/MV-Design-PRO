# Compare modules — scope index (Pakiet I)

## Decyzja architektoniczna (binding, D6)

NIE konsolidujemy 3 modułów `compare*` w polimorficzny moduł.
3 odmienne kontrakty, różne API, różne źródła danych — refactor podniósłby
ryzyko zmiany snapshot hash w `comparison/SLD_COMPARISON_MODE`.

Strategia: **uporządkowanie BEZ konsolidacji**:
- `compare/shared/types.ts` — tylko wspólne typy `ComparisonRow`, `DiffSeverity`
- `compare/INDEX.md` (ten plik) — opis scope każdego modułu
- `compare/index-aggregate.ts` — barrel re-export (bez refactoru kontraktów)

## Modules

### `compare/`
**Scope:** A/B selektor runs + delta table.
**Główny komponent:** `CompareView.tsx`
**Store:** `compare/store.ts`
**Kontrakt:** `compare/types.ts` — własne typy diff
**Kiedy użyć:** porównanie 2 wybranych runów (różne case'y lub różne snapshoty)
**NIE używać do:** porównania szyn/gałęzi w obrębie jednego runa.

### `comparison/`
**Scope:** A/B comparison szyn/gałęzi (`SLD_COMPARISON_MODE`).
**Główny komponent:** `ResultsComparisonPage.tsx`
**Kontrakt:** `comparison/types.ts` — własne typy diff dla SLD elementów
**Specyfikacja:** `comparison/SLD_COMPARISON_MODE.md`
**Kiedy użyć:** overlay na SLD pokazujący różnice szyn/gałęzi A vs B.
**KRYTYCZNE:** snapshot hash zależy od kontraktu — NIE refactorować kontraktu
bez bumpu wersji.

### `comparisons/`
**Scope:** SC + SLD delta overlay (lista porównań z banerami).
**Główny komponent:** `ComparisonPanel.tsx`
**Store:** `comparisons/store.ts`
**Kontrakt:** `comparisons/types.ts` — własne typy
**Kiedy użyć:** lista możliwych porównań w panelu kontekstowym TP.

### `protection-comparison/`
**Scope:** device-centric porównanie nastaw zabezpieczeń.
**Status:** SAMODZIELNE — właściwy scope, NIE część rodziny `compare*`.
**Kiedy użyć:** porównanie 2 urządzeń zabezpieczających (TCC + nastawy).

## Re-export pattern

`compare/shared/types.ts` definiuje wspólne typy (`ComparisonRow`,
`DiffSeverity`) z helperami pure (sortBySeverityDesc, filterByMinSeverity,
computeDeltaPercent). 3 moduły mogą rozszerzać te typy o własne pola.

## Co NIE robić

1. **NIE merge'ować** `compare/`, `comparison/`, `comparisons/` w jeden moduł.
2. **NIE refactorować** kontraktów `comparison/types.ts` bez bumpu wersji
   (snapshot hash w `SLD_COMPARISON_MODE` jest deterministyczny).
3. **NIE używać** typu `DiffSeverity` z `compare/types.ts` —
   importować z `compare/shared/types.ts` (wspólne źródło).
4. **NIE generować** etykiet PL inline — używać `DIFF_SEVERITY_LABELS_PL`.
