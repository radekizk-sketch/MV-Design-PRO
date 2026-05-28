You are reviewing one SLD defect in MV-DESIGN-PRO as a senior SCADA/CAD designer and MV switchgear workflow reviewer.

Scope: compact station SN/nN mini-RMU visual only. Do not invent electrical physics and do not change solvers. Evaluate whether the visual can be mistaken as a short between WE and WY.

Context:
- Active screenshot shows WE and WY line bays on a compact station.
- The external cable/trunk line is drawn at the same y-level as terrain port anchors.
- The station internal SN bus is below it.
- User says it looks like WE is shorted to WY.
- Correct semantics: the external run must terminate at the WE cable head, internal RMU busbar connects bays inside switchgear, and the outgoing run starts from WY cable head. The diagram must not read as one continuous external conductor bridging WE and WY.

Please return exactly:
# UX/electrical risk
# Must-fix geometry
# Accepted acceptance criteria
# What not to change
# Suggested tests

Keep it concise and implementation-aware for React SVG renderer/tests.
