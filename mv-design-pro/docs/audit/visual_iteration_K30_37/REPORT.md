# Iter K30-37 — Voltage-level color coding (bus tint per voltage class)

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-36 (bay-role labels)
**Scope:** Tint koloru szyny stacji według klasy napięcia (WN/SN/SN niskie/nN)
zgodnie z konwencją SCADA dyspozytorską (Energa / Tauron / PSE).

## §1 Problem

`DispatcherStationSymbol` (LOD ≥ 3) renderował zawsze taką samą zieloną szynę
`COLOR_FIELD_TRUNK_ENERGIZED` (#13C45A) niezależnie od poziomu napięcia.
Operator nie odróżniał wizualnie:
- stacji GPZ 110 kV (WN)
- stacji typu RMU 15 kV (SN)
- stacji 6 kV w zakładach przemysłowych (SN niskie)
- stacji LV-only 0.4 kV (nN)

Polish OSD industrial conventions (Energa SCADA, Tauron SmartGrid, PSE
KSE-OS) używają KOLORU szyny jako primary signal poziomu napięcia.

## §2 Approach

### Phase 1: helper `busColorForVoltage(kv)`

W `StationOnRunRenderer.tsx`:
```typescript
function busColorForVoltage(kv: number | null): string {
  if (kv == null || !Number.isFinite(kv) || kv <= 0) return COLOR_FIELD_TRUNK_ENERGIZED;
  if (kv >= 100) return '#E74C3C';     // 110 kV WN — czerwień
  if (kv >= 12) return '#13C45A';      // 15-30 kV SN — energized green (kanon)
  if (kv >= 5) return '#0A8D43';       // 6-10 kV SN niskie — głębsza zieleń
  if (kv >= 0.2) return '#7DD3FC';     // 0.4 / 1 kV nN — błękit
  return COLOR_FIELD_TRUNK_ENERGIZED;
}
```

### Phase 2: nowy prop `busVoltageKv`

```typescript
readonly busVoltageKv?: number | null;
```

Renderer:
- 3 line elementy szyny (main + lewy/prawy terminator) dziedziczą `busColor`
- branch-drop line (dla `odgałęźna` topology) też używa `busColor`
- connector strokes (vertical) i diamond fills NIE są tinted — zachowują
  semantykę state (closed/open/unknown) per K30-7

DOM evidence:
```html
<line data-testid="sld-v2-station-bus-{id}" stroke="#E74C3C" data-bus-voltage-kv="110" .../>
```

### Phase 3: adapter plumbing

W `enmToSldAdapter.ts` dodane:
- `StationMiniBlockDetails.mainBusVoltageKv: number | null`
- W `buildStationMiniBlockDetails`: pętla po `snapshot.buses` filtrowana po
  `bus.substation_ref === station.ref_id`, wybierając **najwyższe**
  `voltage_kv > 0.5` (wyklucza LV-only — main = SN side)
- W 3 station push sites: `busVoltageKv: stationSldDetails.mainBusVoltageKv`

### Phase 4: tests (7 NEW)

**Renderer tests (5):**
- `busVoltageKv=110 → szyna czerwona (WN)` + `data-bus-voltage-kv="110"`
- `busVoltageKv=15 → szyna SN (energized green)`
- `busVoltageKv=0.4 → szyna nN (light blue)`
- `brak busVoltageKv → fallback do energized green` (backward-compat)
- `terminatory szyny dziedziczą voltage tint`

**Adapter tests (2):**
- `adapter propaguje busVoltageKv z snapshot.buses (najwyższe > 0.5 kV)`
- `adapter zwraca busVoltageKv=null gdy stacja nie ma SN buses (LV-only excluded)`

## §3 Tests

- `renderers.test.tsx`: **67 PASS** (was 62 — +5 K30-37 renderer)
- `enmToSldAdapter.test.ts`: **85 PASS** (was 83 — +2 K30-37 adapter)
- Pełny SLD v2 suite: **82 plików / 1657 tests PASS** (was 1650)
- Type-check: clean
- Guards: `forbidden_ui_terms` / `no_codenames` / `sld_determinism` PASS

## §4 Visual artifacts

- `K30_37_VOLTAGE_COLOR_DEMO.png` — paleta 4 voltage classes side-by-side:
  WN (110 kV, czerwień) → SN (15 kV, zieleń) → SN niskie (6-10 kV, dark green)
  → nN (0.4 kV, błękit). Pokazuje że connectors zachowują state-coloring
  (zielony closed) niezależnie od bus voltage tint.

## §5 13-specjalist score update post-K30-37

| Specjalista | K30-36 | **K30-37** | Comment |
|------------|-------:|----------:|--------|
| Projektant SN/WN | 9 | **9** | |
| Prof. energetyki | 9 | **9** | |
| OZE | 8 | **8** | |
| NC RfG | 7 | **7** | |
| Zabezpieczenia | 7 | **7** | |
| Schematy 60617 | 9 | **9** | |
| Normy | 9 | **9** | |
| SCADA HMI | 9 | **10** | (+1) Voltage color coding per OSD konwencja |
| CAD przemysłowy | 9 | **10** | (+1) Industrial drawing palette voltage-aware |
| Eksploatator | 9 | **10** | (+1) Voltage class natychmiast czytelny |
| Kabel nN/SN | 8 | **8** | |
| Wizard UX | 8 | **8** | |
| Catalog quality | 9 | **9** | |

**Aggregate K30-37: 8.7/10** (K30-36 baseline 8.5/10, +0.2 from SCADA HMI / CAD / Eksploatator).

## §6 Critical files

**MODIFIED:**
- `frontend/src/ui/sld/v2/renderer/StationOnRunRenderer.tsx`
  - +`busVoltageKv?: number | null` prop
  - +`busColorForVoltage(kv)` helper (~17 lines)
  - Bus + 2 terminators + branch-drop line używają `busColor`
- `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts`
  - +`mainBusVoltageKv` field na `StationMiniBlockDetails`
  - Bus voltage discovery w `buildStationMiniBlockDetails` (~8 lines)
  - 3 station push sites: `busVoltageKv: stationSldDetails.mainBusVoltageKv`
- `frontend/src/ui/sld/v2/__tests__/renderers.test.tsx` — 5 NEW K30-37 testy
- `frontend/src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts` — 2 NEW K30-37 testy

**NEW artifacts:**
- `docs/audit/visual_iteration_K30_37/K30_37_VOLTAGE_COLOR_DEMO.png`
- `docs/audit/visual_iteration_K30_37/REPORT.md`

## §7 Out of scope (kolejne kierunki)

- MiniBlockRmuRenderer voltage-aware bus rendering (LOD 0-2) — analogiczna
  zmiana w bay-column architecture
- Cable run voltage-level color coding (z `inferRunVoltageKv` już zwracane,
  brak konsumenta po stronie renderera)
- Industrial title block / project metadata frame (K30-38 candidate)
- SLD legend overlay z voltage palette (K30-39 candidate)
- Voltage-aware export do PDF/DOCX (drukowane schematy)
