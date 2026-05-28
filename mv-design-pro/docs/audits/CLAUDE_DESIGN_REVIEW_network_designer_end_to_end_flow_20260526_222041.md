# Summary of top UX risks

1. **Network-build flow may force arbitrary line lengths** before the user knows where the next station belongs, producing dummy geometry that has to be cleaned up later — high rework cost.
2. **Ambiguity between "place station at endpoint of current section" and "split existing section"** — both are physically valid but semantically very different. Conflating them in one click corrupts audit history.
3. **Polish engineering vocabulary inconsistency** (GPZ, SN, pole, station, węzeł, odcinek, odgałęzienie) — if one label appears as both "linia" and "odcinek" or both "rozłącznik" and "łącznik", users mis-select equipment.
4. **LOD that hides electrical meaning** (e.g. collapses an open switch into a continuous line at zoomed-out scales) creates false confidence about energization state.
5. **Hidden state** for readiness, calculation freshness, protection coordination, and DER inclusion — users commit reports against stale solver output.
6. **Right-click / double-click / hover semantics** in CAD canvases are rarely documented in-product; if they differ between station, section, and node, error rate climbs sharply on long sessions.
7. **Reports/justification flow** sits at the end and is the most expensive step to redo — any upstream ambiguity gets amplified here.

# Must-fix issues

- **Default placement rule**: when a section is being drawn and the user inserts a station, the station must snap to the current section endpoint and the next section must continue from that station. No implicit length, no implicit midpoint split.
- **Split-section as a separate verb**: distinct toolbar entry / shortcut / right-click item labelled unambiguously (e.g. *Podziel odcinek w punkcie…*) with **preview → potwierdź → audytuj**. Must record: original section ID, split coordinate, two resulting section IDs, timestamp, user.
- **Stale-calc indicator**: every screen that reads solver output (loading, short-circuit, protections, readiness, raport) must display a freshness badge: *aktualne / nieaktualne — zmieniono X od ostatniego przeliczenia*. Disable "Generuj raport" while stale unless user explicitly overrides with a logged reason.
- **Energization/open-switch rendering**: open devices must remain visually distinct at every LOD. Never collapse an open switch into a continuous conductor.
- **Undo coverage**: every CAD edit, every parameter edit, every topology change must participate in one linear undo stack. Mixed undo stacks (canvas vs forms) are a known source of data loss.
- **Single source of truth for selection**: selecting an object in the SLD must select it in the property panel and tree, and vice versa, with no "ghost" selections.
- **Keyboard escape contract**: `Esc` cancels the current tool and returns to selection — always, from every modal sub-state. Confirm there is no state where `Esc` silently commits.
- **Label collisions on dense feeders**: when two labels overlap, neither must be silently hidden; use leader lines or a collision badge.

# Suggested flow improvements

**A. Section-then-station (default build mode)**
1. User picks *Rysuj linię* from GPZ output or last station.
2. Cursor shows live length; snap to grid/port.
3. Click to drop a vertex (bend point) or press `S` to drop a station at the current endpoint.
4. Station dialog opens inline (type, ID, optional template), `Enter` commits, run continues from the station's outgoing port.
*Removes the "I drew 200 m of nothing because I had to draw something before placing the station" anti-pattern.*

**B. Split-section (explicit, audited)**
1. Right-click on a section → *Podziel w punkcie…* (or `Ctrl+Shift+B`).
2. Hover preview of split point with snap to electrical landmarks (joint, midspan, distance from end).
3. Inline confirm panel shows: *Odcinek A: 142 m → A1: 87 m + A2: 55 m, nowy węzeł W-103*.
4. `Potwierdź` writes to audit log; `Anuluj` discards.
*Splits never happen as a side effect of placing equipment.*

**C. Readiness as a checklist, not a binary**
- Replace the single "Gotowe / Niegotowe" with a structured readiness panel:
  - Topologia (GPZ, pola SN, odcinki domknięte)
  - Parametry przewodów / typów stacji
  - DER zdefiniowane
  - Obliczenia aktualne
  - Nastawy zabezpieczeń skoordynowane
  - Uzasadnienie inżynierskie uzupełnione
- Each row links directly to the offending object. *Exploratory* but high-value.

# Screen/component-level recommendations

- **Project creation**: collect only what's needed to open the canvas (nazwa, GPZ źródłowe, napięcie znamionowe, jednostka projektowa). Defer everything else to in-context panels.
- **GPZ configuration**: separate *parametry zasilania* (Scc, U, Z) from *pola SN* (rozdział funkcjonalny). Today these are commonly mixed and overload the dialog.
- **Pole SN editor**: enforce one purpose per pole (zasilające / odpływowe / pomiarowe / sprzęgło). Validate on save, not on report.
- **Cable/line run editor**: surface *typ przewodu*, *przekrój*, *długość trasy*, *długość elektryczna*, *temperatura*, *ułożenie* in this order — matches the order an OSD engineer fills paper forms.
- **Station property panel**: show inbound/outbound port count, transformer SN, zabezpieczenia po stronie SN i nN, status uziemienia.
- **DER form**: type (PV, wiatr, CHP, magazyn), Pn, cos φ, kod przyłączenia, profil; mark DER with non-default protection settings.
- **Protections screen**: show coordination chart and trip curves side by side; never let user save settings that fail selectivity without a logged justification.
- **Reports screen**: previewable, paginated, with a "wstecz do źródła" link from every figure to the originating object.
- **Property panel**: collapse-by-default groups with state remembered per object type, not globally.
- **Status bar**: current tool, snap mode (siatka / port / koniec / środek), cursor coords in network units, selected count, stale-calc badge.

# SLD/CAD/LOD recommendations

- **LOD tiers (proposed, testable)**:
  - L0 (overview, zoom < 25%): GPZ + magistrale + stacje jako punkty kolorowane wg napięcia/stanu; otwarte łączniki **zawsze** widoczne jako symbol, nigdy ukryte.
  - L1 (25–100%): pełna topologia, etykiety stacji, brak parametrów przewodów.
  - L2 (>100%): pełne etykiety, przekroje, długości, oznaczenia zabezpieczeń.
- **Color must encode one thing per channel** — e.g. hue = napięcie znamionowe, nasycenie = obciążenie, obrys = stan łączeniowy. Document and stick to it.
- **Open vs closed switches**: distinct glyphs at every LOD (filled/empty, not just color — colorblind-safe).
- **Power-path emphasis**: hovering a load should highlight the energizing path back to source GPZ with a temporary overlay, dimming non-path elements. Removes guesswork about which feeder feeds what.
- **Pan**: middle-mouse drag and space-bar drag both supported. Document in status bar tooltip.
- **Zoom**: wheel = zoom to cursor (not to center). `Ctrl+0` = fit, `Ctrl+1` = 100%.
- **Grid**: visible at L1+, snap toggleable with `F9`. Snap state shown in status bar.
- **Port magnets**: snap radius constant in screen pixels, not network units, so it doesn't break at deep zoom.
- **Routing**: orthogonal by default, free-angle on `Shift`. Bend points draggable; deleting a bend point requires the resulting geometry to remain valid (no self-cross).
- **Selection**: single-click selects, `Shift+click` adds, `Ctrl+click` toggles, drag = rubber-band, `Alt+drag` = lasso. Right-click never changes selection unless the target was unselected.
- **Labels**: draggable with a leader line; double-click resets to default position; collisions resolved by deterministic priority (typ obiektu → ID), never randomly.

# Testable acceptance criteria

1. Drawing a section and pressing `S` places a station exactly at the current endpoint; the next click continues a new section from that station's outgoing port. No section of length 0 is created, no section is split.
2. Right-click on a section → *Podziel…* opens a preview; pressing `Esc` leaves the model unchanged; pressing `Potwierdź` writes one entry to the audit log containing original ID, split point, and two new IDs.
3. With any protection or load parameter changed, every screen reading solver output displays *nieaktualne* within one render frame; *Generuj raport* is disabled or requires explicit override.
4. At every zoom level from 5% to 800%, an open łącznik is visually distinguishable from a closed one without relying on hue alone (verifiable with a grayscale screenshot).
5. Selecting a load and pressing `P` (or menu *Pokaż ścieżkę zasilania*) highlights exactly the energized path to source; toggling off restores prior visibility.
6. `Esc` from any drawing or editing sub-mode returns to selection mode with no committed change.
7. Undoing the last 20 operations (mixed canvas + form edits) restores model byte-equality to the pre-edit state.
8. Selecting an object in the tree highlights the same and only the same object in the SLD and property panel.
9. Two labels closer than collision threshold are both rendered with leader lines; no label is silently hidden.
10. Saving a pole SN with mixed purpose (e.g. zasilające + pomiarowe without explicit override) blocks save and points to the offending field.

# Risks and trade-offs

- **Explicit split operation** adds one click vs current implicit behavior — acceptable cost, large correctness gain. Power users may want a keyboard shortcut to keep speed.
- **Stale-calc gating of reports** will frustrate users who want to print drafts. Mitigate with a clearly-labeled *Raport roboczy (dane nieaktualne)* watermark instead of a hard block, only for non-final reports.
- **LOD tiers** require re-tuning visual density; expect a transition period where experienced users complain about "missing" labels until they learn the new zoom levels.
- **Readiness checklist** can become a nag screen if rows are too granular. Calibrate against real projects.
- **Color recoding** breaks muscle memory; ship a one-time legend overlay on first launch after the change.

# What not to change

- **Electrical topology semantics** — sections, węzły, pola SN, GPZ structure must continue to mirror ENM/domain topology exactly.
- **Solver physics and protection coordination logic** — UX changes must not silently relax selectivity, short-circuit, or load-flow rules.
- **Polish engineering vocabulary** for active labels — do not translate or "simplify" terms like GPZ, pole SN, rozłącznik, odłącznik, odcinek, węzeł; these carry domain meaning.
- **Audit trail granularity for topology edits** — never coalesce split / merge / reroute into a single anonymous "edit" event.
- **Distinction between trasa (geometric route) and długość elektryczna** — keep both fields, do not auto-derive one from the other without explicit user action.
- **Open-switch visibility** at any LOD — never hide for the sake of cleanliness.
- **DER as first-class objects** — do not demote to a property of a station.

# Recommended follow-up tests

1. **Task-based usability test (n≥6 MV designers)**: build a feeder with 1 GPZ, 4 stations, 1 branch, 1 DER; measure time, error count, and number of unintended splits. Baseline vs proposed flow.
2. **Misclick audit**: instrument the canvas for 2 weeks; log every action followed by undo within 5 s — these are the real friction points.
3. **Grayscale LOD test**: render canonical projects at five zoom levels and ask protection engineers to identify open switches. Target ≥98% correct.
4. **Report-freshness compliance test**: seed projects with intentionally stale calcs; verify zero stale reports leave the system without an override entry in the audit log.
5. **Keyboard-only walk-through**: complete a full project without mouse except for canvas drawing; list every dead end. Exploratory but reveals hidden state.
6. **Vocabulary consistency sweep**: extract every visible string; cluster by domain concept; fix any concept with more than one active label.
7. **Split vs place-station discrimination test**: present 10 scenarios; user picks the correct verb. Target ≥95% on the new explicit affordances.

