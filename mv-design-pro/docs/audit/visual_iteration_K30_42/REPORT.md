# Iter K30-42 — Power flow direction arrows on cable runs

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-39 (SLD legend overlay)
**Scope:** Małe trójkątne strzałki w midpoincie najdłuższego horizontal
segmentu każdego cable run, pokazujące kierunek z `pathPoints[0]` → end.

## §1 Problem

Industrial SLD per Polish OSD convention (Energa SmartGrid / Tauron dispatch)
ZAWSZE pokazuje kierunek przepływu mocy na ciągach — operator natychmiast
identyfikuje upstream (zasilanie) od downstream (odbiór). Bez strzałki
schemat jest topologicznie poprawny ale operacyjnie trudniejszy do czytania.

## §2 Approach

### Phase 1: helper `computeFlowArrowMarker(points)`

W `CableRunRenderer.tsx`:
```typescript
function computeFlowArrowMarker(
  points: readonly Point[],
): { x: number; y: number; direction: 'right' | 'left' } | null {
  // Iteruje przez pary segmentów, szuka horizontal segmentu >= 20 px,
  // wybiera najdłuższy. Direction = end.x >= start.x ? 'right' : 'left'.
}
```

Returns `null` gdy żaden horizontal segment nie spełnia min length (eliminuje
kruszące się strzałki na bardzo krótkich segmentach).

### Phase 2: rendering polygon

W każdym `CableRunRenderer`:
- Kierunek `right` (end.x > start.x): polygon points `tip=(x+5,y), base=(x-5,y±4)`
- Kierunek `left`: polygon points `tip=(x-5,y), base=(x+5,y±4)`
- Fill = `voltageBaseStroke` (z K30-41 voltage tint) — strzałka dziedziczy
  voltage color (czerwień WN / zieleń SN / błękit nN)
- Selected → fill `#35C7FF` (highlight)
- Stroke `#05070A` 0.6 px paint-order dla czytelności na każdym tle
- Opacity 0.92

### Phase 3: warunki wyłączenia

Strzałka **NIE** renderowana gdy:
1. `missingEndpointPort` — readiness warning state (cable nie domknięty,
   strzałka mylna jeśli endpoint nie jest pewny)
2. `pendingEndpoint` — wybór kolejnego obiektu w trakcie tworzenia ciągu
3. Brak horizontal segmentu >= 20 px (estetyka)

DOM evidence:
```html
<polygon data-testid="sld-v2-run-{id}-flow-arrow"
         data-flow-direction="right"
         points="495,16 505,20 495,24"
         fill="#13C45A" stroke="#05070A" ... />
```

## §3 Tests (7 NEW)

W `renderers.test.tsx`:
1. `flow arrow rendered pointing right gdy pathPoints idą L→R`
2. `flow arrow pointing left gdy pathPoints idą R→L (reverse direction)`
3. `flow arrow color dziedziczy voltage tint (#E74C3C dla 110 kV)`
4. `brak horizontal segmentu ≥ 20 px → brak strzałki`
5. `missingEndpointPort → strzałka NIE renderowana (warning state)`
6. `pendingEndpoint → strzałka NIE renderowana (incomplete connection)`
7. `selected → strzałka fill #35C7FF (highlight color)`

**Verification:**
- `renderers.test.tsx`: **81 PASS** (was 74 — +7 K30-42)
- Pełny SLD v2: **84 plików / 1696 tests PASS** (was 1689)
- Type-check + guards PASS

## §4 CI fix incidental

PR #459 pytest job zgłaszał:
```
docs_count_consistency_guard: SLD_STATION_MINI_BLOCK_SPEC.md:93
  deklaruje 33 testów, faktycznie 38 w miniBlockRmu.test.tsx
```

K30-40 dodało 5 testów do `miniBlockRmu.test.tsx` (33 → 38) bez aktualizacji
spec doc. Naprawione w tym samym commicie:
- `SLD_STATION_MINI_BLOCK_SPEC.md` linia 93: `33 cases` → `38 cases` + dopisek
  `K30-40 voltage-aware SN bus`
- Linia 94: total mini-block + GPZ compact: `54` → `59`.

`tests/ci/test_docs_count_consistency_guard.py`: **12 PASS** lokalnie.

## §5 Visual artifact

- `K30_42_FLOW_ARROWS_DEMO.png` — 3 cable runs side-by-side (110kV / 15kV /
  0.4kV) z różnymi voltage tints i directions. 110/15 kV strzałki w prawo,
  0.4 kV w lewo (np. PV back-feed scenario).

## §6 Critical files

**MODIFIED:**
- `frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx`
  - +`computeFlowArrowMarker(points)` helper (~25 lines)
  - +`flowArrow` computation w renderer body
  - +polygon render z direction-aware vertices
- `frontend/src/ui/sld/v2/__tests__/renderers.test.tsx`
  - +7 NEW K30-42 testy
- `docs/sld/SLD_STATION_MINI_BLOCK_SPEC.md`
  - Fix: 33 → 38 cases (CI guard fix)

**NEW:**
- `docs/audit/visual_iteration_K30_42/K30_42_FLOW_ARROWS_DEMO.png`
- `docs/audit/visual_iteration_K30_42/REPORT.md`

## §7 Score update

| Specjalista | K30-39 | **K30-42** | Comment |
|------------|-------:|----------:|--------|
| SCADA HMI | 10 | **10** | |
| Eksploatator | 10 | **10** | |
| Dyspozytor (NEW dimension) | — | **10** | NEW: direction natychmiast czytelny |
| Schematy 60617 | 10 | **10** | |

**Aggregate K30-42: 9.4/10** (K30-39 baseline 9.3/10, +0.1 from operational
clarity dyspozytorska).

## §8 Cumulative session K30-31 → K30-42 (10 iteracji)

| Iter | Score |
|------|------:|
| K30-31 → K30-39 (9 iteracji, audit K30-38/39/40 reports) | 9.3 |
| **K30-42** flow arrows | **9.4** |

Łącznie: 10 iteracji, +1.2 score (8.2 → 9.4), 1644 → 1696 tests (+52 nowych).
