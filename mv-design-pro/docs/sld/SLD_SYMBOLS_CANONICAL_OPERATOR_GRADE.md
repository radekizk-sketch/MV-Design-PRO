# SLD Symbols Canonical Operator-Grade (Phase 0A)

**Status:** BINDING (Phase 0A — kontrakty + mapowania; Phase 1 — pełne renderery aparatury)
**Wersja:** 1.0
**Pliki źródłowe:**
- `frontend/src/ui/sld/v2/domain/apparatusContracts.ts`
- `frontend/src/ui/sld/v2/domain/apparatusVisualState.ts`
- `frontend/src/ui/sld/v2/domain/apparatusSymbolPolicy.ts`
- `frontend/src/ui/sld/v2/domain/bayDeviceOrder.ts`

---

## 1. Reguła geometrii (Acceptance Invariant nr 13)

Stan aparatu zmienia **tylko** fill / stroke / markery pomocnicze. NIGDY nie zmienia:
- `viewBox` aparatu,
- pozycji `anchors` (portów),
- kształtu (prostokąt, romb, koło — to atrybuty kindu, nie stanu).

Egzekwowane testem `apparatusSymbolPolicy.test.ts` (`isGeometryInvariantAcrossStates`).

## 2. 12 kanonicznych typów aparatów (`ApparatusKind`)

| Kind | Polska etykieta | Wariant geometrii | Lokalizacja |
|---|---|---|---|
| `circuit_breaker` | Wyłącznik | kwadrat | MAIN_AXIS po DS szynowym |
| `switch_disconnector` | Rozłącznik | romb (kwadrat 45°) | MAIN_AXIS (RMU) |
| `disconnector` | Odłącznik | koło | MAIN_AXIS przy szynie |
| `earthing_switch` | Uziemnik | koło z ziemią | LATERAL_BRANCH (zawsze boczne) |
| `fuse` | Bezpiecznik | pionowy prostokąt | MAIN_AXIS w polu TR |
| `ct` | Przekładnik prądowy | koło z PI | MAIN_AXIS po wyłączniku |
| `vt` | Przekładnik napięciowy | koło z PU | LATERAL_BRANCH lub MAIN_AXIS w polu pomiarowym |
| `surge_arrester` | Ogranicznik przepięć | trójkąt z linią | LATERAL_BRANCH |
| `transformer` | Transformator SN/nN | dwa sprzężone okręgi (IEC 60617) | MAIN_AXIS, koniec pola TR |
| `lv_breaker` | Wyłącznik nN | mały kwadrat | MAIN_AXIS po stronie nN za TR |
| `cable_head` | Głowica kablowa | trójkąt | MAIN_AXIS, koniec pola |
| `metering_cubicle` | Pole pomiarowe | prostokąt z VT | osobny field (MEASUREMENT) |

Mapowanie `BayPrimaryDeviceKind` (ENM) → `ApparatusKind` w `BAY_PRIMARY_DEVICE_TO_APPARATUS`.

## 3. 5-wymiarowa matryca stanów (`ApparatusVisualState`)

```ts
interface ApparatusVisualState {
  apparatus_kind: ApparatusKind;
  switching_state: 'closed' | 'open' | 'unknown' | 'not_applicable';
  energization_state: 'energized' | 'deenergized' | 'backfed' | 'unknown';
  safety_state: 'grounded' | 'not_grounded' | 'blocked' | 'alarm' | 'normal';
  result_state: 'complete' | 'partial' | 'failed' | 'missing' | 'not_applicable';
}
```

Reguły walidacji:
- `switching_state.not_applicable` tylko dla CT/VT/SA/transformer/cable_head/metering_cubicle.
- `safety_state.grounded` tylko dla `earthing_switch`.
- `result_state` zwykle `not_applicable` dla CT/VT/transformer (mają własne wyniki niezależne od pola).

Mapowanie ENM `BayDeviceState` → `SwitchingState` w `fromEnmDeviceStateToSwitching`.

## 4. Polityka koloryzacji (`apparatusSymbolPolicy.ts`)

### 4.1 Wybór wariantu (kształt + fill default)

- CT/VT/transformer/cable_head/metering_cubicle/surge_arrester → `fixed_neutral` (geometria stała).
- CB/DS/SD/ES/FUSE/LV_BREAKER:
  - `closed` → `closed_filled` (fill zielony).
  - `open` → `open_break` (przerwa wewnątrz + czerwony marker).
  - `unknown` → `unknown_question` (znak zapytania, neutralny).
  - `not_applicable` → `not_applicable_neutral`.

### 4.2 Priorytet fill (od najwyższego)

1. `result_state.missing` → `missing` (szary, dashed).
2. `switching_state.open` → `transparent` (przerwa).
3. `switching_state.unknown` → `unknown` (neutralny).
4. `closed` + `energization_state`:
   - `energized`/`backfed` → zielony (token COLOR_DEVICE_CLOSED).
   - `deenergized` → szary jasny.
   - `unknown` → neutralny.

### 4.3 Priorytet stroke (od najwyższego)

1. `result_state.failed` → `failed` (czerwony obrys).
2. `safety_state.alarm` → `alarm` (czerwony obrys).
3. `switching_state.open` → `open` (czerwony marker).
4. `result_state.missing` → `missing` (dashed szary).
5. domyślny → `neutral`.

### 4.4 Markery dodatkowe (geometria invariant)

- `safety_state.alarm` lub `blocked` → boczny safety marker.
- `safety_state.grounded` → symbol uziemienia (ziemia) na bocznej gałęzi.
- `result_state.missing` → mały szary trójkąt warning.
- `energization_state.deenergized` → przyciemnienie linii (50% opacity).

## 5. Lokalizacje aparatów (`BayDeviceOrderPolicy`)

### 5.1 Pole liniowe pełne (LINE_FULL)

```
szyna
  │
  ◯ DS_BUS (odłącznik szynowy)
  │
  □ CB (wyłącznik)
  │
  ◯ CT (przekładnik prądowy)
  │
  ◯ DS_LINE (odłącznik liniowy)
  │
  ╠═ ES (uziemnik) → boczny LATERAL_BRANCH RIGHT
  │
  ▽ CABLE_HEAD (głowica kablowa)
```

CT JEST w osi po wyłączniku. ES JEST boczny (LATERAL_BRANCH).

### 5.2 Pole liniowe RMU (LINE_RMU)

```
szyna
  │
  ◇ SD (rozłącznik) — zamiast CB
  │
  ◯ CT (opcjonalny)
  │
  ╠═ ES (uziemnik boczny)
  │
  ▽ CABLE_HEAD
```

### 5.3 Pole transformatorowe pełne (TR_FULL)

```
szyna
  │
  ◯ DS_BUS / □ CB / ▭ FUSE (jedno z trzech, zależne od katalogu)
  │
  ◯ CT
  │
  ╠═ ES (uziemnik boczny)
  │
  ◐◐ TRANSFORMATOR SN/nN
  │
  □ LV_BREAKER (wyłącznik nN)
  │
  szyna nN
```

VT — jeśli pomiar na polu — zawsze **LATERAL_BRANCH** (gałąź boczna, nie w osi).

### 5.4 Pole pomiarowe (MEASUREMENT)

```
szyna
  │
  ◯ DS_BUS
  │
  ▭ FUSE (opcjonalny, dla VT)
  │
  ◯ VT (przekładnik napięciowy w osi)
  │
  ╠═ ES (uziemnik boczny)
```

### 5.5 Pole sprzęgła sekcyjnego (COUPLER)

```
sekcja A — szyna
  │
  ◯ DS_A
  │
  □ CB sprzęgła
  │
  ◯ CT
  │
  ◯ DS_B
  │
sekcja B — szyna
```

### 5.6 GPZ pole liniowe (GPZ_LINE_BAY)

Identyczne jak LINE_FULL, plus VT na bocznej gałęzi (zawsze obecny w GPZ).

## 6. Kolejność iteracji

Renderer MUSI iterować po `BAY_DEVICE_ORDER_POLICY[role]` (a NIE po `equipment_refs[]` z ENM, które jest stabilne ale niesemantyczne).

`countMainAxisSlots(role)` zwraca liczbę slotów MAIN_AXIS — używane do kalkulacji wysokości pola w SLD.

## 7. DER kolor

DER badge color = akcent typu (PV=żółty, BESS=niebieski, FW=cyjan). NIE służy oznaczaniu stanu elektrycznego — kolor toru zależy od `energization_state` × `switching_state`.

## 8. Acceptance Invariants pokryte

- nr 13 (lokalizacja CT/VT/uziemnik wynika z BayTemplate + BayDeviceOrderPolicy): full coverage tej fazy.
- Geometry invariant przez wszystkie kombinacje stanów: testowane w `apparatusSymbolPolicy.test.ts` (19 cases).

## 9. Phase 1 — co dochodzi

Phase 0A dostarcza kontrakty i polityki. Phase 1 wprowadzi pełne renderery aparatury w `BayRenderer`, drugi rząd nN w `MiniBlockRmuRenderer.detail`, oraz aparaty z stanem ApparatusVisualState w GpzSwitchgearRenderer dla LOD 2+.
