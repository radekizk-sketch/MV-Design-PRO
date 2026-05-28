No `MV-DESIGN-PRO` source tree is present in the working directory, so this review is based on the spec/behaviors you described in the brief — not on a running build or codebase. Where a recommendation depends on something I can't verify from the brief, I mark it **exploratory**.

# Summary of top UX risks

1. **Implicit station placement vs. implicit section split** — without a strict separation, a click on an existing section can mean "place a station here" OR "split this section," producing silent topology changes the user didn't intend. This is the single biggest correctness-affecting risk.
2. **Forced/arbitrary line lengths** — if the tool requires a length on creation, designers either invent values or stop trusting downstream calculations. Length should be derivable from geometry + a "definitive length" override field that is clearly labeled as authoritative for solver input.
3. **Stale calculation state is invisible** — after topology edits, it is unclear whether the displayed losses, voltages, and protection coordination are current. Operators may justify reports against stale numbers.
4. **LOD that drops electrically meaningful elements** (open/closed switch state, transformer vector group, DER injection points) before it drops decorative ones (free text, dimension lines). At medium zoom this misleads.
5. **Mixed-language labels** (Polish UI with English engineering tokens) — increases reading time, breaks search, and creates audit ambiguity.
6. **Right-click / double-click overload** — likely the same object exposes "edit," "split," "insert," "properties" through near-identical gestures, which is a known source of accidental edits in CAD/SCADA tools.
7. **Readiness, protection, and report sections feel like separate apps** — designers lose track of which prerequisites block the next stage.

# Must-fix issues

**M1. Separate "place station at endpoint" from "split existing section."**
- Default click while drawing a run → station goes on the **endpoint of the current section**, and the run continues *from the station's outgoing port*. No length prompt.
- Splitting a section is an explicit command (`Podziel sekcję` / toolbar + `Ctrl+Shift+S` exploratory) with: ghost preview of the new node, lengths on both sides, station insertion option, **Anuluj / Zatwierdź**, and an audit entry (`who/when/from-to`).
- Acceptance: clicking on an existing energized section in draw mode must never silently insert a node.

**M2. Remove forced length entry on line creation.**
- Geometric length is computed; an optional `Długość rzeczywista` field overrides it and is visually marked as "authoritative for calculations" (badge `L*`).
- Acceptance: a designer can draw GPZ → station → station without typing any number.

**M3. Persistent "calculation freshness" indicator.**
- Top-bar chip: `Obliczenia: aktualne` (green) / `nieaktualne — zmieniono topologię` (amber, with diff count) / `błąd` (red).
- Reports refuse to export while amber/red unless the user explicitly acknowledges via a checkbox in the export dialog (logged).
- Acceptance: any topology, impedance, or DER change flips the chip to amber within one frame.

**M4. Lock LOD tiers to electrical meaning, not visual density.**
- Tier 1 (overview): GPZ, feeders, station nodes, open points, DER presence.
- Tier 2 (planning): + switch state, transformer SN/uk, cable type code.
- Tier 3 (engineering): + bend points, port labels, protection device IDs, justification anchors.
- Switch state, open points, and DER must **never** disappear at any LOD.
- Acceptance: at every zoom level, an open switch on a ring is visually distinguishable from a closed one without hovering.

**M5. Normalize interaction grammar across all canvas objects.**
- `Hover` = identify (tooltip, port highlight). `Click` = select. `Double-click` = open properties. `Right-click` = context menu. `Drag` = move/route. Drawing tools are entered from the toolbar/keyboard, not by "click into empty space."
- Acceptance: a recorded session of 20 randomized canvas actions produces no accidental edits.

**M6. Polonize active labels consistently.**
- Build a single glossary; flag mixed tokens in CI. E.g. `GPZ`, `Pole SN`, `Stacja`, `Odcinek`, `Rozgałęzienie`, `Źródło OZE`, `Gotowość`, `Obliczenia`, `Zabezpieczenia`, `Uzasadnienie inżynierskie`, `Raport`.
- Acceptance: no English engineering token appears in the active UI outside developer/debug views.

**M7. Linear workflow stepper for the project lifecycle.**
- Top stepper: `Projekt → GPZ → Pola SN → Trasa/Stacje → DER → Gotowość → Obliczenia → Zabezpieczenia → Uzasadnienie → Raport`. Each step shows: not-started / in-progress / blocked / ready.
- Steps remain reachable in any order (engineers are non-linear), but `Raport` is gated on `Gotowość = OK` AND `Obliczenia = aktualne`.

# Suggested flow improvements

**F1. Network-building flow (alternative A — recommended).**
1. From toolbar pick `Rysuj odcinek` (or `L`).
2. Click GPZ outgoing port → cursor enters "active run" with breadcrumb showing distance, accumulated length, and `Esc` to drop, `Enter` to commit.
3. Click an empty point → bend point. Click a station glyph in the catalog rail or press `S` → place station at endpoint; run continues from station's next port (operator can pick port if station has >1 outgoing).
4. To stop without a station: `Esc` or click `Zakończ trasę`.
- Testable: median strokes to draw GPZ → 3 stations → ring ≤ N (set baseline, then track).

**F2. Splitting an existing section (alternative B — explicit).**
1. Select an existing section → `Podziel…` in context menu.
2. Dialog/inline overlay shows: ghost node, drag handle along the polyline, computed lengths each side, optional `Wstaw stację` checkbox.
3. `Anuluj` discards; `Zatwierdź` commits and writes an audit row.
- Testable: cancel must leave geometry, IDs, and calculation freshness untouched (bit-identical state).

**F3. DER and protection coordination as filtered overlays, not separate views.**
- Toggle `Widok DER` shades injection points and shows reverse-flow indicators on edges (exploratory: arrow-fill density mapped to expected reverse-power magnitude).
- Toggle `Widok zabezpieczeń` shows relay zones, selectivity arrows, and conflicts. Stays on the same canvas — designers must see DER and protection together because that's where most coordination errors are caught.

# Screen/component-level recommendations

**Project creation.**
- Single-screen form, not a wizard, with required fields gated. After save, deep-link straight into the GPZ step.
- Don't pre-create a "default GPZ" — empty state should explicitly say "Brak GPZ — dodaj pierwszy" with a primary CTA.

**GPZ configuration.**
- Tabbed inline editor (Dane / Pola SN / Schemat). Show busbar topology preview live as the user edits.
- Validate `SN` field count against the chosen busbar scheme; show inline error, not a modal.

**SN fields panel.**
- Table with sticky header, keyboard navigation (`Tab`/`Shift+Tab`), inline edit, `Ctrl+D` duplicate row. Bulk actions must require selection (no "apply to all" hidden behind a single icon).

**Stations.**
- Properties panel: identity (name, ID, type), electrical (SN, uk, vector group), location, ports. Ports list must show direction and connected section ID — operators currently waste time hunting for what's connected.

**Calculations.**
- Result panels (voltages, losses, short-circuit, protection margins) should each show the calculation timestamp and input hash so the operator can detect divergence between panels.

**Reports.**
- Pre-export checklist visible in the same view (not a separate modal): readiness, calculation freshness, justification coverage, missing labels. Each item links to the offending element.

**Justification (`Uzasadnienie inżynierskie`).**
- Anchored to the element it justifies (station, section, protection setting). Anchor must survive renames; if the anchored element is deleted, the justification turns into a flagged orphan, not silent loss.

# SLD/CAD/LOD recommendations

**SLD readability.**
- Always render: feeder identity color, open-point markers (the universal `||` or industry-equivalent), DER injection arrow, transformer symbol with vector group at Tier 2+.
- Distinguish normal-open vs normal-closed switches by **shape**, not just color — required for accessibility (deuteranopia).
- Bend points only visible at Tier 3 or when the section is selected.

**Routing / labels.**
- Auto-routing should respect manual bend points (don't re-route a user-placed corner on a redraw). When auto-routing overrides a user bend, show a non-blocking toast: `Przebieg odcinka został zoptymalizowany — Cofnij`.
- Labels should auto-de-collide; manual label position survives layout changes (sticky offset relative to its anchor).

**CAD ergonomics.**
- `Space + drag` to pan; middle-mouse pan; `Ctrl+wheel` zoom-to-cursor (not zoom-to-center). `F` to fit selection. `G` toggles grid. `Shift` while drawing constrains to ortho.
- Snap: port magnet has higher priority than grid; show snap-source (small badge near cursor: `port` / `siatka` / `bend`).
- Selection: rubber-band selects only what is fully contained by default; `Alt+rubber-band` selects what is intersected. Don't change the default mid-session.

**LOD specifics.**
- Define LOD by **what an engineer needs to decide at that zoom**, not pixel budget. Write the tier table into the spec; review with two protection engineers before locking.
- At any LOD, hover on any aggregated cluster (e.g., a collapsed branch) must reveal its identity and member count without zooming in.

# Testable acceptance criteria

1. **Station-on-endpoint:** Given an active run terminating on an empty point, when the user presses `S` (or picks station from rail), then a station is placed at that endpoint and the next section starts from the station's port. No length dialog appears.
2. **Section split is explicit:** No interaction on an existing section other than `Podziel…` from the context menu / palette inserts a node. Automated UI test: 200 random clicks on existing sections produce 0 topology changes.
3. **Calculation freshness:** Any change to topology, impedance, or DER flips the freshness chip to `nieaktualne` within ≤ 100 ms. Reports refuse to export while non-current unless the user ticks `Eksportuj mimo nieaktualnych obliczeń` (the choice is logged).
4. **LOD invariants:** At all LOD tiers, snapshot tests confirm visibility of: open/closed switch state, DER markers, GPZ feeder identity.
5. **Interaction grammar:** Hover/click/double-click/right-click behave per the table in M5 across all canvas object types — verified by a per-type matrix test.
6. **Polish labels:** Lint passes the glossary check; CI fails on any English engineering token in active UI strings.
7. **Workflow gating:** `Raport` button is disabled with a tooltip listing missing prerequisites until all gates pass.
8. **Audit on split:** Each split commit writes `{user, timestamp, sectionId, beforeLength, afterLengthA, afterLengthB, stationInserted}` to the project audit log.
9. **Undo safety:** `Ctrl+Z` reverses the last topology mutation (place, split, route change, delete) to byte-identical state.
10. **Justification orphan handling:** Deleting a justified element produces a visible `Osierocone uzasadnienie` entry rather than data loss.

# Risks and trade-offs

- **Strict explicit-split** adds a step compared to "click-to-split." Trade-off accepted: correctness > speed for shared topology.
- **Calculation-freshness gate** can frustrate report exporters during exploratory work. Mitigation: explicit override + audit, not removal of the gate.
- **Auto-routing that preserves manual bends** means more state to persist and migrate. Trade-off accepted: predictable layout > simpler internals.
- **Linear workflow stepper** can imply a forced order. Mitigation: stepper is a status/jump bar, not a wizard; engineers can still work non-linearly.
- **Glossary enforcement in CI** will flag legacy strings during migration. Mitigation: per-screen migration plan with a temporary allowlist that shrinks over time.

# What not to change

- ENM/domain topology model — keep as the source of truth; the UI must not denormalize.
- Solver, load flow, short-circuit, and protection coordination logic.
- Electrical semantics of symbols (open-point notation, transformer vector group, busbar coupler representation).
- Hard validation rules from the domain (e.g., a feeder cannot have two upstream sources without an explicit ring/loop scheme).
- Audit trail completeness — never trade audit fidelity for UI smoothness.
- Polish engineering terminology used in regulated reports.

# Recommended follow-up tests

1. **Cognitive walkthrough** with 2 MV designers + 1 protection engineer on the spec'd network-building flow (`F1`) before implementation — measure step count, hesitation, recovery from mistakes.
2. **Diary study (1–2 weeks)** across an OSD team focused on where calculation re-runs happen vs. where users *think* they happen — validates M3 chip placement.
3. **Eye-tracking or click-heat session** on the SLD at each LOD tier to confirm electrically meaningful elements are seen first.
4. **A/B on split-vs-place interaction** comparing implicit-on-click vs. explicit-`Podziel…`. Measure unintended topology mutations per 100 sessions. Pre-register the threshold.
5. **Accessibility audit**: color-vision simulation on the canvas (deuteranopia, protanopia, tritanopia) — confirms switch state, DER, and freshness chip remain distinguishable.
6. **Localization audit** of every active label by a Polish-speaking power engineer; flag any non-domain phrasing.
7. **Stress test** of large projects (10k+ sections, 500+ stations) for LOD transitions and selection latency — UX recommendations only land if the canvas stays responsive.
8. **Audit-log review drill**: hand an auditor a project with three intentional splits and one delete; can they reconstruct the change sequence using only the audit view? (Exploratory but high-value.)

