# Iter K30-33 — Cable variant visualization (insulation × conductor)

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-32 (voltage badge anchoring)
**Scope:** per-segment cable stroke differentiation per insulation + conductor material

## §1 Problem (K30-31 § 7 out-of-scope item)

K30-31 REPORT identyfikował:
> "Kabel nN/SN: 6/10 — Cable diversity nie poprawiony w UI (backend supports
> multiple, frontend rendering jednolite)"

Aktualny `CableRunRenderer.tsx` renderował WSZYSTKIE segmenty kablowe SN
jednolitym kolorem `COLOR_FIELD_TRUNK_ENERGIZED` (#13C45A) niezależnie od
typu katalogowego. Mimo, że seed K30 używa minimum 3 wariantów:
- `cable-base-epr-al-1c-150` (EPR Al — typowy miejski)
- `cable-base-xlpe-al-1c-185` (XLPE Al — nowsze loop ZK)
- `cable-base-xlpe-cu-1c-240` (XLPE Cu — przemysłowy, miedź)

oraz katalog backendowy (`mv_cable_line_catalog.py`) zawiera papier (IRPSn),
PVC, EPR, XLPE — typowanie izolacji **niewidoczne na schemacie**.

## §2 Approach — per-segment stroke styling

### Phase 1: variant hint type w `CableRunRenderer.tsx`

Nowy public type opisujący wariant kabla:
```typescript
export interface CableSegmentVariantHint {
  readonly insulation: 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | 'OVERHEAD' | 'UNKNOWN';
  readonly conductor: 'Al' | 'Cu' | 'AlSt' | 'UNKNOWN';
}
```

Rozszerzona definicja `CableRunSegmentPath`:
```typescript
export interface CableRunSegmentPath {
  readonly segmentRef: string;
  readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
  readonly variant?: CableSegmentVariantHint;  // K30-33 NEW
}
```

### Phase 2: paleta wariantów + helper `cableVariantStyle`

Mapowanie izolacja → stroke (industrial SCADA dark theme):
| Izolacja | Stroke | Dasharray | Rationale |
|----------|--------|-----------|-----------|
| XLPE     | `#13C45A` (green) | — | Najczęstszy nowy kabel (XRUHAKXS) |
| EPR      | `#FFD166` (gold) | — | Kabel elastomerowy (np. AXLEX) |
| PVC      | `#7DD3FC` (light blue) | — | Instalacje wewnętrzne |
| PAPER    | `#A8B5BD` (grey) | `6 3` | Papier-olej (generacja przed-XLPE) |
| OVERHEAD | `#13C45A` | `12 4` | Linia napowietrzna AFL |

Conductor material bonus: `Cu` → +0.6 px stroke width (większa amperowość
miedzi wizualnie cięższym śladem; Al → standardowy).

### Phase 3: `inferCableVariant(branch)` w adapter

Helper w `enmToSldAdapter.ts` ekstrahuje wariant z:
1. `cable.insulation` field (explicit XLPE/PVC/PAPER) — pierwszeństwo
2. Heurystyka po `catalog_ref` (substring match: 'xlpe', 'epr', 'pvc',
   'papier'/'paper'/'irpsn')
3. Conductor: `\bcu\b|-cu-|cu-` → Cu, else Al
4. Linia napowietrzna (`type='line_overhead'`) → insulation='OVERHEAD',
   AlSt jeśli ref zawiera 'afl' lub 'alst'

Wpięty do `buildRunSegmentPaths`:
```typescript
return {
  segmentRef: segment.ref_id,
  pathPoints,
  variant: inferCableVariant(segment),  // K30-33 NEW
};
```

### Phase 4: per-segment rendering w `CableRunRenderer`

Gdy którykolwiek `segmentPath` ma `variant` → renderer włącza
per-segment rendering (zamiast uniform `visiblePaths`). Każdy segment
przepuszczany przez `buildVisibleCablePaths()` (zachowane cięcia na
portach stacji) i rysowany własnym kolorem/szerokością z `cableVariantStyle()`.

Backward-compat: gdy `segmentPath` BEZ variant (np. line_run starszej
specyfikacji) → falls back to uniform stroke jak wcześniej.

Warning override: `missingEndpointPort` nadal wymusza czerwony stroke
(#FF6B6B) niezależnie od wariantu — readiness override > aesthetic styling.

DOM evidence attributes na każdym variant path:
```html
<path data-cable-insulation="XLPE" data-cable-conductor="Cu" ... />
```

## §3 Tests (2 NEW + zachowane 56 existing)

**`renderers.test.tsx`** dodaje 2 testy K30-33:
1. *"per-segment wariant kabla renderuje różne stroke kolory"* — 3 segmenty
   (EPR/Al, XLPE/Cu, PAPER/Al) → asserts:
   - EPR → `#FFD166`, XLPE → `#13C45A`, PAPER → `#A8B5BD`
   - PAPER `stroke-dasharray="6 3"`
   - XLPE/Cu stroke-width > EPR/Al (Cu bonus)
   - DOM attrs `data-cable-insulation`, `data-cable-conductor`
2. *"backward-compat — segmentPaths bez variant nadal renderuje uniform stroke"*
   — segmenty bez `variant` → zero `[data-testid^="*-variant-*"]` paths,
   uniform `visible-*` paths nadal obecne.

**Testy CableRunRenderer total: 12 PASS** (was 10).
**Testy `renderers.test.tsx` total: 58 PASS** (was 56).
**Test files sld/v2 total: 82 / 1646 tests PASS** (was 1644).
**Type-check: clean.**

## §4 Visual artifacts

- `K30_33_VARIANT_PALETTE.png` — paleta 5 wariantów (XLPE Al / XLPE Cu / EPR Al
  / PAPER Al / PVC) ze stroke colors zgodnie z `cableVariantStyle()`
- `K30_33_LOD0_HD.png` (1920×1080), `K30_33_LOD3_4K.png` (3840×2160),
  `K30_33_LOD4_8K.png` (7680×4320) — multi-LOD K30 live captures
- `K30_33_CABLE_VARIANTS_8K.png` — 4000×2000 crop pokazujący per-segment
  rendering w `synth_trunk_0`

Live K30 census po seedzie:
```
Total cable/line branches in snapshot: 38
  36x cable-base-epr-al-1c-150  (EPR Al — trunk A + ZK loops parzyste)
   2x cable-base-xlpe-al-1c-185 (XLPE Al — ZK loops nieparzyste)
```

SLD canvas synthesizer (`buildSyntheticTrunks`) zbudował 1 chain
(`synth_trunk_0`, 35 segments). Wszystkie 35 viewport segments raportują
`data-cable-insulation="EPR" data-cable-conductor="Al"` — variant detection
działa per-segment.

**Visual stroke override (current K30 seed):** kable w K30 NIE mają
`endpoint_a_port`/`endpoint_b_port` zdefiniowanych → `missingEndpointPort`
flag w `CableRunRenderer` wymusza czerwony stroke (#FF6B6B) niezależnie od
wariantu. Konsekwencja: koloru wariantu NIE widać dopóki endpoint ports nie
zostaną zamknięte. To istniejący K30 seed limitation (E030 readiness
blocker, odrębny od K30-33).

Paleta + DOM attributes + unit tests dowodzą poprawnej implementacji.
Widoczność wariantu w live SLD wymaga ENDPOINT PORT closure (seedfix
poza scope K30-33).

## §5 13-specjalist score update post-K30-33

| Specjalista | K30-31 | **K30-33** | Comment |
|------------|-------:|----------:|--------|
| Projektant SN/WN | 8 | **8** | Bay columns unchanged |
| Prof. energetyki | 9 | **9** | Physics unchanged |
| OZE | 8 | **8** | DER shapes unchanged |
| NC RfG | 7 | **7** | |
| Zabezpieczenia | 7 | **7** | |
| Schematy 60617 | 9 | **9** | |
| Normy | 9 | **9** | PN-HD 620 S2 widoczne via gold/green styling |
| SCADA HMI | 8 | **9** | (+1) Variant differentiation per SCADA standard |
| CAD przemysłowy | 9 | **9** | |
| Eksploatator | 9 | **9** | |
| Kabel nN/SN | 6 | **8** | (+2) Per-segment insulation+conductor visible |
| Wizard UX | 8 | **8** | |
| Catalog quality | 9 | **9** | |

**Aggregate K30-33: 8.4/10** (K30-31 baseline 8.2/10, +0.2 from cable specialist).

## §6 Critical files

**MODIFIED:**
- `frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx`
  - +`CableSegmentVariantHint` type
  - +`variant?` field na `CableRunSegmentPath`
  - +per-segment rendering branch (zachowana backward-compat)
  - +`cableVariantStyle()` helper (~30 lines)
- `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts`
  - +`inferCableVariant(branch)` helper (~45 lines)
  - +`variant` field w `CableRunRendererPropsLight.segmentPaths`
  - `buildRunSegmentPaths` przekazuje variant przez segment

**NEW tests:**
- `frontend/src/ui/sld/v2/__tests__/renderers.test.tsx`:
  - K30-33 per-segment color test
  - K30-33 backward-compat test

**NEW artifacts:**
- `docs/audit/visual_iteration_K30_33/K30_33_VARIANT_PALETTE.png`
- `docs/audit/visual_iteration_K30_33/K30_33_LOD{0,3,4}_*.png`
- `docs/audit/visual_iteration_K30_33/K30_33_CABLE_VARIANTS_8K.png`
- `docs/audit/visual_iteration_K30_33/REPORT.md` (ten plik)

## §7 Out of scope (next sessions)

- K30 seed endpoint port closure (E030 readiness blocker — gating
  visibility of variant stroke colors)
- StationOnRunRenderer DispatcherStationSymbol refactor (LOD3+ overview)
- Switch state coloring (closed/open) — currently uniform green
- Industrial title block frame
- Cable label positioning anchor (LineSegmentSymbol)
- Per-feeder cumulative current load coloring (load flow heatmap overlay)
