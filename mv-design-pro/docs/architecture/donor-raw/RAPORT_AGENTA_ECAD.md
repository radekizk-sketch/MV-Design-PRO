> **MATERIAŁ SUROWY SUBAGENTA — NIE JEST DECYZJĄ.**
> Raport agenta ECAD z audytu donorów 2026-09-07. Zachowany w repo jako dowód i ślad
> rozumowania (§14/§15 mandatu). **Twierdzenia w tym pliku NIE są zweryfikowane w całości.**
> Wiążące są: `OPEN_SOURCE_DONOR_AUDIT.md` (ustalenia zweryfikowane),
> `DONOR_DECISION_MATRIX.md` (decyzje) i `DONOR_AUDIT_CHECKPOINT.md` (pomiary własne).
> Gdzie ten plik jest sprzeczny z tamtymi — **tamte wygrywają**; sprzeczności wykryte
> przy weryfikacji są nazwane w `OPEN_SOURCE_DONOR_AUDIT.md` §7.

# REPORT_ECAD — Semantic ECAD / SLD donor audit for MV-DESIGN-PRO

Agent: ECAD. Baseline: `MV_BASELINE.md` (MV HEAD 5adc958d, CV-4.3 K6).
Method: all four donors cloned with `git clone --depth 1`, source read directly.
README claims are not used as evidence anywhere below.

---

## 0. Provenance — commits and licenses verified at the cloned SHA

| Donor | Commit reviewed (exact SHA) | Commit date | License (verified how) | Copyleft / obligation |
|---|---|---|---|---|
| VoltWeave | `0384b23585b735eda745596b9ea95335a1f2a7e7` | 2026-09-07 | **MIT** — `LICENSE` read: "MIT License / Copyright (c) 2026 VoltWeave contributors". `package.json` has `"private": true` and **no `license` field**. | None. *Risk note:* the only license assertion is the `LICENSE` file; package metadata does not corroborate it, and there are no per-file SPDX headers. |
| sldeditor | `9e1bba0b9fc705172aac5027b0a7c255b200099a` | 2026-09-01 | **MIT** — `LICENSE` read ("Copyright (c) 2026 NovaShang") **and** `package.json` `"license": "MIT"`. Two independent assertions agree. | **Yes, in `third_party/`** — see §L. Repo's own `src/` is clean MIT. |
| xyflow | `0a1f9575b25679f2880175de8d3eae21aedde921` | 2026-09-01 | **MIT** — root `LICENSE` ("Copyright (c) 2019-2025 webkid GmbH") **and** `"license": "MIT"` in `packages/react`, `packages/svelte`, `packages/system`. | None. |
| elkjs | `cc8008397885250fb7004b3e42c975c5535ac443` | 2026-08-13 | **EPL-2.0 OR GPL-3.0-or-later** — `package.json` `"license": "EPL-2.0 OR GPL-3.0-or-later"` **and** SPDX header read in `src/js/elk-api.js`. `LICENSE.md` is full EPL-2.0 text. | **Yes — weak copyleft.** See §L. |

### §L — Registered license obligations (obligations recorded; no legal opinion given)

**elkjs — EPL-2.0 OR GPL-3.0-or-later (dual).** Recipient elects a branch.
- EPL-2.0 branch: file-level weak copyleft. Modifications to EPL-covered files must be
  distributed under EPL-2.0 with source availability. Aggregating an unmodified `elkjs`
  npm dependency alongside proprietary code is the ordinary, low-obligation pattern.
- GPL-3.0-or-later branch: strong copyleft; would reach MV's frontend if elected.
- Obligation registered: **if elkjs is consumed at all, consume the published npm artifact
  unmodified and never vendor/patch its sources.** Any patch converts a
  dependency-aggregation question into a modified-EPL-work question.
- EPL-2.0 also carries patent-retaliation and "Commercial Distributor" indemnity clauses
  (LICENSE.md §4). Registered, not assessed.

**sldeditor — repo MIT, but `third_party/qelectrotech/` is NOT MIT.**
- Measured: **952 `.elmt` files present** under `third_party/qelectrotech/` at this SHA.
- `third_party/qelectrotech/ELEMENTS.LICENSE` read verbatim. Two obligations that matter:
  1. **CC-BY 3.0 attribution** on any redistribution "out of an electric diagram".
  2. Literal text: *"Permission is not granted to use this software or any of the associated
     files as sample data for the purposes of building machine learning models."*
     `THIRD_PARTY_NOTICES.md` restates this as binding on the project and on third parties.
- Mitigation measured, not assumed: `grep -rln "qelectrotech" src/` matches **only
  `src/styles.css`**. The shipped library `src/element-library/*.json` (94 entries; format
  verified on `breaker.json`: declarative `svg` string + `terminals[]` with `orientation`)
  does **not** reference QElectroTech and reads as independently authored.
- Obligation registered: **any MV adoption must draw from `src/`, never from
  `third_party/qelectrotech/`.** Taking a symbol from the `.elmt` collection attaches CC-BY
  attribution plus the ML-training prohibition to MV.

**Cannot verify:** whether every `src/element-library/*.json` glyph is genuinely original
rather than hand-retraced from the CC-BY collection. Source cannot answer this; it needs a
maintainer statement. Flagged, not resolved.

---

## 1. Decision table — one row per SUBSYSTEM

Decisions: COPY | PORT | INTEGRATE | REWRITE_CLEAN_ROOM | STUDY_ONLY | REJECT

| # | Subsystem | Donor / symbols read | MV equivalent | Gap | Decision | Target MV module | ENM impact | SLD impact | Risk | Prio |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Tri-partite semantic identity (device / function / pin) | VoltWeave `model.js` `addDevice`,`addFunction`,`rebindDevice`, `COLLECTIONS` | ENM `Port`/`PortRef`/`ConnectionNode` (`enm/models.py:726-800`) — richer (15 `PortKind`, `nominal_voltage_kv`, `bay_ref`, `occupied_by`) | **None in MV's favour.** MV is ahead | **STUDY_ONLY** | — | none | none | — | P2 |
| S2 | Multi-representation (1 function → N placements) | VoltWeave `app.js:233` `reference()`, `CrossReferenceIndex` | none (scene is single-pass derived) | MV cannot draw one bay on two sheets with cross-refs | **REWRITE_CLEAN_ROOM** | `sld/v3/sheet` + new placement store | none | additive | med | P2 |
| S3 | **Persisted placement + route store (connection ≠ route)** | VoltWeave `connections[].route{pageId,fromPlacementId,toPlacementId,waypoints}` (`model.js:44`), `placements`; sldeditor `Wire.path?`, `layout: Record<ElementId,Placement>`, `Bus.layout?`, `JunctionLayout` (`model/types.ts:142-178`) | **NONE — confirmed at source** | `buildScene.ts` header: v2 `x`/`y` "są WSZĘDZIE IGNOROWANE"; scene fully recomputed | **PORT (shape only)** | new `sld_placement` store + `enm/` sibling table | **additive, ENM keeps primacy** | large | **high** | **P0** |
| S4 | Junction / tap materialization on wire-drop | VoltWeave `model.js:92` `splitConnection`, `app.js:261` `resolveEndpoint` | ENM `ConnectionNode.location="branch_point"` exists; **no canvas gesture creates it** | gesture → explicit domain op missing | **PORT** | `enm/domain_operations_v2.py` + `sld/v3` tool | uses existing enum | med | med | **P0** |
| S5 | Transaction: validate-before-commit + atomic rollback | VoltWeave `ProjectStore.edit` (`model.js:194-199`), `validateProject` (`:106-142`) | `enm/validator.py`, `domain_operations{,_v2}.py`, `rewizje.py` | MV validates; **not proven** it rejects atomically pre-commit on every path | **STUDY_ONLY** | `enm/domain_operations_v2.py` | none | none | low | P1 |
| S6 | Undo/redo via sparse reversible patches, bounded memory | VoltWeave `patchesBetween`, `ProjectStore.apply/undo/redo` (`model.js:148-206`) | `rewizje.py` + `dziennik_zmian.py` | MV has revisions+journal; VoltWeave adds bounded-memory (200 / 32 MB) eviction | **STUDY_ONLY** | `enm/rewizje.py` | none | none | low | P2 |
| S7 | Referential-integrity validator | VoltWeave `validateProject` `model.js:106-142` | `enm/validator.py` | VoltWeave `:135` route↔endpoint check is the **exact invariant S3 needs** | **PORT (one rule)** | validator for new placement store | additive | — | low | P0 |
| S8 | Net analysis (union-find, coordinate-free) | VoltWeave `DisjointSet`,`buildGraph` (`graph.js:4-35`); sldeditor `UnionFind`, `compile.ts:352-363` | `enm/topology.py`, `topology_ops.py`, `rozplyw_wysp.py` | MV has islands already | **REJECT (duplicate)** | — | none | none | — | — |
| S9 | Orthogonal router (Manhattan → A*, obstacles, **explicit failure**) | VoltWeave `orthogonalRoute`,`routeWire`,`escapePoint`,`simplify` (`routing.js:25-63`) | `sld/v3/layout/route.ts`, `v2/geometry/cadRoutingContract.ts` | MV routes; no obstacle-avoiding A* fallback, no waypoint anchors | **PORT** | `sld/v3/layout/route.ts` | none | med | med | **P1** |
| S10 | Domain-aware SLD auto-layout (bus tiers, transformer linkers, bus ties) | sldeditor `compiler/auto-layout.ts` (2120 LOC, 7-stage doc header read) | `sld/v3/layout/{bands,columns,sheetRows,declutter}.ts`, `engine/sld-layout` | MV's is MV-specific and already shipped | **STUDY_ONLY** | — | none | none | — | P2 |
| S11 | Spatial index / hit testing | VoltWeave `SpatialIndex` (`routing.js:66-70`); sldeditor `hit-test.ts` (DOM `data-*`) | `sld/v3/canvas/hitAreas.ts`, `camera.ts`, `minimap.ts` | none | **REJECT (duplicate)** | — | none | none | — | — |
| S12 | Scene / display list + SVG pipeline | VoltWeave `DrawList`,`buildScene`,`sceneToSVG` (`scene.js`) | `sld/v3/scene/buildScene.ts`, `v3/canvas/layers.ts`, `sld/export` | MV's is far richer (LOD, sheets, themes) | **REJECT (duplicate)** | — | none | none | — | — |
| S13 | Persistence | VoltWeave `persistence.js` (IndexedDB/localStorage) | Postgres/Mongo + `project_archive` ZIP | browser-only, wrong tier | **REJECT** | — | none | none | — | — |
| S14 | Report projections (BOM / terminals / cables / ERC) | VoltWeave `analyzeProject` (`graph.js:60-132`), `reports.js` `REPORT_COLUMNS` | `analysis/reporting/`, proof packs, readiness codes | VoltWeave's are control-panel domain (PLC/terminal strips), not MV power domain | **REJECT (wrong domain)** | — | none | none | — | — |
| S15 | Worker + revision staleness discard | VoltWeave `analysis-worker.js`; `app.js:50` `applyAnalysis` (`if(revision!==store.revision)return;`) | `canonical_runs` R1, ADR-018 freshness, ADR-026 | MV has it server-side | **STUDY_ONLY** | — | none | none | — | P2 |
| S16 | Operator interaction UX (busbar first-class, handles, manual waypoints, marquee, group move, keyboard) | sldeditor `canvas/tools/*`, `WireHandles.tsx`, `BusHandles.tsx`, `useKeyboardShortcuts.ts`, `store/group-move.ts` `translateManualWirePaths` | `sld/v3/canvas`, `sld-editor/**` (**56 LOC — effectively empty**) | MV has a viewer, not an editor | **REWRITE_CLEAN_ROOM** | `ui/sld-editor/**` | none | large | med | **P1** |
| S17 | **Proximity auto-tap: drop within 30 px of a bus ⇒ create a Wire** | sldeditor `canvas/drop-on-bus.ts` `dropElement`,`nearestBus`,`PROXIMITY_PX=30` | none | — | **REJECT** | — | would violate law #3 | — | — | — |
| S18 | DXF export | sldeditor `lib/export-dxf.ts` (907 LOC) + `tests/lib/export-dxf.test.ts` | `sld/v3/export`, `sld/export` (SVG/PDF/DOCX) | MV has no DXF | **STUDY_ONLY** | `sld/v3/export` | none | additive | low | P2 |
| S19 | Declarative symbol registry (JSON geometry + typed terminals) | sldeditor `element-library/*.json` (94), `model/library.ts`; VoltWeave `symbols.js` `validateSymbol`, `internal[]` groups | `sld/canonical_symbols/`, `v3/cad/cadSymbolRegistry.ts` | MV has a registry; VoltWeave's `internal[]` **conductive-bond declaration** is absent | **PORT (`internal[]` concept only)** | `cadSymbolRegistry.ts` + ENM | small additive | small | low | P2 |
| S20 | Generic node-editor interaction infra | xyflow `packages/system/src/xyhandle/{XYHandle,utils}.ts` `getClosestHandle`/`connectionRadius`, `xydrag`, `xypanzoom`, `xyminimap`, `xyresizer` | `v3/canvas/{camera,hitAreas,minimap,layers,toolbarLayout}`, `v2/{viewport,lod,renderer,command}` (~183k LOC SLD) | — | **REJECT** | — | none | none | — | — |
| S21 | Generic layered/hierarchical layout with port constraints | elkjs — **algorithm source NOT present at this SHA** (see §4) | `v3/layout/*`, `engine/sld-layout` | — | **REJECT** | — | none | none | — | — |
| S22 | Executable law-invariant test corpus | VoltWeave `tests/core.test.mjs` tests 18, 19, 33, 37, 50, 51 (names read) | MV guards + `sld-determinism.yml` | MV has **no** test named "moving geometry does not alter connectivity" | **REWRITE_CLEAN_ROOM** | `frontend/src/ui/sld/**/__tests__`, `backend/tests/enm/` | none | none | low | **P0** |

---

## 2. VoltWeave — detailed findings

**Scale (measured):** `src/` = 11 files, 1152 physical lines, ~160 KB. Line counts mislead:
the code is written at ~180 chars/line. Dependency-free ES modules, Node ≥20.
Tests: 40 in `tests/core.test.mjs`, 11 in `tests/persistence.test.mjs`.

### 2.1 What VoltWeave actually is (ontology — this decides everything)

`COLLECTIONS = ['pages','devices','functions','pins','placements','connections','strips',
'cables','symbols','macros']` (`model.js:8`). The identity split is real and clean:

- **device** = physical identity (`-K1`, part, manufacturer) — `addDevice`
- **function** = electrical-function identity (a contactor coil vs. its aux contacts) — `addFunction`
- **pin** = port identity, one UUID per terminal — minted in `addFunction` (`model.js:34`)
- **placement** = geometry only `{functionId, pageId, x, y, rotation}` (`model.js:35`)
- **connection** = `{from: pinId, to: pinId}` **plus** nested `route`
  `{pageId, fromPlacementId, toPlacementId, waypoints[]}` (`model.js:44`)

`rebindDevice` (`model.js:47`) re-points a function at another device and garbage-collects the
orphan — proving device identity and function identity are genuinely independent.

### 2.2 Connectivity is coordinate-free — verified in code, not inferred

`graph.js:3` carries the comment *"Disjoint sets contain persistent connection-point IDs only.
No coordinate enters this class."* — and the code honours it. `buildGraph` (`graph.js:13-35`)
unions only:
1. explicit `connections` (`dsu.union(w.from, w.to)`),
2. symbol-declared internal bonds (`symbol.internal` groups — e.g. a feed-through terminal
   bonding pins `1`–`2`), and
3. matching named potentials, scoped `project` or `location` (`graph.js:20-24`).

No branch reads `x`/`y`. Determinism is deliberate: ids sorted, `union` picks the
lexicographically smaller root (`a<b?b:a`), nets and their `connections`/`labels`/`numbers`
sorted before return.

`app.js:261` `resolveEndpoint` is the decisive interaction proof. Dropping a wire onto an
existing wire does **not** infer a connection from crossing geometry — it calls
`splitConnection`, which **inserts a real `junction` function with a real pin** and connects to
that pin. Gesture → explicit topological operation. This is exactly the pattern MV needs for
tapping a line, and MV already has the receiving concept
(`ConnectionNode.location = "branch_point"`).

### 2.3 The disqualifier — placement is load-bearing for topology

VoltWeave inverts MV law #4. Three independent pieces of evidence:

1. `connect()` **requires two placements on the same page** and throws otherwise
   (`model.js:39-40`).
2. `deleteSelection` deletes every connection whose route references a removed placement — with
   the explicit comment *"A route cannot refer to a deleted representation, even when its
   function survives"* (`model.js:64`).
3. `validateProject` **rejects** any connection whose route does not resolve to live placements
   with matching functions: *"Connection route does not represent its semantic endpoints"*
   (`model.js:135`).

So in VoltWeave the drawing **is** the model. Deleting the graphic deletes the electrical
connection (test 33 asserts this as intended behaviour). Under MV law, ENM must survive the SLD
being deleted, recomputed, or relayouted at any LOD (law #4).

**→ Answer to the decisive question: NO. `ProjectStore` cannot become MV's SLD Projection
Kernel. Adopting it wholesale would make placement a precondition for connectivity — precisely
ENM losing primacy.** What is adoptable is the *record shape* (S3) and specific mechanisms
(S4, S7, S9), with the invariant direction **inverted** on the way in.

### 2.4 The one thing MV should actually take (S3) — and the inversion required

VoltWeave's answer to "durable manual CAD placement + routing" is small and correct in shape:
persist **intent**, recompute **geometry**.
- `placements[id] = {functionId, pageId, x, y, rotation}` — durable.
- `connections[id].route.waypoints[]` — durable *anchors only*.
- The rendered polyline is **not** stored. `scene.js:48` calls `routeWire` on every
  `buildScene`, and `routeWire` (`routing.js:61-63`) threads
  `[escapePoint, ...waypoints, escapePoint]` through the router.
- `app.js:228` `autoRoute()` sets `waypoints = []` — "restore automatic routing" is a
  one-field reset, not a mode flag.

For MV the same shape works, with ownership reversed:

| VoltWeave | Required MV form |
|---|---|
| connection cannot exist without placement | **ENM connection exists regardless; placement is optional decoration** |
| deleting placement deletes connection | deleting placement **only** drops the placement row |
| validator rejects route without placements | validator rejects a **placement whose ENM target is gone** (dangling-reference direction reversed) |
| placement store is inside the project | placement store is a **sibling keyed by ENM id**, never inside ENM |

Concretely: a `sld_placement` table keyed by ENM element id holding `{x, y, rotation, lod,
sheet}` plus `route_waypoints` keyed by ENM connection id. `buildSceneV3` gains one optional
input; when a key is absent it falls back to the computed layout it already produces today.
That preserves `buildScene`'s current purity claim (*"Zero DOM/losowości/Date — determinizm"*)
and law #4, because deleting the whole placement store returns MV to exactly today's behaviour.

### 2.5 Transactions and performance ceiling

`ProjectStore.edit` (`model.js:194-199`): `clone(project)` → mutate draft →
`validateProject(draft)` → `patchesBetween` → commit → `notify(label, patches, topologyTouched)`.
Clean validate-before-commit; the `topology` flag (true only when
`functions|pins|connections|symbols` changed) is a selective-invalidation signal analogous to
MV's ADR-026.

**Adversarial note:** `edit` `structuredClone`s the *entire* project and `patchesBetween`
`JSON.stringify`-compares *every entity in every collection* on *every* edit — O(project) per
transaction, against a declared 100 000-entity-per-collection ceiling (`model.js:111`).
VoltWeave dodges this at the UI level, not the model level: during a drag, positions live in
ephemeral `state.overrides` and exactly **one** transaction commits on drop (`app.js:329`).
Anyone porting `ProjectStore` without that override-during-gesture discipline gets a janky
editor. MV should take the *discipline* (one gesture = one transaction), not the O(project) diff.

---

## 3. sldeditor — detailed findings

**Scale (measured):** 121 TS/TSX files, 26 332 lines. React 19 + zustand. 23 test files.

### 3.1 CRITICAL TEST — is connectivity geometry-dependent?

**Answer: NO for the model and the compiler. YES for exactly one editing affordance.**

*Model (clean).* `WireEnd = TerminalRef | BusId | JunctionId` where
`TerminalRef = "${ElementId}.${PinName}"` (`model/types.ts:11-19`). Endpoints are **symbolic
ids**, disambiguated by the presence of a `.`, never by coordinates. `Wire.path?` is documented
as an *optional manual route*; `Wire.label`/`Wire.color` are documented as "Pure decoration —
has no effect on routing or connectivity". `Bus` is a first-class hyperedge node; `Junction` is
a first-class point node; both carry `layout?` that is *optional* ("If absent, auto-layout
computes geometry"). Geometry is genuinely subordinate.

*Compiler (clean).* `compile.ts:352-363` builds nodes by `UnionFind` over
`w.ends[0]`/`w.ends[1]` only, then assigns a `deterministicNodeId(members)` hashed from sorted
endpoints so `routes[nodeId]` overrides survive reload. No coordinate participates.
`auto-layout.ts` stage 5 resolves electrical nodes via union-find **to drive placement** —
layout consumes connectivity, never the reverse. Correct direction.

*Move (clean, and notably well-reasoned).* `store/group-move.ts` `translateManualWirePaths`
translates a manual `w.path` when both endpoint owners moved by an identical delta, and **never
touches `w.ends`**. Its header explains why the fix must live in the drag commit rather than the
compiler. MV law #2 ("moving a symbol may change routing, never topology") is satisfied by
construction.

*The exception (REJECT — S17).* `canvas/drop-on-bus.ts` `dropElement`: dropping a palette item
within `PROXIMITY_PX = 30` of a bus computes `nearestBus` by Euclidean distance and **silently
creates a `Wire`** `{ends: [busId, "${newId}.${tapPin}"]}` in the same dispatch as the
placement. Geometric proximity manufactures an electrical connection.

Mitigating detail, stated for fairness: it materialises an **explicit** `Wire` record, so the
compiler is never asked to infer anything, and the act is one undo entry. It is an auto-tap
*authoring* affordance, not a geometric connectivity *model*.

It is still **REJECT for MV**: under law #3 a silent 30-px "similar XY ⇒ same net" default is
exactly the prohibited behaviour, and in MV it would fabricate a bay-to-busbar connection that
then flows into short-circuit and protection results. If MV ever wants the convenience, it must
be an explicitly confirmed, visibly previewed domain operation — never a side effect of a drop.

**Separation demanded by the task, stated explicitly:** the sldeditor **UX layer** (S16 — tools,
handles, busbar as a first-class draggable object, manual waypoint editing, marquee, group move,
keyboard shortcuts, read-only viewer) is adoptable in clean-room form. The
**connectivity-creating drop affordance** (S17) is not. They are separable: S17 lives in one
311-line file that nothing in the compiler depends on.

### 3.2 What sldeditor is genuinely strong at

- **`auto-layout.ts` (2120 LOC)** — the most domain-aware artifact in any donor here: bus tier
  assignment via BFS from source-tapped buses, transformer "vertical linkers" stepping a level,
  bus ties as "horizontal linkers" holding a level, bottom-up bus-span propagation, tap-slot
  allocation, overlap sweeps with snapshot rollback, all snapped to a 10 px grid. Real SLD
  thinking, not generic graph layout. **But MV already ships its own equivalent**
  (`v3/layout/{bands,columns,sheetRows,declutter,measure,route}.ts` + `engine/sld-layout`),
  tuned to MV's GPZ/bay/LOD canon. Adopting it would re-decide a solved problem.
  **STUDY_ONLY** — read before the next MV layout change, particularly the
  bus-tie/level-preservation rule and the rollback-guarded repack.
- **`auto-route.ts` (111 LOC)** is by contrast trivial: L-shapes, bus-axis projection, **no
  obstacle avoidance**. Strictly weaker than VoltWeave's router. For S9, VoltWeave wins.
- **Type-level documentation** is unusually disciplined (e.g. `SymbolStandard`: "a variant may
  not declare its own terminals … Flipping the standard on a finished drawing must never move or
  re-route anything"). Worth reading as a model for how MV documents SLD contracts.
- **Undo** is whole-diagram snapshot per `dispatch` (simpler than VoltWeave's sparse patches,
  heavier in memory) with the same one-gesture-one-entry discipline.

---

## 4. elkjs — assessed strictly as infrastructure

**Blocking finding, stated plainly: the layout algorithms are NOT in this repository at this SHA.**

Measured: `src/` contains **4 Java files** (`ElkJs.java`, `NodeJsModuleLinker.java`, 2 `.gwt.xml`)
plus `src/java-additional/{JsonAdapter.xtend, SVGImage.java}` and **3 JS files** (`elk-api.js`,
`main-api.js`, `main-node.js`). `lib/` **does not exist** in the clone (build output;
`package.json` `files: ["lib"]`). `build.gradle:70-81` sources the algorithms from an external
`${elkRepo}` checkout of the Eclipse ELK Java repo (`org.eclipse.elk.alg.layered/src` etc.),
transpiled through GWT at build time.

**Therefore I did not read `layered`, port-constraint handling, or crossing minimisation, and I
will not report on their internals.** What is verifiable from what is present:

- **Worker support: yes, first-class.** `elk-api.js` requires `workerUrl` *or* `workerFactory`
  and throws without one; wraps the worker in a `PromisedWorker` dispatching
  `{cmd: 'layout'|'algorithms'|'options'|'categories'}`.
- **Ports / hierarchy: yes, in the type contract.** `typings/elk-api.d.ts`: `ElkNode` carries
  `children?: ElkNode[]` (hierarchy), `ports?: ElkPort[]`, `edges?: ElkExtendedEdge[]`;
  `LayoutOptions` is an open `[key: string]: string` map.
- **Determinism: NOT verified, and cannot be verified from this repo.** ELK's layered
  crossing-minimisation is documented upstream as seed-controlled (`elk.randomSeed`);
  `grep -rn "randomSeed\|RANDOM_SEED"` across this repo returns **zero hits**, because the option
  lives in the ELK core artifact that is not here. MV requires byte-identical output for
  identical input (law #5, SHA-256 stability). Adopting a layout engine whose determinism could
  not be verified from source, and whose behaviour is governed by a stringly-typed option map
  resolved at build time, is not acceptable for a determinism-gated pipeline.
- **Relayout stability after a local edit** — also unverifiable here. ELK layered is a global
  batch algorithm with no incremental mode; a one-symbol edit generically re-runs the whole
  layout and may reorder layers. That is the opposite of what a CAD editor needs, and what MV's
  own `declutter`/`sheetRows` pipeline is already shaped around.

**Decision: REJECT (S21).** Grounds in order: (a) determinism unverifiable from source at this
SHA and structurally seed-dependent upstream; (b) EPL-2.0/GPL-3.0 copyleft obligation (§L) added
to the frontend for a capability MV already has; (c) generic layered layout does not model
busbars, bays, or LOD sheets — sldeditor's `auto-layout.ts` is a better *reference* and MV's own
`v3/layout` a better *implementation*; (d) ~1.5 MB of GWT-transpiled JS in the bundle.

---

## 5. xyflow — assessed strictly as infrastructure

Read: `packages/system/src/` (45 TS files) — `xyhandle/{XYHandle.ts,utils.ts,types.ts}`,
`xydrag`, `xypanzoom`, `xyminimap`, `xyresizer`, `utils/{connections,graph,edges}.ts`,
`types/{edges,handles,nodes}.ts`; `packages/react/src` (128 files).

Its edge model *is* symbolic (`{source, target, sourceHandle, targetHandle}`), and
`getClosestHandle` (`xyhandle/utils.ts:28-59`) snaps the pointer to the nearest handle within
`connectionRadius` — a legitimate gesture-resolution affordance identical in kind to sldeditor's
`hitTerminal`. So xyflow is not architecturally disqualified.

**It is nonetheless REJECT (S20) — the popular library this audit was expected to be willing to
reject.** Grounds:

1. **MV already has every piece.** Measured equivalents: `v3/canvas/camera.ts` (pan/zoom),
   `hitAreas.ts` (hit testing), `minimap.ts` + `SldMinimapPanel.tsx`, `layers.ts`,
   `toolbarLayout.ts`, `chromeLayout.ts`, plus `v2/{viewport,lod,renderer,command}` — inside
   ~183 k LOC of SLD already under determinism CI.
2. **Wrong rendering substrate for CAD.** React Flow positions one absolutely-positioned DOM
   node per graph node under a CSS transform. MV draws an SVG CAD sheet with print geometry,
   grid/snap, clearance rules, label legibility and LOD. Migrating trades a CAD surface for a
   whiteboard surface.
3. **No CAD primitives at all**: no orthogonal routing with obstacles, no manual waypoints, no
   sheet/frame/title-block, no LOD policy, no busbar-as-hyperedge.
4. **Determinism risk**: React Flow's node measurement is DOM-driven (ResizeObserver), so
   geometry depends on fonts and layout timing — hostile to MV's SHA-256-stable requirement.

Residual value: **STUDY_ONLY** at most, for `xyhandle`'s connection-radius UX and `xydrag`'s
gesture lifecycle — both concepts MV's S16 editor will need. Do not add the dependency.

---

## 6. Adversarial review of my own recommendations

Required by the brief: for everything proposed for adoption, what would make it a mistake.

**S3 (persisted placement/route store) — the one I am most confident about, so the hardest case.**
It becomes a mistake the moment the placement store is allowed to answer any question about
*electricity*. Failure modes to guard, by likelihood:
- **Silent promotion to truth.** A future "if a placement exists for bay X, use its x/y to decide
  sheet membership / bay ordering / island grouping" is the ENM-primacy loss, arriving disguised
  as a rendering optimisation. Mitigation: the store must be physically unreachable from
  `backend/src/enm/**` and from solver input assembly; enforce with a guard script in the same
  class as `overlay_no_physics_guard.py`.
- **Stale placements outliving their referents.** VoltWeave solves the mirror problem by
  *deleting connections*; MV must solve it by *dropping placement rows*, which means the
  placement store needs its own reconciliation pass on every ENM revision. If that pass is not
  written, MV acquires a second store that silently disagrees with ENM — a shadow model, i.e. a
  law #1 and Rule 3 violation, worse than today's gap.
- **Determinism regression.** `buildSceneV3` is currently a pure function of ENM + LOD, and
  `sld-determinism.yml` gates on that. Adding an optional input adds a second dimension to every
  golden hash. If fixtures are not extended to cover *both* empty-store and populated-store
  cases, the CI gate silently weakens.
- **Honest cost statement.** This is the "large SLD impact / high risk" row in §1. It is P0
  because it is the measured gap, not because it is cheap.
- **Strongest argument against doing it at all:** MV's fully-derived scene is a genuine
  architectural asset — it is *why* MV can relayout at any LOD and satisfy law #4 trivially.
  Persisted placement is the single change most likely to erode that. If the engineering need
  ("I moved this symbol and it snapped back") can be met by improving automatic layout instead,
  that is strictly safer. This should be an explicit product decision, not an agent's call.

**S4 (junction materialisation).** A mistake if `branch_point` `ConnectionNode`s can be created
from the canvas without passing the same validation as any other ENM operation — the gesture must
be a thin caller of an existing domain operation, never a second write path. Also a mistake if
VoltWeave's `splitConnection` is copied literally: it picks the cut segment by nearest-point-on-
polyline (`model.js:95-99`), i.e. **geometry choosing where topology splits**. For MV the tap
location must be an explicit electrical position (e.g. `position_km` on the segment, which
`CableJoint` already models), with geometry only *proposing* a default.

**S9 (orthogonal router).** A mistake if ported as a *replacement* rather than a *fallback*. MV's
`v3/layout/route.ts` is integrated with bands/columns/clearances; dropping an A* router in front
of it would fight the layout pipeline. The narrow, defensible port is: obstacle-aware A* **as the
escape hatch when the existing router cannot honour a manual waypoint set**, plus VoltWeave's
honesty property — `{failed: true}` surfaced to the user rather than a silently wrong polyline
(`routing.js:43`). Verify the A* is deterministic under MV's fixtures before trusting it: I
reasoned that it is (fixed `dirs` order, snapped grid, deterministic heap insertion) but did
**not** execute it against MV data.

**S16 (editor UX, clean-room).** A mistake if it grows into a second SLD stack beside `v3`.
`ui/sld-editor/**` is 56 LOC today; the temptation to build standalone is real and would duplicate
`v3/canvas`. It must be a tool layer *on* `SldCanvasV3`, not beside it. Also: every new
interaction test must exercise the native path, per the repo's own precedent about synthetic
`dispatchEvent` masking a dead click.

**S22 (invariant tests).** The weakest possible outcome is copying test *names* and writing
assertions that pass trivially against MV's current derived scene (where moving a symbol is
impossible, so "moving geometry does not change connectivity" is vacuously true). These tests only
earn their keep **after** S3 lands, when moving a symbol becomes possible. Written before S3 they
are exactly the "declaration without a test" failure the repo's KLASA-NIE-INSTANCJA rule warns
about — a green check that guards nothing.

**Cross-cutting:** everything marked PORT is a *shape* or a *mechanism*, not a module. No donor
file should land in MV verbatim; VoltWeave is dependency-free ESM JS with no types, sldeditor is
React-19/zustand-coupled. Both are MIT, so copying is permitted — the objection is architectural,
not legal.

---

## 7. What I could not verify

1. **elkjs layout internals, determinism, port-constraint behaviour, relayout stability and
   performance** — the algorithm source is not in the repository at the reviewed SHA (§4).
   Assessing them would require cloning `eclipse/elk` and reading transpiled Java.
2. **Whether any donor is deterministic under MV's own fixtures** — I read code and reasoned about
   determinism; I executed nothing against MV data. No donor test was run.
3. **Provenance of `sldeditor/src/element-library/*.json`** — no in-repo reference to
   QElectroTech, but originality cannot be established from source (§L).
4. **VoltWeave's license robustness** — `LICENSE` says MIT; `package.json` is `"private": true`
   with no `license` field and there are no SPDX headers. Single-source assertion (§0).
5. **MV-side effort estimates** — I measured MV's structure (`enm/models.py:726-800`,
   `v3/scene/buildScene.ts`, `v3/layout/*`, `v3/canvas/*`, `ui/sld-editor/**` = 56 LOC) but did not
   scope implementation cost for any row.
