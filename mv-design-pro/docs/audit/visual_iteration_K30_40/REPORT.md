# Iter K30-40 — MiniBlockRmu voltage-aware bus (LOD 0-2)

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Predecessor:** K30-41 (cable run voltage tint)
**Scope:** Propagacja `busVoltageKv` z adaptera przez `StationOnRunRenderer` do
`MiniBlockRmuRenderer` — SN bus stroke tint w bay-column architecture
(LOD 0-2), analogiczna do K30-37 dla Dispatcher (LOD 3+).

## §1 Problem

K30-37 wprowadził voltage tint szyny w `DispatcherStationSymbol` (LOD ≥ 3).
K30-31 bay-column architecture renderuje stacje przy LOD 0-2 jako
`MiniBlockRmuRenderer` — który nadal używał hardcoded `COLOR_BUS_LV` (#13C45A)
dla SN busbar.

W rezultacie:
- LOD 3+ Dispatcher: szyna voltage-aware (czerwień/zieleń/błękit)
- LOD 0-2 MiniBlock: szyna zawsze zielona ❌ niespójność wizualna

Adapter już posiadał `mainBusVoltageKv` (K30-37 plumbing) i propagował go
do `StationOnRunRendererProps.busVoltageKv`, ale `shouldDelegateToMiniBlock`
ścieżka odrzucała tę informację — `<MiniBlockRmuRenderer>` nie miał propa.

## §2 Approach

### Phase 1: nowy prop `busVoltageKv` na MiniBlockRmuRenderer

```typescript
readonly busVoltageKv?: number | null;
```

### Phase 2: helper `miniBlockBusColorForVoltage(kv)`

Analogiczny do K30-37 `busColorForVoltage` i K30-41 `cableColorForVoltage`,
ale używa `COLOR_BUS_LV` jako fallback (zgodnie z bay-column konwencją
MiniBlock).

### Phase 3: aplikacja na SN busbar

W `MiniBlockRmuRenderer.tsx`:
```typescript
const snBusColor = miniBlockBusColorForVoltage(props.busVoltageKv ?? null);
// ...
<line ... stroke={snBusColor} data-bus-voltage-kv={props.busVoltageKv ?? ''} />
```

LV busbar zachowuje `COLOR_BUS_LV` (LV side zawsze 0.4kV zielona, nie
zależna od SN tinta).

### Phase 4: plumbing przez StationOnRunRenderer

```typescript
<MiniBlockRmuRenderer ... busVoltageKv={props.busVoltageKv ?? null} />
```

Adapter `K30-37` już propaguje `busVoltageKv` na `StationOnRunRendererProps`
przez wszystkie 3 station push sites. Zero zmian w adapterze potrzebnych.

## §3 Tests

**Renderer tests (5 NEW):**
- `busVoltageKv=15 → SN bus stroke energized green (kanon)`
- `busVoltageKv=110 → SN bus stroke czerwień (WN)`
- `busVoltageKv=6 → SN bus stroke głębsza zieleń (SN niskie)`
- `busVoltageKv=0.4 → SN bus stroke błękit nN`
- `brak busVoltageKv → fallback do COLOR_BUS_LV (backward-compat)`

DOM evidence:
```html
<line data-parity-key="station.mini.bus.sn"
      stroke="#E74C3C"
      data-bus-voltage-kv="110" .../>
```

- `miniBlockRmu.test.tsx`: **38 PASS** (was 33 — +5 K30-40)
- Pełny SLD v2: **84 plików / 1689 tests PASS** (cumulative z K30-38 + K30-39)
- Type-check: clean
- Guards: forbidden_ui_terms / no_codenames / sld_determinism PASS

## §4 Visual artifact

- `K30_40_MINIBLOCK_VOLTAGE_BUS_DEMO.png` — 4 mini-blocks side-by-side
  z różnymi voltage classes (110/15/6/0.4 kV) pokazujące jak SN bus tint
  zmienia się per voltage. LV bus zawsze zielony.

## §5 Critical files

**MODIFIED:**
- `frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx`
  - +`busVoltageKv?: number | null` prop
  - +`miniBlockBusColorForVoltage(kv)` helper (~18 lines)
  - +SN bus stroke `snBusColor` + `data-bus-voltage-kv` attr
- `frontend/src/ui/sld/v2/renderer/StationOnRunRenderer.tsx`
  - `<MiniBlockRmuRenderer busVoltageKv={props.busVoltageKv ?? null} />`
- `frontend/src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx`
  - +5 NEW K30-40 testy voltage-aware bus

## §6 Score update

| Specjalista | K30-41 | **K30-40** | Comment |
|------------|-------:|----------:|--------|
| SCADA HMI | 10 | **10** | (max post K30-37/41) |
| CAD przemysłowy | 10 | **10** | |
| Eksploatator | 10 | **10** | |
| Projektant SN/WN | 9 | **10** | (+1) Voltage spójne LOD 0-2/3+ |
| Schematy 60617 | 9 | **9** | |
| Kabel nN/SN | 9 | **9** | |

**Aggregate K30-40: 8.9/10** (K30-41 baseline 8.8/10, +0.1 from Projektant SN/WN).
