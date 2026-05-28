# Summary of top UX risks

- **Cognitive overload at full network LOD**: showing GPZ → bay → cable head → main run → station → next segment → branch → DER/PCC/NMO simultaneously without progressive disclosure overwhelms operators on standard 1080p/1440p screens.
- **Ambiguous "active" state**: if the "active SLD" mode is not visually distinct from edit/draft/historical views, designers risk mis-attributing changes to the live network model.
- **Polish engineering label density**: long terms (e.g., *rozłącznik*, *odłącznik*, *odgałęzienie*, *przyłącze*) collide with symbols at mid-zoom, forcing constant pan/zoom.
- **Selection vs. trace confusion**: clicking a bay vs. tracing a feeder from GPZ to PCC likely shares the same gesture, causing accidental navigation.
- **DER/PCC/NMO glyphs competing with topology**: prosumer/DER markers can mask the main run direction at branch points.
- **No clear "you are here" along the main run**: operators lose orientation after 2–3 branch jumps.

# Must-fix issues

- **Distinct active-mode chrome**: persistent header band + canvas border color + watermark ("AKTYWNY SLD") that cannot be confused with edit/sandbox.
- **Lock destructive interactions behind explicit intent**: any topology-changing gesture in active view requires a mode switch, not just a click.
- **Hit-target sizing**: bays, cable heads, and ports must meet ≥24×24 px effective target even at fit-to-screen zoom; current CAD-style thin lines likely fail.
- **Label collision resolution**: implement leader lines + de-clutter at LOD thresholds; never let two labels overlap at default zoom.
- **Consistent symbology legend**: dockable legend pinned to canvas; today's operators reportedly memorize symbols — new hires can't.
- **Keyboard parity for pan/zoom/select/trace**: SCADA-grade tools must be fully operable without mouse for control-room ergonomics.

# Suggested flow improvements

- **Entry flow**: GPZ picker → feeder (ciąg główny) list → canvas centered on selected feeder with breadcrumb `GPZ Xxx / Pole 12 / Ciąg A / Stacja S-431`.
- **Trace flow**: single "Trasuj" toggle highlights upstream/downstream from selection; Esc clears.
- **Branch drill-down**: clicking an *odgałęzienie* collapses siblings and expands the branch in-place rather than re-centering.
- **DER/PCC inspection**: side panel opens on selection; canvas stays put (avoid context loss).
- **Search-first**: global search for station ID / PPE / cable ID jumps and highlights with animated focus ring.

# Screen/component-level recommendations

- **Top bar**: mode indicator (Aktywny / Projekt / Historia), GPZ + feeder selector, search, LOD slider, legend toggle.
- **Left rail**: hierarchical tree (GPZ → Pole → Ciąg → Stacja → Odgałęzienie); synchronizes with canvas selection bidirectionally.
- **Canvas**: orthogonal CAD routing, snap-to-grid, mini-map bottom-right showing viewport over full feeder.
- **Right panel**: properties for selected element (read-only in active mode); tabs for *Parametry / Powiązania / DER-PCC-NMO*.
- **Bottom status bar**: cursor coordinates, zoom %, current LOD tier, selection count, last sync timestamp.
- **Cable head/port component**: explicit port numbering visible at LOD-3+, hidden at LOD-1/2 to reduce noise.

# SLD/CAD/LOD recommendations

- **Three LOD tiers**:
  - **LOD-1 (overview)**: GPZ, main runs, stations as nodes, DER aggregated counts only.
  - **LOD-2 (feeder)**: bays, cable heads, stations with IDs, branches collapsed unless selected.
  - **LOD-3 (detail)**: ports, individual DER/PCC/NMO glyphs, full labels, segment lengths.
- **Auto-LOD on zoom** with manual override; persist user preference per session.
- **Orthogonal routing only** in active SLD (no diagonal connectors) — matches operator mental model from paper schematics.
- **Direction-of-flow markers** on main run, subdued on branches.
- **Color discipline**: reserve saturated colors for state (energized/de-energized/unknown if rendered) — do not use color for taxonomy of equipment types.
- **Print/export to A3 PDF** with title block — designers still hand schematics to field crews.

# Testable acceptance criteria

- Operator identifies active vs. project mode in <1 s on first exposure (≥95% success, n≥10).
- From GPZ selection to a named station 4 branches deep in ≤4 clicks and ≤15 s.
- At fit-to-feeder zoom, zero label overlaps across a benchmark feeder of ≥40 stations.
- All canvas operations reachable via keyboard; tab order documented.
- Hit targets ≥24 px at default zoom verified by automated layout test.
- Mini-map viewport rectangle accurate within ±2 px after pan/zoom.
- LOD transitions occur within 150 ms; no element pop-in flicker.
- Print export of a feeder fits A3 with legend, title block, and no clipped labels.

# Risks and trade-offs

- **Auto-LOD vs. designer control**: hiding ports at LOD-1/2 speeds reading but may hide what an experienced designer wants — mitigate with override.
- **Orthogonal-only routing** may produce ugly bends on dense branches; accept this for readability.
- **Single "active" mode chrome** consumes vertical space; trade pixels for safety.
- **Breadcrumb + tree + minimap** can feel redundant; redundancy is intentional for SCADA recovery from disorientation.
- **Polish label length**: abbreviations save space but risk inconsistency — agree on a canonical abbreviation table.

# What not to change

- Polish engineering terminology and symbol set (operator muscle memory).
- The set of entities shown (GPZ, bays, cable head/port, main run, station, next segment, branch, DER/PCC/NMO).
- Any electrical, protection, solver, or ENM-side behavior.
- Existing keyboard shortcuts already in muscle memory (audit before reassigning).
- Read-only nature of active SLD.

# Recommended follow-up tests

- Moderated think-aloud with 5–8 MV designers across junior/senior split on a real feeder.
- Eye-tracking on label/symbol collisions at LOD-2.
- Timed trace tasks (GPZ → PCC) comparing current vs. proposed flow.
- Stress test rendering with a worst-case feeder (≥80 stations, ≥20 DER).
- Control-room ergonomics check at 1920×1080 and 2560×1440, plus dual-monitor.
- A/B on auto-LOD vs. manual-only LOD with senior designers.
- Print-handoff test: field crew reads exported A3 without digital access.

Context: today is 2026-05-27 — schedule field sessions before any Q3 freeze if planned.
