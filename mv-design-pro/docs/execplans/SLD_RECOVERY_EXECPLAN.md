# SLD RECOVERY EXECPLAN (2026-07)

Basis: `docs/sld/SLD_FORENSIC_AUDIT.md` + `docs/sld/SLD_ELECTRICAL_SEMANTICS.md`.
Goal: every visible power path is the exact ENM electrical path, terminal-anchored,
single projection, single layout, single renderer per semantic, safe-viewport camera.

Each step: goal · files · kept contracts · removed code · test-before · change ·
test-after · done-criterion. Steps marked **[S]** are executed this session;
**[N]** are specified for the next increment (with exact code locations) and are
NOT claimed done.

## Step 1 [S] — Freeze failing reference cases as guards
- goal: encode E01/E02/E03/E07/E11/E08 as executable oracles so "fixed" is provable.
- files: `ui/sld/v2/canvas/__tests__/enmToSldAdapter.recovery.test.ts` (new).
- test-after: no-bypass (trunk enters station bus, not elevated corridor); one-source; naming bans (`Sekcja 0`, `Kabel…OVERHEAD`); DER PCC=nn_bus.
- done: tests exist and express intent (initially RED where behavior is wrong).

## Step 2 [S] — E11 section label: never zero-based index
- files: `enmToSldAdapter.ts:2181,2335`; `renderer/GpzSwitchgearLayout.ts:109`.
- change: fallback `name ?? ordinal(order+1)`; never `Sekcja ${order}` / `S${order}`.
- test-after: recovery test asserts no "Sekcja 0"/"S0" for the fixture.
- done: label uses name or 1-based ordinal.

## Step 3 [S] — E08 line-class guard
- files: `enmToSldAdapter.ts` `segmentKindLabel`/`buildCableRunLabel`; test.
- change: assert class label ∈ {"Kabel SN","Linia napowietrzna SN"} and never contains "OVERHEAD"; keep insulation variant separate.
- done: guard test green; no concatenated contradiction possible.

## Step 4 [S] — E02 trunk into the station SN bus (no elevated bypass)
- goal: trunk edge terminates on the station SN-bus terminal; remove the
  `STATION_RUN_TRUNK_OFFSET_Y` elevated corridor so the fishbone trunk runs
  through the station row, entering WE / leaving WY on the bus.
- files: `enmToSldAdapter.ts` (`buildCorridorRunGeometry`, `stationRunY`,
  `STATION_RUN_TRUNK_OFFSET_Y` consumers); `renderer/StationOnRunRenderer.tsx`
  (`TRUNK_Y` up-stub); affected tests.
- kept: fishbone-down layout, determinism, LOD mechanism.
- test-before: current renders show elevated trunk.
- test-after: no-bypass recovery test — trunk polyline Y at station rows equals
  the station bus Y (not station.y−80); trunk passes through station column.
- done: render shows trunk through station SN bus; recovery test green.

## Step 5 [N] — Single terminal-anchored routing in the RENDER path
- goal: `SldCanvasV2` cableRuns consume `portAnchoredGeometry` edges (engine
  polylines) instead of slot `buildCableRuns`; retire the two-truth seam
  `sldGeometryFromLayout.ts:134-142`.
- files: `sldGeometryFromLayout.ts`, `enmToSldAdapter.ts` (routing), canvas.
- risk: large; touches ~2700 tests. Not executed this session.

## Step 6 [N] — Retire dead/duplicate paths
- `renderer/GpzCanonicalRenderer.tsx` (dead), `builder/{HierarchicalLayout,CorridorLayout,LayoutStrategyDispatch}` (dormant), legacy `GpzRenderer` fallback.
- Requires migrating tests that render them. Not executed this session.

## Step 7 [DONE] — Safe viewport + mobile camera (E15/E16)
- goal: `fitToView` operates on a SAFE rectangle (element minus header/panels/
  toolbar); portrait default centers source/active feeder at a readable scale
  instead of aspect-letterboxing the wide-short world; "Dopasuj całą sieć" is an
  explicit action.
- files: `viewport/ViewportController.ts`, `SldCanvasV2.tsx` initial-camera,
  `SldWorkspaceContainer.tsx` measured-size → safe-rect.
- constraint: world geometry unchanged; only camera + safe-rect.
- DONE:
  - `ViewportController`: `SafeInsets`/`ZERO_INSETS`/`safeRect`; `fitToView` +
    `centerOnPoint` fit/center within the safe rect (default zero-inset =
    regression-equal to prior behaviour); new pure `initialCameraForNetwork`
    returning `{transform, mode}` — landscape/desktop → `fit`; portrait where
    fit-scale < readable floor → `focus` (readable scale centered on source/GPZ,
    rest of trunk reachable by pan).
  - `SldCanvasV2`: `safeInsets` prop; `computeSourceFocusPoint`; initial-camera
    effect uses `initialCameraForNetwork` (mobile focus) then operator-readable
    flooring only in fit mode; `computeFitTransformForCurrentNetwork` (the
    explicit "Dopasuj całą sieć" action) always fits the WHOLE bbox in the safe
    rect; `data-translate-x/y` exposed for test observability.
  - `SldWorkspaceContainer`: `SLD_CANVAS_SAFE_INSETS` (top 52 / bottom 44 / sides
    16) passed to the canvas.
  - tests: `ViewportController.test` (safeRect, fitToView-insets,
    initialCameraForNetwork at 430×932 + 390×844, geometry-untouched);
    `SldCanvasV2.mobileCamera.test` (real canvas: scale ≥ 0.5 on both phones,
    source in frame, desktop fits, station world transform identical across
    sizes). World geometry proven unchanged (camera = scale+translation only).

## Step 8 [S] — E07 DER PCC clarity
- goal: `nn_side` DER render anchored to station nN bus with explicit PCC marker;
  never floating on the 15 kV trunk.
- files: `renderer/DerRenderer.tsx` / `MiniBlockRmuRenderer` DER placement; test.
- done: recovery test asserts DER PCC anchor = station nn bus.

## Step 9 [S] — Regression + guards
- `vitest run --no-file-parallelism src/ui/sld/v2 src/engine src/ui/sld/core`;
  guards codenames/forbidden/docs/sld-determinism.
- done: all green.

## Step 10 [S/H] — Honest acceptance matrix + reviews
- fill `docs/sld/SLD_SCHEMAT_ODBIOR_2026-07.md` (or dedicated recovery matrix)
  with PROVEN / PARTIAL / SPECIFIED per DoD criterion + evidence. No criterion
  marked done without proof; remaining P0/P1 explicitly listed as SPECIFIED (steps 5-7).

## Sequencing
1→2→3→4→8→9→10 this session. 5,6,7 are the next increment (documented, not faked).
