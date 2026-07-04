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
| 16 | Every edge terminal-to-terminal | SPECIFIED | render path is coordinate-anchored (audit E03); terminal layer exists unused; execplan step 5. NOT done |
| 17 | No dangling connections | PRE-EXISTING (engine) | portAnchoredGeometry drops portless edges; render path not yet on it |
| 18 | No accidental diagonals | PROVEN (R2b) | corridor router orthogonal; prior session |
| 19 | No visual nodes without semantics | PARTIAL | junction dots exist; formal junction-vs-crossing rule = spec |
| 20 | No second active layout engine | SPECIFIED | two engines (slot+topological) confirmed; consolidation = execplan step 5/6. NOT done |
| 21 | No second active renderer | SPECIFIED | GpzCanonicalRenderer dead, GpzRenderer legacy fallback; removal = step 6. NOT done |
| 22 | No legacy fallback | SPECIFIED | slot fallback + GpzRenderer fallback exist. NOT done |
| 23 | Zoom doesn't change world geometry | PRE-EXISTING | audit Q5: setTransform only; ViewportController.test.ts |
| 24 | Mobile doesn't change world geometry | PRE-EXISTING | world geometry viewport-independent (audit §4) |
| 25 | Mobile default not a microscopic strip | SPECIFIED | root cause proven (fixed 1600×900 + aspect-blind fit); fix = execplan step 7. NOT done |
| 26 | Fit uses safe viewport | SPECIFIED | no safe rect (audit E16); execplan step 7. NOT done |
| 27 | Central LOD | PRE-EXISTING | LodPolicy.ts single registry (audit §6) |
| 28 | Labels not on wires | PARTIAL | prior redesign moved labels off pills; declutter exists; not exhaustively proven |
| 29 | Semantic tests pass | PROVEN | recovery oracles + topologyTree + electricalGraphConsistency green |
| 30 | Determinism tests pass | PRE-EXISTING | layoutCutover/substrate/electricalGraph determinism green |
| 31 | Desktop tests pass | PROVEN | 2725 tests + 1 skipped green |
| 32 | Mobile tests pass | SPECIFIED | no mobile test yet (execplan step 7) |
| 33 | Large-network tests pass | PRE-EXISTING | performance.perf.test.ts |
| 34 | Export = screen geometry | PRE-EXISTING (SVG) | serializes live canvas SVG (audit Q7) |
| 35 | P0 = 0 | NOT MET | E02/E03/single-projection/mobile P0s remain (SPECIFIED) |
| 36 | P1 = 0 | NOT MET | dead-code, safe-viewport, naming residue remain |

## 3. Changed files (this session)
- `docs/sld/SLD_FORENSIC_AUDIT.md`, `SLD_ELECTRICAL_SEMANTICS.md`, `SLD_RECOVERY_ACCEPTANCE_2026-07.md`; `docs/execplans/SLD_RECOVERY_EXECPLAN.md` — new.
- `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts` — E11 section number=idx+1+name; E11 order-based fallbacks→1-based.
- `frontend/src/ui/sld/v2/renderer/GpzSwitchgearLayout.ts` — section fallback 1-based.
- `frontend/src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.recovery.test.ts` — new oracles.
- `frontend/src/ui/sld/v2/renderer/__tests__/gpzSwitchgearScada.test.tsx` — 1-based intent.

## 4. Test evidence
- `vitest run --no-file-parallelism src/ui/sld/v2 src/engine src/ui/sld/core` → 150 files, 2725 pass, 1 skip.
- recovery oracles: E01/E07/E08/E11 pass; E02 skip (spec).
- guards: no_codenames, forbidden_ui_terms, docs, sld_determinism → pass.
- `tsc --noEmit` clean; eslint clean on changed files.

## 5. Honest remaining P0/P1 (NOT hidden)
- **P0 E02/E03/§16/§20** — single terminal-anchored projection: render must consume `portAnchoredGeometry` edges; trunk into station SN bus; retire slot router + two-truth seam. (execplan steps 4,5) — large, deferred, NOT faked.
- **P0 §25/26/32** — safe viewport + mobile camera + mobile test. (step 7)
- **P1 §21/22** — remove dead `GpzCanonicalRenderer` + dormant `builder/*` + legacy `GpzRenderer` fallback. (step 6)
- **P1** — DER explicit PCC marker; "RMU" jargon; display-name disambiguation.

## 6. Answer to the governing question
**DOES EVERY VISIBLE POWER PATH REPRESENT THE EXACT ELECTRICAL PATH IN ENM?**
Not yet — **NO**, and now proven *why*: rendered edges are coordinate-anchored,
not terminal-anchored (E03), and the trunk is drawn as an elevated corridor over
bus-to-bus stations (E02). The prerequisite ("prove what is connected to what")
is DONE (single-source traversal, truth table). The terminal-anchored render
rebuild (steps 4-5) is specified and is the gate to a YES; it is the next
increment and is not claimed complete here.
