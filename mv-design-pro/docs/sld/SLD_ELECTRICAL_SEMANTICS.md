# SLD ELECTRICAL SEMANTICS — truth table + ENM traversal (recovery 2026-07)

Binding electrical semantics of the SLD, derived from ENM contracts and the
reference fixture `public/test-fixtures/sldSubstrate52s.enm.json`
(1 source, 54 substations, 54 transformers, 260 branches, 315 buses, 20 generators).
This document answers the prerequisite: **WHAT IS CONNECTED TO WHAT, THROUGH
WHICH TERMINALS, THROUGH WHICH EQUIPMENT, IN WHICH ELECTRICAL ORDER.**

## 1. Source & GPZ — the true energy path (single source)

ENM has exactly ONE source. Traversal from it:

```
source/main  (ZRODLO_SN, model=short_circuit_power, sk3_mva=250, source_side=SN, U=15 kV)
   │ injects at ↓
section/001/bus_sn      ← 15 kV busbar  (name "Sekcja 1", order 0)   [= trunk origin]
   ▲ (LV of TR1)
   │
TR1 110/15 kV  (Yd11, 25 MVA)   hv_bus_ref=bus_110 ─ lv_bus_ref=bus_sn
   ▲
bus_110  "Szyna 110 kV TR1"     ← NO source references this bus
```

**Key fact (E01):** the only real injection is at **15 kV** (`bus_sn`). `bus_110`
+ `TR1` sit upstream of the injection and carry **zero** short-circuit
contribution — they are electrically inert in this model. So the network has
ONE physical source represented redundantly: a 250 MVA @ 15 kV equivalent AND a
decorative 110 kV bus + 110/15 transformer.

**SLD rule (canon):** render ONE coherent GPZ block whose 15 kV busbar is the
explicit trunk origin. The 110 kV / TR1 portion, if drawn, MUST connect visibly
to that 15 kV busbar (single vertical spine 110→TR1→15 kV). The 15 kV
short-circuit equivalent is the SYSTEM behind the busbar — annotate it as the
system equivalent (`Sk"=250 MVA`), NOT as a second independent source glyph on
the trunk. Two disconnected source-looking artifacts are forbidden.

## 2. Trunk & stations — bus-to-bus (E02/E03)

Cable endpoint census (80 cables): `('BUS','BUS')=31`, `('FIELD_TERM','BUS')=12`,
`FIELD_TERM→FIELD_TERM(bus-skip)=0`. The trunk connects **`sn_bus` → `sn_bus`**
station-to-station. Line-field switchgear (`sn_field_breaker/00x`) exists as a
STUB off the bus (`sn_bus → sn_field_terminal/00x`, nothing beyond the terminal
on the IN side) — the field CB does not interrupt the through-trunk.

**SLD rule (canon):** the trunk cable must enter and leave the station **SN
busbar** (the electrical junction). It must NOT be drawn as a continuous line
ABOVE the station with drop-stubs (current elevated corridor = false bypass
appearance). Station SN bus = the node; WE/WY line fields hang off the bus as
bays. The edge is anchored to the **station SN-bus terminal**, not to a raw
elevated coordinate.

**Render-path invariant gap (E03):** rendered `cableRuns.pathPoints` are built
from `station.x/y` + slot constants (`enmToSldAdapter.buildCableRuns`), i.e.
coordinate-to-coordinate. The terminal-anchored layer `portAnchoredGeometry`
exists but is not consumed by `SldCanvasV2`. Target: the rendered trunk edge
resolves station SN-bus terminals as its endpoints.

## 3. Electrical truth table (per object type)

| Domain type | User name (PL) | Role | U | Terminals | In-edge | Out-edge | Apparatus seq | PCC |
|---|---|---|---|---|---|---|---|---|
| source (ZRODLO_SN) | System / GPZ (ekwiwalent) | source | 15 kV | out@bus_sn | — | trunk cable | — | — |
| transformer wn_sn | TR1 110/15 | HV/MV transformer | 110/15 | hv@bus_110, lv@bus_sn | 110 bus | 15 bus | — | — |
| bus (section/bus_sn) | Szyna SN (Sekcja 1) | MV busbar | 15 kV | multi | trunk in | trunk out, feeders | — | — |
| station sn_bus | Szyna stacji SN | MV busbar (station) | 15 kV | WE, WY, TR, ODG | cable_in | cable_out | — | — |
| field LINE_IN | Pole WE | incoming line bay | 15 kV | bus, line | cable | — | DS→CB→CT→głowica | — |
| field LINE_OUT | Pole WY | outgoing line bay | 15 kV | bus, line | — | cable | głowica→CT→CB→DS | — |
| field LINE_BRANCH | Pole ODG | branch bay | 15 kV | bus, line | — | branch cable | DS→CB→CT | — |
| field TRANSFORMER | Pole TR | transformer bay | 15/0.4 | bus, tr | — | to TR | DS→CB(bezp.)→TR | — |
| distribution TR | Transformator SN/nN | MV/LV transformer | 15/0.4 | sn, nn | SN bus | nN bus | — | — |
| generator nn_side | PV/BESS/FW | DER on LV | 0.4 kV | nn | — | — | inverter | station nn_bus |
| NO point | Łącznik NO | open sectionalizer | 15 kV | a, b | — | — | open switch | — |

## 4. WE / WY / ODG (E04)

`FIELD_ROLE` (`domain/apparatusContracts.ts`): WE=`LINE_IN`, WY=`LINE_OUT`,
**ODG=`LINE_BRANCH` (distinct)**. Correct enum. Gap: raw ENM `bay_role` has no
value mapping to `LINE_BRANCH` (`FEEDER→LINE_OUT`), so ODG has no ingest path —
in this fixture branches are separate corridors, not station ODG bays. Not a
correctness error; ODG bay ingest is a latent modeling extension.

## 5. DER / PCC (E07)

All 20 generators: `connection_variant="nn_side"`, `bus_ref=stn/*/nn_bus`, real
`p_mw` (0.5 / 2.0), no `blocking_transformer_ref`. So the canonical chain
(inverter→block-tr→MV-field→PCC) is NOT modeled here — DER attach to the
**station LV (nN) busbar**. `buildDers` absorbs them into the LV bus.

**SLD rule (canon):** for `nn_side` DER, the PCC is the **station nN busbar**;
draw the source symbol (PV/BESS/FW) attached to the station's nN side (behind the
station transformer), NOT floating on the 15 kV trunk. When a model uses
`block_transformer`/`dedicated_mv`, draw the full chain via
`DerConnectionTreeRenderer`. The symbol must carry an explicit PCC anchor.

## 6. Naming (E08, E10/E11, E12)

- **Line class (E08):** `cable → "Kabel SN"`, `line_overhead → "Linia napowietrzna SN"`
  (`classifySegmentKind`/`segmentKindLabel`). The `OVERHEAD` token is a per-segment
  insulation VARIANT (`inferCableVariant`, only for `type==='line_overhead'`),
  orthogonal to the class label. A concatenated "Kabel SN · OVERHEAD Al" cannot
  arise for one branch in this fixture (all `type=cable`); it is a latent risk
  from inconsistent seed catalog data. Canon: class label and insulation variant
  must never be concatenated into a contradictory string; add a guard test.
- **Sekcja index (E11):** `enmToSldAdapter.ts:2181/2335`, `GpzSwitchgearLayout.ts:109`
  synthesize `Sekcja ${order}` / `S${order}` from ZERO-based `order`. Inconsistent
  with `topologyInputReader.ts:422` (`order+1`) and `GpzRenderer.tsx:460` (`roman(idx+1)`).
  Canon: user-facing section label = `name` if present, else 1-based ordinal;
  never a raw zero-based index.
- **TR1 name reuse (E10):** display name "TR1"/"T1" collides across transformer,
  110 kV bus ("Szyna 110 kV TR1"), station ("Stacja T1"), station bus, load, PV.
  ref_ids are unique. Canon: user-facing labels must disambiguate element class
  (transformer vs bus vs station vs field).
- **"N nN" (E12):** overloaded — `StationOnRunRenderer` renders `${n}× nN` for
  voltage LEVELS; `MiniBlockRmuRenderer` renders `${n} nN` for FEEDERS;
  `StationInternalView` "odpływy nN". Canon: one meaning — number of nN outgoing
  feeders — expressed unambiguously ("N odpływów nN") or by geometry alone.

## 7. Switch state (E13)

State is already geometry-bearing (not color-only): `ApparatusCbSquare`,
`ApparatusSwitchDisconnector`, `ApparatusEarthingSwitch` render distinct
open/closed/earthed geometry; covered by `structuralSvgInvariants.test.tsx`,
`apparatusVisualState.test.ts`, IEC symbol tests. Canon retained.

## 8. Acceptance oracle (traversal)

For the fixture, a correct SLD must let a reader trace WITHOUT guessing:
`source/main → bus_sn(15kV) → GPZ outgoing bay → cable → T1.sn_bus →
[T1 WY] → cable → T8.sn_bus → … → T7.sn_bus`, and at each Tn a branch tap
`Tn.sn_bus → Ln-1.sn_bus → … `, plus DER at `Tn.nn_bus`. Every rendered power
edge must resolve to a named terminal pair from THIS traversal.
