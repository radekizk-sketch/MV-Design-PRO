> **MATERIAŁ SUROWY SUBAGENTA — NIE JEST DECYZJĄ.**
> Raport agenta PROJECTION z audytu donorów 2026-09-07. Zachowany w repo jako dowód i ślad
> rozumowania (§14/§15 mandatu). **Twierdzenia w tym pliku NIE są zweryfikowane w całości.**
> Wiążące są: `OPEN_SOURCE_DONOR_AUDIT.md` (ustalenia zweryfikowane),
> `DONOR_DECISION_MATRIX.md` (decyzje) i `DONOR_AUDIT_CHECKPOINT.md` (pomiary własne).
> Gdzie ten plik jest sprzeczny z tamtymi — **tamte wygrywają**; sprzeczności wykryte
> przy weryfikacji są nazwane w `OPEN_SOURCE_DONOR_AUDIT.md` §7.

# REPORT_PROJECTION — donor audit: PowSyBl Diagram (SLD + NAD)

Agent: AGENT PROJECTION. Baseline: `MV_BASELINE.md` (MV HEAD 5adc958d, CV-4.3 K6).
Audit date: 2026-09-07. Method: read Java source at the cloned SHA. README/docs claims are **not**
used as evidence anywhere below; every capability statement names the file and symbol I read.

---

## 0. Donor provenance and licence — VERIFIED AT COMMIT

| Item | Value |
|---|---|
| Primary donor | `https://github.com/powsybl/powsybl-diagram` |
| Clone path | `.../scratchpad/donor/src/powsybl-diagram` |
| **Commit SHA reviewed** | **`952186b5b34d1e4e472a04fb663b3654b54e3022`** (2026-09-02, "Filter HVDC converter station and PST arrow by voltage-level classes (#828)") |
| Secondary donor (identity binding only) | `https://github.com/powsybl/powsybl-core`, **SHA `cd6f609d5ea9c900a7a5271a2773293c5710f2ae`**, sparse checkout of `iidm/iidm-api` + `iidm/iidm-extensions` only |
| Language / toolchain | Java 21 (`pom.xml:65 <java.version>21</java.version>`), Maven, depends on `powsybl-core 7.3.0` (`pom.xml:76`) |
| Size (main sources) | 39 977 LOC total; SLD core 20 229 LOC; NAD 8 227 LOC; 374 main + 233 test Java files |
| Test corpus | 279 reference `.svg` + 97 reference `.json` under `src/test/resources` |

### Licence verification (done, not assumed)

- Repo root `LICENSE` (373 lines) is verbatim **Mozilla Public License Version 2.0**. Verified by reading
  the file, not by trusting a badge.
- `pom.xml` contains **no** `<licenses>` block — the root `LICENSE` file is the only repo-level statement.
- Per-file: 607 `.java` files total; **600 carry the MPL-2.0 notice header**; **253 additionally carry
  `SPDX-License-Identifier: MPL-2.0`**; 7 files carry no header (e.g.
  `diagram-util/.../PermanentLimitPercentageMax.java`, `single-line-diagram-core/.../builders/ZoneRawBuilder.java`)
  and fall under the repo `LICENSE`.
- `powsybl-core` at `cd6f609d`: `LICENSE.txt` is likewise **MPL-2.0**; `iidm-api/.../Identifiable.java`
  carries `SPDX-License-Identifier: MPL-2.0`.

**License verified at commit `952186b5b34d1e4e472a04fb663b3654b54e3022` (powsybl-diagram) and
`cd6f609d5ea9c900a7a5271a2773293c5710f2ae` (powsybl-core): MPL-2.0.**

### Obligations registered (not legal advice — obligation register + risk)

MPL-2.0 is **file-level** copyleft ("weak copyleft"), not project-level.

| Scenario | Obligation created | Risk to MV |
|---|---|---|
| **Only patterns studied** (read the Java, write original Python/TS from the understanding, no code text carried over) | **None under MPL-2.0.** MPL §1.4/§3 attach to "Covered Software" = the source form the licensor released and modifications of it. An independently written file is not a modification of a Covered file. | Nil, provided no verbatim/derivative text (including translated-line-by-line ports) lands in MV files. |
| **Code copied or mechanically ported file-by-file** into MV | The MV file becomes Covered Software: (a) must retain the MPL notice, (b) that file's **source must stay available under MPL-2.0** to anyone receiving the MV binary, (c) MV's other files stay under MV's own licence (MPL is per-file). | Moderate and *permanent* per touched file. MV is a commercial engineering product; a per-file MPL obligation inside `frontend/src/ui/sld/**` creates a disclosure duty on those files and a licence-compatibility question at distribution. |
| **Linked as a Maven artifact** (`powsybl-single-line-diagram-core` jar used unmodified) | Notice + source-availability for the unmodified artifact only; MV code that merely calls it is not Covered. | Low licence risk, but see subsystem **S10** — the *technical* risk is decisive, not the licence. |

Practical consequence for the decisions below: every **PORT** decision I recommend is deliberately a
**clean-room re-implementation from the described algorithm** (spec-level), *not* a line-by-line
translation, precisely so that no MV file acquires the per-file obligation. That distinction must be
enforced in review, because a "port" that is really a transliteration carries the obligation just the
same. Where the value is genuinely in the *code text* rather than the idea (there is one such case,
S9), I mark it **REWRITE_CLEAN_ROOM** with an explicit no-look implementation rule.

### Technology mismatch — stated plainly

PowSyBl Diagram is **Java 21 + Maven + JGraphT + W3C DOM SVG emission**, sitting on the
**IIDM** object model from `powsybl-core`. MV is **Python 3.11 / FastAPI** on the backend and
**TypeScript 5 / React 18** for the SLD (`frontend/src/ui/sld/v3/**`, ~183k LOC across v2+v3). There
is no shared runtime, no shared model, and no shared serialization. This is not a "wrap it in a
service" situation — see S10 for the cost breakdown and why I reject INTEGRATE outright.

---

## 1. Summary table — one row per subsystem

| # | Subsystem | Decision | Priority | Target MV module |
|---|---|---|---|---|
| S1 | Equipment identity ↔ SVG identity binding | **STUDY_ONLY** (MV already conforms; adopt 2 named invariants) | P1 | `sld/v3/scene/buildScene.ts`, `sld/v3/core/layoutResult.ts` |
| S2 | SLD generation pipeline (cell/block decomposition) | **STUDY_ONLY** | P2 | `sld/v3/layout/**` |
| S3 | Placement *hints* as domain-model extensions (feeder order/direction, busbar index) | **PORT** (concept) | **P0** | `backend/src/enm/models.py` (Bay), `sld/v3/layout/columns.ts` |
| S4 | Persisted placement + manual routing round-trip (side-car keyed by domain id) | **PORT** | **P0** | new `backend/src/enm/rozmieszczenie.py` + `sld/v3/layout/route.ts` |
| S5 | Depth-limited network neighbourhood (partial diagram / focus mode) | **PORT** | **P0** | `backend/src/enm/topology_ops.py` |
| S6 | Style providers / result overlays (class-names-only contract, composition) | **PORT** (contract), **REJECT** (threshold evaluation) | P1 | `frontend/src/ui/sld-overlay/OverlayEngine.ts` |
| S7 | Layout separation from domain model (three storage strategies) | **STUDY_ONLY** | **P0** (as a decision input) | ADR-024 addendum; `docs/adr/` |
| S8 | Determinism engineering (integer grid, pinned Locale, total orders) | **PORT** (patterns) + **REJECT** (4 named anti-patterns) | **P0** | `sld/v3/layout/**`, `sld/v2/core/hashes.ts` |
| S9 | Orthogonal routing: A* on occupancy grid with bend penalty | **REWRITE_CLEAN_ROOM** | P1 | `sld/v3/layout/route.ts` |
| S10 | The library itself (Java artifact / service) | **REJECT** | — | — |

---

## 2. Subsystem detail

---

### S1 — Equipment identity ↔ SVG identity binding

**Donor / commit / licence:** powsybl-diagram @ `952186b5`, MPL-2.0.

**Files and symbols actually read**
- `single-line-diagram/single-line-diagram-core/src/main/java/com/powsybl/sld/util/IdUtil.java` —
  `escapeId`, `unescapeId`, `escape`, `unescape`, `escapeClassName`, `ID_PREFIX = "id"`.
- `.../sld/svg/DefaultSVGWriter.java` — lines 224, 261–265, 391–398, 447–452, 507, 530–533, 873–874,
  927–928, 957, 988–989, 1008, 1046–1047; `setMetadata(...)`, `getUnescapedId(Node)`.
- `.../sld/svg/GraphMetadata.java` — `NodeMetadata` (fields `unescapedId`, `id`, `vId`, `nextVId`,
  `componentType`, `open`, `direction`, `equipmentId`, `labels`), `WireMetadata`, `LineMetadata`,
  `FeederInfoMetadata`, `BusInfoMetadata`, `parseJson`, `writeJson`.
- `.../sld/model/nodes/EquipmentNode.java` — `equipmentId` field + `getEquipmentId()`.
- `.../sld/model/graphs/NodeFactory.java` — all `create*` methods; `BUS_CONNECTION_ID_PREFIX = "BUSCO_"`,
  `CONNECTIVITY_ID_PREFIX = "INTERNAL_"`, `createConnectivityNode(graph,id)` prefixing with the
  voltage-level id.
- `network-area-diagram/.../nad/model/Identifiable.java`, `AbstractIdentifiable.java` —
  `getSvgId()` / `getEquipmentId()` / `getName()`.
- `network-area-diagram/.../nad/build/iidm/IdProvider.java`, `IntIdProvider.java`.
- `network-area-diagram/.../nad/svg/metadata/NodeMetadata.java`, `AbstractMetadataItem` (via ctor
  `super(svgId, equipmentId)`).
- `powsybl-core@cd6f609d` `iidm/iidm-api/.../network/Identifiable.java` — `getId()`, `getAliases()`,
  `getAliasFromType`, `extends Extendable<I>`.

**Capability.** PowSyBl runs **two different and incompatible identity strategies**, which is the
single most instructive thing in this donor:

1. **SLD (the good one).** The SVG element id is a **pure, total, invertible function of the domain
   id**: `escapeId(x) = "id" + escape(prefixId + x)`, where `escape` maps every non-alphanumeric char
   `c` to `_<int c>_`. `unescapeId` is its exact inverse. No counter, no UUID, no hash, no
   layout input. Therefore the SVG id of a given equipment is **identical across every relayout, every
   layout algorithm, and every parameter set** — only `prefixId` (an explicit namespace for embedding
   several diagrams in one page) can shift it. Diagram-internal nodes that have no equipment behind
   them get ids that are still pure functions of domain data: `"BUSCO_" + <adjacent node id>`,
   `"INTERNAL_" + <voltageLevelId> + "_" + <iidm node number>`.
   Alongside that, `GraphMetadata.NodeMetadata` carries `equipmentId` **explicitly as its own field**,
   so a consumer never has to parse the SVG id to recover the network object.
2. **NAD (the bad one).** `IntIdProvider.createSvgId(String idNetworkElement)` ignores its argument
   and returns `String.valueOf(count++)`. The `IdProvider` javadoc *specifies* this: "calling twice on
   the same object should result in two different ids" and "using the object fields to create an id
   should be limited to debug mode". The binding back to the network survives only because
   `AbstractIdentifiable` carries `(svgId, equipmentId)` as two separate fields and the metadata JSON
   emits both.

The reusable contract from (2), independent of how svgId is generated, is the **two-id model**:
projection identity and domain identity are distinct, both are emitted, and *everything that must
survive a relayout keys on the domain id*. PowSyBl proves this by keying its persisted-position store
on `equipmentId`, never on `svgId` (see S4).

**MV equivalent.** MV already does the SLD-style thing. `frontend/src/ui/sld/v3/scene/buildScene.ts`
builds scene refs as pure template functions of ENM refs — `${bayRef}#descent`,
`${sectionId}#bus-primary`, `${transformerRef}#hv-connector`, `${src.id}#grid-source-drop` —
and the file's own comment at line 2783-2784 states the `#`-suffix convention explicitly as a
contract. `frontend/src/ui/sld-overlay/overlayTypes.ts:250` and `rawResultOverlayStore.ts:114`
key overlays on `elementRef` (a domain ref), not on a scene id.

**Gap.** Three, all narrow:
1. MV's convention lives in comments and in `compose/unikalnyTestId.ts` usage, not in a pinned
   invariant with a test. PowSyBl's is a **named, invertible, unit-testable pure function**
   (`unescapeId(escapeId(x)) == x`). MV has no `parseSceneRef(ref) -> {domainRef, role}` inverse and
   no test asserting round-trip.
2. MV has no equivalent of `prefixId`: two SLD scenes rendered into one DOM (e.g. an A/B comparison
   view, which MV has in `ui/comparison` and `ui/power-flow-comparison`) will collide on element ids.
3. MV has no equivalent of `NodeMetadata.nextVId` — the id of the *container on the other side* of a
   feeder, emitted per node, which is what makes "click this feeder → open the neighbouring diagram"
   a data lookup rather than a graph re-walk. This is directly the hook MV's wanted focus/trace mode
   needs (see S5).

**Benefit.** Small but load-bearing: it converts MV's identity convention from a discipline into an
enforced invariant, and unblocks multi-diagram-per-page and one-click neighbourhood navigation.

**Decision: STUDY_ONLY.** MV's mechanism is already correct and already richer (composite
`owner#role` refs). Nothing to port. What MV should adopt is two *invariants*, written as code + tests
in MV's own idiom:
- `INV-SLD-ID-1`: scene ref is a pure function of ENM refs and role; a `parseSceneRef` inverse exists
  and round-trips (property test over the fixture corpus).
- `INV-SLD-ID-2`: every scene element carries `domainRef` as a first-class field, never only inside a
  composed string.
Plus one small feature: an optional scene-level `refPrefix` for multi-diagram pages.

**Target MV module.** `frontend/src/ui/sld/v3/scene/buildScene.ts`,
`frontend/src/ui/sld/v3/core/layoutResult.ts`, `frontend/src/ui/sld/v3/compose/unikalnyTestId.ts`.

**ENM impact.** None. **SLD impact.** Additive: one exported `parseSceneRef`, one optional prefix
parameter threaded through `buildScene`.

**Migration risk.** Low. The prefix parameter must default to `""` or every existing scene hash
changes — that would break `sld/v2/core/hashes.ts` and the SLD determinism CI.

**Test strategy.** Property test `parseSceneRef(buildRef(a,b)) === {a,b}` over all ref roles found by
grep in `buildScene.ts`; a scene-hash regression test asserting the default prefix leaves every
existing golden hash byte-identical.

**What would make this a mistake.** If MV adopts PowSyBl's *escaping* scheme literally
(`_<charcode>_`), it gets unreadable ids, a second encoding to maintain, and no benefit — MV's ENM
refs are already DOM-safe. The value is the *invertibility invariant*, not the encoding. Also: if MV
introduces `refPrefix` without pinning the default, it silently invalidates every golden SVG hash —
a determinism regression dressed as a feature.

---

### S2 — SLD generation pipeline (graph building, cell/block decomposition, positioning)

**Donor / commit / licence:** powsybl-diagram @ `952186b5`, MPL-2.0.

**Files and symbols actually read**
- `.../sld/SingleLineDiagram.java` — `draw*`, `preDraw(Graph, SldParameters, Network)` (the whole
  pipeline in one switch: `VoltageLevelGraph → voltageLevelLayoutFactory.create(g).run(params)`,
  `SubstationGraph → substationLayoutFactory`, `ZoneGraph → zoneLayoutFactory`), then
  `DefaultSVGWriter.write(...)` → `GraphMetadata.writeJson(...)`.
- `.../sld/builders/NetworkGraphBuilder.java` (40 KB) — `buildVoltageLevelGraph`, `buildSubstationGraph`
  (VLs sorted by `Comparator.comparing(VoltageLevel::getNominalV).reversed()`), `buildGraph`,
  `addBranchEdges`, `addSnakeEdges`, `getTeePointFeederNodes`, inner classes
  `AbstractGraphBuilder extends DefaultTopologyVisitor`, `NodeBreakerGraphBuilder` (`getFeeder(Terminal)`,
  `addTerminalNode`, `visitBusbarSection`, `addTeePoint`), `BusBreakerGraphBuilder`
  (`connectToBus`, `addTerminalNode` with `order++` and `order % 2` direction), `buildBusBreakerGraph`.
- `.../sld/layout/Layout.java` (the whole contract is `void run(LayoutParameters)`),
  `PositionVoltageLevelLayout.java` (`run` = refine → detect cells → organize blocks →
  `calculateMaxCellHeight` → `calculateBusNodeCoord` → `calculateCellCoord` → `addPaddingToCoord` →
  `manageSnakeLines` → `adaptPaddingToSnakeLines`).
- `.../sld/layout/ImplicitCellDetector.java` — `detectCells`, `detectCell(graph, typeStops,
  exclusionTypes, allocatedNodes)`, `createExternAndShuntCells`, `isPureExternCell`,
  `detectAndTypeShunt`; the intern/extern/shunt classification rule is stated in the class javadoc
  (intern = connects BUSes without reaching a FEEDER).
- `.../sld/layout/CellBlockDecomposer.java` — `determineComplexCell`, `createPrimaryBlocks`,
  `elaborateLegPrimaryBlock`, `elaborateFeederPrimaryBlock`, `rElaborateBodyPrimaryBlocks`,
  `mergeBlocks` (loop `searchParallelMerge` / `searchSerialMerge` until one block remains,
  `UndefinedBlock` fallback).
- `.../sld/layout/BlockOrganizer.java` — `organize`, `checkBlocks`,
  `checkLegPrimaryBlockConsistency`, `checkFeederPrimaryBlockConsistency`, `determineStackableBlocks`.
- `.../sld/layout/position/AbstractPositionFinder.java` — `buildLayout` (indexBusPosition →
  `VerticalBusSet.createVerticalBusSets` → `organizeBusSets` → `Subsection.createSubsections` →
  `organizeDirections`), `mergeHblWithNoLink`.
- `.../sld/layout/position/clustering/PositionByClustering.java` (class javadoc states the algorithm),
  `Link.java` (`LinkCategory{COMMON_BUSES, FLAT_CELLS, CROSSOVER, SHUNT}`, `assessLink`, `compareTo`),
  `Links.java` (`TreeSet<Link> linkSet`, `getStrongestLink() = linkSet.last()`, `mergeLink`).
- `.../sld/model/coordinate/Position.java` — integer `(h, v, hSpan, vSpan)` + `Orientation`.
- `.../sld/model/nodes/Node.java`, `AbstractNode.java` (`private final Point position = new Point(-1,-1)`).
- Directory census: `layout/` 42 files / 3 985 LOC, `layout/position*` 2 720 LOC, `model/blocks` 16 files,
  `model/cells` 9 files.

**Capability.** A 7-stage deterministic pipeline that turns a node-breaker or bus-breaker electrical
graph into a busbar-and-feeder single-line drawing without any manual placement:
`NetworkGraphBuilder` (electrical → diagram graph) → `GraphRefiner` → `ImplicitCellDetector`
(partition into ExternCell / InternCell / ShuntCell / ArchCell) → `CellBlockDecomposer` (each cell →
a tree of Leg/Body/Feeder primary blocks merged into Serial/Parallel composites) →
`PositionFinder.buildLayout` (busbar vertical positions + cell horizontal order, by agglomerative
clustering on a 4-category link strength) → `BlockPositionner` (integer `Position` grid) →
`CalculateCoordCellVisitor`/`CalculateCoordBlockVisitor` (integer grid × `cellWidth/2` and
`verticalSpaceBus` → pixels) → snake lines between voltage levels.

The design property worth naming: **all combinatorial decisions happen in integers** (`Position` is
`int h, v, hSpan, vSpan`), and floating point appears only in the final affine map to pixels.

**MV equivalent.** `frontend/src/ui/sld/v3/scene/buildScene.ts` (8 416 LOC) plus
`v3/layout/{columns,bands,segments,measure,sheetRows,clearances,declutter,apparatusStack,labels,route}.ts`
(12 788 LOC total). MV's decomposition is domain-shaped rather than topology-shaped: MV already knows
what a `Bay` is (with a full runtime/protection/interlock/SPZ/alarm model in ENM), what a `GPZSection`
is, what an `NnSection` is. PowSyBl has to *infer* "this cluster of switches is one feeder bay" via
`ImplicitCellDetector`; MV is handed that structure by ENM.

**Gap.** Effectively none that matters. MV's advantage here is real: PowSyBl's cell detection exists
because IIDM does not model bays, so it reverse-engineers them from graph traversal, and when the
pattern is unrecognisable it degrades to `UndefinedBlock` and logs an error
(`CellBlockDecomposer.mergeBlocks`). MV never has that failure mode. The one genuine MV-side lack is
that MV's layout does not have a *named, tested* claim equivalent to `checkLegPrimaryBlockConsistency`
/ `checkFeederPrimaryBlockConsistency` — assertions that a decomposed structure is well-formed before
coordinates are computed, throwing rather than drawing something wrong.

**Benefit.** Low. Adopting the pipeline would be a regression.

**Decision: STUDY_ONLY.** Two things worth lifting as *ideas*, not code: (a) the integer-grid-first
discipline (covered under S8 where it is the P0 item), and (b) pre-coordinate structural assertions
that fail loudly.

**Target MV module.** `frontend/src/ui/sld/v3/layout/**` (assertions only).

**ENM impact.** None. **SLD impact.** None beyond added assertions.

**Migration risk.** Nil if scoped to assertions. **High if not scoped**: adopting cell/block
decomposition would mean *discarding* MV's Bay-aware layout in favour of an inference algorithm built
for a model that lacks bays. That is a strict downgrade.

**Test strategy.** For the assertions only: negative tests that a malformed bay composition raises
before any coordinate is produced.

**What would make this a mistake.** Anyone reading "PowSyBl is the industrial reference" and
concluding MV should restructure `v3/layout` around cells and blocks. It should not. PowSyBl's cell
detector is a workaround for a modelling gap MV does not have. Importing it would add an inference
layer, an `UndefinedBlock` failure mode, and a second vocabulary (cell/block) competing with MV's
(Bay/Section) — the "two paths for the same physics" architectural debt CLAUDE.md ZASADA NR 3
explicitly forbids.

---

### S3 — Placement *hints* stored as domain-model extensions (feeder order, direction, busbar index)

**Donor / commit / licence:** powsybl-diagram @ `952186b5` + powsybl-core @ `cd6f609d`, both MPL-2.0.

**Files and symbols actually read**
- `powsybl-core@cd6f609d` `iidm/iidm-extensions/.../network/extensions/ConnectablePosition.java` —
  `NAME = "position"`, `enum Direction{TOP,BOTTOM,UNDEFINED}`, nested `interface Feeder` with
  `getName/getOrder/removeOrder/getDirection`, `getFeeder()/getFeeder1()/getFeeder2()/getFeeder3()`,
  `static void check(...)`. **The class javadoc is the decisive text**: "This class gives some
  information **for visualization tools** … This gives visualization tools **suggestions** for
  displaying the equipments within a voltage level."
- `powsybl-core@cd6f609d` `.../extensions/BusbarSectionPosition.java` (busbarIndex / sectionIndex),
  present in the same extensions package listing.
- `powsybl-core@cd6f609d` `iidm/iidm-api/.../network/Identifiable.java` — `extends Extendable<I>`,
  which is the hook that makes extensions possible at all.
- `.../sld/builders/NetworkGraphBuilder.java` `NodeBreakerGraphBuilder.getFeeder(Terminal)`,
  `addTerminalNode` (reads `feeder.getOrder()` → `node.setOrder`, `feeder.getDirection()` →
  `node.setDirection`, defaulting `UNDEFINED → TOP`), `visitBusbarSection` (reads
  `BusbarSectionPosition` → `node.setBusBarIndexSectionIndex`).
- `.../sld/builders/NetworkGraphBuilder.java` `BusBreakerGraphBuilder.addTerminalNode` — the
  *no-hint* fallback: `node.setOrder(order++)`, `direction = order % 2 == 0 ? TOP : BOTTOM`.
- `.../sld/layout/position/predefined/PositionPredefined.java` (242 LOC) vs
  `.../position/clustering/PositionByClustering.java` (251 LOC) — the two `PositionFinder`s.
- `.../sld/layout/PositionFromExtensionVoltageLevelLayoutFactorySmartSelector.java` —
  `PRIORITY = 1000`, `isSelectable(vl)` = BUS_BREAKER **or** `hasAtLeastOneExtension(vl)` which scans
  connectables for `ConnectablePosition` / `BusbarSectionPosition`.
- `.../sld/layout/VoltageLevelLayoutFactorySmartSelector.java` — `findBest(vl)` via `ServiceLoader`,
  `.filter(isSelectable).max(comparingInt(getPriority))`.
- `.../sld/layout/SmartVoltageLevelLayoutFactory.java`.
- `.../sld/builders/VoltageLevelRawBuilder.java:83 addExtension(Node fn, Integer order, Direction dir)`
  — confirmed this sets fields on the **SLD diagram node**, not on any iidm object.

**Capability.** A three-tier fallback for feeder placement, selected automatically by priority:
1. If the network carries `ConnectablePosition` / `BusbarSectionPosition` extensions → use them
   (`PositionPredefined`): the engineer's chosen feeder **order** and **TOP/BOTTOM side**, and the
   physical busbar index/section, are honoured exactly.
2. Otherwise → compute them (`PositionByClustering`).
3. In bus-breaker topology with no hints at all → a deterministic degenerate rule (sequential order,
   alternating side).

The critical modelling decision: the hints are **ordinal and topological, never geometric**. There is
no x, no y, no rotation, no pixel anywhere in `ConnectablePosition`. And they are attached via the
generic `Extendable` mechanism, so the core `Connectable` class is untouched — the presentation
concern is bolted on, not baked in.

**MV equivalent.** ENM has `Bay` with a full runtime model, `Substation`, `GPZSection`, `NnSection`,
`Port` (15 `PortKind`s) and `ConnectionNode`. MV's SLD derives bay ordering inside
`frontend/src/ui/sld/v3/layout/columns.ts` and `sheetRows.ts` from whatever order the ENM
collections come in.

**Gap — this is a real one.** Reading `MV_BASELINE.md` and the ENM file listing
(`backend/src/enm/models.py`, `topology.py`, `topology_ops.py`), MV has **no domain-level field
expressing "this bay is the 3rd feeder from the left on section A" or "this feeder draws upward"**.
Bay order in the drawing is therefore an emergent property of collection order in the ENM document
plus `columns.ts` logic. Consequences:
- The engineer cannot express a layout intent that survives an ENM edit. Reordering or inserting a bay
  can reshuffle the whole drawing.
- Two networks that are electrically identical but were built in a different sequence draw
  differently — which is a determinism-of-*intent* problem even if the byte hash is stable per input.
- There is nowhere to put the classic SN/nN convention "incoming feeders on top, outgoing on bottom"
  as data rather than as code.

**Benefit.** High and P0. It is the smallest possible change that makes MV drawings stable under
model editing, and it is the prerequisite for S4 (a persisted-placement store needs *something*
stable to key ordering on before you reach for coordinates).

**Decision: PORT** — the concept, in MV's own idiom, clean-room (the concept is a 3-field record; no
donor code is needed or wanted).

Concretely: add to ENM `Bay` (and the equivalent for `Source`/`Transformer` terminals on a section)
an optional, additive placement-hint block:

    kolejnosc: int | None          # feeder order on the section (None = derive)
    strona: "gora" | "dol" | None  # drawing side relative to busbar (None = derive)

and on `GPZSection` / `NnSection` the busbar index/section pair if not already implied. All optional,
all `exclude_none`, so existing payloads and their canonical hashes are untouched. `columns.ts` then
becomes: honour the hint when present; fall back to the current derivation when absent.

**Target MV module.** `backend/src/enm/models.py` (`Bay`, `GPZSection`, `NnSection`),
`backend/src/enm/validator.py` (uniqueness of `kolejnosc` within a section),
`frontend/src/ui/sld/v3/layout/columns.ts` + `sheetRows.ts`.

**ENM impact.** Additive optional fields only. Canonical-hash-neutral for existing documents because
`exclude_none` drops them (`backend/src/enm/hash.py` must be re-verified on this point before merge —
this is a hard gate, not an assumption).

**SLD impact.** `columns.ts` gains a hint-first branch. Existing scenes with no hints must produce
byte-identical output.

**Migration risk.** Medium. Two specific hazards:
1. **Hash drift.** If `hash.py` serialises `None` fields, every existing ENM document's canonical hash
   changes and every golden fixture breaks. Must be proven neutral by test before merge.
2. **Predicate pairing (CLAUDE.md "KLASA, NIE INSTANCJA" §3).** The condition under which a hint is
   *written* (UI drag-to-reorder) and the condition under which it is *read* (`columns.ts`) must come
   from one source of truth. Two independently-written predicates that "agree today" is exactly the
   defect class that review flagged four times.

**Test strategy.**
- Hash neutrality: for every ENM golden fixture, canonical hash before == after the model change.
- Honour test: set `kolejnosc` on a 4-bay section in every permutation; assert the rendered column
  order equals the hint, for all 24 permutations (iloczyn cech, not one example).
- Fallback test: hints absent → scene byte-identical to today's golden.
- Cross-feature product: `kolejnosc × strona × section with mixed hinted/unhinted bays` — the
  partially-hinted case is where a naive implementation produces a nondeterministic interleaving.
- Validator: duplicate `kolejnosc` within one section is a validation error, not a silent tie-break.

**What would make this a mistake.**
- If MV puts **coordinates** in these fields. The moment `x`/`y` enters ENM, MV has geometry in the
  canonical model and canonical law #4 ("persistent identity is independent of placement") is dead.
  PowSyBl's discipline here is precisely that `ConnectablePosition` contains *no* geometry — copy the
  restraint, not just the idea.
- If the hint becomes mandatory. Then every ENM producer (wizard, import, reference networks) must
  invent an order, and MV acquires a required field with no natural source — a fabrication.
- If validation is skipped and duplicate orders silently tie-break. That reintroduces exactly the
  nondeterminism the change is meant to remove.

---

### S4 — Persisted placement and manual routing, round-tripped through a side-car keyed by domain id

**Donor / commit / licence:** powsybl-diagram @ `952186b5`, MPL-2.0.

**Files and symbols actually read**
- `network-area-diagram/.../nad/layout/FixedLayoutFactory.java` — ctors taking
  `Map<String,Point> fixedPositions` and `Map<String,TextPosition> textNodesWithFixedPosition`;
  `create()` calls `layout.setInitialNodePositions(fixedPositions)` and
  `layout.setNodesWithFixedPosition(fixedPositions.keySet())`.
- `network-area-diagram/.../nad/layout/BasicFixedLayout.java` — `nodesLayout`:
  `Point p = getInitialNodePositions().get(node.getEquipmentId()); if (p != null) node.setPosition(...)`.
  **Keyed on `getEquipmentId()`, not `getSvgId()`.**
- `network-area-diagram/.../nad/layout/LayoutFactoryUtils.java` — `create(Path metadataFile)` etc.,
  building a `FixedLayoutFactory` from `DiagramMetadata.parseJson(...)`.
- `network-area-diagram/.../nad/svg/metadata/DiagramMetadata.java:310-317` —
  `getFixedPositions()` = `nodesMetadata.stream().collect(toMap(NodeMetadata::getEquipmentId,
  NodeMetadata::getPosition))`; `getFixedTextPositions()` likewise on `TextNodeMetadata`.
- `network-area-diagram/.../nad/routing/CustomPathRouting.java` — `Map<String,List<Point>>
  customEdgePaths` / `customTextPaths`; `computeSingleBranchEdgeCoordinates` does
  `customEdgePaths.getOrDefault(edge.getEquipmentId(), List.of())`, falls through to
  `super` (`StraightEdgeRouting`) when empty, otherwise **recomputes both endpoints**
  (`computeEdgeStart(node1, customPoints.getFirst(), ...)`) and splices the stored interior points
  between them; `computeCumulatedDistances`, `computeIndexMiddlePath`.
- `network-area-diagram/.../nad/routing/EdgeRouting.java` (`void run(Graph, SvgParameters)`),
  `StraightEdgeRouting.java`, `AbstractEdgeRouting.java:74-85` (`injectionEdgesLayout`; the
  `injection.setAngle(angle)` there is on the **NAD diagram model**, not on iidm).
- `single-line-diagram/single-line-diagram-cgmes/single-line-diagram-cgmes-dl-iidm-extensions/.../
  {NodeDiagramData,DiagramPoint,NetworkDiagramData,CouplingDeviceDiagramData,InjectionDiagramData,
  LineDiagramData,VoltageLevelDiagramData,ThreeWindingsTransformerDiagramData,DiagramTerminal}.java`
  — `NodeDiagramData<T extends Identifiable<T>> extends AbstractExtension<T>`, keyed
  `Map<String /*diagramName*/, NodeDiagramDataDetails>`; `record DiagramPoint(double x, double y,
  int seq) implements Comparable<DiagramPoint>` (compares on `seq`);
  `NetworkDiagramData` holding `Map<String, Set<String>> diagramsNames` in a `TreeMap`/`TreeSet`.
- `.../single-line-diagram-cgmes-layout/.../CgmesVoltageLevelLayout.java` (a `Layout` whose `run()`
  reads coordinates instead of computing them), `AbstractCgmesLayout.java` (`setNodeCoordinates`
  switch over BUS/SWITCH/FEEDER, `setBusNodeCoordinates`, `setCouplingDeviceNodeCoordinates`,
  `setInjectionNodeCoordinates`, `setLineNodeCoordinates`, `setOrientation`,
  `shiftAndScaleNodeCoordinates`, `removeFictitiousSwitchNodes`, `checkDiagramFails`),
  `LayoutToCgmesExtensionsConverter.java` (`applyLayout`, `setNodeDiagramPoints`, `getMaxSeq`,
  `OffsetPoint`), `CgmesVoltageLevelLayoutFactorySmartSelector.java` (`PRIORITY = 500`,
  `isSelectable` = has a CGMES DL extension).

**Capability.** PowSyBl solves "the user moved a symbol; keep it moved" **twice, two different ways**,
and both are instructive:

**(a) NAD — side-car metadata round-trip, no model involvement at all.**
Render emits `diagram.svg` + `diagram_metadata.json`. The JSON's `nodes[]` carry
`{svgId, equipmentId, x, y}`. On the next render, `LayoutFactoryUtils.create(metadataFile)` reads it
back, `DiagramMetadata.getFixedPositions()` reduces it to `Map<equipmentId, Point>`, and
`FixedLayoutFactory` pins exactly those nodes while everything else — including newly added equipment
absent from the file — is laid out by the underlying algorithm. Manual edge waypoints work the same
way through `CustomPathRouting`, keyed on `edge.getEquipmentId()`.

**(b) SLD/CGMES — placement as an opt-in extension on the equipment, namespaced by diagram name.**
`NodeDiagramData<T>` etc. hang off the equipment via `AbstractExtension`, and each holds a
`Map<diagramName, details>` so one network can carry several named drawings. `CgmesVoltageLevelLayout`
is then just another `Layout` implementation — same `run(LayoutParameters)` interface as
`PositionVoltageLevelLayout` — that reads stored points instead of computing them, selected
automatically by the SmartSelector when the extension is present.

Three invariants hold across both, and they are the actual deliverable of this subsystem:
1. **The store is keyed by domain id, never by projection id.** `BasicFixedLayout` uses
   `getEquipmentId()` even though `getSvgId()` was right there. This is what makes the store survive
   NAD's unstable counter ids, and what makes it survive relayout, re-render and algorithm change.
2. **Missing entries are normal, not an error.** `getOrDefault(..., List.of())` and
   `if (p != null)` — new equipment falls back to the algorithm silently. There is no migration step,
   no "rebuild the placement file", no partial-store failure mode.
3. **Stored geometry is advisory and never load-bearing for connectivity.** `CustomPathRouting`
   stores only *interior* waypoints and **recomputes both endpoints against current node positions
   every time**. Moving a symbol re-attaches its routes; the stored waypoints bend the middle. Geometry
   can never create or destroy a connection.

**MV equivalent.** None. `MV_BASELINE.md` states the measured gap exactly: "there is no persisted
placement/route store — the scene is fully regenerated, so manual CAD placement + manual routing
waypoints are not durable domain data." Confirmed by inspection: `frontend/src/ui/sld/v3/scene/
buildScene.ts` computes the entire scene from ENM on every call; `v3/layout/route.ts` (431 LOC)
computes routes; `frontend/src/ui/sld-editor/` is ~56 LOC, i.e. empty.

**Gap.** Total. This is MV's largest measured hole in the projection layer, and PowSyBl has a
directly applicable, production-proven answer for it.

**Benefit.** Highest of anything in this audit. It converts MV's SLD from "a picture the system draws"
into "a drawing the engineer owns", without touching ENM's electrical truth — which is precisely the
combination MV's canonical law demands and which MV currently cannot offer.

**Decision: PORT** (concept + data-shape, clean-room implementation).

Recommended shape for MV, taking NAD's variant (a) as the model and CGMES's variant (b) for the
naming/versioning idea:

    # backend/src/enm/rozmieszczenie.py  — NOT part of the ENM electrical document
    RozmieszczenieSLD:
        schemat: str                       # diagram name — several drawings per project
        wersja_enm: str                    # ENM canonical hash at capture time (staleness signal)
        pozycje: dict[str, Punkt]          # domain_ref -> (x, y)     [advisory]
        trasy:   dict[str, list[Punkt]]    # domain_ref -> interior waypoints only  [advisory]

Stored beside the ENM revision (`backend/src/enm/rewizje.py` / `store.py`), never inside the ENM
document; served through its own endpoint; consumed by `buildScene` as an optional overlay input with
per-entry fallback.

**Target MV module.** New `backend/src/enm/rozmieszczenie.py` + repository in
`backend/src/infrastructure/`; API under `backend/src/api/`; frontend
`frontend/src/ui/sld/v3/layout/route.ts` (waypoint splice) and `v3/scene/buildScene.ts`
(position override); the currently-empty `frontend/src/ui/sld-editor/` becomes the write path.

**ENM impact.** **Zero by construction, and that is the point.** The store lives outside the ENM
document, so the canonical hash, the revision chain (`rewizje.py`), the change journal
(`dziennik_zmian.py`) and every solver input are untouched. If this rule is relaxed even once —
if a single coordinate lands in `models.py` — canonical law #1 and #4 are both broken.

**SLD impact.** Large but additive: `buildScene` gains an optional `rozmieszczenie` parameter;
absent or empty ⇒ byte-identical output to today.

**Migration risk.** Medium-high, five named hazards:
1. **Staleness.** A stored position referring to a deleted bay must be dropped silently on read, not
   raise, and not be resurrected on a later re-add of the same ref. PowSyBl gets this free from
   `getOrDefault`/null-check; MV must implement and test it deliberately.
2. **Determinism.** Two inputs now feed the scene (ENM + placement). The scene hash must be a function
   of *both*, and `sld/v2/core/hashes.ts` plus `scripts/sld_determinism_guards.py` must be updated in
   the same change — otherwise MV gets a scene that changes without its hash changing, which is worse
   than no store at all.
3. **Endpoint recomputation.** If MV stores full polylines instead of interior waypoints, a moved
   symbol leaves a dangling wire and the drawing starts lying about connectivity. Store interior
   points only; recompute endpoints every render. This is non-negotiable and follows canonical law #2/#3.
4. **Write-path scope.** `ui/sld-editor` is empty today; building the write path is genuinely new UI
   work, not a port.
5. `CustomPathRouting` mutates nothing outside the diagram model — MV must keep the same property so
   `overlay_no_physics_guard.py` and `arch_guard.py` stay green.

**Test strategy.**
- Round-trip: render → capture positions → re-render with the store → every stored element lands on
  its stored coordinate to the last decimal; every unstored element lands exactly where it did before.
- Staleness product (iloczyn cech): `{stored ref deleted} × {stored ref renamed} × {new ref added} ×
  {ENM hash changed / unchanged}` — 16 cases, all must degrade gracefully with no exception and no
  silent resurrection.
- Connectivity invariant: with waypoints stored for edge E, move E's endpoint symbol; assert the route
  still terminates exactly on both current ports, and assert the ENM topology hash is unchanged
  (geometry never creates connectivity).
- Determinism: same (ENM, store) ⇒ identical scene SHA-256; different store ⇒ different SHA-256.
- Empty store ⇒ every existing golden scene byte-identical.

**What would make this a mistake.**
- **Storing placement inside the ENM document** "because it's simpler". It is the one change that
  turns a correct design into a violation of canonical laws #1 and #4, and it is exactly what the
  CGMES variant (b) does. I recommend variant (a) *specifically because* variant (b) would be illegal
  in MV. Do not copy the CGMES pattern.
- **Storing full polylines** rather than interior waypoints — makes geometry authoritative over
  attachment.
- **Building the store before S3.** Without ordering hints, users will fight the layout with
  coordinates, and MV ends up with a hand-placed drawing per project that nobody dares regenerate —
  the exact failure mode PowSyBl avoids by having `PositionPredefined` absorb intent *ordinally*
  before anyone reaches for x/y. Sequence: S3 then S4.
- **Not updating the determinism guards in the same change.** A second scene input that the hash does
  not cover is a silent determinism hole.

---

### S5 — Depth-limited network neighbourhood (partial diagram / focus mode)

**Donor / commit / licence:** powsybl-diagram @ `952186b5`, MPL-2.0.

**Files and symbols actually read**
- `network-area-diagram/.../nad/build/iidm/VoltageLevelFilter.java` (195 LOC, read in full) —
  `record VoltageLevelFilter(Set<VoltageLevel> voltageLevels) implements Predicate<VoltageLevel>`;
  `NO_FILTER`; `createVoltageLevelDepthFilter(network, vlId, depth)`;
  `createVoltageLevelsDepthFilter(network, ids, depth)`;
  `createVoltageLevelFilterWithPredicate(network, ids, depth, predicate)`;
  `createNominalVoltageFilter(network, ids, lowerBound, upperBound, depth)` and the
  lower/upper-bound convenience overloads; `getNextDepthVoltageLevels(network, vls)`;
  the recursive core `traverseVoltageLevels(Set current, int depth, Set visited, Predicate)`;
  `checkVoltageBoundValues`; inner `VlVisitor extends DefaultTopologyVisitor` with `visitLine`,
  `visitTwoWindingsTransformer`, `visitThreeWindingsTransformer` (visits the two *other* legs),
  `visitHvdcConverterStation` (hops to the other converter station), `visitBoundaryLine`
  (only if `isPaired()`, then hops through the tie line), and `visitTerminal` which is the single
  gate: `if (!visited.contains(vl) && predicate.test(vl)) next.add(vl)`.
- `network-area-diagram/.../nad/build/iidm/NetworkGraphBuilder.java` — `getVoltageLevels()`
  (`filter(voltageLevelFilter).sorted(comparing(VoltageLevel::getId))`), the visible/invisible split
  (`voltageLevelsInvisible` = one hop beyond the visible set, sorted by id, added with
  `visible=false`), `addVoltageLevelGraphNode(vl, graph, visible, injectionsAdded)`,
  `addGraphEdges` (every stream `.sorted(Comparator.comparing(::getId))`).
- `network-area-diagram/.../nad/model/VoltageLevelNode.java` usage of the `visible` flag,
  `.../svg/metadata/NodeMetadata.java` field `invisible`.
- `.../sld/svg/DefaultSVGWriter.java` `setMetadata(...)` — emission of `nextVId`
  (the other-side voltage-level id per feeder node).
- MV side: `backend/src/enm/topology_ops.py` lines 935-1010 —
  `AdjacencyEntry`, `SpineNode(bus_ref, depth, is_source, children_refs)`, `TopologySummary`,
  `compute_topology_summary(enm)` (full adjacency both directions, open branches skipped,
  transformers included, `source_bus_refs` sorted).

**Capability.** A composable subgraph selector: *start from a set of containers, expand N hops through
electrical connections, and drop anything failing an arbitrary predicate at every step*. Three
properties make it more than a BFS:

1. **The predicate is applied during expansion, not after.** `visitTerminal` gates before adding to
   the frontier, so a voltage-level that fails the filter also blocks traversal *through* itself.
   "Show me 2 hops around GPZ-A but only ≥ 15 kV" therefore means 2 hops *through the 15 kV network*,
   not 2 hops through everything then a filter. That is the semantics an engineer actually wants and
   the one a naive implementation gets wrong.
2. **Hop semantics are defined per equipment class, not per graph edge.** A 3-winding transformer
   reached at leg 1 exposes legs 2 *and* 3 as one hop; an HVDC converter hops to its partner station;
   an unpaired boundary line is a dead end. These are electrical adjacency rules, not topological ones.
3. **A visible/invisible ring.** `NetworkGraphBuilder` adds one extra hop beyond the requested depth
   as `visible=false` nodes, so lines leaving the focus area terminate on a real (if unrendered)
   counterpart instead of dangling. `NodeMetadata.invisible` carries this to the consumer.

Plus, from SLD: `NodeMetadata.nextVId` gives every feeder the id of the container on its far side —
the data needed to make "expand focus to the neighbour" a lookup rather than a re-traversal.

**MV equivalent.** `compute_topology_summary` in `backend/src/enm/topology_ops.py` builds a full
adjacency map and a source-rooted spine with a `depth` field. That is a *global* summary, not a
*local* extraction. Grepping `backend/src/enm/` for depth/hop/neighbourhood selection returns exactly
one hit — the `SpineNode.depth` field. There is no
`extract_neighbourhood(enm, seed_refs, depth, predicate)`.

**Gap.** Complete, on the backend where it belongs. The building blocks are all present (adjacency
construction is already written and already deterministic, open branches already excluded); what is
missing is the bounded, predicate-gated, class-aware extraction on top, and the "visible ring"
concept for honest edges of the cut.

**Benefit.** High, P0. This is the single donor capability that maps 1:1 onto a wanted MV feature
(partial SLD / focus mode / local neighbourhood / trace highlighting) with no equivalent in MV today.
It is also the enabler for the `PERF-SC-50` class of usability problems: a 50-station network is
unreadable as one drawing, and the fix is not a faster renderer, it is a smaller drawing.

**Decision: PORT** (algorithm + semantics; clean-room Python implementation — the Java is ~90 lines
of logic and the value is entirely in the three semantic properties above, not in the code text).

**Target MV module.** `backend/src/enm/topology_ops.py` — a new
`wyodrebnij_otoczenie(enm, seed_refs, glebokosc, predykat) -> ENMSubset` sitting on the existing
adjacency construction, returning `{refs_widoczne, refs_pierscien}` (visible / boundary ring).
Frontend consumes it as a scene filter in `frontend/src/ui/sld/v3/scene/buildScene.ts`; the
`nextVId` analogue is an additive scene-element field pointing at the far-side container ref.

**ENM impact.** **Read-only.** The extraction returns a *set of refs*, never a new ENM document. This
must be enforced: producing a pruned ENM would create a second model instance and break canonical
law #1 (Single Model Rule) and MV's Case Immutability Rule. The subset is a *view selector* consumed
by the projection, exactly as `VoltageLevelFilter` is a `Predicate` handed to the graph builder and
never a `Network`.

**SLD impact.** `buildScene` gains an optional visible-ref set. Empty/absent ⇒ full scene, byte-identical.

**Migration risk.** Medium. Named hazards:
1. **Determinism.** PowSyBl uses `HashSet` internally but sorts by id before *construction*
   (`getVoltageLevels()`, `addGraphEdges`, `voltageLevelsInvisible`). MV must sort at the boundary
   too — returning a Python `set` to the frontend would be nondeterministic ordering and would break
   scene hashing.
2. **Predicate-during-expansion.** Implementing it as "BFS then filter" is the subtly wrong version
   and will look correct on every radial test fixture. It only diverges on meshed/ring networks —
   which is precisely MV's SN ring use case. Test on a ring.
3. **Class-aware hops.** MV's equivalents of the special cases are: transformer (2- and 3-winding),
   `SwitchBranch`/`FuseBranch` with `status == open` (already excluded from adjacency — but is an open
   switch a *boundary* or *invisible*?), `CableJoint`, `LineRun`, and DER terminals. Each needs an
   explicit decision. "Analogicznie" is not acceptable here (CLAUDE.md ZAKAZ SKRÓTÓW).
4. **Ring honesty.** Without the visible/invisible ring, MV's focus view will show feeders vanishing
   into nothing, which reads as a modelling error to an engineer.

**Test strategy.**
- Depth exactness on a known radial fixture: `depth ∈ {0,1,2,3}` returns exactly the expected ref sets.
- **Ring topology** (`rozplyw_wysp.py` fixtures, SN ring): depth-2 from one point must reach the same
  set from either direction, and must terminate identically — the case where BFS-then-filter breaks.
- Predicate-during-expansion: a network A—B—C where B fails the predicate; assert C is **not** reached
  at depth 2. This is the one test that distinguishes the correct implementation from the naive one.
- Class-aware hop product (iloczyn cech): `{2W trafo, 3W trafo, open switch, fuse, cable joint,
  DER terminal, line run} × {inside focus, on the ring, outside}` — every combination asserted.
- Determinism: identical `(enm, seed, depth, predicate)` ⇒ identical ordered output, 100 repetitions,
  and stable across a dict-ordering perturbation of the input ENM.
- Scene: focus scene ⊂ full scene, and every element in the focus scene is byte-identical to its
  counterpart in the full scene (focus must not re-layout, or trace highlighting will jitter).

**What would make this a mistake.**
- **Returning a pruned ENM instead of a ref set.** That is a second model. It would pass tests and
  quietly destroy the single-model invariant. If anyone proposes it "for convenience", that is the
  moment to stop.
- **Implementing it in the frontend.** Neighbourhood extraction is topology, topology is domain, and
  `ui_no_physics_guard.py` / `arch_guard.py` exist to prevent exactly this. It belongs in
  `backend/src/enm/`.
- **Re-laying-out the focus view.** If the focus scene runs a fresh layout, elements move when the
  user focuses, and "focus" becomes disorienting rather than clarifying. PowSyBl gets away with a
  fresh layout because NAD is a force-directed schematic with no stable geometry expectation; MV's SLD
  is a CAD-like drawing where an engineer expects the busbar to stay put. Filter the scene, do not
  recompute it.
- If MV builds this *only* as a rendering filter and not as a backend selector, it cannot be reused by
  analyses, reports, or protection zone selection — a wasted opportunity, and a second implementation
  waiting to be written.

---

### S6 — Style providers and result overlays

**Donor / commit / licence:** powsybl-diagram @ `952186b5`, MPL-2.0.

**Files and symbols actually read**
- `.../sld/svg/styles/StyleProvider.java` (full interface: `getEdgeStyles`, `getNodeStyles`,
  `getNodeDecoratorStyles`, `getBranchEdgeStyles`, `getNodeSubcomponentStyles`, `reset()`,
  `getCssFilenames()`, `getCssUrls()`, `getBusStyles`, `getBusInfoStyle`,
  `getBusLegendCaptionStyles`, `getFeederInfoStyles`, `getCellStyles`) — **every method returns
  `List<String>` or `String`; none returns a number, a colour value, or geometry.**
- `.../sld/svg/styles/StyleProvidersList.java` — `concatenateLists(...)`, `reset()` fan-out.
- `.../sld/svg/styles/{AbstractStyleProvider,AbstractVoltageStyleProvider,BasicStyleProvider,
  EmptyStyleProvider,NominalVoltageStyleProvider,StyleClassConstants,StyleProviderFactory,
  AnimatedFeederInfoStyleProvider,BusHighlightStyleProviderFactory}.java`.
- `.../sld/svg/styles/iidm/LimitHighlightStyleProvider.java` (read in full) — `getOverloadStyle(edge)`,
  `isOverloaded(FeederNode)` calling `network.getBranch(n.getEquipmentId()).isOverloaded()`;
  `getNodeStyles` comparing `busbarSection.getV()` against
  `getTerminal().getVoltageLevel().getHighVoltageLimit()` / `getLowVoltageLimit()` and returning
  `VL_OVERVOLTAGE_CLASS` / `VL_UNDERVOLTAGE_CLASS`.
- `.../sld/svg/styles/iidm/TopologicalStyleProvider.java` — `vlNodeIdStyleMap`, `vlBusIdStyleMap`,
  `stylesIndices` caches, `reset()` clearing them, `isNodeSeparatingStyles`, `isMultiTerminalNode`,
  `getVoltageLevelEdgeStyles` (open-switch handling).
- `.../sld/svg/{LabelProvider,AbstractLabelProvider,DefaultLabelProvider,CustomLabelProvider,
  FeederInfo,ValueFeederInfo,AbstractFeederInfo,BusInfo}.java`.
- `diagram-util/.../diagram/util/ValueFormatter.java` — `formatVoltage/formatPower/formatAngleInDegrees`,
  ctor takes an explicit `Locale`.
- `.../sld/svg/DefaultSVGWriter.java:452-455` — `writeStyleClasses(g, styleProvider.getNodeStyles(...))`
  then `writeStyleAttribute(g, styleProvider.getNodeStyle(...))`.
- MV side: `frontend/src/ui/sld-overlay/` — `OverlayEngine.ts:48` (`elementRef: element.element_ref`),
  `overlayTypes.ts:250` (`elementRef: string`), `rawResultOverlayStore.ts:15,114-118`
  (`getMetric(elementRef, code)`), plus `LoadFlowOverlayAdapter.ts`,
  `ShortCircuitFlowOverlayAdapter.ts`, `ZeroSequenceOverlayAdapter.ts`, `OltcOverlayAdapter.ts`,
  `RawToTypedOverlayAdapter.ts`, `cableLoadingOverlay.ts`, `sldDeltaOverlayStore.ts`.

**Capability — two halves, one good and one MV must refuse.**

*Good half (the contract).* A style provider is a pure function
`(diagram element, result-bearing model) → List<CSS class name>`. It cannot return a colour, a
threshold, a number, or a coordinate — the type system forbids it; the palette lives entirely in CSS
files declared by `getCssFilenames()`. Providers **compose** (`StyleProvidersList` concatenates class
lists from N providers), so "nominal-voltage colouring" + "topology colouring" + "limit violation
highlight" stack without any of them knowing about the others. `reset()` gives each provider a
defined cache-invalidation point when the underlying results change. Nothing in the interface can
mutate the network or the diagram graph.

*Half MV must refuse.* `LimitHighlightStyleProvider.getNodeStyles` performs
`busbarSection.getV() > voltageLevel.getHighVoltageLimit()` **inside the presentation layer**. That is
a normative threshold evaluation — a verdict — computed in a style provider. PowSyBl can afford it
because IIDM stores both the result (`getV()`) and the limit on the same object and treats the
comparison as trivially derived. MV cannot: `scripts/overlay_no_physics_guard.py` and
`scripts/physics_label_guard.py` exist to forbid precisely this, and MV's canonical law puts every
verdict behind a solver/analysis module with a WHITE BOX trace.

**MV equivalent.** MV's overlay layer is already structurally correct: `element_ref`-keyed metrics,
adapters per result family, a raw→typed adapter boundary, and a store the canvas queries by
`(elementRef, code)`. MV is arguably *ahead* of PowSyBl on the physics boundary.

**Gap.** Two, both about composition rather than correctness:
1. **No composition primitive.** PowSyBl's `StyleProvidersList` lets N independent providers
   contribute classes to the same element. MV has parallel adapters (`LoadFlow…`, `ShortCircuitFlow…`,
   `ZeroSequence…`, `Oltc…`, `cableLoading…`) but no declared stacking contract — what happens when
   load-flow overloading and a short-circuit contribution both want to mark the same cable is, as far
   as I can see, not specified in one place.
2. **No declared `reset()` / invalidation point per overlay.** MV has freshness machinery
   (`frontend/src/ui2/freshness/`, ADR-018, ADR-026 selective invalidation) but the overlay providers
   themselves do not expose a uniform invalidation hook the way `StyleProvider.reset()` does.

**Benefit.** Moderate. It hardens an already-correct layer and removes a class of "two overlays fight
over one element" bugs before they are written.

**Decision: PORT the contract (P1); REJECT the threshold evaluation (hard).**

Port: (a) an explicit "overlay providers return class/marker tokens, never values or colours" typed
contract; (b) a `zlozOverlaye(...)` composition function with a **declared, deterministic precedence
order** for conflicting tokens; (c) a uniform `reset()`/invalidate hook wired to the existing
freshness signals.

Reject: any comparison of a measured value against a limit inside `ui/sld-overlay/**` or `ui2/**`.
Where such a comparison is needed, the *verdict* must arrive from the backend as a field on the result
element (MV already has `severity.py`, `compliance/`, and `analysis/normative/` for exactly this), and
the overlay maps verdict → token.

**Target MV module.** `frontend/src/ui/sld-overlay/OverlayEngine.ts`, `overlayTypes.ts`,
`rawResultOverlayStore.ts`.

**ENM impact.** None. **SLD impact.** None to geometry; overlay token stacking becomes explicit.

**Migration risk.** Low-medium. The real risk is the *opposite* of adoption: someone reads
`LimitHighlightStyleProvider`, concludes "PowSyBl does thresholds in the style layer, so it's fine",
and lands a `>` against a limit in `ui/sld-overlay`. That is a guard-breaking, canon-breaking change
that would look like it had industrial precedent.

**Test strategy.**
- Composition product (iloczyn cech): every pair from
  `{load-flow overload, SC contribution, zero-sequence, OLTC, cable loading, delta}` applied to the
  same element — assert the resulting token set and the precedence order are deterministic and
  documented, for all pairs (not one example).
- Contract test: no overlay provider function's return type admits a number or a colour string
  (type-level), plus a guard-script assertion over `ui/sld-overlay/**` for comparison operators
  against limit-shaped fields.
- Invalidation: stale result ⇒ every overlay token cleared; assert against `freshness` state
  transitions.
- Re-run `scripts/overlay_no_physics_guard.py`, `scripts/physics_label_guard.py`,
  `scripts/trace_ui_leak_guard.py` as merge gates.

**What would make this a mistake.**
- Copying `LimitHighlightStyleProvider`'s shape. It is the one place in this donor where the
  layer discipline is weaker than MV's, and it is superficially the most tempting file in the whole
  repository because it is short and does something visibly useful.
- Adding a composition layer MV does not need. If in practice MV's overlays are mutually exclusive by
  construction (one active result family at a time), then `StyleProvidersList` is speculative
  abstraction and should not be built. This needs a five-minute check against
  `useOverlayRuntime.ts` before any work starts — if overlays are already exclusive, downgrade this
  whole subsystem to STUDY_ONLY.

---

### S7 — Layout separation from the domain model (decisive question, answered from code)

**Donor / commit / licence:** powsybl-diagram @ `952186b5` + powsybl-core @ `cd6f609d`, MPL-2.0.

**Files and symbols actually read** — the union of S3 and S4 evidence, plus a repository-wide
mutation audit: `grep -rn "addExtension|newExtension|\.setP\(|\.setQ\(|\.setV\(|\.setAngle\(|removeExtension"`
over every `src/main/java` in the donor, results reviewed individually.

**Finding — stated precisely, because the baseline calls this decisive.**

PowSyBl uses **three different storage strategies** for three different kinds of "layout data", and
the distinction between them is the actual lesson:

| Kind of data | Where it lives | Evidence |
|---|---|---|
| **Pixel coordinates** (x, y of every node, wire polylines) | **Never in the network model.** Transient fields on the *diagram* graph node: `AbstractNode.position = new Point(-1,-1)`, set by `Layout.run()`, discarded when the graph is discarded. | `sld/model/nodes/AbstractNode.java`; `sld/model/nodes/Node.java` (`getCoordinates`/`setCoordinates`/`setX`/`setY`) |
| **Ordinal placement hints** (feeder order, TOP/BOTTOM, busbar index/section, display name) | **In the network model, as optional `Extension`s** — `ConnectablePosition`, `BusbarSectionPosition` — explicitly documented as "suggestions for visualization tools". Contains no geometry. | `powsybl-core .../extensions/ConnectablePosition.java` javadoc + interface |
| **Persisted geometry** (x, y, seq polylines per named diagram) | **Two options, in separate modules, never in the core algorithm**: (a) NAD — outside the model entirely, round-tripped via the emitted metadata JSON keyed by `equipmentId`; (b) CGMES — as an opt-in `AbstractExtension` on the equipment, namespaced by diagram name. | `nad/layout/FixedLayoutFactory.java` + `DiagramMetadata.getFixedPositions()`; `single-line-diagram-cgmes-dl-iidm-extensions/**` |

The mutation audit is clean and confirms the separation:
`single-line-diagram-core` — the entire layout and rendering algorithm, 20 229 LOC — contains **zero**
calls that mutate an iidm object. The only `addExtension` in that module
(`VoltageLevelRawBuilder.java:83`) sets `order`/`direction` on an **SLD diagram node**, and the only
`setAngle` in NAD (`AbstractEdgeRouting.java:79`) is on the **NAD diagram model**'s `Injection`.
Every genuine iidm mutation lives in `single-line-diagram-cgmes-dl-conversion` and
`…-cgmes-layout` — modules whose declared job is importing/exporting diagram data — and every one of
them goes through the `Extension` mechanism (`addExtension` / `removeExtension`), never through a core
model field.

**MV equivalent.** ENM holds no coordinates (confirmed: `MV_BASELINE.md` inventory and the
`backend/src/enm/` file listing show no geometry types), and the scene is fully derived
(`buildScene.ts`). ADR-024 already states "SN/nN projections from one model".

**Gap.** Not a code gap — a **decision gap**. MV has strategy 1 (transient coordinates) and nothing
else. It has no equivalent of the middle tier (ordinal hints, S3) and no equivalent of persisted
geometry (S4). Because the middle tier is missing, the pressure to jump straight from "no persistence"
to "coordinates in the model" is strong, and that jump is fatal to canonical law #4.

**Benefit.** This subsystem's benefit is entirely in the *decision it constrains*: it gives MV
external, production evidence that (a) coordinates in the model are avoidable, (b) ordinal hints in
the model are legitimate and are what mature systems actually put there, and (c) persisted geometry
belongs in a named side-car.

**Decision: STUDY_ONLY**, recorded as an ADR addendum so the next agent cannot relitigate it.

**Target MV module.** `mv-design-pro/docs/adr/` — an addendum to ADR-024 (or a new ADR) recording the
three-tier rule and the explicit prohibition of tier-3-in-ENM.

**ENM impact.** None (documentation). **SLD impact.** None.

**Migration risk.** Nil. The risk is in *not* recording it.

**Test strategy.** Not applicable; but the rule should be made enforceable — a guard asserting that no
geometry-shaped field name (`x`, `y`, `pos`, `coord`, `punkt`, `wspolrzedne`) appears in
`backend/src/enm/models.py`. A declaration without a test is false confidence (CLAUDE.md
"KLASA, NIE INSTANCJA" §4).

**What would make this a mistake.** Recording the rule and then treating the CGMES extension variant
as equally acceptable. It is *acceptable for PowSyBl* because IIDM's extension mechanism is a
first-class, serialisable, opt-in side-channel with its own lifecycle. ENM has no such mechanism, so
in MV the same pattern would mean adding fields to `models.py` — which is not the same thing at all,
and would break the canonical hash and the revision chain. The ADR must say *which* of the two
variants MV adopts (NAD's) and *why the other is rejected*, or the next reader will pick the wrong one.

---

### S8 — Determinism engineering (and four anti-patterns to refuse)

**Donor / commit / licence:** powsybl-diagram @ `952186b5`, MPL-2.0.

**Files and symbols actually read**
*Good patterns:*
- `.../sld/model/coordinate/Position.java` — integer `(h, v, hSpan, vSpan)` via
  `EnumMap<Dimension, Segment>`; `.../coordinate/{Coord,Point,Segment,Direction,Orientation,Side}.java`.
- `.../sld/layout/PositionVoltageLevelLayout.java` `calculateNodeCoord` — the single place integers
  become pixels: `position.get(H) * (cellWidth/2) + busPadding`,
  `firstBusY + position.get(V) * verticalSpaceBus`.
- `.../sld/layout/position/clustering/PositionByClustering.java` `indexBusPosition` —
  `busNodes.stream().sorted(Comparator.comparing(BusNode::getId))`.
- `.../sld/layout/position/clustering/Links.java` — `TreeSet<Link> linkSet`,
  `getStrongestLink() = linkSet.last()`, `int linkCounter` passed into every `Link`.
- `.../sld/layout/position/clustering/Link.java` `compareTo` — four weighted categories, then
  **`return this.nb - oLink.nb`**: an explicit total order, no unresolved ties.
- `.../sld/layout/position/clustering/Link.java` `assessCommonBusNodes`/`assessFlatCell` —
  `new LinkedHashSet<>(...)` rather than `HashSet` for intersection sets.
- `.../sld/builders/NetworkGraphBuilder.java` — `sorted(comparing(VoltageLevel::getNominalV).reversed())`;
  `nad/build/iidm/NetworkGraphBuilder.java` — every stream `.sorted(comparing(::getId))`.
- `.../sld/svg/SvgParameters.java` — `languageTag = "en"` and
  `Locale.forLanguageTag(languageTag)`; **`Locale.getDefault()` appears nowhere**;
  `undefinedValueSymbol = "—"`; explicit per-quantity precisions.
- `diagram-util/.../ValueFormatter.java` — `DecimalFormatSymbols.getInstance(locale)` from the
  injected locale.
- `.../sld/svg/DefaultSVGWriter.java:569` — `String.format("%s(%s,%s)", TRANSLATE, x, y)` where x,y
  are `double` rendered via `%s` (`Double.toString`, locale-independent); `:820`
  `Precision.round(matrix[i], precision)`.
- `.../sld/svg/GraphMetadata.java` `@JsonPropertyOrder({"unescapedId","id","vid",...})` with the
  comment stating it exists because getter-vs-creator ordering differs across systems and
  "leads to comparison errors in the unit tests" — i.e. a determinism bug found and fixed.
- Test harness: `single-line-diagram-core/src/test/java/com/powsybl/sld/AbstractTestCase.java` —
  `toString(resourceName)`, `normalizeLineSeparator`, and assertions of the form
  `assertEquals(toString("/TestCase1.svg"), toSVG(g, ...))` (e.g. `iidm/TestCase1.java:56,64,72`,
  `iidm/TestBattery.java:40`, `iidm/TestCase11FlatDesignComponents.java:73`). 279 golden SVGs,
  97 golden JSONs — **full-text equality modulo line separators.**

*Anti-patterns (also read, also cited):*
- `.../sld/svg/GraphMetadata.java` — `nodeMetadataMap`, `wireMetadataMap`, `lineMetadataMap`,
  `feederInfoMetadataMap`, `busInfoMetadataMap`, `componentByType` are all **`HashMap`**, and the
  JSON getters emit `ImmutableList.copyOf(map.values())` — i.e. **HashMap iteration order**.
- `nad/build/iidm/IntIdProvider.java` — monotone counter as SVG id (S1).
- `.../sld/layout/pathfinding/DijkstraPathFinder.java` —
  `PriorityQueue<>(Comparator.comparingDouble(n -> n.getCost() + n.getDistance()))` with **no
  tie-break**, plus `Set<Point> visited = new HashSet<>()`.
- `diagram-util/.../layout/setup/SquareRandomSetup.java` — `DEFAULT_SEED = 3L`, `new Random(DEFAULT_SEED)`;
  `diagram-util/.../layout/forces/util/RandomForce.java` — `random.nextDouble(1,2)` to separate
  coincident points.

**Capability.** PowSyBl achieves reproducible SVG in practice and proves it with 279 golden-file
comparisons. The techniques that carry the weight:
1. **Integer-first geometry.** All combinatorics happen on an integer `(h, v)` grid; floats enter only
   in one linear map at the end. Float accumulation order therefore cannot reorder anything.
2. **Total orders everywhere a choice is made.** The clustering merge order is a `TreeSet` on a
   comparator that ends in a creation-index tie-break — there is no "pick any of the equally good ones".
3. **Sort at every model→algorithm boundary**, by stable domain id or by a physical quantity then id.
4. **`LinkedHashSet` where a set's iteration order can leak into output.**
5. **Ambient environment is banned from the output path**: locale is an explicit parameter with a
   pinned default; there is no `Locale.getDefault()`, no `System.currentTimeMillis()`, no unseeded
   randomness in SLD.
6. **Explicit serialization field order** where the serializer's own ordering proved
   platform-dependent.
7. **Enforcement by golden full-text comparison**, not by spot assertions.

**MV equivalent.** MV already requires SHA-256-stable output, has `sld/v2/core/hashes.ts`,
`scripts/sld_determinism_guards.py`, `scripts/trace_determinism_guard.py`,
`scripts/fault_scenarios_determinism_guard.py`, an SLD determinism CI workflow, and
`npm run accept:sld-v3`. MV's enforcement is comparable or better.

**Gap.** Not enforcement — *technique*. I did not audit MV's `v3/layout/**` numerics in depth (out of
scope for this donor audit and I will not claim what I did not read), so I state this as a question
MV must answer against itself, not as a finding: **does MV's layout make its ordering and packing
decisions on integers, or on floats?** `measure.ts` (1 271 LOC), `columns.ts` (420), `bands.ts` (213),
`clearances.ts` (152) are the files where this is decided. If any comparison that *selects* an
arrangement is a float comparison, MV's determinism rests on identical float evaluation order rather
than on structure — which holds today and breaks the day the code is refactored or the JS engine
changes its optimisation.

**Benefit.** High, P0 — because it is cheap insurance on an invariant MV has already declared
non-negotiable.

**Decision: PORT the patterns (P0). REJECT four specific donor practices (hard).**

Port: integer-grid-first decision making; explicit total orders with a stable final tie-break;
sort-at-boundary; explicit locale/precision in every formatter that reaches output; explicit key order
in every emitted JSON.

Reject, by name, with reasons:
1. **`HashMap` backing serialized collections** (`GraphMetadata`). Works only because Java's String
   hash and HashMap resize behaviour happen to be stable for a given key set and JDK. MV needs
   stability across environments and over time; use insertion-ordered or sorted structures for
   anything that reaches output.
2. **Counter-based projection ids** (`IntIdProvider`). Directly violates MV's "stable ids across
   relayout". Adding one element renumbers everything after it.
3. **A priority queue with no tie-break** (`DijkstraPathFinder`). Reproducible today only because
   `PriorityQueue`'s sift order and `Grid.getNeighbors`' fixed right/left/up/down ordering happen to
   be deterministic. That is stability by accident, and it is exactly the routing code MV would
   otherwise want (S9). If MV implements it, the comparator must end in an explicit `(f, x, y)`
   tie-break.
4. **Seeded pseudo-randomness in a layout** (`SquareRandomSetup(DEFAULT_SEED=3L)`, `RandomForce`).
   Reproducible for a fixed seed and fixed iteration order, but any change to node insertion order
   changes every position. MV's SLD must have no randomness at all, seeded or otherwise.

**Target MV module.** `frontend/src/ui/sld/v3/layout/{measure,columns,bands,clearances,segments}.ts`;
`frontend/src/ui/sld/v2/core/hashes.ts`; `mv-design-pro/scripts/sld_determinism_guards.py`.

**ENM impact.** None. **SLD impact.** Potentially significant if an integer-grid refactor is needed —
must be proven hash-neutral or accompanied by a deliberate golden regeneration.

**Migration risk.** Medium. An integer-grid refactor of `measure.ts` touches the most load-bearing
layout file MV has. It must be done against the existing golden corpus with a byte-equality gate, not
"it looks the same".

**Test strategy.**
- A guard extension asserting no `Intl`/`toLocaleString`/`Date`/`Math.random` on any code path that
  reaches scene output.
- A repeat-determinism test: build the same scene 100× in one process and across two processes;
  assert identical SHA-256.
- A perturbation test: shuffle the order of collections inside the input ENM document (same
  semantics, different serialisation order); assert the scene hash is unchanged. **This is the test
  that actually catches missing sort-at-boundary**, and I would expect it to be the highest-yield
  single test in this whole report.
- Locale hostility: run the frontend suite under a comma-decimal locale (`pl-PL`) and assert scene
  bytes unchanged.

**What would make this a mistake.** Refactoring `v3/layout` to integers *speculatively*, before
running the perturbation and locale tests to find out whether MV actually has a problem. If those two
tests pass, MV's determinism is already structural and an integer refactor is unrequested churn
(CLAUDE.md §Simplicity, §Surgical Changes). Run the tests first; refactor only what they indict.

---

### S9 — Orthogonal routing: A* on an occupancy grid with bend penalty

**Donor / commit / licence:** powsybl-diagram @ `952186b5`, MPL-2.0.

**Files and symbols actually read**
- `.../sld/layout/pathfinding/PathFinder.java` — `List<Point> findShortestPath(Grid, Point start, Point goal)`.
- `.../sld/layout/pathfinding/DijkstraPathFinder.java` (97 LOC, read in full) — despite the name it is
  **A\***: priority is `node.getCost() + node.getDistance()` where `distance` is the straight-line
  heuristic to the goal. Bend penalty: `int cost = 1; if (parent != null && Grid.isRightAngle(parent,
  current, neighbor)) cost++;`. On success it calls `grid.setAvailability(path, false)` — the found
  corridor is **reserved**, so subsequent routes must go around. `rebuildPath` walks parents and then
  `smoothPath` keeps only direction-change vertices.
- `.../sld/layout/pathfinding/Grid.java` (193 LOC) — `getNeighbors(Point)` returning right, left, up,
  down in that fixed order, gated by `isAvailable`; `updateNode`; `isRightAngle`; `setAvailability`.
- `.../sld/layout/pathfinding/ZoneLayoutPathFinderFactory.java`.
- `.../sld/layout/{AbstractLayout,AbstractBaseLayout,InfosNbSnakeLinesHorizontal,
  InfosNbSnakeLinesVertical}.java` — the separate "snake line" mechanism used between voltage levels
  inside a substation (lane counting rather than grid search).
- `.../sld/layout/{MatrixZoneLayout,AbstractPositionedZoneLayout,ManuallyPositionedZoneLayout}.java`
  and `layout/zonebygrid/{Matrix,MatrixCell,MatrixZoneLayoutModel}.java` — where the path finder is used.

**Capability.** A compact orthogonal wire router: 4-connected grid, A* with Manhattan-ish movement, a
bend penalty that makes straight runs preferred over equal-length zig-zags, sequential routing with
corridor reservation so wires do not overlap, and post-hoc simplification to direction-change vertices
only. ~325 LOC for the whole package. It is the smallest complete implementation of "route wires like
a draughtsman would" I have read.

**MV equivalent.** `frontend/src/ui/sld/v3/layout/route.ts` (431 LOC) and `segments.ts` (356 LOC);
`frontend/src/ui/sld/v2/geometry/cadRoutingContract.ts`. I read the file inventory and sizes but did
**not** read `route.ts` line by line — it is MV's own code and outside this donor audit's scope — so I
make no claim about which algorithm MV currently uses. What I can say is that MV has a routing module
of comparable size and a declared CAD routing contract.

**Gap.** Cannot be asserted without reading `route.ts`. What I *can* assert is the specific
capability set to compare against: bend penalty, corridor reservation across sequentially routed
edges, and vertex simplification. If `route.ts` lacks corridor reservation, MV will produce
overlapping wire runs on dense SN sections and no amount of per-edge routing quality will fix it.

**Benefit.** Conditional, P1. High if MV lacks reservation; near zero if it has it.

**Decision: REWRITE_CLEAN_ROOM** — and this is the one place where I deliberately do **not** say PORT.

Reason: this is the only donor component where the value is concentrated in ~100 lines of tight
algorithmic code, which is exactly the situation where a "port" degenerates into a transliteration and
the MV file acquires the MPL per-file obligation (§0). The algorithm itself — A* on a 4-connected grid
with a turn penalty and edge reservation — is textbook and independently reconstructible. The rule for
implementation: work from the three-line description above, not from the Java, and add the tie-break
the donor lacks.

**Target MV module.** `frontend/src/ui/sld/v3/layout/route.ts`, governed by
`frontend/src/ui/sld/v2/geometry/cadRoutingContract.ts`.

**ENM impact.** None — routes are geometry (canonical law #2/#3: routing may change, topology may not).

**SLD impact.** Potentially large: any routing change moves wires and changes every scene hash. Must
be a deliberate golden regeneration with visual sign-off, and per CLAUDE.md ZASADA NR 2 the visual
verdict on SLD is the owner's (gate B-02), not the agent's.

**Migration risk.** High, for three reasons:
1. Every golden SVG/scene hash changes. This is a `sld-determinism.yml` and `accept:sld-v3` event.
2. **The donor's determinism defect must not be reproduced.** `PriorityQueue` with a
   cost-only comparator leaves ties to heap internals; on a uniform grid ties are the common case.
   MV's comparator must be `(f, then g, then x, then y)` — a total order — or MV's SHA-256 stability
   rests on V8's heap implementation.
3. Corridor reservation makes routing **order-dependent**: route A then B ≠ route B then A. The edge
   iteration order must therefore be an explicit sort on domain ref, not incidental.

**Test strategy.**
- Total-order test: construct a grid with many equal-cost paths; assert the same path is returned over
  1 000 runs and across two processes.
- Order-dependence test: assert edges are routed in sorted-ref order, and that shuffling the input
  edge collection does not change the output.
- Bend-penalty test: a case where a straight L and a staircase have equal length; assert the L wins.
- Reservation test: two edges whose ideal paths overlap; assert the second detours and neither
  overlaps.
- Topology invariant: for every routing result, assert the ENM topology hash is unchanged — geometry
  never creates connectivity.
- Golden: full `accept:sld-v3` regeneration with owner visual sign-off (gate B-02).

**What would make this a mistake.**
- Doing it at all without first reading `route.ts` and establishing that MV lacks reservation or bend
  penalty. Replacing a working router to gain features it already has would be pure churn and would
  burn a golden regeneration for nothing. **This subsystem is gated on that check.**
- Transliterating the Java. That converts a clean-room rewrite into a licensed derivative and defeats
  the reason this row says REWRITE_CLEAN_ROOM rather than PORT.
- Shipping it before S4. Manual waypoints (S4) and auto-routing (S9) interact: the router must treat
  stored waypoints as fixed via-points and route around reserved corridors between them. Building the
  router first means building it twice.

---

### S10 — The library itself (Java artifact, or a rendering service)

**Donor / commit / licence:** powsybl-diagram @ `952186b5`, MPL-2.0.

**Files and symbols actually read** — the integration surface specifically:
`SingleLineDiagram.draw(Network, String id, Writer svg, Writer metadata, SldParameters)`;
`SldParameters.java` (component library, layout params, svg params, label/style provider factories,
zone layout path finder factory); `NetworkGraphBuilder(Network, LayoutParameters)`;
`powsybl-core@cd6f609d iidm/iidm-api/.../network/Identifiable.java` and the
`iidm/iidm-extensions/.../network/extensions/` listing (≈40 extension types);
`pom.xml` (Java 21; `powsybl-core 7.3.0`; modules `powsybl-iidm-impl`, `powsybl-ucte-converter`,
`powsybl-ieee-cdf-converter`, `powsybl-tools-test`).

**Capability.** Everything above, callable as `SingleLineDiagram.draw(network, vlId, svgWriter,
metadataWriter, params)` — provided you hand it a `com.powsybl.iidm.network.Network`.

**Gap / cost.** The entry cost is not the Java runtime; it is the **model**. To call this, MV must
construct an IIDM `Network` from ENM. That means a total mapping of:
`Bus`, `OverheadLine`, `Cable`, `SwitchBranch`, `FuseBranch`, `Transformer`, `Source`, `Load`,
`ShuntCapacitor`, `Generator`, `Measurement`, `ProtectionAssignment`, `Substation`, `GPZSection`,
`NnSection`, `Bay` (with its full runtime/protection/interlock/SPZ/alarm model), `LineRun`,
`CableJoint`, `Port` (15 `PortKind`s), `PortRef`, `ConnectionNode` — onto IIDM's
`VoltageLevel`/`Substation`/`BusbarSection`/`Switch`/`Connectable` vocabulary. Several of those have
**no IIDM counterpart at all** (`Bay` as a first-class object with protection state, `FuseBranch`,
`CableJoint`, `ProtectionAssignment`, `NnSection`), so the mapping would be lossy in exactly the
places where MV's SLD is more informative than PowSyBl's.

And that mapping would be a **second network model**: a parallel object graph with its own topology
semantics (node-breaker index numbers, bus-breaker views), its own extension state, and its own
notion of what is connected. `MV_BASELINE.md` canonical law #1 forbids precisely this — "no
third-party solver model may become a second source of truth". One can argue an ephemeral render-time
IIDM instance is not a *source of truth*; but it would need to be constructed, validated, kept in sync
with ENM edits, and debugged whenever the drawing disagrees with the model — which is the operational
definition of a second source of truth regardless of intent.

Add: a JVM in the deployment (`docker-compose.yml` currently runs 6 services, none of them Java), a
Java↔Python boundary for every render, SVG-as-a-blob arriving in a React app that today builds an
interactive scene graph (losing every hit-test, hover and inline-edit affordance MV's canvas has), and
`powsybl-core 7.3.0` as a transitive dependency footprint.

Against all that, the *benefit* is a substation drawing MV already produces, in a style MV has already
diverged from deliberately (Bay-aware, LOD-aware, sheet-based, CAD-editable).

**Benefit.** Negative.

**Decision: REJECT.**

**Target MV module.** None.

**ENM impact.** Would be severe if pursued (parallel model). **SLD impact.** Would replace
`v3/**` with an opaque SVG blob.

**Migration risk.** Not applicable — rejected.

**Test strategy.** Not applicable.

**What would make this a mistake (i.e. what would make REJECT wrong).** Honest answer: if MV's goal
were ever "produce a CGMES/CIM-conformant substation diagram for exchange with a TSO", then IIDM +
CGMES-DL is the interchange format and reimplementing it in TypeScript would be the mistake. That is a
different product requirement from the one in the baseline, and if it ever appears, this REJECT should
be revisited *for the CGMES export path only* — as an offline export tool, never as the interactive
renderer.

---

## 3. Cross-cutting notes

### Things I could NOT verify — stated rather than inferred
1. **MV's `route.ts` internals.** I read its size and its neighbours, not its algorithm. S9's gap
   statement is therefore conditional and I have marked it so. The first action on S9 is to read it.
2. **MV's `v3/layout` float-vs-integer decision basis.** S8's central question about MV is posed as a
   question, not asserted as a finding. The perturbation and locale tests I propose are the cheap way
   to answer it empirically.
3. **Whether MV's overlays are already mutually exclusive.** S6's composition recommendation is gated
   on a check of `useOverlayRuntime.ts` that I did not perform.
4. **Whether `backend/src/enm/hash.py` drops `None` fields.** S3's hash-neutrality claim is stated as a
   required gate, not as a verified fact.
5. **Runtime behaviour of the donor.** I did not build or execute PowSyBl (no JDK 21 / Maven run in
   this session). All determinism statements are from source reading plus the existence and form of
   the 279/97 golden-file assertions — which is strong evidence of *intent and enforcement*, but I
   have not personally observed byte-identical output across two JVM versions. The HashMap-ordering
   concern in `GraphMetadata` is a code-level observation, not an observed failure.

### Recommended sequence (the subsystems interact)
`S7 (record the rule)` → `S3 (ordinal hints in ENM)` → `S5 (neighbourhood extraction, independent, can run in parallel)` → `S4 (placement side-car)` → `S9 (router, only if the S9 gate check indicts route.ts)` → `S8 and S6 hardening alongside`.
S4 before S3 pushes users toward coordinate-fighting. S9 before S4 means building the router twice.

### Adversarial summary — the three ways this report could be wrong
1. **I may be over-weighting S4.** Its value depends on MV users actually wanting to hand-place
   symbols. If the auto-layout is good enough that nobody moves anything, the placement store is
   infrastructure for a workflow that does not exist. The cheap test is to ask before building:
   does the owner's SLD verdict (gate B-02) ever come back as "wrong position" rather than "wrong
   drawing"? If always the latter, S4 drops from P0 to P2 and S3 alone may suffice.
2. **S5's benefit assumes focus mode is wanted for reading, not for performance.** If the real driver
   is `PERF-SC-50` render time, a neighbourhood filter helps the symptom while the actual cost may be
   elsewhere; that would be treating a modelling feature as a performance fix and would leave the
   performance problem intact.
3. **The whole report treats PowSyBl as authoritative on projection because it is mature and widely
   used.** It is mature — but its SLD exists to draw *transmission* substations from a model with no
   bay concept, and two of its own subsystems (NAD ids, the limit style provider) are weaker than
   MV's equivalents. Where I recommend adoption I have tried to say which specific property is worth
   having; where the donor is worse than MV I have said so (S1 NAD ids, S2 cell detection, S6
   threshold evaluation, S8 four anti-patterns). If a reader takes "PowSyBl is the industrial
   reference" as blanket endorsement, this report has failed at its job.
