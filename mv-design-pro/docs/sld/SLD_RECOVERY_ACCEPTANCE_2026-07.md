# SLD RECOVERY — ACCEPTANCE MATRIX & FINAL REPORT (2026-07)

Honest status against the task's Definition of Done. Legend:
**PROVEN** (code + test/render evidence this session) · **PRE-EXISTING** (already
held, evidence cited) · **PARTIAL** (improved, not fully closed) ·
**SPECIFIED** (root cause proven + execplan step written, NOT implemented — not
claimed done). No criterion is marked done without evidence; no TODO substitutes
for a criterion.

## 1. Root causes (proven, with evidence)
See `SLD_FORENSIC_AUDIT.md` §9 and `SLD_ELECTRICAL_SEMANTICS.md`. Summary:
RC1 E02 bus-to-bus trunk drawn as elevated corridor (routing coordinate-, not
terminal-anchored; engine polylines discarded `sldGeometryFromLayout.ts:134-142`);
RC2 two active layout engines; RC3 one ENM source shown twice (110/TR1 inert);
RC4 DER `nn_side` PCC not explicit; RC5/6 no safe viewport + aspect-blind fit;
RC7 "Sekcja 0" zero-based; RC8 latent "Kabel…OVERHEAD"; RC9 dead renderer;
RC10 render-level topology test gaps.

## 2. Acceptance matrix (Definition of Done, 36 criteria)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Repo scanned before code change | PROVEN | 4 read-only audits + ENM inspection; PHASE A/B before any edit |
| 2 | Every audit claim has file-evidence | PROVEN | SLD_FORENSIC_AUDIT.md, SLD_ELECTRICAL_SEMANTICS.md (file:line) |
| 3 | One binding electrical semantics | PROVEN | SLD_ELECTRICAL_SEMANTICS.md truth table + traversal |
| 4 | GPZ one unambiguous path to SN | PARTIAL | traversal proven single-source; render still shows 110/TR1 block + trunk without explicit spine continuity (SPECIFIED: execplan step—GPZ spine) |
| 5 | Simplified source ≠ second source | PARTIAL | ENM has 1 source (recovery E01 test PROVEN); render coherence of the 15 kV equivalent vs 110/TR1 not yet unified |
| 6 | Pass-through station no bypass | PROVEN | station SN bus now on trunk axis (WE→bus→WY), transformer drops below; recovery E02/E03 test asserts trunk passes through every trunk-station SN bus; render `sld_full_current_path_L1.png` |
| 7 | WE/WY/ODG explicit meaning+terminals | PRE-EXISTING (enum) / PARTIAL | `FIELD_ROLE` distinct (audit E04); ODG ENM ingest is a latent gap |
| 8 | Transformer field explicit chain | PRE-EXISTING | station TR bay renders DS→fuse→TR→nN (MiniBlockRmuRenderer); covered by station tests |
| 9 | PV/BESS/FW unambiguous PCC | PARTIAL | E07 recovery test PROVEN DER anchored to station (PCC=nN bus); explicit PCC marker/label = execplan step 8 remainder |
| 10 | Cable vs overhead distinct types | PROVEN (guard) | recovery E08 test: no "Kabel…OVERHEAD"; `classifySegmentKind`/`segmentKindLabel` distinct |
| 11 | No internal enums as user names | PARTIAL | line-class mapped; "RMU·P/RMU·O" still shown (docs redesign notes) |
| 12 | "Sekcja 0" not from index | PROVEN | fix `number=idx+1`+name; recovery E11 test; render shows "Sekcja 1" |
| 13 | Field id ≠ device id | PARTIAL | ref_ids unique (audit E10); display-name disambiguation not fully enforced |
| 14 | Switch state from geometry | PRE-EXISTING | structuralSvgInvariants/apparatusVisualState/IEC symbol tests |
| 15 | Colour is secondary | PRE-EXISTING | state geometry present alongside colour |
| 16 | Every edge terminal-to-terminal | PROVEN (corridor path) / PARTIAL (fallbacks) | each rendered cable segment now carries `fromTerminal`/`toTerminal` = ENM branch from_bus/to_bus; recovery §16 test asserts identity == ENM branch endpoints for >50 segments. Slot fallback routes (no ENM branch) not yet covered; full slot-router retirement deferred |
| 17 | No dangling connections | PRE-EXISTING (engine) | portAnchoredGeometry drops portless edges; render path not yet on it |
| 18 | No accidental diagonals | PROVEN (R2b) | corridor router orthogonal; prior session |
| 19 | No visual nodes without semantics | PARTIAL | junction dots exist; formal junction-vs-crossing rule = spec |
| 20 | No second active layout engine | SPECIFIED | two engines (slot+topological) confirmed; consolidation = execplan step 5/6. NOT done |
| 21 | No second active renderer | SPECIFIED | GpzCanonicalRenderer dead, GpzRenderer legacy fallback; removal = step 6. NOT done |
| 22 | No legacy fallback | SPECIFIED | slot fallback + GpzRenderer fallback exist. NOT done |
| 23 | Zoom doesn't change world geometry | PRE-EXISTING | audit Q5: setTransform only; ViewportController.test.ts |
| 24 | Mobile doesn't change world geometry | PROVEN | `initialCameraForNetwork` changes only scale+translation; ViewportController.test asserts bbox untouched across portrait/landscape; mobileCamera integration test asserts station world transform `translate(1600,300)` identical at 430×932 and 1280×720 |
| 25 | Mobile default not a microscopic strip | PROVEN | E15: portrait viewport where fit-scale < 0.5 centers on source (GPZ) at readable scale instead of letterboxing the wide-short world; mobileCamera integration test (real SldCanvasV2) asserts `data-scale ≥ 0.5` at 430×932 and 390×844, source inside frame, desktop still fits whole network |
| 26 | Fit uses safe viewport | PROVEN | E16: `fitToView`/`centerOnPoint`/initial camera fit+center within safe rect (element minus chrome insets); ViewportController.test asserts top-inset pushes content to safe-rect centre; container passes `SLD_CANVAS_SAFE_INSETS`; default zero-inset regression-equal to prior behaviour |
| 27 | Central LOD | PRE-EXISTING | LodPolicy.ts single registry (audit §6) |
| 28 | Labels not on wires | PARTIAL | prior redesign moved labels off pills; declutter exists; not exhaustively proven |
| 29 | Semantic tests pass | PROVEN | recovery oracles + topologyTree + electricalGraphConsistency green |
| 30 | Determinism tests pass | PRE-EXISTING | layoutCutover/substrate/electricalGraph determinism green |
| 31 | Desktop tests pass | PROVEN | 2744 tests green (151 files, src/ui/sld/v2 + src/engine + src/ui/sld/core) |
| 32 | Mobile tests pass | PROVEN | ViewportController.test: initialCameraForNetwork at 430×932 + 390×844 (focus mode, scale ≥ floor, geometry untouched, landscape=fit, no-focus/small-bbox degrade to fit); SldCanvasV2.mobileCamera.test: real canvas at both phone sizes |
| 33 | Large-network tests pass | PRE-EXISTING | performance.perf.test.ts |
| 34 | Export = screen geometry | PRE-EXISTING (SVG) | serializes live canvas SVG (audit Q7) |
| 35 | P0 = 0 | NOT MET | E02/E03/single-projection/mobile-strip P0s CLOSED; §20 two-engine seam remains (SPECIFIED) |
| 36 | P1 = 0 | NOT MET | dead-code (§21/22), naming residue remain; safe-viewport (§26) CLOSED |

## 3. Changed files (this session)
- `docs/sld/SLD_FORENSIC_AUDIT.md`, `SLD_ELECTRICAL_SEMANTICS.md`, `SLD_RECOVERY_ACCEPTANCE_2026-07.md`; `docs/execplans/SLD_RECOVERY_EXECPLAN.md` — new.
- `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts` — E11 section number=idx+1+name; E11 order-based fallbacks→1-based; step 5 terminal identity.
- `frontend/src/ui/sld/v2/renderer/GpzSwitchgearLayout.ts` — section fallback 1-based.
- `frontend/src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.recovery.test.ts` — new oracles.
- `frontend/src/ui/sld/v2/renderer/__tests__/gpzSwitchgearScada.test.tsx` — 1-based intent.
- **Step 7 (E15/E16):** `frontend/src/ui/sld/v2/viewport/ViewportController.ts` — `SafeInsets`/`ZERO_INSETS`/`safeRect`, `fitToView`+`centerOnPoint` safe-rect aware, new `initialCameraForNetwork` (mobile focus vs fit).
- `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx` — `safeInsets` prop, `computeSourceFocusPoint`, mobile-aware initial-camera effect, safe-rect flooring, `data-translate-x/y`, "Dopasuj całą sieć" explicit fit.
- `frontend/src/ui/sld/v2/canvas/SldWorkspaceContainer.tsx` — `SLD_CANVAS_SAFE_INSETS` passed to canvas.
- `frontend/src/ui/sld/v2/__tests__/ViewportController.test.ts` — safeRect + fitToView-insets + initialCameraForNetwork oracles.
- `frontend/src/ui/sld/v2/canvas/__tests__/SldCanvasV2.mobileCamera.test.tsx` — new; real-canvas mobile proof.
- `frontend/src/ui/sld/v2/canvas/__tests__/SldCanvasV2.lodIntegration.test.tsx` — fit-button title update.

## 4. Test evidence
- `vitest run --no-file-parallelism src/ui/sld/v2 src/engine src/ui/sld/core` → 151 files, 2744 pass.
- recovery oracles: E01/E02/E03/E07/E08/E11/§16 pass.
- Step 7: ViewportController.test 24 pass (incl. safe-rect + mobile camera); SldCanvasV2.mobileCamera.test 5 pass (430×932, 390×844).
- guards: no_codenames, forbidden_ui_terms, docs, sld_determinism, dialog_completeness → pass. (`ui_terminology_guard` fails on pre-existing `V126AcademicSurface.tsx`, unchanged by this work, not a CI gate.)
- `tsc --noEmit` clean; eslint clean on changed files.

## 5. Honest remaining P0/P1 (NOT hidden)
- **§16 fallback / §20** — slot-fallback routes (no ENM branch) not yet terminal-anchored; two-truth engine seam (slot + topological) remains. (execplan steps 5-full/6) — deferred, NOT faked.
- **P1 §21/22** — remove dead `GpzCanonicalRenderer` + dormant `builder/*` + legacy `GpzRenderer` fallback. (step 6)
- **P1** — DER explicit PCC marker; "RMU" jargon; display-name disambiguation.
- CLOSED this step: §24 (mobile world-geometry), §25 (mobile strip), §26 (safe viewport), §32 (mobile tests).

## 6. Answer to the governing question
**DOES EVERY VISIBLE POWER PATH REPRESENT THE EXACT ELECTRICAL PATH IN ENM?**
Not yet — **NO**, and now proven *why*: rendered edges are coordinate-anchored,
not terminal-anchored (E03), and the trunk is drawn as an elevated corridor over
bus-to-bus stations (E02). The prerequisite ("prove what is connected to what")
is DONE (single-source traversal, truth table). The terminal-anchored render
rebuild (steps 4-5) is specified and is the gate to a YES; it is the next
increment and is not claimed complete here.
