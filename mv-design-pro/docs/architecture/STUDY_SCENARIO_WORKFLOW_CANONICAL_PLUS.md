# P23 — Study / Scenario Workflow (CANONICAL+)

> **ZASTĄPIONY (2026-09-04):** model Study/Scenario/Run tej warstwy (P23, `application/study_scenario/**`, bez routera API, 2 konsumentów) jest konsolidowany w `REVISION_SCENARIO_EXECUTION_MODEL.md` (pozycja C4 inwentarza: strangle → delete procedurą kasacji). Dokument zachowany jako materiał wejściowy do czasu kasacji kodu; nie jest źródłem kanonicznym.


## Cel i zakres (P23)

Celem P23 jest wprowadzenie **kanonicznego workflow Study → Scenario → Run** jako
warstwy **orchestration (read-only)**, która porządkuje istniejące analizy, dowody i raporty
(P11–P24+) w **spójny, deterministyczny i audytowalny model pracy inżynierskiej**.

**Warstwa P23 NIE jest solverem** i **NIE uruchamia obliczeń**. To wyłącznie
warstwa organizacyjna, referencyjna i audytowa.

## Mapowanie referencyjne → MV-DESIGN-PRO (CANONICAL+)

| Referencja branżowa | MV-DESIGN-PRO (CANONICAL+) | Różnica jakościowa |
|------|-----------------------------|--------------------|
| Study Case / Project | **Study** | MV przechowuje *wiedzę o przypadku*, nie tylko konfigurację |
| Scenario / Case | **Scenario** | Jawne zależności + deterministyczne ID + hash |
| Run / Calculation | **Run** | Read-only run history, status **NOT COMPUTED** zamiast FAIL |
| Results Browser | **Post-hoc Views** (P11–P24+) | Konsumpcja wyników bez recompute |

## Lifecycle Study → Scenario → Run

1. **Study** — nadrzędny kontekst projektowy:
   - deterministyczny `study_id` i `hash`,
   - opis, autor, założenia, profil normatywny,
   - **brak** jakiejkolwiek logiki obliczeniowej.

2. **Scenario** — wariant pracy sieci:
   - zawsze przypięty do Study,
   - jeden Study → wiele Scenario,
   - **dokładnie jeden Base Scenario**,
   - deterministyczny `scenario_id` i `hash`,
   - referencje do stanów (switches/sources/loads/constraints).

3. **Run** — niezmienny zapis uruchomienia:
   - zawsze przypięty do Scenario,
   - wiele Run per Scenario,
   - **immutable history** (bez mutacji i bez recompute),
   - status: **COMPLETE** albo **NOT COMPUTED**.

## Relacje do P20, C-P22, P24+

Run nie generuje wyników — **konsumuje je post-hoc**.
Każdy Run może wskazywać:

- **P11–P19 ProofDocuments** przez `proof_set_ids`,
- **P20 NormativeReport** przez `normative_report_id`,
- **P21 VoltageProfileView** przez `voltage_profile_view_id`,
- **P22a ProtectionInsightView** przez `protection_insight_view_id`,
- **C-P22 Curves I-t** przez `protection_curves_it_view_id`,
- **P24+ PDF Report** przez `report_p24_plus_id`.

**Ważne:** wszystkie te artefakty są *referencjami*, nie triggerami.
Run nie uruchamia solvera ani generatorów dowodów.

## Zasady audytowe i determinism

- **Deterministyczne ID i hash** dla Study i Scenario.
- **Stabilna serializacja JSON** (sortowanie kluczy i list).
- **Brak danych wejściowych → NOT COMPUTED**, nigdy FAIL.
- **Run niezmienny** — historia uruchomień jest audytowalna.
- **Pełna ścieżka referencji** Study → Scenario → Run widoczna w inspectorach.

## Co P23 NIE robi (explicit)

- **Nie dodaje solverów** i nie zmienia Result API.
- **Nie wprowadza nowych obliczeń** ani heurystyk.
- **Nie uruchamia recompute** przy odczycie danych.
- **Nie zastępuje istniejących pojęć Case/Project** — to warstwa orchestration.
