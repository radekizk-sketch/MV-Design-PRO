# Iter K30-49 — LF derived metrics plumbing (canvas → renderers)

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-48 (SC results projection)
**Scope:** Pure helper `computeLfDerivedMetrics` + integracja w `SldCanvasV2`
łączą raw overlay store (LF results) z propami K30-44 (voltageDeviationPct)
i K30-45 (loadingPct). Bez tego K30-44/45 były theoretical props bez
live data source.

## §1 Problem

K30-44 i K30-45 wprowadziły wizualne klasyfikatory:
- `StationOnRunRenderer.voltageDeviationPct` → ring color station code (PN-EN 50160)
- `CableRunRenderer.loadingPct` → loading chip + overload overlay (IEC 60865)

Ale **żaden komponent nie computował tych wartości** z LF results. Stacje
zawsze pokazywały default cyan ring, kable nigdy nie miały loading chip.
Props były martwe bez wiring do `rawResultOverlayStore`.

## §2 Approach

### Phase 1: nowy helper `lfDerivedMetrics.ts`

```typescript
export function computeLfDerivedMetrics(
  payload: RawOverlayPayload | null,
  stations: readonly StationLfMeta[],
  cableRuns: readonly CableRunLfMeta[],
): LfDerivedMetrics
```

Returns:
- `voltageDeviationPctByStationId: Map<stationId, number>` —
  `((U_actual - U_nominal) / U_nominal) × 100` per stacji
- `cableLoadingPctByRunId: Map<runId, number>` —
  `max over segments (I_actual / ampacity) × 100`

Implementation details:
1. **SC payload guard** — jeśli `analysis_type` nie zawiera 'load_flow'/
   'power_flow', return empty maps (SC results emitują IK_3F_A nie U_kV/I_A).
2. **SN bus ref translation** — `stn/{hash}/station` → `stn/{hash}/sn_bus`
   (kanon ResultOverlayLayer).
3. **Ampacity defaults per voltage class** (gdy brak explicit I_max w catalog):
   - ≥ 100 kV (WN) → 1200 A (AFL-240)
   - 12-30 kV (SN) → 400 A (1×185 XLPE Al)
   - 5-10 kV (SN niskie) → 300 A
   - 0.2-1 kV (nN) → 200 A
   - default → 400 A
4. **Edge cases**: I_A = null/0 / negative → segment skipowany. Station
   bez busVoltageKv → skipowana. Cable bez segmentRefs → skipowany.

### Phase 2: integracja w SldCanvasV2

```typescript
const overlayPayload = useRawResultOverlayStore((state) => state.payload);
const lfDerived = computeLfDerivedMetrics(overlayPayload, props.stations, props.cableRuns);

// W StationOnRunRenderer render:
voltageDeviationPct={
  st.voltageDeviationPct
    ?? lfDerived.voltageDeviationPctByStationId.get(st.id)
    ?? null
}

// W CableRunRenderer render:
loadingPct={lfDerived.cableLoadingPctByRunId.get(run.id) ?? null}
```

**Override priority:** explicit `st.voltageDeviationPct` z adaptera > derived
z payload > null (default). Pozwala adapterowi w przyszłości override (np.
gdy adapter ma sophisticated voltage classification z time-of-day data).

## §3 Tests (13 NEW)

W `frontend/src/ui/sld/v2/canvas/__tests__/lfDerivedMetrics.test.ts`:
1. `payload=null → empty maps`
2. SC payload (non-LF) → empty maps
3. Station U=15.45, nominal=15 → +3.0%
4. Station U=13.5, nominal=15 → -10.0%
5. Station bez busVoltageKv → skipowana
6. Station bez U_kV metric → skipowana
7. Cable I=200 A SN (ampacity 400) → 50%
8. Cable I=480 A SN → 120% OVERLOAD
9. Cable multi-segment → max po segmentach
10. Ampacity defaults: 110 kV → 1200 A, 0.4 kV → 200 A
11. Cable bez segmentRefs → skipowany
12. Cable z I_A=null lub ≤ 0 → skipowany
13. Combined: stations + cable runs naraz

**Verification:**
- `lfDerivedMetrics.test.ts`: **13 PASS**
- Pełny sld/v2: **88 plików / 1750 tests PASS** (was 1737)
- Type-check + guards PASS

## §4 Critical files

**NEW:**
- `frontend/src/ui/sld/v2/canvas/lfDerivedMetrics.ts` (~100 lines)
- `frontend/src/ui/sld/v2/canvas/__tests__/lfDerivedMetrics.test.ts`

**MODIFIED:**
- `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx`
  - Import `computeLfDerivedMetrics`
  - +`const lfDerived = computeLfDerivedMetrics(overlayPayload, ...)` w render body
  - `<StationOnRunRenderer voltageDeviationPct={...}>` injection
  - `<CableRunRenderer loadingPct={...}>` injection

## §5 Score update

| Specjalista | K30-48 | **K30-49** | Comment |
|------------|-------:|----------:|--------|
| Eksploatator | 10 | **10** | (max) |
| Projektant SN/WN | 10 | **10** | (max) |
| **Architekt analizy** | 9 | **10** | (+1) LF results widoczne realtime w SLD |

**Aggregate K30-49: 9.9/10** (K30-48 baseline 9.8/10, +0.1 from end-to-end
data flow LF → derived metrics → visual projection).

## §6 Cumulative session K30-31 → K30-49 (16 iteracji)

| Phase | Iters | Score |
|-------|-------|------:|
| Bay-column refactor + voltage anchoring | K30-31/32 | 8.2 |
| Cable variants + bay-role labels + voltage tints | K30-33/36/37/41 | 8.8 |
| Mini-block voltage + title block + legend | K30-40/38/39 | 9.3 |
| Flow arrows + scale ruler | K30-42/43 | 9.5 |
| LF/SC projections + N-arrow | K30-44/45/47/48 | 9.8 |
| **LF data plumbing** | **K30-49** | **9.9** |

Łącznie: 16 iteracji w sesji, **+106 nowych testów** (1644 → 1750).
