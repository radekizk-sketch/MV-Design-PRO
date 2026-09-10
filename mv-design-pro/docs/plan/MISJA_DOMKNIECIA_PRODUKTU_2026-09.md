# MV-DESIGN-PRO — AUTONOMOUS FULL PRODUCT COMPLETION MISSION (dyrektywa właściciela, 2026-09-09)

Zapis dosłowny mandatu właściciela (wersja poprawiona przez właściciela: „narzucamy tylko misję, zakres
produktu, prawa domenowe, kryteria jakości i Definition of Done; architekturę, kolejność, kontrakty,
modele danych, API, UI i sposób realizacji 12 systemów Fable projektuje, uzasadnia i wdraża sam").

Twarde prawa wynikające z przyjętej architektury (bez zmian): jedna prawda sieci, brak fizyki w UI,
zero fabrykacji, niezależna weryfikacja, brak wiecznego legacy. Bramki właściciela bez zmian:
B-01 (zamrożone rdzenie solverów `network_model/solvers/**` i profile NC RfG), B-02 (werdykt wizualny SLD).

ROLE — Lead Principal Engineer + Power Systems Architect + Product Architect + UX Architect +
Autonomous Engineering Orchestrator. Own the technical completion of the product. Not audit-only,
not another roadmap, not a proposal. DESIGN AND IMPLEMENT THE COMPLETE MV-DESIGN-PRO PRODUCT as a
professional engineering environment for MV networks, MV/LV substations, LV systems, renewable
generation, BESS, protection, analysis, design, documentation and engineering automation. Continue
from the real current state; do not restart; no parallel replacement product; architecture is an
intermediate step — the required outcome is a working system.

1. AUTONOMY — decide target architecture, information model, subsystem boundaries, APIs, domain
services, solver integration, persistence, workflows, UI architecture, UX interaction model, data
dependencies, migration strategy, testing/validation strategy, release sequence, deletion of obsolete
implementations, MCP architecture, CAD/GIS integration strategy, implementation order. Owner
intervention only for genuinely irreversible product decisions, external constraints that cannot be
inferred, or explicit existing owner gates.

2. DO NOT TREAT THE CURRENT PLAN AS THE LIMIT — existing plans/audits/backlogs are evidence, not the
product definition. Determine independently: what exists, what only appears to exist, what is partial,
duplicated, without consumer, UI without capability, backend without workflow, missing, to redesign,
to delete. Then complete the product.

3. PRODUCT SCOPE — 12 domains forming ONE coherent engineering environment: (1) Digital Twin / ENM,
(2) Network Design, (3) Power Flow / Short Circuit / Earth Fault, (4) Protection & Measurement,
(5) OZE / BESS / RfG, (6) Power Quality & Dynamics, (7) LV / Earthing, (8) SLD / CAD / GIS,
(9) Optimization & Reliability, (10) Reporting / WHITE BOX / Compliance, (11) Commissioning / As-built,
(12) MCP Engineering Control Plane.

4. DIGITAL TWIN / ENM — complete the information foundation (assets, connectivity, substations,
switchgear, buses, feeders, transformers, lines, cables, sources, loads, DER, BESS, measurements,
protection, operating state, phases, neutral/earthing, revisions, variants, scenarios, assumptions,
provenance, catalog binding, calculations, results, documentation, as-built state, extensions).
No competing persistent truths for the same network; remove obsolete duplicate paths after proven
migration.

5. NETWORK DESIGN — from calculation environment to complete design environment: feeders, cable
systems, overhead lines, transformers, substations, switchgear, bays, MV/LV interfaces, LV circuits,
protection, CT/VT, compensation, DER connection, BESS, earthing, surge protection, extensions,
modernization, variants. Help the engineer CHOOSE solutions (selection, constraints, ranking,
engineering justification), not only check entered equipment.

6. POWER FLOW / SHORT CIRCUIT / EARTH FAULT — professional completeness: balanced load flow, islands,
multiple sources, voltage control, tap changers, DER control modes, reactive limits, time-varying
conditions, IEC 60909 studies, source/converter contributions, min/max fault levels, symmetrical
components, fault impedance, earth faults, isolated/compensated/resistance-earthed networks, Petersen
coil, network earth-fault currents, zero-sequence quantities, protection-relevant earth-fault outputs.
First determine the physically correct model and validation method.

7. PROTECTION & MEASUREMENT — lifecycle: fault behaviour → measurement chain → function → settings →
coordination → trip targets → validation → documentation → commissioning. Functions: overcurrent,
earth-fault, directional, voltage, frequency, ROCOF, vector shift, distance, differential,
autoreclosing, breaker failure, synchronism, interlocking, groups, TCC, sensitivity, selectivity,
coordination. CT/VT: measurement circuits, burden, accuracy, saturation, suitability, secondary
wiring, IED interfaces. Determine future relationship to IEC 61850 / SCL.

8. OZE / BESS / RfG — PV, wind, BESS, PCC, converter behaviour, P/Q capability, voltage/frequency
regulation, reactive requirements, network strength, hosting capacity, fault contribution, FRT/HVRT,
LoM, RfG, OSD requirements, connection studies, documentation. BESS as an energy-storage system
(energy, power, SOC, efficiency, control, operation, grid support; grid-forming where justified).

9. POWER QUALITY & DYNAMICS — real PQ engineering (not only result validation): voltage magnitude,
frequency, voltage changes, flicker, asymmetry, harmonics, interharmonics, THD, dips, swells,
interruptions, emission assessment, harmonic impedance, frequency scanning, resonance,
filter/capacitor interactions, DER harmonic behaviour, EN 50160 / IEC 61000 workflows. Dynamics:
RMS, FRT trajectories, converter controls, PLL, current limitation, P/Q priority, frequency response,
ROCOF, grid-forming, motor starting, island behaviour, stability — design the architecture.

10. LV / EARTHING — real LV engineering: phases, N, PE, PEN, phase loads, asymmetry, neutral current,
fault loop, minimum fault current, automatic disconnection, device coordination, voltage drops,
full MV→transformer→LV→load paths, earthing arrangements. Earthing design: MV station earthing, LV
earthing, soil, electrodes, grids, earth resistance, earth-fault current, GPR, touch/step voltage,
thermal withstand, normative compliance.

11. SLD / CAD / GIS — professional MV SLD, station diagrams, LV diagrams, GPZ views, OZE/BESS
connections, operating states, analysis/protection overlays, sheets; correct relationship of
semantics, layout, placement, routing, persistence, projections, symbols, sheets, overlays; the drawing
never becomes a competing truth. CAD interoperability (e.g. ZWCAD) without CAD as authoritative model:
API surface, identity mapping, block/attribute interaction, round-trip rules, conflicts, revisions,
validation. GIS: formats, spatial representations, route/location/topology integration where useful.

12. OPTIMIZATION & RELIABILITY — contingency analysis, reliability, restoration, switching
alternatives, weak-point ranking, N-1 and broader contingencies, losses, reinforcement alternatives,
connection-point alternatives, hosting-capacity alternatives, optimization (multi-criteria; objective
model, constraints, method, variant representation, deterministic vs stochastic, UI).

13. REPORTING / WHITE BOX / COMPLIANCE — every important result explainable (what, inputs,
assumptions, method, standard/profile, model revision, why pass/fail, what must change); traces, proof
packages, intermediate values, assumption registry, data/normative/result provenance, comparison and
engineering reports, OSD/compliance documents, equipment schedules, protection settings, drawings,
evidence packages; documents know whether they are current or stale.

14. COMMISSIONING / AS-BUILT — DESIGN → APPROVED → CONSTRUCTION → COMMISSIONING → AS-BUILT →
OPERATIONAL BASELINE: measurements, commissioning results, protection checks, secondary injection,
FAT/SAT, equipment verification, deviations, calibration, model updates, as-built documentation,
acceptance evidence, final baseline; COMTRADE/event import if justified.

15. MCP ENGINEERING CONTROL PLANE — design from first principles: meaningful engineering capabilities
for an AI agent (not arbitrary execution) preserving validity, consistency, permissions,
transactionality, provenance, rollback, auditability, independent verification; same canonical state
as UI/backend; no separate AI-only model.

16. FIND WHAT IS STILL MISSING — multidisciplinary gap analysis (network/station/LV designer,
protection, measurement, OZE/BESS, PQ, analysis, operations, commissioning, CAD/GIS, auditor):
„what would still force this engineer to leave MV-DESIGN-PRO?" — decide, assess, prioritize, implement.

17. FULL ENGINEERING WORKFLOW — primary acceptance criterion: from project objective + input data + OSD
conditions to complete model + selected equipment + verified calculations + protection +
quality/compliance + SLD + alternatives + verdict + documentation + commissioning/as-built path,
without an external spreadsheet.

18. UI/UX ENGINEER-FIRST — one professional workstation; the engineer thinks about the network and the
project, not modules; UI understands goal, context, selected asset, stage, completeness, freshness,
failures, next work, actions.
19. NEVER ASK FOR DATA THE SYSTEM ALREADY KNOWS — propagate, show origin, explicit override only where
legitimate.
20. FAILURES MUST BE ACTIONABLE — what/why/where/what fixes/what each fix changes; apply or evaluate
remedies in context.
21. ONE NEXT-ACTION MECHANISM understanding the real Definition of Done of the project goal (new MV
network, new station, customer connection, OZE/BESS connection, reinforcement, protection
modernization, audit, as-built verification).
22. ENGINEERING ROLES — role views as projections of one project state, no separate applications.
23. PROFESSIONAL UI/UX QUALITY — evaluated on the real application; Polish technical terminology;
information hierarchy, density, consistency, units, stale/invalid visibility, result↔element links.
24. REAL END-TO-END ACCEPTANCE PROJECTS — A radial MV, B ring with NOP (N-1 + restoration), C OZE
connection, D MV/LV station, E compensated MV network (earth fault + protection), F modernization
(as-is → variant → comparison); production paths only.
25. VALIDATION — independent oracles (analytical, reference cases, pandapower, MATPOWER, independent
implementation, normative examples, hand calculation, manufacturer data, literature); a golden file is
not an oracle.
26. DONOR PROGRAM — selective ADOPT / ADAPT / STUDY / REJECT after inspecting code, maintenance,
license, pattern.
27. MIGRATION AND DELETION — inventory → canonical replacement → parity → consumer migration →
observation → deletion → resurrection guard.
28. COMPLETION CONTRACT — CLAIMED DONE → VERIFICATION GATE → ACCEPTED DONE (13 conditions: function,
canonical model, no competing truth, real cases, oracle, backend/frontend/E2E tests, guards, remote CI,
real-workflow UI/UX verification, documentation reflects reality, explicit limitations); no
self-certification.
29. PRIORITIZATION — dependencies, risk, value; vertical capabilities over horizontal scaffolding; do
not interrupt an active critical convergence boundary without justification; blockers: class, root
cause, same class elsewhere, evidence, continue.
30. WORKING STYLE — autonomous; subagents for parallel work; lead agent owns coherence, evidence,
integration, priority, acceptance; never end with only audit/plan/TODO when implementation can continue;
persist state in the repository.
31. DEFINITION OF PRODUCT COMPLETION — a professional engineer can model, design, calculate, compare,
optimize, protect, verify, document, commission and maintain the engineering truth of a real
MV/MV-LV/OZE/BESS project in one coherent system: physically correct, traceable, deterministic where
required, maintainable, extensible, auditable, intuitive, one engineering truth.
32. START NOW — establish the actual boundary of work and real status; update the product completion
map only where necessary; do not stop; select the highest-value executable vertical slice and
implement; measured reality wins over plans; design missing architecture; complete partial subsystems;
converge duplicates; connect or remove UI without capability; expose backend capability without
workflow; eliminate manual bridges; add materially missing capabilities; own the completion.
