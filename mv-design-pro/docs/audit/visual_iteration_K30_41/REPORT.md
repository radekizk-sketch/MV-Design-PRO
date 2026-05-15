# Iter K30-41 — Cable run voltage tint + voltage chip

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-37 (voltage-level color coding szyny stacji)
**Scope:** Wire `inferRunVoltageKv` (już istniejące w adapterze) do
`CableRunRenderer` — voltage tint stroke (gdy brak K30-33 variant rendering)
+ voltage chip przy starcie ciągu.

## §1 Problem

`inferRunVoltageKv(snapshot, runSegments)` było już zaimplementowane
w `enmToSldAdapter.ts` (linia 1880) i używane wyłącznie do generowania
text label `"15 kV"` przy starcie ciągu. Nie było konsumenta po stronie
renderera dla **wizualnego kolorowania kabla per voltage class**.

Konsekwencja: każdy kabel SN renderował uniform `COLOR_FIELD_TRUNK_ENERGIZED`
zielony niezależnie od poziomu napięcia (110kV vs 15kV vs 0.4kV — wszystkie
zielone). Po K30-37 to było asymetryczne: szyna stacji już ma voltage tint,
ale kabel SN łączący stacje nadal monochromatyczny.

## §2 Approach

### Phase 1: `cableColorForVoltage(kv)` helper

W `CableRunRenderer.tsx` (analogicznie do `busColorForVoltage` z K30-37):
```typescript
function cableColorForVoltage(kv: number | null): string {
  if (kv == null || !Number.isFinite(kv) || kv <= 0) return COLOR_FIELD_TRUNK_ENERGIZED;
  if (kv >= 100) return '#E74C3C';     // WN czerwień
  if (kv >= 12) return '#13C45A';      // SN zieleń (kanon)
  if (kv >= 5) return '#0A8D43';       // SN niskie głębsza zieleń
  if (kv >= 0.2) return '#7DD3FC';     // nN błękit
  return COLOR_FIELD_TRUNK_ENERGIZED;
}
```

### Phase 2: nowy prop + tint stroke uniform

```typescript
readonly voltageKv?: number | null;
```

Zmiana `strokeColor` computation:
```typescript
const voltageBaseStroke = cableColorForVoltage(voltageKv ?? null);
const strokeColor = missingEndpointPort
  ? '#FF6B6B'
  : selected
    ? '#35C7FF'
    : voltageBaseStroke;   // ← was COLOR_FIELD_TRUNK_ENERGIZED
```

Priority order:
1. `missingEndpointPort` → red warning (zachowane K30-29 readiness override)
2. `selected` → niebieskie podświetlenie (zachowane)
3. **`voltageBaseStroke`** ← K30-41 NEW
4. Fallback do COLOR_FIELD_TRUNK_ENERGIZED gdy brak voltageKv

**Variant rendering ma pierwszeństwo:** gdy `useVariantRendering === true`
(K30-33 cable type identity), per-segment variant strokes pozostają
niezmienione (XLPE→green, EPR→gold, PVC→blue, PAPER→grey). Voltage tint
dotyczy tylko uniform path fallback.

### Phase 3: voltage chip przy starcie ciągu

Niezależnie od variant rendering, jeśli `voltageKv > 0` → renderuje
prostokątny chip 32×13 px przy `pathPoints[0]`:
```html
<g data-testid="sld-v2-run-{id}-voltage-chip" data-voltage-kv="{kv}">
  <rect fill={voltageBaseStroke} opacity="0.85" />
  <text fill="#0A0E14" fontWeight="800">15 kV</text>
</g>
```

Format auto: `≥1 kV → "{N} kV"`, `<1 kV → "{N*1000} V"`. Dla 0.4 kV
chip pokazuje "400 V" (standardowa konwencja).

### Phase 4: adapter plumbing (5 call sites)

W `enmToSldAdapter.ts`:
- `CableRunRendererPropsLight.voltageKv?: number | null` (nowy field)
- 5 cable run push sites wywołują `inferRunVoltageKv(snapshot, segments)`
  i propagują:
  1. Explicit `line_runs` builder (już miał voltageKv var od starej K30-X)
  2. Synth trunk z chain detection
  3. Logical view trunks (corridors)
  4. Logical view branches
  5. Orphan branches (fallback path)

W `SldCanvasV2.tsx`: `cableRuns` typu light interface wzbogacony o
`voltageKv?: number | null`. `<CableRunRenderer {...run}>` automatycznie
przekazuje przez spread.

## §3 Tests

**Renderer tests (7 NEW):**
- `voltageKv=110 → uniform stroke red WN tint (gdy brak variant)`
- `voltageKv=15 → uniform stroke energized green SN`
- `voltageKv=0.4 → uniform stroke nN błękit`
- `voltage chip renderowany przy starcie ciągu z "{kV} kV"`
- `voltageKv=0.4 → chip pokazuje "400 V" (sub-kV format)`
- `brak voltageKv → brak voltage chip + fallback uniform green`
- `variant rendering ma pierwszeństwo nad voltage tint dla strokes`

**Adapter tests (2 NEW):**
- `adapter propaguje voltageKv ciągów kabli z from_bus voltage_kv`
- `voltageKv=null gdy from_bus.voltage_kv niedostępne`

**Total:**
- `renderers.test.tsx`: **74 PASS** (was 67 — +7 K30-41 renderer)
- `enmToSldAdapter.test.ts`: **87 PASS** (was 85 — +2 K30-41 adapter)
- Pełny SLD v2 suite: **82 plików / 1666 tests PASS** (was 1657)
- Type-check: clean
- Guards: `forbidden_ui_terms` / `no_codenames` / `sld_determinism` PASS

## §4 Visual artifacts

- `K30_41_CABLE_VOLTAGE_TINT_DEMO.png` — synthetic demo 5 voltage classes:
  110kV (WN czerwień) → 30kV (SN zieleń) → 15kV (SN kanon) → 6kV (SN niskie
  dark green) → 0.4kV (nN błękit). Każdy z chip + uniform stroke tint.

## §5 13-specjalist score update post-K30-41

| Specjalista | K30-37 | **K30-41** | Comment |
|------------|-------:|----------:|--------|
| Projektant SN/WN | 9 | **9** | |
| Prof. energetyki | 9 | **9** | |
| OZE | 8 | **8** | |
| NC RfG | 7 | **7** | |
| Zabezpieczenia | 7 | **7** | |
| Schematy 60617 | 9 | **9** | |
| Normy | 9 | **9** | |
| SCADA HMI | 10 | **10** | (już max post K30-37) |
| CAD przemysłowy | 10 | **10** | (już max post K30-37) |
| Eksploatator | 10 | **10** | (już max post K30-37) |
| Kabel nN/SN | 8 | **9** | (+1) Voltage tint kabla + chip |
| Wizard UX | 8 | **8** | |
| Catalog quality | 9 | **9** | |

**Aggregate K30-41: 8.8/10** (K30-37 baseline 8.7/10, +0.1 from Kabel nN/SN).

## §6 Critical files

**MODIFIED:**
- `frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx`
  - +`voltageKv?: number | null` prop
  - +`cableColorForVoltage(kv)` helper (~18 lines)
  - `strokeColor` używa `voltageBaseStroke` zamiast hardcoded
  - +voltage chip rendering przy `pathPoints[0]` (~32 lines)
- `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts`
  - +`voltageKv?: number | null` na `CableRunRendererPropsLight`
  - 4× NEW `const voltageKv = inferRunVoltageKv(...)` (4 nowe call sites)
  - 5× `voltageKv` field na cable run push (existing voltage label
    pozostaje, ale wartość teraz idzie też przez właściwy prop)
- `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx`
  - +`voltageKv?: number | null` na light cable run shape interface

**TESTS:**
- `frontend/src/ui/sld/v2/__tests__/renderers.test.tsx` — 7 NEW K30-41
- `frontend/src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts` — 2 NEW K30-41

**NEW artifacts:**
- `docs/audit/visual_iteration_K30_41/K30_41_CABLE_VOLTAGE_TINT_DEMO.png`
- `docs/audit/visual_iteration_K30_41/REPORT.md`

## §7 Out of scope (kolejne kierunki)

- MiniBlockRmuRenderer voltage-aware bus rendering (LOD 0-2) — propagacja
  `busVoltageKv` przez bay-column architecture (K30-31)
- Industrial title block / project metadata frame (K30-38 candidate)
- SLD legend overlay z paletą K30-33 / K30-37 / K30-41 (K30-39 candidate)
- Voltage-aware export do PDF/DOCX (drukowane schematy)
- Cable run chip auto-positioning żeby unikać collision z `feeder-origin`
  label (currently both renderowane przy starcie — potencjalna kolizja
  w niektórych layoutach)
