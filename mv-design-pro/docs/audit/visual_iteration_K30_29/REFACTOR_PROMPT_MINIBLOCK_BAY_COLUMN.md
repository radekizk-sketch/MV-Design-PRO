# Refactor Prompt: MiniBlockRmuRenderer → bay-column architecture

**Target session goal:** Major refactor `MiniBlockRmuRenderer.tsx` z aktualnego
"floating symbols" layout na proper **bay-column SLD architecture** wzorowany
na `GpzSwitchgearRenderer.tsx`. Cel: per-station mini-block musi wyglądać
jak prawdziwy schemat elektryczny IEC 60617, NIE "układ klocków".

---

## Context

### Brutalna ocena użytkownika K30-29 (1/10):
> "Mini SLD totalnie nieczytelny, symbole rozmieszczone przypadkowa,
> układ klocków a nie schemat elektryczny"

### Co jest aktualnie (post-K30-30, branch `claude/cleanup-documentation-sld-7zVRd` commit `8925f15`):

`mv-design-pro/frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx`
(1100 lines) renderuje mini-blok per station w trzech wariantach
(`overview` 118×72, `compact` 190×136, `detail` 220×164 lub 340×280 z PV).

**Architektura aktualna (problemy):**

1. **SnBusRow** (line 493) — horizontal busbar SN + `BayMarker`s evenly
   spaced. Każdy BayMarker ma vertical dropline od `topY` do bus + switch
   diamond. **OK strukturalnie**, ale switche umieszczone NAD busem
   (`switchY = busY - 20`) gdy w real SLD switche powinny być POD busem.

2. **TransformerTriangle** (line 226) — TR symbol hardcoded `cy = 6` lub
   `cy = 2` z PV. **K30-30 dodało explicit vertical lines** bus → TR top
   + TR bottom → LV bus, ale **TR wciąż floating** bez integracji
   z bay structure. TR powinno być **dedykowanym bay** w kolumnie SN
   (rola TRANSFORMER) z normal bay column structure.

3. **LvSectionRow** (line 678) — LV bus horizontal + N feeder droplines.
   **OK strukturalnie**, ale brak per-feeder CB symbol details (CT/protection
   relay), feeders distributed evenly w 18% margins.

4. **Voltage overlay badge** (`U=X kV`) — renderowane SEPARATELY w
   `ResultOverlayLayer.tsx` jako floating div NAD station bbox. Brak
   visual anchor do station body.

5. **Cable labels "EPR Al 1C 150 · 167 m"** — renderowane na trunk segments
   w `LineSegmentSymbol`. Floating powyżej stations.

6. **Station BBOX rectangle** (line 189) — opacity 0 (po K30-30), ale
   struktura nadal "card layout" — bus + symbols inside fixed rect.

### Co jest dostępne jako wzorzec (`GpzSwitchgearRenderer.tsx`, 1937 lines):

GPZ renderer jest **dojrzała implementacja** z bay-column architecture:

- **`GpzSwitchgearLayout.ts`** — `computeSwitchgearLayout(sections, couplers)`
  → `SwitchgearLayout` z `cells[]` array (BayCell | CouplerCell), każdy
  z explicit `x` position
- **`BayCell`** ma `bay: GpzBayDescriptor` z bay role + apparatus refs +
  measurements + secondary flags
- **`BayRenderer.tsx`** (80 lines) — pojedynczy bay column z vertical
  apparatus stack: TOP→bus connection→CB→DS→CT/VT→ES→BOTTOM
- **`GpzBayWidgets.tsx`** (354 lines) — measurement rows + secondary
  flags badges per bay
- **`GpzApparatusSymbols.tsx`** (590 lines) — IEC 60617 symbols:
  `<CircuitBreakerSymbol>`, `<DisconnectorSymbol>`, `<EarthSwitchSymbol>`,
  `<CTSymbol>`, `<VTSymbol>`, etc.

Use these as **direct reference** dla mini-block bay-column refactor.

---

## Target architecture

### Bay-column model dla MiniBlockRmuRenderer

```
                         (trunk dropline z above)
                                  │
                                  ▼
─────────────────────────────────────────────────────────── SN busbar (horizontal solid line)
        │           │           │           │           │
       DS1         DS2         TR-DS        ...       (vertical bay columns)
        │           │           │
       CB1         CB2         TR-CB
        │           │           │
       ES1         ES2          ●  ──── TR primary
       │            │           │
       │            │       ┌───┴───┐
   (line OUT)  (line OUT)   │  TR   │
                            │ Yzn11 │
                            └───┬───┘
                                │
                                ● ──── TR secondary
                                │
                  ─────────────────────────── LV busbar
                        │      │      │
                       LV-CB1  LV-CB2 LV-CBn
                        │      │      │
                     (nN out)(nN out)(nN out)
```

### Proposed component structure

**NEW** `BayColumnSn.tsx` (~150 lines):
- Pojedynczy bay column SN (LINE_IN / LINE_OUT / TRANSFORMER)
- Vertical apparatus stack:
  1. Bus connection point (`y = busY`)
  2. Optional vertical lead to disconnector
  3. Disconnector symbol (z `GpzApparatusSymbols.DisconnectorSymbol`)
  4. Optional CB symbol (`GpzApparatusSymbols.CircuitBreakerSymbol`)
  5. Earthing switch symbol
  6. Bottom termination point (vertical lead to feeder OR transformer)
- Props: `x: number`, `busY: number`, `bayRole: FieldRole`,
  `apparatusKinds: ApparatusKind[]`, `interactive callbacks`

**NEW** `BayColumnLv.tsx` (~100 lines):
- Pojedynczy bay column LV (nN feeder)
- Stack: LV bus → CB → outgoing point
- Props: `x`, `lvBusY`, `cbCatalogRef`, `loadKw?`

**NEW** `MiniBlockBayLayout.ts` (~100 lines):
- `computeMiniBlockLayout(snBays, nnFeeders, hasTransformer)`:
  - SN bay positions: evenly spaced X coords
  - TR bay position: rightmost OR dedicated column
  - LV bay positions: evenly spaced below LV bus
  - Returns `MiniBlockLayout { snColumns, lvColumns, totalWidth, totalHeight, busY, lvBusY }`

**REFACTORED** `MiniBlockRmuRenderer.tsx`:
- Replace `SnBusRow` + `BayMarker` z `BayColumnSn[]`
- Replace `LvSectionRow` z `BayColumnLv[]` 
- Use `computeMiniBlockLayout` dla positioning
- Keep variant detection (overview/compact/detail) but compute compact
  bay column heights per variant
- Bus = horizontal line connecting tops of all bay columns
- LV bus = horizontal line connecting tops of all LV columns
- TR symbol integrated w dedicated bay column (NIE floating)

### Per-variant rendering

- **overview** (118×72): pojedyncza compact bay column z minimalnym apparatus
  set (top connection + DS only)
- **compact** (190×136): N bay columns horizontally, basic apparatus
  (DS + CB), no measurements
- **detail** (220×164): full bay column with stacked apparatus per role,
  visible CT/VT badges, TR integrated w dedicated bay, LV bus below

### Visual anchors (zlikwiduj "floating")

- Voltage overlay badge: rendered AS PART of station body (relative
  position dolny-left of bus SN, NOT separate overlay layer)
- Cable label "EPR Al X · Ym": positioned AT trunk midpoint between
  two stations (existing) — but ENSURE solid line connector od cable
  to top of each station SN bus
- DER badges (PV hex / BESS sq / FW triangle): positioned obok TR bay
  z explicit connection line (LV-side) lub przy block TR (SN-side)
- L (load) / G (generation) green/orange pills: pozycjonowane pod LV
  bus z explicit dropline z LV feeder

---

## Acceptance criteria

1. ✅ Każdy bay SN (LINE_IN/LINE_OUT/TRANSFORMER) renderowany jako
   **vertical column** z stacked apparatus per IEC 60617:
   - DS (rhombus) → optional CB (square z X) → ES (Y symbol) — wszystko
     na jednej osi pionowej
2. ✅ TR rendered as dedicated bay column (NIE floating). Vertical line
   bus SN → TR primary terminal explicitly visible.
3. ✅ LV bus → N feeder columns z CB per feeder
4. ✅ Trunk → bus SN connection EXPLICIT vertical dropline (visible przy
   `topology.connection`)
5. ✅ Voltage badge anchored to station body (NIE floating overlay)
6. ✅ No station BBOX rectangle outline (klocki feel eliminated)
7. ✅ Per-variant compact rendering (overview/compact/detail) z
   responsive bay column heights
8. ✅ Backward-compat: existing `MiniBlockRmuRendererProps` interface
   preserved (drop-in replacement). Test fixtures should still pass.
9. ✅ 56 existing `renderers.test.tsx` tests PASS
10. ✅ Type-check + lint clean
11. ✅ Visual verification: ultra-zoom 800×800 single station shows
    proper electrical schematic (NOT card layout)
12. ✅ K30-25 multi-feeder visualization preserved (5 feeders S08 visible
    as 5 LV bay columns, NOT 5 droplines from single LV bus)
13. ✅ Industrial readability — 13-specjalist aggregate ≥7/10

---

## Files to modify

**Frontend (NEW + modified):**

| File | Change | Lines (est) |
|------|--------|-------------|
| `frontend/src/ui/sld/v2/renderer/MiniBlockBayLayout.ts` | NEW — layout engine | ~150 |
| `frontend/src/ui/sld/v2/renderer/BayColumnSn.tsx` | NEW — SN bay column renderer | ~180 |
| `frontend/src/ui/sld/v2/renderer/BayColumnLv.tsx` | NEW — LV bay column renderer | ~120 |
| `frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx` | REFACTOR — use new components | ~600 (was 1100) |
| `frontend/src/ui/sld/v2/renderer/MiniBlockFootprints.ts` | UPDATE — apparatus stacks per role | +50 |
| `frontend/src/ui/sld/v2/__tests__/renderers.test.tsx` | UPDATE — adjust position assertions | +20 |
| `frontend/src/ui/sld/v2/__tests__/bayColumnSn.test.tsx` | NEW — bay column tests | ~150 |
| `frontend/src/ui/sld/v2/__tests__/bayColumnLv.test.tsx` | NEW | ~100 |
| `frontend/src/ui/sld/v2/__tests__/miniBlockBayLayout.test.ts` | NEW | ~100 |

**Reuse without modification (already exist):**
- `frontend/src/ui/sld/v2/renderer/GpzApparatusSymbols.tsx` — IEC 60617
  symbols (`CircuitBreakerSymbol`, `DisconnectorSymbol`, `EarthSwitchSymbol`,
  `CTSymbol`, `VTSymbol`)
- `frontend/src/ui/sld/v2/theme/tokens.ts` — colors + stroke widths
- `frontend/src/ui/sld/v2/renderer/MiniBlockFootprints.ts` — `MINI_BLOCK_FOOTPRINT`,
  `deriveFootprintType`, role definitions

---

## Implementation plan (step-by-step)

### Phase 1: Layout engine (~2h)

**File:** `MiniBlockBayLayout.ts` (NEW)

```typescript
// Public types
export interface SnBayColumn {
  readonly bay: MiniBlockBayDescriptor;  // existing type
  readonly x: number;
  readonly apparatusStack: readonly ApparatusKind[];  // ['DS','CB','ES']
}

export interface LvBayColumn {
  readonly index: number;
  readonly x: number;
  readonly cbCatalogRef?: string;
  readonly loadKw?: number;
}

export interface MiniBlockLayout {
  readonly variant: 'overview' | 'compact' | 'detail';
  readonly snColumns: readonly SnBayColumn[];
  readonly trColumn: SnBayColumn | null;  // dedicated TR bay
  readonly lvColumns: readonly LvBayColumn[];
  readonly busY: number;        // SN bus Y
  readonly lvBusY: number;      // LV bus Y
  readonly totalWidth: number;
  readonly totalHeight: number;
}

export function computeMiniBlockLayout(
  variant: 'overview' | 'compact' | 'detail',
  snBays: readonly MiniBlockBayDescriptor[],
  hasTransformer: boolean,
  nnFeedersCount: number,
  showPvCircuit: boolean,
): MiniBlockLayout {
  // Compute X positions:
  //   - SN bay columns: evenly distributed left→right
  //   - TR column: rightmost SN column LUB dedicated extra column
  //   - LV columns: evenly distributed below LV bus
  // Compute Y positions:
  //   - busY: top of mini-block + apparatus stack height
  //   - lvBusY: busY + apparatus stack + TR height + gap
}
```

### Phase 2: Bay column components (~3h)

**File:** `BayColumnSn.tsx` (NEW)

Per-role apparatus stack:
- **LINE_IN / LINE_OUT / RMU_LINE**: DS → CB → ES (3 apparatus)
- **TRANSFORMER / RMU_TRANSFORMER**: DS → CB → (extends w TR bay z separate
  TransformerSymbol below CB)
- **MEASUREMENT**: VT + CT (no CB)
- **COUPLER**: DS → CB → DS (3 apparatus, no ES)
- **RMU_OZE / OZE**: DS → CB → ES + DER badge below

Render:
```tsx
function BayColumnSn(props) {
  const { x, busY, bayRole, apparatusStack, variant } = props;
  const stackTop = busY + 4;  // start below bus
  const apparatusHeight = variant === 'overview' ? 14 : variant === 'compact' ? 22 : 32;
  const gap = 6;
  
  return (
    <g data-testid={`bay-column-sn-${props.bayRef}`}>
      {/* Connection point to bus (visible explicit) */}
      <circle cx={x} cy={busY} r={1.5} fill={COLOR_BUS_SN} />
      
      {/* Vertical lead bus → top of stack */}
      <line x1={x} y1={busY} x2={x} y2={stackTop} stroke={COLOR_BUS_SN} strokeWidth={2} />
      
      {/* Stacked apparatus */}
      {apparatusStack.map((kind, idx) => {
        const cy = stackTop + idx * (apparatusHeight + gap) + apparatusHeight / 2;
        return (
          <g key={`${kind}-${idx}`}>
            {kind === 'DS' && <DisconnectorSymbol cx={x} cy={cy} size={apparatusHeight} />}
            {kind === 'CB' && <CircuitBreakerSymbol cx={x} cy={cy} size={apparatusHeight} />}
            {kind === 'ES' && <EarthSwitchSymbol cx={x} cy={cy} size={apparatusHeight} />}
            {/* Vertical lead between apparatus */}
            {idx > 0 && (
              <line x1={x} y1={cy - apparatusHeight/2 - gap}
                    x2={x} y2={cy - apparatusHeight/2}
                    stroke={COLOR_BUS_SN} strokeWidth={2} />
            )}
          </g>
        );
      })}
    </g>
  );
}
```

**File:** `BayColumnLv.tsx` (NEW)

Similar struktura dla nN feeder column:
- LV bus connection point
- Vertical lead down
- CB symbol
- Outgoing point (z optional load badge below)

### Phase 3: Refactor MiniBlockRmuRenderer (~3h)

Replace existing rendering w `MiniBlockRmuRenderer.tsx`:

```tsx
export function MiniBlockRmuRenderer(props): JSX.Element {
  const variant = props.variant;
  const layout = useMemo(
    () => computeMiniBlockLayout(
      variant,
      props.snBays,
      props.hasTransformer,
      props.nnFeedersCount,
      hasPvNnCircuit(variant, props.derBadges),
    ),
    [variant, props.snBays, props.hasTransformer, props.nnFeedersCount, props.derBadges],
  );
  
  return (
    <g data-testid={`sld-v2-mini-rmu-${props.id}`}>
      {/* Trunk connection point (vertical dropline z above) */}
      {props.showTrunkLead && (
        <line
          x1={0} y1={-50}
          x2={0} y2={layout.busY}
          stroke={COLOR_TRUNK} strokeWidth={STROKE_TRUNK_LINE_PX}
        />
      )}
      
      {/* SN busbar — horizontal connecting all bay columns */}
      <line
        x1={layout.snColumns[0].x - 10}
        y1={layout.busY}
        x2={(layout.trColumn ?? layout.snColumns[layout.snColumns.length - 1]).x + 10}
        y2={layout.busY}
        stroke={COLOR_BUS_SN} strokeWidth={STROKE_BUSBAR_PX}
      />
      
      {/* SN bay columns */}
      {layout.snColumns.map((col) => (
        <BayColumnSn key={col.bay.bayRef} {...col} busY={layout.busY} variant={variant} />
      ))}
      
      {/* TR bay column (if present) — DS → CB → TR symbol → LV connection */}
      {layout.trColumn && (
        <TrBayColumn
          x={layout.trColumn.x}
          busY={layout.busY}
          lvBusY={layout.lvBusY}
          ratedKva={props.transformerRatedKva}
          variant={variant}
        />
      )}
      
      {/* LV busbar */}
      {variant === 'detail' && layout.lvColumns.length > 0 && (
        <>
          <line
            x1={layout.lvColumns[0].x - 10}
            y1={layout.lvBusY}
            x2={layout.lvColumns[layout.lvColumns.length - 1].x + 10}
            y2={layout.lvBusY}
            stroke={COLOR_BUS_LV} strokeWidth={STROKE_BUSBAR_PX}
          />
          {layout.lvColumns.map((col) => (
            <BayColumnLv key={col.index} {...col} lvBusY={layout.lvBusY} />
          ))}
        </>
      )}
      
      {/* Station code + Nn badge (existing K30-29) */}
      <StationCodeBadge code={props.stationCode} y={layout.totalHeight + 8} />
      <NnCountBadge count={props.nnFeedersCount} y={layout.totalHeight + 8} />
      
      {/* Voltage overlay anchored DIRECTLY to bus (NIE separate layer) */}
      {props.voltageMetric != null && (
        <VoltageBadge
          x={0}
          y={layout.busY - 22}
          value={props.voltageMetric}
        />
      )}
      
      {/* DER badges anchored to TR bay column LV side */}
      {props.derBadges.length > 0 && layout.trColumn && (
        <DerBadgesGroup
          x={layout.trColumn.x}
          y={layout.lvBusY + 12}
          badges={props.derBadges}
        />
      )}
    </g>
  );
}
```

### Phase 4: Visual verification (~1h)

Ultra-zoom screenshots (800×800, 1600×1200 single station):
- S01 z 1 feeder
- S03 z 3 feeders
- S08 z 5 feeders
- S09 z 4 feeders (przemysłowa)
- S25 z PV farm SN-side

Expert team review per K30-29 protocol — must score ≥7/10 aggregate.

---

## Verification checklist

```bash
cd mv-design-pro/frontend
npm run type-check                                   # clean
npx vitest run --no-file-parallelism src/ui/sld/v2/  # all PASS
npm run lint                                          # clean

# Visual: re-seed K30 + capture multi-LOD
cd ../backend && poetry run uvicorn src.api.main:app --port 8000 &
cd ../frontend && npm run dev &
node scripts/seed-gn30.mjs
# Run LF + SC_3F + capture screenshots multi-LOD
# Inspect S01, S03, S08, S09, S25 ultra-zoom 800×800

# Run Playwright E2E
npm run test:e2e -- critical-engineer-flow

# Run all guards
cd .. && python scripts/sld_determinism_guards.py
python scripts/forbidden_ui_terms_guard.py
python scripts/no_codenames_guard.py
```

Expected outcomes:
- 5008+ backend tests still PASS
- 1700+ frontend tests PASS (incl. new bay column tests)
- Visual S08 (5 feeders) ultra-zoom shows 5 LV bay columns, NOT 5 droplines
- TR symbol rendered AS BAY (dedicated column z DS→CB→TR→LV connection)
- Station code + badges anchored to body, voltage badge integrated
- 13-specjalist aggregate score ≥7/10 (was 1/10 K30-29 critique)

---

## Reference files (read first)

1. `mv-design-pro/frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx`
   — current implementation (1100 lines)
2. `mv-design-pro/frontend/src/ui/sld/v2/renderer/GpzSwitchgearLayout.ts`
   — bay-column layout engine wzorzec (401 lines)
3. `mv-design-pro/frontend/src/ui/sld/v2/renderer/GpzSwitchgearRenderer.tsx`
   — full GPZ renderer (1937 lines) — Cell-based architecture
4. `mv-design-pro/frontend/src/ui/sld/v2/renderer/BayRenderer.tsx`
   — single bay renderer wzorzec (80 lines)
5. `mv-design-pro/frontend/src/ui/sld/v2/renderer/GpzApparatusSymbols.tsx`
   — IEC 60617 symbol library (590 lines)
6. `mv-design-pro/docs/audit/visual_iteration_K30_29/REPORT.md`
   — K30-29 status + 13-specjalist scores
7. `mv-design-pro/docs/audit/visual_iteration_K30_29/K30_30_TR_CONNECTIONS_FIX.png`
   — current state visual baseline (1/10 user score)

---

## Out of scope (next session beyond)

- GPZ canonical renderer refactor (already mature)
- ResultOverlayLayer floating badges removal (separate concern)
- Cable label positioning anchoring (separate file `LineSegmentSymbol`)
- StationOnRunRenderer DispatcherStationSymbol refactor (LOD3+ different
  use case — overview map, not detailed schematic)

---

## Estimated effort

- Phase 1 (layout engine): 2h
- Phase 2 (bay column components): 3h
- Phase 3 (renderer refactor): 3h
- Phase 4 (visual verification + iter): 2h
- **Total: ~10h focused work** dla solid bay-column refactor

---

## Final goal

Per-station mini-block musi wyglądać jak **prawdziwy industrial SLD**
przy zoom 800×800, z explicit electrical connections per IEC 60617:
- Bus → bay columns → apparatus stack → TR → LV bus → feeder columns
- Wszystkie symbole z visible droplines (NIE floating)
- Voltage badge zintegrowana z station body (NIE overlay overlay)
- 13-specjalist aggregate ≥7/10 (user feedback baseline 1/10).
