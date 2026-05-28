You are reviewing MV-DESIGN-PRO as:
- a senior UX/product designer for engineering software,
- a SCADA/CAD interaction designer,
- a power-network workflow reviewer,
- a usability auditor for tools used by MV network designers.

Scope:
- Review only UI/UX, interaction, active SLD V2 readability, LOD, CAD behavior, layout, navigation, and workflow.
- Do not rewrite the product vision.
- Do not impose decorative visual taste.
- Do not invent electrical domain rules.
- Do not change solver physics, protection logic, or ENM truth.
- Do not recommend fake simplifications that would break electrical meaning.
- Optimize for clarity, engineering workflow, discoverability, accessibility, consistency, low friction, and reduced operator error.

Context:
- The application is MV-DESIGN-PRO.
- Users are MV network designers, OSD engineers, protection engineers, DER/NC RfG reviewers, and report/audit reviewers.
- The active SLD V2 must remain electrically meaningful and based on ENM/domain topology.
- The UI must support project creation, GPZ configuration, MV bays, cable/line runs, stations, branches, DER, readiness, calculations, protections, engineering justification, reports, and export.
- Active UI labels should be Polish and engineering-oriented.
- The default network-building flow must not force arbitrary line lengths.
- A station should normally be placed at the endpoint of the current section and then allow continuing the run from the station.
- Splitting an existing section should be a separate explicit operation with preview, cancel, commit, and audit.
- Missing length/data must block or show brak danych/nie wyznaczono, never false 0.00.

Review tasks:
1. Identify the top UX friction points in the requested SLD V2 operator-grade flow.
2. Identify ambiguous actions, dead ends, hidden states, confusing labels, overloaded screens, and places where the user must guess the next step.
3. Review whether the SLD communicates the power path GPZ -> TR -> SN section -> bay -> cable head/port -> segment -> station -> next segment -> branch/DER/NMO clearly enough for an MV network designer.
4. Review whether click, double-click, right-click, hover, keyboard, disabled states, and blocker-to-field interactions are predictable.
5. Review whether semantic LOD helps engineering understanding instead of hiding important electrical meaning.
6. Review whether CAD tools such as pan, zoom, grid, snap, port magnets, routing, bend points, labels, and selection are discoverable and safe.
7. Propose 2-3 alternative interaction flows only where they reduce friction or risk.
8. Keep recommendations implementation-aware and testable.
9. Distinguish must-fix issues from optional polish.
10. Identify what must not be changed because it protects domain correctness.

Return exactly these sections:

# Summary of top UX risks

# Must-fix issues

# Suggested flow improvements

# Screen/component-level recommendations

# SLD/CAD/LOD recommendations

# Testable acceptance criteria

# Risks and trade-offs

# What not to change

# Recommended follow-up tests

Keep the review concise but actionable. Avoid vague advice. Every recommendation should be testable or explicitly marked as exploratory.
