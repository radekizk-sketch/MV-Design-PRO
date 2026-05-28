Note up front: I'm reviewing against the description you provided, not against live screens. Recommendations marked **[exploratory]** assume things about the current UI I cannot verify; the rest are testable against any build.

# Summary of top UX risks

1. **Mode ambiguity on the canvas.** Drawing, editing, and splitting likely share the same pointer affordance. With MV topology, mistaking "split section here" for "place station at endpoint" is an audit-grade error, not a cosmetic one.
2. **Forced numeric input interrupts gestural drawing.** Any modal that demands a line length before the segment is committed will push users to type "100" repeatedly and lie to the model. This corrupts downstream cable losses and protection coordination.
3. **Section split has the same blast radius as a structural edit but feels like a click.** Without preview/cancel/commit and an audit trail, ENM topology drift becomes invisible.
4. **LOD that hides electrical meaning at typical working zoom.** Switchgear, open points (Q-otwarty), earthing, and protection symbols disappear at the zoom level designers actually pan around at.
5. **Right-click-only paths to engineering actions.** Discoverability for new OSD engineers collapses; keyboard accessibility for audit reviewers collapses.
6. **Overloaded property panel.** GPZ + SN + cable + DER + protection parameters in one stacked inspector trains users to scroll-and-guess.
7. **Polish label drift.** Mixing "stacja" / "Stacja" / "STACJA" or "GPZ" vs "Główny Punkt Zasilania" across screens silently raises cognitive load for protection engineers who scan labels rather than read them.
8. **Readiness ("gotowość") as a hidden state.** If readiness blocks calculations but is shown only as a small badge, users repeatedly hit "Oblicz" and get rejected without knowing why.

# Must-fix issues

- **M1. Default segment commit must not require length.** Drawing a section terminates on click; length is derived from geometry × scale. A length override is an explicit, optional field in the inspector — never a blocking modal.
- **M2. Station-at-endpoint is the default terminator.** Clicking on empty canvas at the end of an active run inserts a station node and re-arms the run from that station's outgoing port. No additional menu step.
- **M3. Split-section is a named, explicit tool** (e.g. `Podziel sekcję`) with: hover preview of split point with electrical attributes inherited to both halves, before/after summary panel, Cancel / Zatwierdź, and an immutable entry in the audit log (who, when, original section ID, two child IDs).
- **M4. Open points, earthing, and protection devices must remain visible at every LOD where the topology itself is visible.** Labels can drop; symbols cannot.
- **M5. Every action reachable from right-click must also be reachable from the ribbon/toolbar and a keyboard shortcut.** Right-click is a power-user accelerator, not a sole entry point.
- **M6. Undo/redo must cover graph mutations** (placement, splits, deletes, port reconnects, DER attach) and protection parameter edits, with a visible history. Anything that mutates ENM topology without an undo entry is a defect.
- **M7. Selection model must be unambiguous.** Single click = select; double-click = open inspector / edit primary attribute; hover = transient highlight + tooltip with ID, type, and current state (Z/O for switches, kierunek for feeders). Selection survives pan/zoom; it does not survive tool change unless the tool operates on the selection.
- **M8. Readiness gate must be diagnostic, not binary.** If `Oblicz` is disabled, the button (or an adjacent panel) lists the missing inputs by name with a click-to-jump link to the offending field.
- **M9. Polish label inventory is normalized.** Single source of truth for terms (Stacja, Sekcja, Odcinek, Pole, Łącznik, Wyłącznik, Odłącznik, Rozłącznik, GPZ, SN, DER, Nastawa, Zabezpieczenie). No abbreviation appears without its expansion in a tooltip on first encounter per session.
- **M10. Destructive actions require typed or two-step confirmation** only when they break topology or invalidate computed results (delete station that anchors a feeder, change GPZ type, re-parent a branch). Routine deletes use a toast with Cofnij.

# Suggested flow improvements

**Flow A — Continuous run with station-at-endpoint (replaces "draw + dialog + place").**
Tool: `Prowadź linię`. Click a source port → mouse moves draw a rubber-band aligned to snap/ortho → click on empty canvas commits a segment **and** inserts a station node at the endpoint by default → run re-arms from that station's downstream port → `Esc` ends the run; `Enter` ends and opens the inspector for the last station. Modifier: hold `Shift` while clicking to commit a bare bend point instead of a station (for routing without electrical meaning). Modifier: hold `Alt` to commit on an existing element and snap to its nearest free port. **Length is never prompted.**

**Flow B — Explicit Split with preview.**
Tool: `Podziel sekcję` (T or menu). Hover over an existing section shows a ghost split marker tracking the cursor with snap to nearest pole/distance increment; a side panel shows: parent section ID, proposed child A (length, R, X, type), child B, inherited attributes, attached devices reassigned to which child. `Zatwierdź` writes the split and pushes one audit entry; `Anuluj` discards. Splits while the calc results are stale automatically mark results as `Nieaktualne`.

**Flow C — Inspector-as-form, canvas-as-truth.**
Instead of one tall property panel, the inspector becomes a tabbed, role-aware form: `Identyfikacja`, `Elektryczne`, `Zabezpieczenia`, `DER`, `Audyt`. Tabs that are not applicable to the selected element are hidden, not greyed. Calculated fields are visually distinct from input fields (different background, lock icon, "obliczone" badge). This reduces the scroll-and-guess pattern.

# Screen/component-level recommendations

- **Project tree (lewa kolumna).** Group by GPZ → Pole → Linia → Sekcja → Stacja. Each node shows: ID, status badge (Robocza / Gotowa / Zatwierdzona), and a "stale results" dot when topology changed since last calc. Right-click parity with ribbon. Keyboard: arrow keys to navigate, `Enter` to focus on canvas with that element centered and selected.
- **Ribbon / toolbar.** Group tools by phase: `Topologia` (rysuj, stacja, podziel, połącz, usuń), `Urządzenia` (łączniki, zabezpieczenia, DER), `Obliczenia`, `Raport`. Active tool is shown with a sticky badge near the cursor (`Prowadzę linię`, `Dzielę sekcję`) — kills mode ambiguity.
- **Inspector.** Tabbed as in Flow C. Inputs validate inline with units in the field suffix (`mm²`, `A`, `kV`, `m`, `Ω/km`). Required-for-calc fields carry a small dot; on calc rejection, the dot turns red and Tab-key navigates between unresolved ones.
- **Status bar.** Pointer position in scene units; current snap target ("snap: port wyjściowy GPZ-3 Pole 7"); current LOD; warnings count clickable to open a docked panel.
- **Warnings/errors panel (dół).** Sortable, filterable. Each row links bidirectionally with a canvas element (click row → flash + center; click element → row highlights).
- **Calc results panel.** Pinned to the right when a calc completes; freshness badge (`Aktualne` / `Nieaktualne — zmieniono topologię o 14:32`); never silently overwritten — stale runs are kept until user confirms replacement.
- **Report builder.** Section toggles map 1:1 to deliverables the audit reviewer signs. Preview must paginate identically to export. No "what you see is not what you get" gap.

# SLD/CAD/LOD recommendations

- **LOD tiering (testable).**
  - LOD-0 (very far): GPZ icons, main feeders as thick polylines, no labels.
  - LOD-1: + stations, open points, normally-open switches highlighted (e.g. red outline), feeder IDs.
  - LOD-2: + section labels, lengths, conductor types.
  - LOD-3: + protection devices, settings hints, DER markers, phasing.
  - **Rule:** an element that affects power path direction (open point, normally-open switch, tie point) is never hidden at any LOD where the conductor it sits on is drawn. Labels may drop; symbols cannot.
- **Power path readability.** Normally-open switches need a visual contract distinct from closed ones at all zooms (shape, not just color — accessibility). Direction of feed shown by either arrow glyphs on energized segments or subtle gradient; do not rely on color alone.
- **Snap & ports.** Port magnets activate within a zoom-invariant pixel radius (e.g. 12 px). Visual: port glows when in range; tooltip shows port name and whether it is free. Snapping to an occupied port is rejected with a non-modal toast, never silently re-routed.
- **Routing.** Orthogonal default, freehand on `Shift`. Bend points are draggable but never auto-insert during routing without a visible preview ghost. Auto-cleanup of co-linear bend points on commit, with undo.
- **Selection on dense areas.** When clicking where multiple elements overlap within snap radius, surface a small disambiguator chip listing candidates with type + ID; do not "pick the topmost" silently.
- **Labels.** Collision-aware leader lines; user can pin a label position and that pin survives LOD changes. Never reflow labels during pan.
- **Grid & units.** Grid is informational, not snap-binding by default; snapping respects ports and pole positions, not grid intersections. Scale bar always visible.
- **Color.** Reserve red strictly for "abnormal state" (otwarty łącznik normalnie zamknięty, alarm, błąd nastaw). Don't use red for selection or hover.

# Testable acceptance criteria

1. Drawing 10 consecutive segments using Flow A produces 10 segments + 10 stations with no modal dialog opened and no length field touched.
2. With one section selected, invoking `Podziel sekcję` and clicking at midpoint produces exactly one audit entry, two child sections whose summed length equals parent ±0.01 m, and inherited electrical attributes match the inheritance rules table.
3. For every right-click menu item, a keyboard shortcut and a ribbon entry exist; automated UI test enumerates the right-click menu and asserts coverage.
4. At LOD-0, all normally-open switches present in the dataset are still rendered as distinct shapes (not merely tinted).
5. Clicking `Oblicz` while readiness is incomplete opens (or highlights) a panel listing every missing required field, each with a working "Przejdź do" link.
6. Undo restores topology + inspector field values + selection state for the last 50 operations in a session, including splits.
7. Closing the app with unsaved topology changes triggers a save/discard/cancel prompt; "Anuluj" returns to the exact prior state including selection.
8. Color-only state cues fail a deuteranopia simulation test for at least one alternate cue (shape or pattern).
9. Polish label inventory: a build-time check fails if any UI string is not present in the canonical glossary file.
10. After splitting a section while calc results exist, the results panel shows `Nieaktualne` within one frame; export-to-report refuses to attach stale results without explicit user override + signed note.

# Risks and trade-offs

- **Station-at-endpoint as default** speeds drawing but increases the chance of unintended stations on quick exploratory sketches. Mitigation: `Shift` modifier for bare bend point, and a session-level toggle for users who prefer "bare nodes by default."
- **Explicit split tool** adds one tool button and one ceremony step. Cost is real; the alternative (silent splits) is worse for audit.
- **Diagnostic readiness gate** requires every required field to declare its calc dependency. Initial wiring cost is non-trivial but it is a one-time schema task and pays off in support load.
- **Tabbed inspector** hides fields that some power users currently scan in one column. Mitigate with a `Pokaż wszystko` flat view as an opt-in.
- **Stricter color semantics** may require relabeling existing selection/hover styles; review brand and theme contracts before changing.

# What not to change

- ENM-based topology model and the identity of GPZ / Pole / Sekcja / Stacja / Łącznik objects.
- Solver inputs, physics, and the electrical meaning of each parameter.
- Protection logic, coordination rules, and any nastawy defaults.
- The rule that the SLD is an electrical document, not a free-form diagram: do not introduce "decorative" nodes that are not electrically real.
- Polish as the active UI language and the engineering register of labels.
- Audit immutability: do not let any UX shortcut bypass the audit log for topology changes, protection edits, or report sign-off.
- Length is derived from geometry × scale, not invented; never reintroduce a mandatory length modal.

# Recommended follow-up tests

- **Task-based usability test (n≥6 per persona).** Tasks: build a 6-station feeder with one tie point; split an existing section near a DER; configure a new pole and run readiness; produce a sign-off report. Measure: time, error count, recovery time, number of "where do I click" pauses ≥3 s.
- **Discoverability audit.** New OSD engineer, no training, 20 min: how many of the 12 core actions can they find without right-clicking? Target ≥10.
- **Audit-trail integrity test.** Scripted session performs N topology mutations including 5 splits; export audit; assert 1:1 mapping and idempotent replay.
- **LOD legibility test.** Static screenshots at 4 zoom levels shown to protection engineers; they identify normally-open switches and feed direction. Target ≥95% correct at LOD-1 and above.
- **Color-vision test.** Run the canvas through deuteranopia/protanopia simulators; verify state cues remain distinguishable.
- **Performance test on realistic graph.** ≥2000 elements: pan/zoom must stay above 30 fps; selection latency <100 ms; calc rerun and result rebinding without freezing the UI thread.
- **Locale + truncation test.** Longest Polish labels in every component at minimum supported window width; nothing truncates without a tooltip.
- **Recovery test.** Force-kill mid-edit and reopen; expect autosave restore point ≤2 min old plus an explicit "przywróć / odrzuć" choice.

**[exploratory]** If the current build already uses a command palette, expanding it to cover all ribbon actions (`Ctrl+K`) would likely outperform any right-click redesign for experienced users — worth one prototype round before committing to the ribbon-heavy direction.

