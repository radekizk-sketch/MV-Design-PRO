# Summary of top UX risks

1. **Forced section length during network build** — users must commit to an arbitrary line length before placing the next station, breaking the natural "draw to where the station is" mental model and producing throwaway geometry that pollutes audit history.
2. **Conflation of "place station at endpoint" vs "split existing section"** — both currently feel like the same gesture, so a designer who wanted to extend the run risks silently cutting an approved section (high-cost error: changes branch IDs, breaks downstream protection settings).
3. **SLD/CAD mode ambiguity** — the same canvas is asked to serve geographic-ish layout and electrical schematic reading; without an explicit mode indicator users misread topology vs geometry.
4. **LOD hides electrically meaningful elements** at zoom levels where the user still needs them (e.g., disconnectors, fuse type, neutral treatment), instead of hiding only decorative labels.
5. **Hidden state in calculations/readiness** — "Gotowość", "Obliczenia", "Zabezpieczenia" can be stale relative to the current topology with no visible "dirty" indicator, leading to reports generated from out-of-date results.
6. **Right-click and double-click contracts are inconsistent** across stations, sections, branches, and DER — designers cannot form a reliable muscle memory.
7. **Polish engineering labels mixed with generic CAD verbs** ("Split", "Snap") in some menus — breaks scanning for OSD/protection engineers.

# Must-fix issues

- **M1. Endpoint-first placement is the default.** Single click on the current section's free endpoint → "Wstaw stację w końcu odcinka" places station, then continuation tool stays armed so the next click extends the run. No forced length. Testable: average clicks to place 3 stations in a run ≤ 6.
- **M2. Section split is a separate explicit command.** Available via right-click on a section midpoint and via toolbar ("Podziel odcinek"). Must show: ghost preview of the two resulting sections with new IDs, length distribution, affected protection zones; require explicit "Zatwierdź podział" / "Anuluj"; write an audit entry on commit.
- **M3. Topology-changed indicator.** Any structural edit marks dependent panels (Obliczenia, Zabezpieczenia, Raport, Gotowość) with a visible "nieaktualne" badge and disables "Generuj raport" until recalculated, or warns with a confirm-and-stamp dialog.
- **M4. Selection scope is unambiguous.** Click selects the element under cursor; only the highlighted element is acted on. No invisible parent selection. Selected element type is shown in the status bar ("Wybrano: Odcinek SN  •  ID 12  •  L=420 m").
- **M5. Destructive operations always reversible within session.** Delete, split, reroute, and "Przenieś stację" go through the undo stack with a labeled entry ("Cofnij: podział odcinka").
- **M6. SLD must always show breakers, disconnectors, fuses, earthing, and neutral treatment regardless of LOD.** Only labels/annotations and decorative geometry hide at lower LOD.
- **M7. Keyboard escape contract.** `Esc` cancels the active tool in one press, returns to selection tool, and never deletes already-placed elements. `Enter` commits a multi-step operation (split, route).
- **M8. Snap and port magnets are toggleable and visible.** Status bar shows current snap state; F9 toggles grid snap, F3 toggles port magnets, with on-screen toast on change.

# Suggested flow improvements

**Flow A — Continuous run with station-at-endpoint (replaces forced-length flow).**
1. User picks "Prowadź linię SN" from "Stacje i odcinki SN".
2. Click on GPZ port → rubber-band section follows cursor with live length readout.
3. Click on empty canvas → places a vertex (bend point), continues rubber-band.
4. Click an existing station port → snaps and terminates section.
5. Press `S` while rubber-banding → places a new station at the cursor, terminates current section at the station's port, and re-arms the tool to continue from the station's opposite port.
6. `Esc` ends the run; `Enter` ends and opens "Parametry odcinka".
Testable: build a 5-station radial feeder without opening any modal dialog.

**Flow B — Explicit section split with preview.**
1. Right-click section → "Podziel odcinek…".
2. Cursor shows ghost split marker that snaps to grid / to a percentage / to a measured distance from either end (input field).
3. Preview panel shows: ID-A / ID-B, L-A / L-B, affected protections, affected calculation cases.
4. "Podgląd" / "Zatwierdź podział" / "Anuluj". Commit writes audit record with user, timestamp, old/new IDs, parameter inheritance rule.

**Flow C — Reattach vs reroute.**
- Dragging a station should move it along the run with sections elastically following (reroute), not detach the station. Detach is a separate "Odłącz stację" command with confirmation, because it has electrical consequences.

# Screen/component-level recommendations

- **Project tree / left panel:** group strictly by ENM hierarchy (Projekt → GPZ → Pole SN → Wyprowadzenie → Odcinki/Stacje/DER). One node = one electrical object. Show object ID and a status dot (OK / niekompletne / błąd walidacji).
- **Properties panel (right):** sticky header with object type and ID; sections collapsible; numeric fields show unit suffix in the input, not the label, to keep tab-stops compact. Validation errors are inline and reference the rule, not just "invalid".
- **Toolbar:** group by verb family — *Buduj* (linia, stacja, odgałęzienie, DER), *Modyfikuj* (podziel, połącz, przenieś, odłącz), *Analiza* (obliczenia, zabezpieczenia, gotowość), *Raport*. Each tool has a tooltip showing label + shortcut + 1-line description.
- **Status bar:** cursor coordinates, current snap mode, current LOD, selected element summary, topology-dirty flag.
- **Calculation/Readiness panels:** show "ostatnio policzono o HH:MM dla wersji topologii #N"; a red banner if topology version has advanced.
- **Reports:** disable export when topology is dirty; if user overrides, the PDF must stamp "Raport wygenerowany z nieaktualnych obliczeń" — non-removable.
- **Modal dialogs:** never use them for routine geometric edits. Reserve modals for irreversible or cross-cutting actions (commit split, delete station with downstream sections, change GPZ).

# SLD/CAD/LOD recommendations

- **Two explicit views, one model.** Add a tab/toggle between "Widok geograficzny" and "Widok schematu (SLD)". Selection, IDs, and edits are synchronized; only layout differs. Users currently guessing which they're in is a major error source.
- **LOD policy:** electrical symbols (wyłącznik, odłącznik, rozłącznik, bezpiecznik, uziemnik, transformator, DER) never disappear with zoom. Hide only: section length labels, cable type codes, coordinates, annotations, secondary IDs. Provide a 3-step LOD slider with named levels ("Pełny", "Inżynierski", "Przegląd") rather than continuous fade.
- **Power-path clarity in SLD:** enforce orthogonal routing with 90° bends in schematic view; source (GPZ) always on the left or top; radial branches downstream; loops shown with a distinct return-path style. Color the energized path from source on hover-over a node.
- **Port magnets:** every station has named ports (Pole 1, Pole 2, Sekcja A/B). When rubber-banding, ports highlight at ≤ 20 px and the magnetized port shows its label. Connecting to the wrong busbar section is one of the highest-cost mistakes — magnet snap must show *which* busbar it will land on before commit.
- **Bend points:** double-click a section to add a bend point; drag to move; right-click a bend point → "Usuń wierzchołek". Bends carry no electrical meaning and must be visually distinct from real nodes (small hollow square vs filled symbol).
- **Selection safety:** click on whitespace inside a station's bounding box should not select the station — only clicking on the station's symbol or label. Prevents accidental drags of the whole station when the user meant to pan.
- **Pan/zoom contract:** middle-mouse or space+drag = pan; scroll = zoom-to-cursor; `0` = fit; `1` = 1:1; `F` = fit selection. Document on a discoverable "Skróty klawiszowe" panel.
- **Branches and DER:** branches inherit visual weight from parent feeder; DER symbols always show direction-of-flow arrow when calculation results are current, greyed out when stale.

# Testable acceptance criteria

1. A new user can build a 5-station radial feeder from GPZ in ≤ 90 seconds with no modal dialogs and no throwaway sections in the audit log.
2. Splitting a section never occurs without a preview screen and explicit "Zatwierdź".
3. After any topology edit, the readiness/calc/report panels show "nieaktualne" within 300 ms.
4. Generating a report from a dirty topology is either blocked or stamps the PDF — verified by snapshot test on the export.
5. `Esc` from any build tool returns to selection without removing placed elements (10/10 trials).
6. At minimum LOD ("Przegląd"), all of {wyłącznik, odłącznik, rozłącznik, bezpiecznik, uziemnik, transformator, DER} remain visible — verified by rendering test on a fixture network.
7. Right-click menu items are identical in label and order for the same object type across all screens.
8. Every destructive action appears in the undo stack with a labeled entry (audited via undo-log test).
9. Port magnetization preview names the target port and busbar section before click commits.
10. Geographic ↔ SLD toggle preserves selection and viewport focus on the selected object.

# Risks and trade-offs

- **Endpoint-first build changes muscle memory** for existing users. Mitigation: ship as a feature flag ("Tryb budowy: ciągły / klasyczny") for one release; collect telemetry on completion time and error rate before flipping the default.
- **Topology-dirty blocking of reports** may frustrate users in a hurry. Mitigation: allow override with the non-removable stamp, rather than a hard block.
- **LOD policy that keeps all electrical symbols visible** may crowd the canvas in very large networks. Mitigation: cluster identical adjacent symbols into a group symbol with a count badge at extreme zoom-out, but keep the cluster expandable.
- **Two views (geo / SLD) double the layout maintenance burden.** Mitigation: auto-generate the SLD layout from topology with manual override only where the engineer pins a node.
- **Split preview increases clicks** for users who split frequently. Mitigation: keep preview, but allow `Enter` to commit without mouse travel.

# What not to change

- ENM/domain topology as the source of truth for the SLD.
- Polish engineering terminology in active UI labels (do not anglicize "wyłącznik", "rozłącznik", "GPZ", "SN", "pole", "sekcja").
- Electrical semantics of station, section, branch, DER, busbar — visual changes must not collapse distinctions the solver or protection logic relies on.
- Solver physics, short-circuit calculation method, protection coordination logic.
- Audit trail format and immutability — UX improvements must write *more* audit entries (split, move, detach), never fewer.
- The requirement that section split is a separate, explicit, previewed operation.
- Domain-driven validation rules (e.g., neutral treatment, earthing requirements, allowed cable types per voltage level) — UI may surface them earlier but must not relax them.
- Polish report templates and their regulatory content.

# Recommended follow-up tests

1. **Moderated task test, n≥6 MV designers:** build a defined 8-station feeder with one tee branch and one DER. Measure time, error count, throwaway-geometry count, and SUS score. Compare classic vs endpoint-first build.
2. **Error-recovery test:** induce common mistakes (wrong port, accidental split, deleted station with downstream sections). Measure time-to-recover and whether the user discovers undo unaided.
3. **Protection-engineer review session:** show SLD at three LOD levels on a real 110/15 kV GPZ fixture. Ask whether protection-relevant elements are legible; flag any that disappear.
4. **Audit-log review with an OSD reviewer:** is every structural change traceable to a user/time/old-new-ID record? Are split/merge operations reconstructable from the log alone?
5. **Keyboard-only walkthrough:** can a designer build a small network without a mouse? (Accessibility + power-user check.)
6. **Stale-report regression test:** automated test that any topology edit invalidates calculation state and either blocks or stamps the next report export.
7. **Exploratory:** A/B test the geographic ↔ SLD toggle vs always-SLD on a cohort of new users — does the dual view reduce or increase misreading of topology?

