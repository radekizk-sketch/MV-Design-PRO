# 08. EKC — MACIERZ KONSUMENTÓW, PÓL, JEDNOSTEK I WARUNKÓW ODBIORU

**Cel:** przełożyć 02-ENERGETYKA-I-MODULY na kontrakty danych, które agent implementujący może sprawdzić w repo, a następnie opisać w Pydantic/TypeScript bez duplikacji solvera. Poniższe nazwy pól są proponowane; mapowanie do rzeczywistego ENM musi być udokumentowane w ADR. TO_VERIFY przy normie oznacza, że trzeba sprawdzić tekst/edycję przed automatycznym enforcement.

## C1. SC-60909 / trójfazowy i niesymetryczny short-circuit

Input domain paths:
- case nominal_ll_voltage [kV] and frequency [Hz], fault location node_ref, fault_kind 3F/2F/2F-E/1F-E;
- topology and switch states as of scenario; source Sk'' [MVA] or Ik'' [kA] (not both blindly), phase source impedance Z1,Z2,Z0 [Ω] or rated data and R/X;
- MV line phase impedance per km [Ω/km], zero sequence model and earth return path, segment lengths [km];
- transformer Sn [MVA], voltage [kV], uk [%], Pcu [kW], group, tap, neutral earth, type/connection, correction conditions;
- source machine/converter data and explicit validity of fault contribution data;
- max/min network arrangement and relevant conductor temperatures.

Normative lookup:
- which IEC/PN edition actually locked; Table c row keyed by Un and max/min; correction procedure IDs; interpretation of source types; applicability of special earth faults.
Derived output (solver-owned):
- Ik'' [kA rms], ip [kA peak], Ib [kA rms], Ik [kA], contributions, Zk/Z0 [Ω], time-dependent DC if implemented, I²t [A²s], per-source whitebox.
EKC output (EKC-owned):
- versioned parameter selection, requirement violations, missing data and source trace; NEVER actual short-circuit physics.
Critical distinct failures:
- cmin chosen as 0.95 with active 2016 SN table; no normative claim, keep explicit manual assumption;
- zero-sequence Z0 missing or guessed from Z1;
- peak derived with inappropriate κ model;
- U_line vs U_phase mismatch;
- multiple-source breaker current summed as total where individual duty required.
Acceptance: actual call chain API -> resolved source -> SC input -> current solver -> output trace -> report.

## C2. LF / branch power flow

Inputs: ENM graph, branches, bus state, P/Q per source/receiver, voltage setpoints, taps, R/X/B, phase model, inverter Q mode, slack constraints.
Normative/standards: case voltage limits and equipment loading limits only after domain-specific source selection; solver tolerances and algorithm are engineering settings, not standard thresholds.
Outputs: U_mag and U_angle per phase/bus, branch I_from/I_to, P/Q_from/to, losses, iteration count/convergence, technical constraint flags.
Guard: sign convention at from/to cannot flip under change of GUI orientation; Q injection sign and power factor lead/lag defined.
Special: for Q(U), capacitor may raise bus U; slack_q and q_from/q_to must remain physically consistent.
Tests: balanced/unbalanced, reverse DER export, regulator saturation, islanded multiple sources, no convergence, PQ/ZIP composition.

## C3. Voltage quality / harmonics

Inputs: measurement point ID, voltage class and U_nom, data window, timestamp and sample quality, harmonic order h, measurements U_h, U1, Pst/Plt, negative sequence, frequency.
Lookup: PN-EN 50160 chosen base + A1 if applicable, IEC 61000 specific compatibility/emission constraints, OSD thresholds, contractual conditions. Each threshold: clause/edition, point, duration, quantile, normal-operation exclusions.
Outputs: percent observations passing, threshold comparison, gaps and NON_EVALUABLE for insufficient window; not a fake zero.
Tests: missing week, wrong voltage category, off-nominal harmonic order, wrong statistical aggregation, percentiles at boundary.

## C4. Cable sizing

Inputs: conductor/material, U0/U(Um), type, manufacturer, revision, length, R20/Rac/X'/C', earth conductor/screen, number of parallel runs, laying/thermal conditions, max insulation temperatures and fault duration.
Lookup: cable product catalogue, IEC 60287 candidate correction method, IEC 60502-2 product classification, IEC 60949 thermal short-circuit method, ENEA permitted cable families and installation instructions.
Outputs: Iz_derated [A], Iload/Iz [%], ΔU [V/%], P_loss [kW], thermal equivalent short-circuit I²t, earth fault return path, insulation conformity and limitations.
Missing: no soil resistivity or grouping => assumption requested; no made-up Iz from cable nominal cross-section alone.
Boundary tests: n cables in parallel and screens, screen earthing mode, two different sections, temperature nonlinear correction, installed length, ambient >= max operating limit.

## C5. Overhead mechanical and electrical lines

Inputs: wire family/structure and approved catalog record, actual spans XYZ with elevation, supports, conductor mass, modulus, thermal coefficient and UTS, atmospheric climate scenario, crossing objects, temperature.
Lookup: chosen national standard variant, ENEA overhead line construction, required clearances by object category, conductor data, country/local constraints, valid dates. NOT one generic clearance.
Outputs: sag/tension/clearance per scenario, constraint violations, map/profile/collision artifacts, dimensional evidence.
Missing: unknown terrain elevation or weather class -> no blanket safe clearance.
Tests: asymmetric support heights, differing hot and ice-load state, clearance to multiple object classes, map EPSG and line profile parity, licensing of GIS layer.

## C6. GPZ source and topology

Inputs: WN 110-kV boundary U, Sk'', R/X and neutral network where relevant; TR 110/SN Sn, uk, Pcu, group/tap, bus sections, line bays, measurements/protection; ENM actual topology.
Lookup: exact ENEA GPZ design drawing edition, electrical apparatus family and IEC 62271 relevant parts, IEC 60076 transformer, instrument CT/VT.
Outputs: SC input and LF reference network, equipment adequacy, field composition conformance, sources and diagram evidence.
Missing: incomplete schematic evidence or variant mismatch => NOT_EVALUATED; no invented IEC 60617 symbols or ENEA schematic components.

## C7. Station SN/nN

Inputs: station construction, A/B/C/D role, lifecycle, design project new/rebuild/existing, variant standard/simplified, equipment field list, TR Sn, Un/Ur, feeder count, remote control.
Lookup: ENEA Z1/Z2/Z3 edition and relevant sections, IEC 62271-202 station, 62271-200 switchgear, device families; choice depends on operator and date.
Outputs: requirement evaluation per facet with source and exception condition, not single hard-coded true.
Missing: station variant unknown -> cannot apply simplified 400/normal 630 spec by forced union.
Tests: end/through/branch/section, one TR and line bays, pole-mounted cable entry if new, existing pole-mounted not subject to same new-build prohibition, remote measurements.

## C8. Switchgear and field configuration

Inputs: primary devices and placements, bay role, station technology, product family and option, Ur, Ir, Ik/time, Ipk, breaking/making ratings, IAC classification, insulation test ratings, interlock state, NO.
Lookup: IEC 62271 common and selected product-specific parts plus ENEA and manufacturer, revision and class; symbol reference IEC60617.
Outputs: per-quantity evaluation comparing like with like, field profile compliance, actionable reasons and sources; no equalization of short-time withstand with breaking capability.
Tests: wrong type of breaker, earth switch main path, DS/CB order, missing CT/VT, IAC alternative/accessibility class, unknown device product.

## C9. Symbols and LOD SLD

Inputs: semantic apparatus IDs, electrical topology from ENM, active field profile, NO states, device measurements, label and symbol catalog bindings.
Lookup: approved symbol identity in IEC60617 and project/ENEA convention, renderer-specific geometry not in EKC.
Outputs: SymbolId/semantic label/provenance; SldCanvasV3 draws according to computeLayout and LOD, independent of knowledge-service canvas.
Test: geometry repeated deterministic, cross LOD same statuses, moving label does not change ENM or normative verdict, CT current path, VT lateral, Ferranti distinct.

## C10. Power TR

Inputs: U_HV/U_LV, Sn, uk, Pk, P0, ratio, vector group, neutral, tap limits/position and thermal rating.
Lookup: IEC 60076 applicable part, manufacturer data, ENEA specific station ratings.
Outputs: validated nameplate and requirements; solver computes impedance, losses, no-load and sequence transfer.
Test: 110/15 vs 15/0.4 and voltage references, group phase shifts, winding-to-earth zero path, tap correction and thermal limit.

## C11. CT and VT

CT inputs: Ip/Is ratio and actual multi-ratio tap, one/multi core, class, VA, FS/ALF, P1/P2, location; VT: primary/secondary voltage phase LL/LN, winding count/connection, class, VA, phase shift, residual winding if actually present.
Lookup: IEC 61869 relevant edition, manufacturer and ENEA drawings.
Outputs: measurement ratio for LF/EAZ/metering, label for SLD, compliance with class and burden; do not create missing winding.
Test: CT reversal, chosen tap, VA burden, protection saturation, VT line-to-phase conversion and independent current/voltage transducer classification.

## C12. EAZ and selectivity

Inputs: relay model/version, programmed functions, CT/VT source data, selected curves, pickup current, time multipliers, delayed trips, directional reference, breaker time, source and network minima/maxima.
Lookup: IEC 60255 appropriate parts, ENEA protection requirements, actual manufacturer relay curves and firmware; optional IEC61850 mapping.
Outputs: settings adequacy, selectivity margin, forbidden assumptions, source trace.
Test: 51 vs 50, 67N only when explicitly configured, faults in compensated network, CT burden uncertainty, curve limits at boundary.

## C13. Telemechanics/IED

Inputs: remote_control capability, bay role, channels, power supply, measurement map, controlled switching devices, time sync, IED protocol and actual point definitions.
Lookup: ENEA telemechanika exact edition, communication/equipment source, IEC61850/IEC60870 relevant only when used.
Outputs: missing measurement/communication requirements and signals, source scope; not automatic compulsory telemechanics qualification.
Test: line remote CT+VT, local switch, one channel fails, quality flags and stale timestamps, accidental remote command blocked by interlock.

## C14. PV plant

Inputs: installed DC MWp vs AC maximum active power, inverter units and product versions, transformer nominal, PF/Q envelope, control mode P/Q(U), assigned IEC/OSD rules, connection point and PGM classification.
Lookup: NC RfG, PTPiREE procedure/test annex by PGM type, current ENEA IRiESD and connection conditions, verified manufacturer model.
Outputs: admissible tested features and missing docs/certificates, actual power flows from solver, protection obligations if applicable.
Test: dc/AC ratings separation, Q sign, Q(U) deadband 0.98–1.02 Un as explicit example configuration not universal standard default, no direct PV to SN bus.

## C15. BESS

Inputs: PAC, E usable/nominal, charge/discharge efficiencies, SOC, mode, reactive/fault current converter data, connection transformer and protection.
Lookup: appropriate RfG/OSD if power generating module classification applies, manufacturer data, IEC 62933 parts where actually applicable; safety separately verified.
Outputs: scenario constraints and compliance, no default converter contribution.
Test: SOC near 0 and 1, charging/dispatch sign, Q capability at P, k_sc missing, no overlap with PV source classification.

## C16. Wind (FW) and rotating generators

Inputs: turbine mechanical/electrical manufacturer, SC machine model, inverter topology (doubly fed/full converter/synchronous), transformer, operating point, Q limits, speed/control data.
Lookup: IEC60909 edition for machine/converter contribution, RfG/PTPiREE/OSD certification by model/firmware, manufacturer.
Outputs: model eligibility and trace per source, with no blanket k_sc factor.
Test: machine vs converter, fault current decay, source limits and control, PGM category, negative sequence if supported.

## C17. Biogas / synchronous cogeneration

Inputs: aggregate P_e nominal, generator S_n, power factor, P_max per unit, machine voltage and reactances, excitation/control, protection/transformer and number of units.
Lookup: applicable RfG/ENEA source and manufacturer; generator characteristics.
Outputs: generator parameters and energy/fault analysis.
Test: two 249kW electrical units vs two 299kW nameplate discrepancy flagged, not silently normalized; source S[kVA] != P[kW]; generator count and units.

## C18. Neutral earthing, Z0 and earth fault

Inputs: neutral mode per network segment, Petersen coil/tuned current, earth resistor/impedance, C0, cable sheath and return path, transformer winding and ground, fault Rf.
Lookup: 60909-3 special case, earthing standards appropriate to voltage, OSD neutral management.
Outputs: network model validation and solver path selection; touches/steps only if implemented with appropriate basis.
Test: single earth fault in isolated system cannot be simply equated to SC 3F, transformer delta sequence path, multiple grounding and screen return.

## C19. LV / protection against shock

Inputs: TN/TT/IT and PE/PEN, LV transformer secondary, conductor length R/X, fault loop, protection fuse/CB RCD, rated voltage and disconnection.
Lookup: PN-HD/IEC60364 exact parts and edition, OSD nN, manufacturer curves.
Outputs: ADS verification, Zs and related proof in nN projection; do not reuse SN fault limit.
Test: TT vs TN, RCD selectivity, failure on unknown earthing, portal nN-to-SN and two SLD projections.

## C20. Metering and energy losses

Inputs: direct/semi/indirect topology, CT/VT ratio, meter model/class and registers, time-series energy, U/I factors, sign and billing interval, metering points.
Lookup: ENEA metering standard + IRiESD, manufacturer, regulatory source; R4 training formulas only as GUIDANCE until units audited.
Outputs: multiplier and accounting energy only when all prerequisites reviewed; technical LF loss results remain separate.
Test: CT ratio tap, class/VA, reverse export energy, period length, training formula cannot promote to normative estimator automatically.

## C21. Product catalog and BOM

Inputs: manufacturer, exact model/configuration/firmware, product datasheet edition, options, ratings, cost price source and date, stock region if relevant.
Lookup: IEC product norm + ENEA requirements, manufacturer sheet; no copy of product data into Reference Engine pack.
Outputs: product selection filters and reasons per requirement, value provenance, BOM with source and package revision, cost provenance separate from normative compliance.
Test: product revision differences, options, aged price, incompatible device choice, missing manufacturer rated fields = NOT_EVALUATED.

## C22. Reports and archives

Inputs: case/ENM hash, result run and solver version, project knowledge lock, catalog hashes, rule status, conflict resolution, engineer waivers, source editions.
Lookup: all applied record and evidence anchors, issuer and valid date. Outputs: report with source refs and assumptions; archive reproducible without external current internet, while respecting licensed-source storage.
Test: historical replay and reopen after new release, revoked-basis warning, no copyrighted full norm embedded, exact number and equation refs, source availability status.

## C23. State estimation and operations

Inputs: measurement time/value/unit/quality/variance, topology states, bus and feeder graph, incident modes, operator constraints when confirmed.
Lookup: operational instructions/standards specific to actual state-estimation use; no fictitious requirement.
Outputs: estimated states and confidence from state estimation solver, freshness distinct from normative update.
Test: out-of-time measurements, missing observability, switch state mismatch, no SCADA-claims from a CAD analysis.

## C24. GIS, CAD and SN-SAG-LAB external adapter

Inputs: route geometry and EPSG, terrain level/survey precision, object crossings, support locations, source dataset time/rights.
Lookup: legal technical distance criteria, ENEA overhead line standard and norms by geography/edition; cadastral and GIS data provenance distinct from electrical norm.
Outputs: geometry-based violations with exact limit source, exported DXF/CSV/PDF traces, signed readonly EKC release.
Test: wrong EPSG, outdated terrain model, crossing category change, clearance measured in three dimensions, no license leak to external app.

## 2. Rules of dependency injection into consumers

A resolver returns **approved and deterministic** ParameterBundle/ComplianceProfile for a specified capability ID and lock, not a vague raw PDF response. The bundle contains: producer release hash, source edition refs, typed quantities, application scope, explicit assumptions, missing fields, warning/conflict, schema_version and bundle hash. The consumer loads it through a boundary adapter and converts only verified units/dimensions to its input object.

No module calls PDF extraction, official web, LLM or full-text search inside a computation. No module infers normative source from a CSS state/color. A compliance evaluator reads ENM and catalog but cannot mutate it. Catalog versions are pinned by the case; new catalogs may be offered as an opt-in design migration. UI has no hidden independent copy of constraints.

## 3. Atomic data freshness and reproducibility

Distinct fingerprints:
- ENM/topology snapshot hash;
- catalog snapshot hash;
- selected knowledge release hash;
- parameter bundle hash;
- solver implementation and scenario hash;
- result payload hash.
Freshness flags: TOPOLOGY_CHANGED, INPUT_CHANGED, CATALOG_CHANGED, KNOWLEDGE_UPDATE_AVAILABLE, SOURCE_INTEGRITY_FAILED, SOLVER_UPDATED. Only actual input/equation changes require recomputation; new knowledge publication without migration creates an update notice and impact preview. A prior report keeps references and results.

## 4. Decision record per selected standard

For each integrated source:
- What edition and status?
- Which exact section/table/formula and page?
- Who verified the extraction and interpretation?
- Which case conditions apply and what input paths prove them?
- What quantity/units/result?
- Which module and function consumes it?
- Which test proves numerical/logic parity?
- Which ENM/project snapshots are affected by migration?
- What happens when missing/conflicting/withdrawn?
- What license permits storage/preview?
No answer => not eligible for automatic normative enforcement.

## 5. End-to-end acceptance evidence matrix

For every capability C1–C24, implementation gate must show at least:
(1) source edition and evidence verified;
(2) typed record and application scope;
(3) actual runtime adapter and result;
(4) negative/unknown test;
(5) data/units boundary tests;
(6) regression against baseline;
(7) UI/report source trace or proof pack;
(8) no duplicated canonical model.
For candidates not yet supported by MV-DESIGN-PRO mark NOT_IMPLEMENTED, not an invented PASS. Runtime scope can be narrowed to existing product features; the rest remains backlog.
