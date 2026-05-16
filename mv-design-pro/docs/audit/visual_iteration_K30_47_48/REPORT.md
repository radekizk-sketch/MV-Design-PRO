# Iter K30-47 + K30-48 — North arrow + Short-circuit results projection

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Scope:** Dwa nowe overlay komponenty:
- K30-47: SldNorthArrow — orientacja geograficzna per PN-EN ISO 5456 (opcjonalny).
- K30-48: SldShortCircuitOverlay — projekcja wyników zwarciowych per IEC 60909.

## K30-47 — North arrow per PN-EN ISO 5456

Industrial map-style drawings używają strzałki N wskazującej geograficzną
orientację. Dla SLD jest to opcjonalne (schematy są topologiczne) ale
przydatne gdy layout zawiera geographic context.

### Implementacja

NEW `SldNorthArrow.tsx` (~70 lines):
```typescript
readonly visible?: boolean;       // default true
readonly x?: number;              // pozycja
readonly y?: number;
readonly rotationDeg?: number;    // domyślnie 0 = N do góry
readonly size?: number;           // default 48
```

Renderowanie:
- Outer circle frame (`#0A0E14` fill, `#5A6878` border)
- Asymmetric arrow: filled half (right) + outline half (left) — distinct
  from generic ↑ arrow
- "N" label at top
- Rotation rotuje strzałkę całą (nie label)

### Tests (6 NEW)

W `SldNorthArrow.test.tsx`:
1. `visible=true` (default) → root group
2. `visible=false` → null
3. `size=0` → null (graceful)
4. `rotationDeg` propaguje w data-attr + transform rotate
5. Renderuje literę "N"
6. `x/y` prop steruje transform

### Integration w SldCanvasV2

```typescript
readonly showNorthArrow?: boolean;  // default FALSE (SLD topological)
// ...
<SldNorthArrow visible={showNorthArrow} x={width - 80} y={height - 200} />
```

## K30-48 — Short-circuit results projection per IEC 60909

### Problem

Backend obsługuje SC solver (IEC 60909), oblicza:
- **Ik"** initial symmetrical SC current (subtransient)
- **ip** peak SC current
- **Ith** thermal equivalent (t=1s)
- **Ik** steady-state SC current

Per type (3F / 2F / 1F / 1F_GROUND), per bus, per fault location. Aktualnie
brak wizualnej projekcji tych wyników na SLD — wszystko jest tylko w
ProofPack PDF/JSON. Operator szukający fault impact musi czytać tabelę.

### Implementacja

NEW `SldShortCircuitOverlay.tsx` (~230 lines):

**Public types (data contract):**
```typescript
export type FaultType = '3F' | '2F' | '1F' | '1F_GROUND';

export interface SldShortCircuitBusResult {
  busId: string;
  x: number; y: number;
  label?: string;
  ikkA: number;                  // Ik"
  ipkA?: number;                 // peak
  ithkA?: number;                // thermal 1s
  ikSteadyKA?: number;
  isFaultLocation?: boolean;     // gdzie zwarcie wystąpiło (X marker)
}

export interface SldShortCircuitSourceContribution {
  sourceId: string;
  sourceLabel: string;
  sourceX: number; sourceY: number;
  faultBusId: string;            // pointer do bus result
  ikContribKA: number;           // contribution z tego źródła
  sourceKind?: 'GPZ' | 'TRANSFORMER' | 'PV' | 'BESS' | 'FW' | 'MOTOR' | 'OTHER';
}

export interface SldShortCircuitProjection {
  faultType: FaultType;
  busResults: readonly SldShortCircuitBusResult[];
  sourceContributions?: readonly SldShortCircuitSourceContribution[];
  runId?: string;
}
```

**Rendering structure (3 layers):**

1. **Fault type badge** (top-left): symbol "3φ" / "2φ" / "1φ" / "1φ⏚" +
   nazwa polska ("3-fazowe" itp). Backgroud red `#7A1414` + border `#FF6B6B`.
2. **Source contribution arrows** (dashed): z każdego źródła do faulted bus.
   Color per source kind (GPZ czerwień, PV gold, BESS blue, FW mint, MOTOR
   orange). Arrowhead na 80% długości. Ik contribution chip na midpoint.
3. **Per-bus results**: chip 80×36 z Ik" + ip + Ith. Severity tinted border.
   Faulted bus dodatkowo X marker w czerwonej obwódce.

**Severity classifier per Ik" amplitude:**
```typescript
< 1 kA  → grey  "minimal"
1-5 kA  → green "normal"   (typowe nN/SN distribution)
5-15 kA → amber "elevated" (zwykłe SN industrial)
15-30kA → orange "high"    (large urban / industrial)
≥ 30 kA → red   "extreme"  (110 kV bus / large generator)
```

### Tests (13 NEW)

W `SldShortCircuitOverlay.test.tsx`:
1. `projection=null → null (back-compat)`
2. `visible=false → null`
3. Fault type badge "3-fazowe" dla 3F (data attr + text)
4. Fault type 1F_GROUND → "1-faz. doziemne"
5. Ik=8.5 kA → severity "elevated" (#FFD166)
6. Ik=3 kA → severity "normal" (green)
7. Ik=40 kA → severity "extreme" (red)
8. `isFaultLocation=true` → X marker
9. `isFaultLocation=false/missing` → brak X
10. Source contribution → dashed line + arrowhead + chip
11. Source kind colors: GPZ #E74C3C, PV #FFD166
12. Source z nieznanym faultBusId → skipowany (no crash)
13. Multi-bus + multi-source projekcja renderuje wszystkie

### Integration w SldCanvasV2

```typescript
readonly shortCircuitProjection?: SldShortCircuitProjection | null;
// ...
<SldShortCircuitOverlay projection={shortCircuitProjection ?? null} />
```

Przyszły wire (TBD): backend SC run result → adapter convert do
`SldShortCircuitProjection` shape → store w app state → injected do canvas.
Aktualnie overlay aktywowany tylko przez explicit prop (testing-friendly,
no auto-load).

## §3 Visual artifact

- `K30_47_48_SC_PROJECTION_DEMO.png` — pełna scena z fault type badge (3F),
  GPZ-A jako source (Ik contrib 7.80 kA z czerwoną strzałką), PV-15 jako
  source (0.70 kA gold), fault bus S08 z X markerem + Ik" 8.50 kA chip
  (elevated amber), plus north arrow w corner.

## §4 Score impact

- K30-47 +0.1 (PN-EN ISO 5456 compliance — Normy / CAD przemysłowy)
- K30-48 +0.3 (Zabezpieczenia +2, Eksploatator +1, Projektant SN/WN +1 —
  pełna projekcja SC wyników na schemacie)

**Aggregate post K30-44+45+47+48: 9.8/10**

## §5 Critical files

**NEW:**
- `frontend/src/ui/sld/v2/canvas/SldNorthArrow.tsx` (~70 lines)
- `frontend/src/ui/sld/v2/canvas/SldShortCircuitOverlay.tsx` (~230 lines)
- `frontend/src/ui/sld/v2/canvas/__tests__/SldNorthArrow.test.tsx` (6 tests)
- `frontend/src/ui/sld/v2/canvas/__tests__/SldShortCircuitOverlay.test.tsx` (13 tests)
- `docs/audit/visual_iteration_K30_47_48/K30_47_48_SC_PROJECTION_DEMO.png`
- `docs/audit/visual_iteration_K30_47_48/REPORT.md`

**MODIFIED:**
- `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx`
  - Imports + props (`showNorthArrow`, `shortCircuitProjection`)
  - Renders w canvas overlay group
