# SLD FORENSIC AUDIT (recovery 2026-07)

Read-only forensic scan of the active ENM → SLD pipeline. Evidence format:
`path:Lstart-Lend — symbol — finding`. Paths relative to `mv-design-pro/frontend/src`.
Method: 4 parallel read-only audit scopes (architecture, electrical semantics,
viewport/LOD, tests) + main-agent ENM inspection of `public/test-fixtures/sldSubstrate52s.enm.json`.

Screenshot is NEVER a source of topological truth — only evidence of a
presentation effect. Truth hierarchy: ENM contracts > canonical spec > domain
invariants > tests > active code > screenshot.

## 0. Executive verdict

The question the whole task turns on — **DOES EVERY VISIBLE POWER PATH REPRESENT
THE EXACT ELECTRICAL PATH IN ENM?** — currently answers **NO**, for a structural
reason: the render's **node positions come from one engine but its cable routes
come from another**, and the routes are **coordinate-derived, not terminal-anchored**.

## 1. Active pipeline (Q1)

Entry `buildSldDataFromSnapshot` (`ui/sld/v2/canvas/enmToSldAdapter.ts:682-831`),
two-pass:
1. `:689-693` — slot geometry pass: `buildGpzs/buildSections/buildStations/buildCableRuns/buildBranchPointMarkers` assign slot x/y.
2. `:709` — `buildSldLayoutGeometry` → `canvas/sldGeometryFromLayout.ts:60-101` → `geometry/portAnchoredGeometry.ts` → `engine/sld-layout/layoutEngine.ts` `TopologicalLayoutEngine.layout:586-636`.
3. `:710-724` — override: `applyLayoutToStations/applyLayoutToGpzs` overwrite node x/y with engine positions, then **`buildCableRuns` is re-run** from new station centers + GPZ trunk origins.
4. `:726-830` — DER / supply-path / topology projection + power-flow annotation.
Renderers: `canvas/SldCanvasV2.tsx` under one world transform `<g translate/scale>` (`:1132`).
Topology reader: `ui/sld/core/topologyInputReader.readTopologyFromENM`.

## 2. Two active geometry engines — INVARIANT 22 VIOLATION (P0)

- **Slot engine** (adapter): `buildStations:3178-3269`, `buildGpzs:2021`, constants `Y_RUN_BASE/X_STATIONS_START/RUN_PITCH/STATION_PITCH:207-291`. Runs first, always.
- **TopologicalLayoutEngine**: `engine/sld-layout/layoutEngine.ts:583-637`. Overrides node x/y whenever it builds ≥1 port→port edge (`sldGeometryFromLayout.ts:80-92`).
- **Two-truth seam (root of E02)**: `sldGeometryFromLayout.ts:134-142` deliberately does NOT apply engine edge polylines to cable runs — **routing is re-derived by slot `buildCableRuns` from moved station centers; engine edge polylines are discarded**. So rendered edges are **coordinate-to-coordinate**, not terminal-to-terminal — exactly the forbidden pattern (primary_objective: "od x1,y1 do x2,y2" zakazane).
- **Dormant duplicates (P1)**: `ui/sld/v2/builder/{HierarchicalLayout,CorridorLayout,LayoutStrategyDispatch}` assign coordinates but have only test callers. Dead layout math.

## 3. Renderer multiplicity — GPZ (Q4)

- ACTIVE: `SldCanvasV2.tsx:1240` `<GpzSwitchgearRenderer {...mapCanonicalToSwitchgearProps(canonical)}>`.
- LEGACY FALLBACK: `SldCanvasV2.tsx:1396` `<GpzRenderer>` (branch when no canonical props).
- DEAD (P1): `renderer/GpzCanonicalRenderer.tsx` — type-only import (`:79`); component rendered only in `__tests__`. Canonical props are re-mapped to the switchgear renderer, so the canonical component never renders in-app.

## 4. Interaction → no re-layout (invariants 12-15 SATISFIED) (Q5)

- Layout memoized on data only: `SldWorkspaceContainer.tsx:1082` `useMemo(buildSldDataFromSnapshot,[snapshot,logicalViews])`.
- Auto-fit effect deps `[viewportContentSignature,width,height]` (`SldCanvasV2.tsx:845-879`). Zoom/pan/overlay/panel only call `setTransform` — camera, not geometry. **Invariants 12,13,14,15 hold in code.** (But no TEST asserts overlay/panel invariance — gap, §8.)

## 5. Bounds & export (Q6, Q7)

- World bbox: `ViewportController.computeBoundingBox:151-168`; consumers push only NODE anchor points (`SldCanvasV2.tsx:845-879`). **Cable-run `pathPoints` are NOT in the fit bbox** (P1) — routes beyond node extents can clip; degenerate/zero-size legacy GPZ undercounts bounds.
- Export = same geometry: `export/downloadSldExport.ts:62-85` serializes the live `svg[data-testid="sld-canvas-v2"]`; `export/exportSvg.ts` only normalizes color/theme. **Export is geometry-faithful to screen (invariant 34 SATISFIED for SVG path).** DXF/CIM/61850/PDF not audited.

## 6. Viewport / LOD / mobile

- **LOD central (invariant 27 SATISFIED)**: `lod/LodPolicy.ts:10-17` thresholds, `:29-35` `inferLodFromScale`, `:77-106` `isVisibleAtLod`, `:245-309` hysteresis FSM. LOD never mutates node x/y (`layoutEngine.ts:564-574` `projectLod` strips children only). Invariants 17-19 hold.
  - Hysteresis DISABLED in live canvas: `SldCanvasV2.tsx:836-842` builds controller with `hysteresisMargin:0, debounceMs:0`. Scattered `viewportScale` checks in renderers are zoom-invariant sizing caps, NOT competing LOD thresholds.
- **No safe viewport (E16 CONFIRMED)**: `ViewportController.fitToView:92-117` takes only `{width,height}` + symmetric `paddingPx`; `measured` = full container contentRect (`SldWorkspaceContainer.tsx:883-905`). No header/panel/toolbar insets. grep `safe`/`inset` → only CSS `inset-0` + label insets.
- **Mobile empty-strip (E15) ROOT CAUSE**: content authored for fixed landscape frame `DEFAULT_FRAME={1600,900}` (`layoutEngine.ts:69`) + no-shrink scale floor `s=Math.max(sFit*0.86,1)` (`:544`) → wide-short world bbox. Camera `fitToView` does aspect-preserving uniform min-scale centered (`ViewportController.ts:106-114`); wide-short content in portrait → letterboxed thin horizontal strip, tall black bands (`SldCanvasV2.tsx:1116` fills element with `COLOR_BG`). It is **aspect-ratio letterboxing**, not a bounds/overlay bug.

## 7. Electrical semantics facts (from ENM fixture) — see SLD_ELECTRICAL_SEMANTICS.md

- **ONE source** (`enm.sources` length 1): `gpz/…/source/main` "GPZ Referencyjny 15 kV". GPZ substation has bus_110 + section/001/bus_sn + transformer `wn_sn` (TR1 110/15 Yd11 25 MVA, `uhv_kv/ulv_kv`). Section `incoming_source_ref` = the same source. **E01 = presentation problem, not a dual model.**
- Section `gpz_sections[0].order = 0`, `name = "Sekcja 1"` → **E11 "Sekcja 0" = zero-based index leak** at `enmToSldAdapter.ts:2335` (`Sekcja ${sec.order}`), `:2181`, `GpzSwitchgearLayout.ts:109` (`S${order}`).
- All 20 DER `connection_variant="nn_side"`, `bus_ref=stn/*/nn_bus` → **E07: DER attach to station LV bus, not the 15 kV trunk; PCC = station nN bus.**
- **E02 mechanism**: trunk routed at `stationRunY = station.y − STATION_RUN_TRUNK_OFFSET_Y(80)` (`enmToSldAdapter.ts` router; offset `StationOnRunRenderer.tsx:33`), i.e. an elevated corridor ABOVE stations with drop-stubs — reads as a bypass over the station instead of WE→bus→WY through it.

## 8. Test coverage gaps (P0)

- No general no-bypass test that a pass-through station's inbound terminal ≠ outbound terminal (only branch-pole `enmToSldAdapter.test.ts:3262` and GPZ `GpzCanonicalRenderer.noDirectTie.test.tsx`).
- Terminal-to-terminal anchoring test (`geometry/__tests__/portAnchoredGeometry.substrate.test.ts` "M-03a V-07") covers the ENGINE geometry, **not the rendered slot cable runs** — so it does not guard the actual render.
- No terminal-id uniqueness on a built graph; no terminal-position stability across open/close or across LOD (only within-LOD determinism).
- No naming-ban tests for "Sekcja 0" / "Kabel…OVERHEAD".
- No overlay/panel geometry-stability test (invariant declared in `ViewportController.test.ts` header, no body).
- No mobile/portrait fit test; no "pan/zoom does not re-layout" guard.
- Strong existing coverage: symbol open/closed geometry (`structuralSvgInvariants.test.tsx`, `apparatusVisualState.test.ts`, IEC symbol tests) → **E13 well-covered**; determinism strong; topologyTree connectivity strong.

## 9. Prioritized root causes

| # | Failure | Root cause (file:line) | Severity |
|---|---|---|---|
| RC1 | E02 bypass / edges not terminal-anchored | routing re-derived from node centers; engine polylines discarded `sldGeometryFromLayout.ts:134-142`; elevated trunk `STATION_RUN_TRUNK_OFFSET_Y=80` | P0 |
| RC2 | Two active layout engines | slot `buildStations/buildCableRuns` + `TopologicalLayoutEngine` glued | P0 |
| RC3 | E01 dual-source appearance | one ENM source; GPZ block vs trunk-origin rendered without explicit continuity | P0 |
| RC4 | E07 DER PCC unclear | DER `nn_side` shown near 15 kV line, PCC (station nN bus) not explicit | P0 |
| RC5 | E15 mobile letterbox | fixed 1600×900 frame + min-scale aspect-blind fit, no safe viewport | P1 |
| RC6 | E16 no safe viewport | `fitToView` uses full element | P1 |
| RC7 | E11 "Sekcja 0" | `Sekcja ${order}` zero-based fallback | P1 |
| RC8 | E08 "Kabel…OVERHEAD" | line-class label concatenation | P1 |
| RC9 | Dead GPZ renderer / dormant layouts | `GpzCanonicalRenderer` + `builder/*` unused | P1 |
| RC10 | Test gaps | no render-level no-bypass / terminal-uniqueness / naming-ban / mobile tests | P0 (proof gap) |
