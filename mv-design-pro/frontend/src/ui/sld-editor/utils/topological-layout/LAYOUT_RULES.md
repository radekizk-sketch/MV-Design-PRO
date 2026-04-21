# Topological Auto-Layout SLD - Layout Rules

Canonical layout rules for the topological auto-layout engine.
All rules are enforced programmatically - no manual positioning required.

## 1. Topological Roles

Every SLD symbol receives exactly ONE topological role:

| Role | Assigned To | Description |
|------|------------|-------------|
| `POWER_SOURCE` | Source elements | External grid / generator infeed |
| `BUSBAR` | Bus elements | Busbar (szyna zbiorcza) |
| `SECTION` | Switch between two busbars | Busbar coupler / section switch |
| `FEEDER` | LineBranch, Load, Cable | Feeder departure from busbar |
| `AXIAL_ELEMENT` | Transformer, Switch | Element on main vertical axis |
| `INLINE_ELEMENT` | Series elements in feeder chain | Element inline within a feeder |

**Invariant**: `count(roles) === count(symbols)` (after BoundaryNode filtering)

## 2. BoundaryNode Filtering

Nodes whose `elementName` contains "BoundaryNode" (case-insensitive) are filtered from rendering.
BoundaryNode is a business/analysis concept, not a physical element - it does not appear on SLD.

## 3. Canonical Layers (Vertical Ordering)

Top-down layout uses 13 canonical layers with fixed Y offsets:

| Layer | Y Offset | Content |
|-------|----------|---------|
| L0 | 0 | External sources (grid infeed) |
| L1 | 140 | WN busbar (110kV+) |
| L2 | 260 | WN/SN transformer |
| L3 | 360 | SN busbar (6-30kV) |
| L4 | 500 | Feeder switches |
| L5 | 620 | Feeder branches (cables, lines) |
| L6 | 760 | Load elements |
| L7 | 900 | Station SN/nN transformer |
| L8 | 1040 | Station nN busbar |
| L9 | 1180 | Station nN feeders |
| L10 | 1320 | Station PV inverter |
| L11 | 1460 | Station BESS |
| L12 | 1600 | Station consumer loads |

**Rule**: Source.y < WN_Busbar.y < Transformer.y < SN_Busbar.y < Feeder.y

## 4. Voltage Level Detection

Voltage levels are detected from element names:

| Pattern | Voltage Level |
|---------|--------------|
| Contains "110", "220", "400" | WN (High Voltage) |
| Contains "0.4", "nn", "nN" | nN (Low Voltage) |
| Default | SN (Medium Voltage) |

## 5. Busbar Layout

- Busbars are horizontal lines at their canonical layer Y position
- Width = `max(minBusbarWidth, slotCount * baySpacing + 2 * padding)`
- `minBusbarWidth` = 200px (from CANONICAL_GEOMETRY)
- `baySpacing` = 100px between feeder slots
- Busbars are centered at `padding + busbarWidth / 2`

### Busbar Sections

- A busbar may have multiple sections separated by section switches (couplers)
- Each section gets its own set of feeder slots
- Section detection: switches where both endpoints connect to the same busbar

## 6. Feeder Slot System

Feeders are assigned to deterministic slots along their parent busbar:

1. Feeder chains are detected: `busbar -> switch -> branch/load`
2. Chains are sorted by `symbolId` (alphabetical, deterministic)
3. Slots are evenly spaced along the busbar section
4. Slot X position = `sectionStartX + (index + 1) * spacing`
5. Spacing = `sectionWidth / (slotCount + 1)`

**Invariant**: Same feeder set -> identical slot positions

## 7. Feeder Chain Detection

A feeder chain is: `busbar(elementId) -> switch(fromNodeId|toNodeId) -> branch/load`

Rules:
- Switch must have one endpoint matching the busbar's `elementId`
- Branch/load must connect to the switch
- Branches connecting TWO busbars are NOT feeders (they are transformers/ties)
- Each chain element is positioned at its canonical layer Y, at the slot X

## 8. Station Stacks

Station substations (PV, BESS, FW, consumer) form vertical stacks:

```
SN busbar
  |
SN/nN transformer (L7)
  |
nN busbar (L8)
  |
nN feeders (L9-L12)
```

Station symbols are detected by name patterns ("stacja", "station", "GPO", "PV", "BESS").

## 9. Grid Snapping

All positions snap to a 20px grid:
```
snapped = Math.round(value / gridSize) * gridSize
```

**Invariant**: Every symbol position `x % 20 === 0 && y % 20 === 0`

## 10. Collision Detection

Symbol-symbol collision = CI FAIL.

### Bounding Boxes

| Element Type | Width | Height |
|-------------|-------|--------|
| Bus | 200 | 8 |
| Source | 40 | 40 |
| TransformerBranch | 40 | 60 |
| Switch | 20 | 30 |
| Other | 40 | 40 |

### Resolution Algorithm

1. Detect all AABB overlaps (with clearance margin)
2. Sort colliding pairs by priority (lower type priority moves)
3. Priority order: Bus(0) > Source(1) > Transformer(2) > Switch(3) > Branch(4) > Load(5)
4. Shift lower-priority symbol by `clearance + overlap` on appropriate axis
5. Repeat until no collisions or max iterations (20) reached

**Clearance**: 24px default symbol-symbol clearance

## 11. Determinism Guarantee

The layout is 100% deterministic:
- Same `symbols[]` array -> bitwise identical `positions` map
- Input order does not matter (symbols sorted by ID internally)
- No randomness, no Date.now(), no Math.random()
- Verification: `verifyDeterminism(symbols)` runs layout twice and compares

## 12. Incremental Updates (Auto-Insert)

When a symbol is added/removed:
1. Determine affected scope (which busbars/sections change)
2. Re-run role assignment on updated symbol set
3. Rebuild skeleton for affected sections only
4. Stability check: unrelated sections must not change positions

Operations:
- `ADD`: Insert new symbol into appropriate slot
- `REMOVE`: Remove symbol, collapse slot
- `MODIFY`: Re-evaluate role and reposition

## 13. Export Margin Validation

Layout must fit within export format boundaries:

| Format | Width | Height |
|--------|-------|--------|
| A3 | 1587 | 1122 |
| A4 | 1122 | 793 |
| PNG | 3840 | 2160 |

Margin = 40px from each edge.

## 14. Geometry Constants (CANONICAL_GEOMETRY Source)

All geometry values are sourced from `sldCanonicalStyle.ts` CANONICAL_GEOMETRY tokens:

```
gridSize = 20
padding = 80
layerSpacing = 140
busbar.minWidth = 200
busbar.height = 8
bay.spacing = 100
transformer.parallelSpacing = 120
source.verticalOffset = 60
stationStack.verticalPitch = 140
```

## 15. Orientation Support

Two orientations supported:

| Orientation | Primary Axis | Secondary Axis | Flow |
|-------------|-------------|----------------|------|
| `top-down` | Y (vertical) | X (horizontal) | Source top, loads bottom |
| `left-right` | X (horizontal) | Y (vertical) | Source left, loads right |

Default: `top-down` (standard SLD convention)
