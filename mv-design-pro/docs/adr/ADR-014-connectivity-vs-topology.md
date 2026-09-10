# ADR-014: Łączność a topologia — jeden `TopologyService`

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §9

## Kontekst
„Effective topology" jest liczona w 20 miejscach z 4 definicjami krawędzi; frontend liczy energizację samodzielnie i to jest to, co widzi operator (A2-01, A2-08); NOP ma dwie/trzy prawdy (A2-07).

## Decyzja
Jedyny dostawca topologii: `TopologyService(snapshot, effective_state) → TopologyView` (redukcja CN→TN przez zamknięte łączniki, wyspy, energizacja, źródła zasilania per węzeł, ścieżki, radialność, NOP). Konsumenci (solvery przez assembler, projekcje SLD, walidacja, N-1, wyspy nN i SN) czytają `TopologyView`; żaden konsument nie liczy łączności sam. Frontend otrzymuje energizację i ścieżki z backendu.

## Konsekwencje
- 19 implementacji do kasacji po teście tożsamości wyników na rejestrze sieci.
- Inkrementalna aktualizacja po zmianie stanu łącznika (budżet: M < 30 ms).
- Scena SLD musi mieć równość krawędzi z `TopologyView` (test klasy na wszystkich fixturach).

## Alternatywy odrzucone
- Utrzymanie „companion" w kliencie dla responsywności: podwójna prawda; responsywność zapewnia cache per rewizja.
