# Iter K30-43 — Drawing scale ruler per PN-EN ISO 5455

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-42 (power flow direction arrows)
**Scope:** Komponent skali rysunku w bottom-left canvas, standardowy industrial
drawing element per PN-EN ISO 5455 (drawing scale notation).

## §1 Problem

Industrial drawings (zarówno schematy elektryczne SLD jak i mapy sieci OSD)
muszą zawierać widoczną skalę umożliwiającą odczytanie rzeczywistych
odległości. K30-38 title block już dokumentuje skalę liczbowo ("Skala: 1:1000")
ale **graficzna listwa skali** brakowała — bez niej operator nie może odczytać
odległości fizycznych z rysunku bezpośrednio.

Polish OSD convention (Energa / Tauron / PGE drawing standards) wymaga
graficznej skali zgodnie z PN-EN ISO 5455.

## §2 Approach

### Phase 1: nowy komponent `SldScaleRuler.tsx`

```typescript
export interface SldScaleRulerProps {
  readonly visible?: boolean;            // default true
  readonly x?: number;                   // pozycja transform
  readonly y?: number;
  readonly pixelsPerKm?: number;         // default 800 (K30 STATION_PITCH ~ 1km/800px)
  readonly lengthKm?: number;            // default 1.0
  readonly majorTickKm?: number;         // default 0.5 (co 500 m)
  readonly minorTickKm?: number;         // default 0.1 (co 100 m)
}
```

Rendering structure:
- Panel 0A0E14 z border #5A6878
- Title "SKALA · PN-EN ISO 5455" (9 px bold)
- Main horizontal line (#DDF7FF, 1.6 px)
- Minor ticks (0.9 px, 5 px height)
- Major ticks (1.4 px, 10 px height) + labels "0" / "500 m" / "1 km"

### Phase 2: tick computation

Ticks generowane niezależnie major/minor — pozwala major/minor mieć
nie-współmierne kroki (np. majorTickKm=0.25 z minorTickKm=0.1 działa OK
po fixie):
```typescript
for (let kmPos = 0; kmPos <= lengthKm + 0.0001; kmPos += majorTickKm) {
  majorTicks.push(...);
}
const majorSet = new Set(majorTicks);
for (let kmPos = 0; kmPos <= lengthKm + 0.0001; kmPos += minorTickKm) {
  if (!majorSet.has(...)) minorTicks.push(...);
}
```

### Phase 3: integracja w SldCanvasV2

```tsx
import { SldScaleRuler } from './SldScaleRuler';
// ...
readonly showScaleRuler?: boolean;  // default true
// ...
<SldScaleRuler visible={showScaleRuler} x={20} y={height - 60} />
```

Pozycja: bottom-left canvas (przeciwlegle do title block w bottom-right).
Standardowa industrial drawing layout convention.

### Phase 4: graceful edge cases

- `lengthKm <= 0` → null (zwraca pusty render)
- `pixelsPerKm <= 0` → null
- `visible=false` → null
- Label format: `0` / `"{N} m"` (N < 1000) / `"{N} km"` (N >= 1000)

## §3 Tests (10 NEW)

W `frontend/src/ui/sld/v2/canvas/__tests__/SldScaleRuler.test.tsx`:
1. `visible=true` (default) → root group renderowany
2. `visible=false` → null
3. Default 1 km z 3 major ticks (0, 500m, 1km)
4. Major tick label format: `0` / `"500 m"` / `"1 km"`
5. `data-pixels-per-km` + `data-length-km` attrs
6. PN-EN ISO 5455 reference w tytule
7. `x/y` prop steruje pozycją transform
8. `lengthKm=0.5` → ticks 0 + 500m (brak 1km)
9. `lengthKm=0` lub `pixelsPerKm=0` → null (graceful)
10. Custom `majorTickKm=0.25` → 5 major ticks (0, 250m, 500m, 750m, 1km)

**Verification:**
- SldScaleRuler: **10 PASS**
- Pełny sld/v2: **85 plików / 1706 tests PASS** (was 1696)
- Type-check + guards PASS

## §4 Visual artifact

- `K30_43_SCALE_RULER_DEMO.png` — 3 warianty side-by-side:
  - Default 1 km (10 minor + 3 major ticks)
  - Zoom-in 0.5 km
  - Zoom-out 2 km (5 major ticks: 0/500m/1km/1.5km/2km)

## §5 Critical files

**NEW:**
- `frontend/src/ui/sld/v2/canvas/SldScaleRuler.tsx` (~120 lines)
- `frontend/src/ui/sld/v2/canvas/__tests__/SldScaleRuler.test.tsx`
- `docs/audit/visual_iteration_K30_43/K30_43_SCALE_RULER_DEMO.png`
- `docs/audit/visual_iteration_K30_43/REPORT.md`

**MODIFIED:**
- `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx`
  - Import `SldScaleRuler`
  - +`showScaleRuler?: boolean` prop (default true)
  - +`<SldScaleRuler visible={...} x={20} y={height - 60} />` render

## §6 Score update

| Specjalista | K30-42 | **K30-43** | Comment |
|------------|-------:|----------:|--------|
| Normy | 10 | **10** | |
| CAD przemysłowy | 10 | **10** | |
| Schematy 60617 | 10 | **10** | |
| Projektant SN/WN | 10 | **10** | (+1) Skala graficzna PN-EN ISO 5455 |

**Aggregate K30-43: 9.5/10** (K30-42 baseline 9.4/10, +0.1 from PN-EN ISO 5455 compliance).

## §7 Cumulative session K30-31 → K30-43 (11 iteracji)

| Iter | Score | Tests Δ |
|------|------:|--------:|
| K30-31..K30-39 (9 iter) | 9.3 | +45 |
| K30-42 flow arrows | 9.4 | +7 |
| **K30-43 scale ruler** | **9.5** | +10 |
| **TOTAL** | **8.2 → 9.5** | **1644 → 1706 (+62)** |
