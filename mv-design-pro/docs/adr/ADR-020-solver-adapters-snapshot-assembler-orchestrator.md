# ADR-020: Adaptery solverów — migawka kanoniczna, assembler wejść, orkiestrator i zadania

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §2–§3, §7; `../twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md` §2.3

## Kontekst
10 builderów rozpływu / 7 ścieżek zwarć z rozbieżną interpretacją (c=1,0 vs 1,1), 4 macierze Ybus, 5 torów uruchomienia, 4 rejestry biegów, solvery synchronicznie w żądaniu HTTP, Celery z 0 zadań (A3-01/02/07, A9-02/10).

## Decyzja
`CanonicalNetworkSnapshot` (z `EffectiveState` i `TopologyView`) → `SolverInputAssembler` z widokami (PositiveSequence, Sequence, Phase, Protection, Thermal, Dynamic, TimeSeries, Harmonic) jako **jedyne** źródło interpretacji (stałe normatywne z rejestru) → solvery FROZEN/rozszerzone → `SolverOrchestrator` (DAG analiz, gotowość per analiza, cache po hashach, równoległość per scenariusz w **puli procesów**, zadania 202 + status/postęp/anulowanie, `PARTIAL` przy awarii, provenance stemplowane). Celery/Redis/MongoDB usunięte z compose (0 użyć), chyba że właściciel utrzymuje workerów.

## Konsekwencje
- Kasacja 9 builderów PF, 6 ścieżek SC, 3 Ybus, torów `enm/runs`, `power-flow-runs/execute`, `unified /api/runs`, `batch_execution_service`, `execution_engine`.
- Test: golden wejścia solverów bit-identyczne per sieć rejestru; K=10 biegów skaluje; determinizm między procesami.

## Alternatywy odrzucone
- Wątki (GIL: K=10 wolniej 1,81×) i synchroniczne żądania: dzisiejszy stan.
- Celery jako obowiązkowy: infrastruktura bez zadań i bez konsumenta.
