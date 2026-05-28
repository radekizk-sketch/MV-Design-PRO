# UX/electrical risk

A continuous horizontal external conductor drawn at the same y as the WE and WY terrain anchors reads as a single through-line that bypasses the station. The eye connects WE→WY along that line; the internal SN bus, sitting below, looks like a parallel tap rather than the only galvanic path. For an MV designer this is indistinguishable from a busbar short between feeder bays — exactly the wrong mental model for a compact RMU where current must enter via the WE cable head, traverse the internal bus through the bay switches, and leave via the WY cable head.

Secondary risks: ambiguous fault-isolation reading (operator may assume opening one bay still leaves the trunk live across the station), and the cable-head symbol loses its semantic "termination" meaning when the line visually overshoots it.

# Must-fix geometry

- Split the external run into two independent stubs: `we_external` (terrain → WE cable head) and `wy_external` (WY cable head → terrain). No shared polyline, no shared SVG path id.
- Each stub must **terminate at** the cable-head anchor (▲) — last vertex equals the cable-head port, not a point past it. No pixel of the external stub may extend into the station-interior x-range between the two cable heads.
- Introduce a vertical drop from each cable head down to the internal SN bus y-level (`busbar_y`). The cable head is the inflection point between "external" and "internal" coordinate bands.
- Enforce two y-bands with a visible gap: `external_y` (terrain) strictly above `busbar_y` (internal bus), separated by ≥ one grid unit. Never co-linear.
- Internal SN busbar is the **only** horizontal segment connecting WE and WY; it lives in the internal band, inside the switchgear envelope rectangle.
- Cable-head glyph rendered on top of (higher z-index than) the external stub end so the triangle visually caps the line.
- Optional but recommended: thin a dashed "terrain" baseline so the external stubs visibly drop *into* the station envelope rather than skim its roof.

# Accepted acceptance criteria

- AC1: For any compact station with WE and WY bays, no single SVG path (or visually contiguous set of collinear segments sharing stroke style) spans from `we_external` terrain anchor to `wy_external` terrain anchor.
- AC2: `max(external_stub.y) < busbar.y - gap_min` where `gap_min ≥ 1` grid unit; holds for both stubs.
- AC3: Each external stub's terminal vertex equals its cable-head port within ≤ 0.5 px tolerance.
- AC4: The set of horizontal segments at `y == busbar_y` whose x-range covers both bay drop points is exactly one, and it carries the `role="sn-busbar"` data attribute.
- AC5: Removing the internal busbar from the model produces a visually disconnected WE/WY (snapshot diff must show two islands) — proves there is no external bridge.
- AC6: Cable-head glyph bounding box overlaps the external stub's last segment endpoint (z-order check).

# What not to change

- Solver inputs, topology adapter semantics, NetworkModel — this is pure renderer geometry.
- Cable-head symbol shape (IEC ▲) and its anchor contract.
- Bay ordering, bay labels, RMU envelope dimensions, or LOD apparatus stack.
- SN bus electrical identity; only its rendered y/x extents and the rule that it is the sole horizontal SN connector.
- Polish UI labels, color tokens, stroke widths used elsewhere — match existing style.

# Suggested tests

- Vitest (`sld/core/__tests__/compactStationRouting.test.ts`): build a fixture with WE+WY bays, run the layout pipeline, assert (a) two distinct external path ids, (b) `external_y < busbar_y - gap_min`, (c) each external path's last point equals its cable-head port.
- Vitest determinism: snapshot the routed path d-attributes; re-run, assert byte-identical (extends existing `determinism.test.ts` pattern).
- Vitest topology-vs-visual: mutate the model to delete the internal busbar; assert the rendered graph has ≥ 2 connected components in the SVG (flood-fill over rendered segments), proving no external bridge.
- Playwright (`e2e/sld-canvas-routing.spec.ts`): render a compact station, take a clip of the WE→WY corridor, assert no horizontal line crosses the mid-x between the two cable heads at `external_y`.
- Guard hook: extend `scripts/sld_determinism_guards.py` (or a new `sld_no_external_bridge_guard`) to scan rendered fixtures for any horizontal segment at terrain y whose x-range covers both bay anchors — fail CI if found.
