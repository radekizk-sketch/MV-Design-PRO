> **MATERIAŁ SUROWY SUBAGENTA — NIE JEST DECYZJĄ.**
> Raport agenta PROTECTION z audytu donorów 2026-09-07. Zachowany w repo jako dowód i ślad
> rozumowania (§14/§15 mandatu). **Twierdzenia w tym pliku NIE są zweryfikowane w całości.**
> Wiążące są: `OPEN_SOURCE_DONOR_AUDIT.md` (ustalenia zweryfikowane),
> `DONOR_DECISION_MATRIX.md` (decyzje) i `DONOR_AUDIT_CHECKPOINT.md` (pomiary własne).
> Gdzie ten plik jest sprzeczny z tamtymi — **tamte wygrywają**; sprzeczności wykryte
> przy weryfikacji są nazwane w `OPEN_SOURCE_DONOR_AUDIT.md` §7.

# REPORT_PROTECTION — AGENT PROTECTION, donor due-diligence

Scope: protection coordination (ZAB) for MV-DESIGN-PRO. Baseline read in full:
`scratchpad/donor/MV_BASELINE.md`. Judgement per SUBSYSTEM, never per repo.

## 0. Donors, commits, licences (verified at the cloned SHA)

| Donor | Clone path | Commit SHA | Commit date | Licence file actually read | Verdict |
|---|---|---|---|---|---|
| oxigrid (cool-japan) | `donor/src/oxigrid` | `1f46bc66612f9cd9147bcd02d3f2513d2638a8f8` | 2026-06-16, author `KitaSan` | `LICENSE` = Apache License 2.0 full text (191 lines); `Cargo.toml: license = "Apache-2.0"`; one `SPDX-License-Identifier: Apache-2.0` found (`src/planning/integrated/mod.rs`) | Licence verified at commit `1f46bc66`. Permissive. |
| Sandia Protection-settings-optimizer | `donor/src/pso` | `44fe954120e7dbab77d39aff8a118c1c348dc3b3` | 2026-03-23, author `trupatel` | `LICENSE` line 1 = "Copyright 2023 National Technology & Engineering Solutions of Sandia, LLC (NTESS). Under the terms of Contract DE-NA0003525 with NTESS, the U.S. Government retains certain rights in this software." followed by the **full GNU GPL v3** text (675 lines). `setup.py: license = 'GPLv3'` | Licence verified at commit `44fe9541`. **Copyleft.** |

Obligations, stated as facts from the files, **no legal opinion given**:
- **oxigrid / Apache-2.0**: distributed use requires retaining the copyright and licence notice,
  including a copy of the licence, and stating changes made. No `NOTICE` file exists at this SHA
  (checked), so no NOTICE-propagation obligation arises from this SHA. Includes an express patent
  grant. Nothing here blocks use in a closed-source backend.
- **Sandia / GPL-3.0**: GPLv3 is copyleft. Conveying a work that incorporates or derives from this
  code obliges licensing the whole combined work under GPLv3 and providing corresponding source.
  The Sandia/NTESS line adds U.S. Government retained rights on top of the GPL; it does **not**
  relax it. **Practical consequence for MV: no code from `RSO_pack` may enter MV-DESIGN-PRO.**
  Algorithms and workflow (uncopyrightable ideas) may be re-derived clean-room from the standard
  and public literature — but not transcribed. Escalate to the owner before any use beyond reading.

Additional donor-hygiene facts:
- oxigrid is **Rust**, not Python. Any "COPY" is impossible by construction; only PORT is on the
  table, and a port is a rewrite that must be re-validated anyway.
- Sandia PSO has **zero test files and no CI** (`find . -iname '*test*'` returns only an OpenDSS
  input deck `Examples/IEEE34_OpenDSS/IEEE34Test.dss`; no `.github/` directory exists).

---

## 1. MV SIDE — what MV can and cannot do today (measured, not assumed)

**Correction to the baseline.** `MV_BASELINE.md` states "backend/src/protection/ is THIN
(~1.1k LOC) — real gap candidate". That figure is accurate for that *directory*
(`src/protection/` = 1,140 LOC: `curves/{iec_curves,ieee_curves,curve_calculator}.py`) but it is
**not** MV's protection surface. Measured at HEAD:

```
find src   -path '*protection*' -name '*.py' | xargs wc -l  ->  23,843 LOC across 85 files
find tests -path '*protection*' -name '*.py' | xargs wc -l  ->  19,016 LOC across 49 files
```

Breakdown of what I actually read:

| Layer | File | LOC | What it does |
|---|---|---|---|
| SOLVER | `src/network_model/solvers/protection_iec60255.py` | 982 | IDMT physics. `compute_idmt_generic` (t = TMS·A/(M^B−1)+C) and `compute_ieee_c37112_generic` (t = TD·(A/(M^p−1)+B)) are the **single** implementations of each formula shape (card N-D4). `compute_curve_trip_time`, `compute_i2t_thermal_energy`, `check_selectivity_pair`, `run_protection_coordination`. Full WHITE BOX trace + LaTeX substitution + SHA-256 `deterministic_signature`. |
| SOLVER | `src/network_model/solvers/protection_lv_curves.py` | 796 | LV apparatus: MCB thermal/magnetic (IEC 60898-1, bands from catalog `lv_mcb_bands_iec60898`), MCCB electronic 3-stage definite-time (IEC 60947-2), gG fuse gates (IEC 60269-1). Explicitly **refuses to interpolate** between normative points — returns a three-state `GwarancjaNormy` band instead of a fabricated time. |
| DOMAIN | `src/protection/curves/{iec,ieee}_curves.py`, `curve_calculator.py` | 1,140 | Curve adapters delegating to the solver engines; `calculate_curve_points`, `calculate_grading_margin`, `check_coordination`, `analyze_curve_set`. |
| APPLICATION | `src/application/analyses/protection/**` + `src/application/protection_analysis/engine.py` | ~8,700 | `coordination/analyzer.py` (920) sensitivity/overload/selectivity; `sanity_checks/rules.py` (653); `czas_wylaczenia_galezi.py` (545); `base_values/{compute,resolver,models}.py`; `overcurrent/pipeline.py` (384). |
| ANALYSIS | `src/analysis/protection_curves_it/**`, `protection_insight/**` | 1,332 | TCC (I-t) chart builder + SVG/PDF renderers + insight serializer. |
| API | `src/api/protection_{coordination,runs,comparisons,overcurrent_settings,analysis_runs}.py` | 1,613 | `POST /protection-coordination/...` with `ProtectionSettingsRequest` carrying **stage_51, stage_50, stage_50_high, stage_51n, stage_50n**, `directional`, `ct_ratio`, device types RELAY/FUSE/RECLOSER/CIRCUIT_BREAKER; `FaultCurrentRequest{ik_max_3f, ik_min_3f, ik_max_2f, ik_min_1f}`; TCC data, selectivity/sensitivity/overload endpoints, PDF/DOCX export. |
| ENM | `src/enm/models.py` | — | `ProtectionSetting` (l.54), `ProtectionAssignment` (l.684), `ProtectionSettingValue` (l.1141), `ProtectionFunctionState` (l.1148), `SpzState` (l.1173), `BayProtectionControlUnit` (l.1213), `BayInterlockSet` (l.1236). |

**MV CAN today**: multi-stage 50/51/50HH/51N/50N settings modelling with CT ratio and
directionality metadata; IEC 60255-151 SI/VI/EI/LTI + DT trip times and IEEE C37.112 MI/VI/EI;
LV MCB/MCCB/gG normative bands; I²t; pairwise grading-margin verdicts (PASS/MARGINAL/FAIL at
0.3 s / 0.2 s); sensitivity + overload checks; TCC charts; PDF/DOCX proof; determinism via
SHA-256 signature; wired through the canonical run registry.

**MV CANNOT today — four measured gaps:**

- **G1 — no topology-derived primary/backup pairing.** `protection_iec60255.run_protection_coordination`
  takes `relay_pairs: tuple[tuple[RelaySettings, RelaySettings], ...]` as an **input**. The
  application layer does no better: `application/analyses/protection/coordination/analyzer.py`
  line 545 reads `# Compare adjacent devices (assuming ordered downstream to upstream)` and then
  pairs `devices[i]` with `devices[i+1]` by **caller-supplied list order**. Verified by grep: no
  `networkx`, `nx.`, `shortest_path` or `has_path` anywhere under
  `application/analyses/protection`, `application/protection_analysis`, `analysis/protection_insight`.
  The pairing is an unverified caller assertion, not a derived fact — exactly the class of
  "ordering creates connectivity" that MV law forbids everywhere else.
- **G2 — no automatic fault-case derivation per protected zone.** Fault currents arrive as a
  caller-supplied `FaultCurrentRequest` keyed by `location_id`. Nothing walks the topology to ask
  "what is the max fault at the near end and the min fault at the far end of the zone this device
  protects, and which devices see it".
- **G3 — verification only, no setting synthesis.** Grep for optimise/synthesise/propose/suggest
  across the protection application layer and the IEC 60255 solver: nothing. MV can say "these
  settings fail"; it cannot say "use TMS = x".
- **G4 — no re-verification under reconfiguration.** MV models rings (`ui2/kreatory` ring wizard)
  and OZE infeed, but there is no "settings chosen for configuration A, still selective in
  configuration B / after tie-switch closure / with DER online" pass.

**MV-side defect found while auditing (not a donor matter, but a Zero-Debt item):**
`protection_iec60255.py` defines `IEC60255CurveType.RI = "RI"` with params `(120.0, 1.0)`, LaTeX
`t = TMS·120/((I/Is)−1)`, and the UI-visible Polish label `"Odwrotna RI (120)"`. **That curve is
IEC 60255-151 *Long-Time Inverse*, not RI.** The genuine RI (ASEA) characteristic has a different
functional form, `t = TMS/(0.339 − 0.236/M)`, and is not in IEC 60255-151 Table 1 at all. MV's own
`src/protection/curves/iec_curves.py` names the identical `(120.0, 1.0)` pair
`LONG_TIME_INVERSE = "LTI"`, label `"Długoczasowa odwrotna (LTI)"`. One curve, two names inside MV,
one of them normatively wrong and UI/proof-visible. Priority **P0**, independent of any donor.

---

## 2. SUBSYSTEM DECISIONS

Legend: COPY | PORT | INTEGRATE | REWRITE_CLEAN_ROOM | STUDY_ONLY | REJECT.

### 2.1 oxigrid (Apache-2.0, `1f46bc66`, Rust)

| # | Subsystem | Files/symbols actually read | Claimed | What it really is | MV equivalent | Gap closed | Decision | MV target | ENM impact | Protection impact | Risk | Test strategy | Prio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| O1 | IDMT / TCC relay curves | `src/protection/relay.rs` (whole file, 228 L): `RelayCharacteristic::{iec_coeffs,ieee_coeffs}`, `OcRelay::trip_time`, `OcRelay::check_coordination`, `DistanceRelay::trip_time` | "IEC 60255, IDMT, TCC" | Constants right; surrounding code not (§3.1). Formula duplicated **4×** in the crate (`relay.rs`, `coordination.rs`, `coordination_advanced.rs`, `coordination_optimizer.rs`, each with its own curve enum), plus a 5th disagreeing distance model | `compute_idmt_generic` / `compute_ieee_c37112_generic` — **one** implementation per formula shape, WHITE BOX, LaTeX, tested | **None.** MV strictly better | **REJECT** | — | none | none | — | — | — |
| O2 | IEC 60909 short circuit | `src/protection/iec60909.rs` (908 L, read in full): `Iec60909Calculator::{calculate_all,calculate_at_bus,kappa_factor,thermal_equivalent,build_z_matrix}`, all 16 `#[test]`; `src/protection/shortcircuit.rs` l.20–60 (`C_MAX_LV/C_MAX_HV/C_MIN`, `Iec60909Method`); `src/protection/coordination_advanced.rs` l.1–50 (2nd `Iec60909Calculator`, `c_factor: 1.05`) | "IEC 60909" | **Not IEC 60909.** SLG wrong by √3 (proved numerically, §3.2); `c` table inverted for MV/HV; **zero** impedance correction factors K_T/K_G/K_S; `I_th` m/n roles swapped and m hard-coded; `FaultType` decorative | `short_circuit_iec60909.py` (1,517 L) with `C_MIN=0.95`, `C_MAX=1.10`, and `K_T = 0.95·c_max/(1+0.6·x_T)` emitted as an explicit WHITE BOX step with LaTeX substitution | **None — negative.** Adoption would be a regression | **REJECT** | — | none | none | — | — | — |
| O3 | Coordination / CTI check | `src/protection/coordination.rs` (248 L): `CoordinationPair`, `CoordinationViolation`, `CoordinationStudy`; `coordination_study.rs` l.1–45 | "coordination study, zone topology" | Pairs are an **input** (`(primary_idx, backup_idx, i_fault_a)`) — same shape as MV, no topology derivation. "Zone-based topology" = user-declared zones, not a graph | `check_selectivity_pair` + `analyzer._check_selectivity` | Closes nothing (G1 stays open) | **REJECT** | — | none | none | — | — | — |
| O4 | Coordination optimizer | `coordination_optimizer.rs`: `CoordinationObjective`, `optimize()` (l.595), `solve_linear_programming()` (l.406–510), `verify_sensitivity()` (l.618), `compute_selectivity_index()` | "optimal selectivity, LP" | **Not LP.** A Gauss–Seidel style monotone TDS relaxation (init at `tds_min`, sweep pairs, `applied = max(new, old)`, stop at `max_change < 1e-4`). Two of four objectives dispatch to the same function. Backup TDS solved at `primary_max_fault` — ignores infeed between the pair | none (G3) | The *pattern* — deterministic monotone relaxation instead of a stochastic search — is the right shape for a deterministic MV backend | **STUDY_ONLY** (pattern informs a clean-room design; code not portable; "LP" naming is false) | (future) `application/analyses/protection/coordination/` | none | would enable setting synthesis | — | — | P2 |
| O5 | Differential 87T/87B | `differential.rs` l.1–60, 155–260: dual-slope bias + 2nd/5th harmonic restraint, `slope1=0.30/slope2=0.60`, `i_diff > i_min_pu && i_diff > slope·i_rst` | IEC 60255-12 | Textbook-correct **relay behaviour model**, not network physics. 15 tests, all shape assertions | none | Real gap, not one MV has asked for | **STUDY_ONLY** | — | new ENM protection function type would be needed | out of current scope | — | — | P2 |
| O6 | Distance 21 | `distance.rs` l.1–130: Mho (`centre = z_reach/2`, `radius = |z_reach|/2`), quadrilateral, load blinder; `relay.rs::DistanceRelay` | "distance" | Mho geometry correct for a **self-polarised** mho (no memory/cross polarisation). Contradicted by `relay.rs::DistanceRelay`, which compares scalar magnitudes only — not a distance characteristic at all | none | Distance protection is not an MV (15/20 kV) need | **REJECT** | — | — | — | — | — | — |
| O7 | Auto-recloser (SPZ) | `autorecloser.rs` l.1–140: `AutorecloserConfig{n_shots, dead_times_s}`, `Reclaiming`/`Lockout` | IEC 60255-4 | Clean state machine, defaults `dead_times_s: [0.3, 15.0, 30.0]`. No physics | ENM has `SpzState` (`enm/models.py:1173`) | ENM models SPZ state but nothing evaluates a reclose *sequence* against coordination | **STUDY_ONLY** (state-machine shape only; Polish SPZ practice, not IEC 60255-4:1976, is the authority) | (future) `application/analyses/protection/` | uses existing `SpzState` | SPZ-aware selectivity | — | — | P2 |
| O8 | FLISR | `src/network/flisr.rs` l.1–28 (1,001 L, 13 tests) | fault location/isolation/restoration | Indicator-pattern scan + bracket isolation + tie-switch restoration with a thermal check. Outside the protection package | none | Not a coordination need; overlaps MV switching/topology ops | **REJECT** (for this audit) | — | — | — | — | — | — |
| O9 | Relay test-case generation | `protection_testing.rs` l.380–490 (pickup verification at 0.8/0.9/1.0/1.05/1.1/1.5×, log sweep 1.05→20× pickup) | secondary-injection test plans | The **only** oxigrid idea worth reusing: a systematic multiplier grid for exercising a curve implementation | MV protection tests are per-scenario, not swept | Test-design idea for MV's own curve solvers | **STUDY_ONLY** | `backend/tests/` | none | none | none | adopt the multiplier grid as a property test over `compute_idmt_generic` | P2 |

### 2.2 Sandia Protection-settings-optimizer (**GPL-3.0**, `44fe9541`, Python)

**Licence gate first: GPLv3 means no code enters MV.** Every "adopt" below is therefore
**REWRITE_CLEAN_ROOM at best** — architecture and workflow only, re-derived from the standard.

| # | Subsystem | Files/symbols actually read | Capability | How it works | MV equivalent | Gap closed | Decision | MV target | ENM impact | Protection impact | Risk | Test strategy | Prio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | **Topology → primary/backup pairs** | `RSO_pack/src/PathTracingFuns.py` (whole file): `findRelaysInPath`, `findDeviceInPath(path, ProDevices, DOC)`, `create_priamry_backup_from_paths`, `find_edgenode`, `find_faultpath_insys`, `isPrimaryRelay`; `RSO_pack/src/GenNxGraph.py::genGraph` | derive pairs from the graph | `genGraph` builds a `networkx.Graph` (lines + transformers as edges, buses as nodes). For a fault node, `nx.shortest_path(source_bus → fault)` gives the path; devices are matched onto path edges by the `(Bus1, Bus2)` tuple; consecutive devices along the path become (primary, backup). `isPrimaryRelay` decides primacy by checking whether another device sits on the fault path between relay and fault. `DOC=1` matches forward direction only | **none — this is G1** | Replaces "assume the caller ordered the list correctly" with a derived, auditable fact | **REWRITE_CLEAN_ROOM** — the *idea* (path-walk over the canonical graph; primacy = no intervening device) is sound and uncopyrightable. Do **not** transcribe. Two donor properties must be **rejected**, not ported: (a) `nx.shortest_path` returns **one** path, so on a ring or meshed MV feeder the backup set is silently incomplete — MV must enumerate all source→fault paths / use directed edge cuts; (b) device↔edge binding by `(Bus1,Bus2)` **string tuple** violates MV's identity law — MV must bind via `ProtectionAssignment` → `Bay`/`Port`/`PortRef` ids | `application/analyses/protection/coordination/` (new `pary_zabezpieczen.py`); reads ENM via `enm/topology.py` | **read-only**; reuses `ProtectionAssignment`, `Port`, `PortRef`, `ConnectionNode`. No new ENM element, no second source of truth | replaces list-order pairing at `analyzer.py:545`; `run_protection_coordination` gains a derived `relay_pairs` provider (signature unchanged) | Medium. Ring/mesh enumeration is the hard part; must stay deterministic (sorted paths, stable ids) | Golden ENM fixtures: radial feeder, **ring closed**, ring open, tie-switch, feeder with mid-line OZE infeed, transformer-bounded zone. Assert the exact pair set + a stable SHA-256 over it. Per KLASA-NIE-INSTANCJA test the **product** {radial, ring, meshed} × {directional, non-directional} × {DER present, absent}, not the one example | **P0** |
| S2 | Fault-case selection per zone | `PathTracingFuns.find_edgenode` (leaf nodes at max distance from each primary device); `ADAPT_OPTV10.py` l.460–512 (`MinFault_P`, `MinFault_N` from the fault matrix `M2`) | pick the fault cases bounding a device's zone | Fault points = graph leaves (degree 1) farthest from the primary device; min fault taken across the SLG/LL/3φ observations there | **none — this is G2** | Turns "caller supplies fault currents" into "the analysis asks the SC solver for the right faults" | **REWRITE_CLEAN_ROOM** | `application/analyses/protection/coordination/przypadki_zwarciowe.py`; **fault currents must come from MV's `short_circuit_iec60909`**, never from a donor formula | read-only | closes the loop SC solver → coordination without the caller in the middle | Medium — must respect **PERF-SC-50** (one SC run per zone boundary on a 50-station network is a lot of solver calls; batch it) | Assert each device's fault set is exactly {near-end c_max, far-end c_min} for its derived zone; determinism hash | **P1** |
| S3 | CTI constraint formulation | `RSO_pack/src/write_fit_fun.py` (whole file): `write_GA_fit_fun`, `write_Con` | CTI constraints + objective | `gac[p] = min(T_backup_candidates) − (min(T_primary_candidates) + CTI)`, feasible when `≥ 0`. `T*_candidates` = {phase IDMT, ground IDMT, phase instantaneous, ground instantaneous} filtered to `> 0` — i.e. **the fastest element of the device wins**, the correct way to grade a multi-stage relay. Constraints emitted only where `I/Ip ≥ 1.2` **and** `V < 0.95 pu` for both devices. Recloser pairs get a second constraint (fast→slow shot, hard-coded 0.2 s) | MV grades `t_upstream − t_downstream` for a single 51 stage; MV's API models 50/51/50HH/51N/50N but the **solver-level** margin check does not take the min across active stages | The "min over all active elements of the device" rule is the valuable piece and is directly usable by MV's existing multi-stage request model | **REWRITE_CLEAN_ROOM** (concept only; §3.3 lists three defects that must not travel) | `protection_iec60255.check_selectivity_pair` — extend to accept a device's stage set and grade on `min(t_active_stages)`; frozen dataclasses additive only | none | **strengthens the existing check**; today a fast 50 stage on the downstream device is invisible to the margin verdict | Low–Medium (frozen result API: add fields, never change existing ones) | Product test: {51 only, 51+50, 51+50+50HH, 51N} × {upstream faster stage, downstream faster stage} × {both pick up, only one picks up}. Pin the "min over stages" rule with a test ("deklaracja bez testu = fałszywa pewność") | **P1** |
| S4 | Optimizer engine | `ADAPT_OPTV10.py::runSettingsOptimizer` l.780–869; `RSO_pack/__init__.py`; `requirements.txt` | GA setting optimisation | `pygad.GA(num_generations=10000, sol_per_pop=50, num_parents_mating=5, gene_type=int, stop_criteria=["saturate_50"])`. The fitness function is **generated as Python source text on disk** by `write_fit_fun` then loaded with `importlib.util.spec_from_file_location(...).exec_module(...)` | none | G3 | **REJECT** as technology. Stochastic GA with **no fixed seed** in this call (`initial_population` is commented out), so identical input can give different settings — direct violation of MV's Determinism Rule. Runtime code generation + `exec_module` inside a FastAPI worker is unacceptable. `matplotlib.pyplot` imported at module scope and `plot_fitness()` called mid-run. Dependency stack `pygad + dss_python + matplotlib + pandas>=3.0.0` is **not acceptable** for MV's backend (`dss_python` drags OpenDSS; `pandas>=3.0.0` conflicts with MV's pinned stack) | — | — | — | — | — | — |
| S5 | Setting synthesis (replaces S4) | — | — | — | none | G3 | **REWRITE_CLEAN_ROOM**, deterministic: monotone downstream→upstream TDS relaxation (the O4 *pattern*) over the S1 pair graph and S2 fault cases, with an exact analytic inverse of `compute_idmt_generic` for the required TMS. Deterministic, WHITE BOX (every TMS bump a traceable step), no RNG | `application/analyses/protection/coordination/dobor_nastaw.py` (application layer — **synthesis is not physics**; it only calls the solver) | none | new capability: proposed settings + the proof that they grade | Medium. Must satisfy `protection_no_heuristics_guard.py` — every factor cited to a standard or an explicit named input | Same-input→same-output hash; convergence bound; a case with **no feasible solution** must report infeasibility, never a silent best-effort | **P1** |
| S6 | Re-verification under reconfiguration | `RSO_pack/src/SEN.py::checkSensivity` (l.22 ff., l.611–632) | check chosen settings in another configuration | Re-runs `write_Con` for a changed switch/DER state and flags `cti_min < 0.98·CTI` (`Error_code = 'SEN: minimum CTI Volated'`) | **none — this is G4** | Ring/tie/DER-online selectivity | **REWRITE_CLEAN_ROOM** | `application/analyses/protection/coordination/weryfikacja_konfiguracji.py` | reads ENM scenarios (`enm/scenariusze.py` exists) | catches the case MV cannot see today | Medium | Product test: {settings from config A} × {config A, ring closed, tie closed, DER off, DER on}; assert a FAIL is produced where one is due | **P1** |
| S7 | Relay curve model | `RSO_pack/src/OT_funs.py::OCOT/OCIT/mhoDist/OCTCC_Name` (whole file) | relay TCC | **US/ANSI U1–U5 only** (SEL constants). The IEC C1–C5 block is **commented out dead code**. Plus undocumented `TDS/10`, hard clamp `M>30 → M=30`, a discontinuity at `T=0.02`, an unconditional `+0.03 s` (§3.3) | MV's IEC 60255-151 + IEEE C37.112 engines, WHITE BOX, tested | Nothing — it cannot even express the European curve family MV needs | **REJECT** | — | — | — | — | — | — |
| S8 | Pickup / instantaneous sizing | `ADAPT_OPTV10.py` l.500–570 | derive Ip, Inp, IT | `Ip = 1.25·IL` if `Imin > 1.5·IL` else `0.5·Imin`; `Ip = 0.1·Imin` when `IL = 0`; `IT = 1.25·MaxBac` if `MaxPri/MaxBac ≥ 1.3` | MV: pickup is an input | Would close part of G3 | **REJECT as written** — uncited magic factors (1.25 / 1.5 / 0.5 / 0.1 / 1.3) are exactly what `protection_no_heuristics_guard.py` exists to stop; and the `enableIT==1` branch is **crash-broken** (§3.3). If MV wants pickup synthesis, derive it from PN-EN/PTPiREE practice with every factor a named, cited input | — | — | — | — | — | — |
| S9 | External-tool adapters | `RSO_pack/src_OpenDSS/`, `src_RONM/`, `src_RAVENS/`, `ravens_simplier_code/`, `Read_CSV_Functions.py` | OpenDSS/CAPE/RONM ingestion | CSV/JSON importers for third-party fault studies | MV has ENM + its own SC solver + an existing pandapower bridge | none | **REJECT** — a second network source of truth is forbidden by MV law #1 | — | — | — | — | — | — |

**One architectural fact worth keeping from Sandia**: PSO does **not** compute short circuits. It
consumes a fault-observation matrix produced by an external study (`read_Fault_CSV_Data` → `M2`).
That separation — *fault study is a separate, authoritative service; the coordination engine only
consumes it* — is exactly the shape MV should build: `short_circuit_iec60909` stays the sole
authority and the ZAB module consumes canonical run results. Free architectural confirmation.

---

## 3. oxigrid engineering validation

Per formula examined: what the code computes vs what the standard requires.

### 3.1 IDMT curves — `src/protection/relay.rs`

| Item | Code | Standard | Verdict |
|---|---|---|---|
| IEC constants | SI (0.14, 0.02), VI (13.5, 1.0), EI (80.0, 2.0), LTI (120.0, 1.0) | IEC 60255-151:2009 Table 1 | **Correct** |
| IEEE constants | MI (0.0515, 0.1140, 0.02), VI (19.61, 0.4910, 2.0), EI (28.2, 0.1217, 2.0) | IEEE C37.112-1996 | **Correct** |
| IEC evaluation | `tms * a / denom` | `t = TMS·A/(M^p−1)` | **Correct** |
| IEEE evaluation | `tms * (a/denom + b)` | `t = TD·(A/(M^p−1)+B)` | **Correct** (same convention MV uses) |
| Below pickup | `i_fault <= i_pickup → None` | correct | OK |
| Near M=1 | `denom < 1e-12 → INFINITY` | correct-ish | OK |
| Reset characteristic | **absent** | IEC 60255-151 defines definite-time and inverse reset | **Missing** (MV also lacks it — a shared, genuine gap) |
| Minimum operating time, accuracy class | **absent** | IEC 60255-151 accuracy/limit clauses | **Missing** |
| Short-time inverse curve | **absent** | in the standard family | **Missing** |
| `check_coordination` boundary case | `t_backup − t_primary`, both `unwrap_or(INFINITY)` | — | **Defect.** When neither relay picks up: `INFINITY − INFINITY = NaN`; `NaN >= margin` is false, so it reports **not coordinated with a NaN margin**. MV handles the same case explicitly (`t_up is None and t_down is None → PASS`). |
| Instantaneous element | returns `inst_time` unconditionally once `i ≥ inst_level` | should be `min(t_inst, t_idmt)` | Minor defect |
| Duplication | same formula in `relay.rs`, `coordination.rs`, `coordination_advanced.rs`, `coordination_optimizer.rs` — four curve enums, four evaluators | — | Structural: exactly the debt MV eliminated in card N-D4 |

### 3.2 IEC 60909 — `src/protection/iec60909.rs` (the headline finding)

| Quantity | Code | IEC 60909-0:2016 | Verdict |
|---|---|---|---|
| Equivalent voltage source | `eq_v_kv = c·Un/√3` | `cUn/√3` at the fault location | **Correct** |
| I″k3 | `eq_v_kv / |Z1|` | `cUn/(√3·|Z1|)` | **Correct** |
| **I″k1 (SLG)** | `(√3·c·Un/√3)/|Z1+Z2+Z0|` — the √3 **cancels itself** → `c·Un/|Z1+Z2+Z0|`. Its own doc-comment (l.13) states the correct `√3·c·Un/|Z1+Z2+Z0|` | `I″k1 = √3·cUn/|Z1+Z2+Z0|` | **WRONG — understated by exactly √3.** Verified numerically on the module's own `simple_2bus_network()` fixture (reproduced independently in Python): bus 0 → oxigrid 6.2489 kA vs IEC 10.8234 kA (ratio 1.73205); bus 1 → 3.0460 vs 5.2759 (ratio 1.73205). At bus 0, `Z0 < Z1`, so the correct SLG current (10.82 kA) **exceeds** the 3-phase current (9.62 kA), as physics requires; oxigrid returns 6.25 kA, i.e. *below* the 3-phase value. Physically impossible and unsafe. |
| I″k2 (LL) | `= c·Un/|Z1+Z2|` | `I″k2 = cUn/|Z1+Z2|` | **Correct** — but the doc-comment (l.14) states a different formula, `(√3/2)·I″k3·|Z1|/|Z1+Z2|`. Doc and code disagree; the code is the right one. |
| I″k2E (DLG) | `(c·Un/√3)/|Z1 + Z2‖Z0|` | that expression is the **positive-sequence component I₁**, not the fault current I″k2E (the IEC double-earth-fault formula involves `|Z2−Z0|` / `|Z1Z2+Z1Z0+Z2Z0|`) | **Mislabelled**: a sequence component returned in a field documented as "Initial symmetrical DLG SC current" |
| κ | `1.02 + 0.98·exp(−3R/X)` | IEC 60909-0 eq. (55) | **Correct** |
| I_th | `I″k·√(m+n)` with `m = 1.0` fixed and `n = 0.5·exp(−2t/τ)` | IEC 60909-0 §4.8: **m** is the *DC* heat factor, **n** the *AC* factor; `n = 1` far-from-generator and `m` is a defined function of κ and f·Tk | **Wrong twice**: m/n roles are swapped in the doc, and both values are invented. With `m=1, n≈0.5` it returns ≈1.22·I″k where far-from-generator IEC gives ≈1.0–1.05·I″k — a ~20 % overstatement. The code calls this "simplified"; MV's law calls it an undocumented heuristic. |
| **Impedance correction factors** | `grep -rn 'K_T|k_t|K_G|impedance_correction|1 + 0.6'` across all of `src/` → only hits are in `src/network/cable_sizing.rs` for ampacity derating. **None in the protection package** | IEC 60909-0 §6.3.3 `K_T = 0.95·c_max/(1+0.6·x_T)`; §6.6 `K_G`; power-station units `K_S/K_SO` | **Entirely absent.** This is the difference between IEC 60909 and a plain Thévenin study. MV implements `K_T` explicitly with a LaTeX WHITE BOX step. |
| Voltage factor `c` | Three inconsistent conventions in one crate: `iec60909.rs` default `1.1` with **no voltage-level table**; `shortcircuit.rs` `C_MAX_LV=1.10, C_MAX_HV=1.05, C_MIN=0.95` (these three constants are **never referenced anywhere else** — dead); `coordination_advanced.rs` `c_factor: 1.05` "for max" | IEC 60909-0 Table 1: MV/HV `c_max=1.10, c_min=1.00`; LV `c_max=1.05` or `1.10` by tolerance, `c_min=0.95` | **Wrong for MV/HV, the entire MV-DESIGN-PRO domain.** `C_MAX_HV=1.05` understates max fault current by 4.5 % (unsafe for equipment rating); `C_MIN=0.95` applied to MV understates min fault current by 5 % against the required `c_min=1.00`. |
| `FaultType` | `calculate_all` always writes `ThreePhase`; `calculate_at_bus(bus, ft)` calls `calculate_all` and then just **overwrites the tag**, changing no number | — | The fault-type API is decorative |
| Validation | 16 `#[test]` in the file. `test_slg_fault_formula` (l.746) asserts only `r.i_k1_ka >= 0.0`; the LL/DLG test asserts `>= 0.0`. `assert_relative_eq!` is used only for κ, config defaults and a `c`-proportionality ratio. **No test compares any current against a published IEC 60909 worked example or another tool.** | — | **The module is unvalidated.** Its tests are shape assertions (positive, monotone, larger-than) that a √3 error passes trivially. |

**Verdict on oxigrid as an engineering source: FAILS.** The README label "IEC 60909" is not
supported by the code. The IDMT *constants* are the only thing found that is both correct and
non-trivial, and MV already has them — with a single implementation, a WHITE BOX trace and real
tests, none of which oxigrid has. Every protection subsystem is **REJECT** or **STUDY_ONLY**.

### 3.3 Sandia — engineering validation of the pieces proposed for re-derivation

| Item | Code | Finding |
|---|---|---|
| Curve family | `OT_funs.py::OCOT` | Only US **U1–U5** (SEL) curves are live; the IEC **C1–C5** block is commented out. As shipped the optimizer **cannot optimise an IEC 60255 curve at all.** |
| `OCOT` numerics | `OT_funs.py` | `TDS = TDS/10` (undocumented scale); `M > 30 → M = 30` (undocumented clamp); `if T < 0.02: T = 0.02+0.03` then `return T+0.03` — so `T=0.019 → 0.08 s` but `T=0.021 → 0.051 s`: a **discontinuous, non-monotone** trip-time function at the boundary, plus a silent `+0.03 s` breaker time folded into what is reported as relay operating time. |
| Instantaneous | `OT_funs.py::OCIT` | Fixed `0.02 s`, hard-coded. |
| Distance | `OT_funs.py::mhoDist` | **Three bugs in ~20 lines**: `cy[ii]` where `cy[jj]` is meant; the second loop tests `tripzone[ii]` using the *leaked* `ii` instead of `kk`; only the last `Top` is returned. Dead-broken; not called by the optimizer. |
| Constraint bookkeeping | `write_fit_fun.py`, `del gac[pp-1:]` and `del Ttot[cc-1:]` | **Off-by-one**: `pp` counts written constraints, so this deletes index `pp-1` — the **last constraint is silently dropped** from the fitness. Same for the last operating time. If `pp == 0` the subsequent `min(gac)` runs over `None`s → `TypeError`. |
| Objective | `write_fit_fun.py` | `y2 = min(gac)` when feasible, and `Pen += i*0.01` per satisfied constraint, then `Z = −(y1+y1_1+y2+Pen)`. Margin above CTI is charged **twice** as a cost, so the optimum sits exactly at CTI with zero tolerance headroom. Defensible as intent, undocumented as implemented. |
| Instantaneous sizing | `ADAPT_OPTV10.py` l.540–566 | `MaxBac = max(MaxFault_Bac)` (a float) is followed by `if(len(MaxBac)!=0)` → **`TypeError` unconditionally** whenever `enableIT==1`; if the list is empty, `max()` raises `ValueError` first. Also `MaxFault0_Bac` filters on `F[20]==1` (the *primary* flag) instead of `F[21]==1`, and `ITg` is set from the **phase** `MaxBac` rather than `MaxBac0`. **All three shipped examples set `enableIT = 0`** (`Cape_Example.py:21`, `Opendss_Example.py:57`, `RONM_Example.py:67`) — this path has never been run. |
| Determinism | `ADAPT_OPTV10.py` l.808–820 | `pygad.GA` with no seed; `initial_population = initpop` is **commented out** even though the function accepts `GA_initial_seed`. Non-deterministic by construction. |
| Runtime code generation | `write_fit_fun.py` + `ADAPT_OPTV10.py` l.792–805 | Writes `.py` files to `Main_dir` and `exec_module`s them each pass. |
| "Independent" verification | `SEN.py` l.611–632 | Re-uses **`write_Con`**, i.e. the same constraint generator (and the same off-by-one). Structurally not an independent check. MV's version must use a genuinely separate evaluation path. |
| Validation | repo-wide | **No tests, no CI.** |
| Pair derivation (the good part) | `PathTracingFuns.py` | The algorithm is sound *for radial feeders*: path-walk + "primary = no intervening device". Its `nx.shortest_path` single-path assumption breaks on rings/meshes — precisely MV's MV-network case. |

---

## 4. Adversarial review — what would make each proposed adoption a mistake

- **S1 (topology-derived pairs, P0) would be a mistake if** MV copies the radial assumption. On a
  closed MV ring, `shortest_path` yields one path and the derived pair set is *plausible but
  incomplete* — worse than today's honest "caller asserts the order", because it looks derived. If
  MV cannot enumerate all source→fault paths deterministically, **do not ship S1**; a confidently
  wrong pair set silently produces a green selectivity verdict for a fault the ring backs up from
  the other side. Second failure mode: binding devices to `(bus_from, bus_to)` name tuples instead
  of `ProtectionAssignment`/`PortRef` ids — that imports a name/geometry-derived identity into the
  canonical model and breaches law #3/#4.
- **S2 (fault-case derivation, P1) would be a mistake if** it multiplies SC solver calls without
  regard to **PERF-SC-50**, the known open runtime regression on ~50-station networks. Zone-boundary
  faults for every device on a large network is a large multiple of today's load. Ship it only with
  batching and a measured runtime budget, or it converts a correctness win into an unusable feature.
- **S3 (min-over-stages grading, P1) would be a mistake if** it changes the meaning of existing
  fields in the frozen `SelectivityPairResult` / `ProtectionCoordinationResult`. `t_downstream_s`
  today means "the 51 stage's time". Silently redefining it as "the fastest stage's time" changes
  every stored `deterministic_signature` and every archived proof. New fields, additive only.
- **S5 (setting synthesis, P1) would be a mistake if** the relaxation may return a "best effort"
  when no feasible grading exists. An engineer handed TMS values that do *not* grade, labelled as a
  result, is worse off than one told "infeasible — here is the binding pair". Also a mistake if any
  factor in it is a bare number: `protection_no_heuristics_guard.py` is the correct gate and should
  stay red until every constant is cited or an explicit named input.
- **S6 (reconfiguration re-verification, P1) would be a mistake if** it reuses the S3 evaluator as
  its "independent" check — exactly the Sandia `SEN.py` mistake: an independence claim with a shared
  failure mode. Independence must be structural, not nominal.
- **O4/O7/O9 (STUDY_ONLY) become mistakes the moment anyone upgrades them to PORT.** §3.2 shows the
  repo's own numeric claims are unreliable; anything taken from it must be re-derived from the
  standard and re-tested, at which point the donor has contributed a hint and nothing more.
- **The whole ZAB programme would be a mistake if** built as a new island. MV law #1 and owner
  directive 1 (global end-to-end vision) mean pairs come from ENM, currents from
  `short_circuit_iec60909`, results into `canonical_runs`, and outputs flow to TCC charts, the
  proof pack and the SLD overlay. A standalone coordination module with its own device list would
  be a second source of truth.
- **Against my own P0**: the honest alternative to S1 is to keep the caller-supplied pair list and
  simply *validate* it against the topology (reject a pair with no path, or with a device in
  between). That is smaller, carries no ring-enumeration risk, and closes the "unverified
  assertion" hole without the correctness exposure. If deterministic ring enumeration cannot be
  achieved within the session, this validation-only variant is the right P0 and full derivation
  becomes P1.

---

## 5. Summary of decisions

| Decision | Subsystems |
|---|---|
| **REJECT** | O1 IDMT curves, O2 IEC 60909, O3 coordination check, O6 distance, O8 FLISR, S4 GA optimizer engine, S7 relay curve model, S8 pickup/instantaneous sizing, S9 external adapters |
| **STUDY_ONLY** | O4 optimizer *pattern*, O5 differential, O7 auto-recloser, O9 relay test-case generation |
| **REWRITE_CLEAN_ROOM** | S1 topology→pairs (**P0**), S2 fault-case derivation (P1), S3 CTI min-over-stages (P1), S5 deterministic setting synthesis (P1), S6 reconfiguration re-verification (P1) |
| **COPY / PORT / INTEGRATE** | **none.** No donor code enters MV: oxigrid is Rust and demonstrably wrong where checkable; Sandia is GPL-3.0. |
| MV-side defect to fix regardless of donors | `IEC60255CurveType.RI` mislabels IEC 60255-151 Long-Time Inverse; conflicts with MV's own `iec_curves.LONG_TIME_INVERSE`; UI/proof-visible (**P0**) |

The decisive framing holds and is confirmed by evidence, not assumed: the donors supply
**architecture and workflow** (S1/S2/S3/S5/S6) and **nothing normative**. Both donors' own formula
implementations are, where independently checkable, worse than MV's.

---

## 6. Explicitly NOT verified

- oxigrid was **not compiled or executed**. `cargo` and `rustc` are present in this environment,
  but I did not run `cargo test`; all Rust findings come from reading source and from an
  independent Python reproduction of `iec60909.rs`'s own `simple_2bus_network()` fixture (§3.2).
  A `cargo test` run would tell you whether oxigrid's tests pass — it would **not** change the
  finding, because the tests assert `i_k1_ka >= 0.0` and a √3 error passes that.
- Sandia PSO was **not executed** (needs `dss_python`/OpenDSS, `pygad`, `pandas>=3.0.0`, and
  external CSV fault studies). The `enableIT==1` crash and the `del gac[pp-1:]` off-by-one are read
  from source, not observed at runtime.
- oxigrid files **not** read in full (headers/greps only; no claim rests on them):
  `shortcircuit.rs` (1,786 L — only l.20–60 and the `c` constants), `fault.rs`,
  `fault_symmetric.rs`, `fault_asymmetric.rs`, `fault_current_limiter.rs`, `hif.rs`,
  `ibr_protection.rs`, `microgrid_protection.rs`, `motor_protection.rs`, `zone_protection/**`,
  `protection_testing.rs` (beyond l.380–490), `network/flisr.rs` (beyond l.1–28).
- Sandia files **not** read in full: `ADAPT_OPTV10.py` (869 L — read l.500–570, 780–869 and the
  import block), `SEN.py` (643 L — read l.22–40 and l.600–635), `DirCalc.py`,
  `Read_CSV_Functions.py`, `write2csv.py`, `src_OpenDSS/`, `src_RONM/`, `src_RAVENS/`,
  `ravens_simplier_code/`.
- The exact structure of the `M2` fault-observation matrix is inferred from its **use** in
  `write_fit_fun.py` (column groups `FI=[2,3,8,9,14,15]` currents, `VI=[4,5,10,11,16,17]` voltages,
  `NI=[6,7,12,13,18,19]` ground currents, `[20]`/`[21]` primary/backup flags), not from reading its
  construction end-to-end.
- No legal opinion is offered on either licence. The licence texts were read at the SHAs above and
  their obligations restated; the GPLv3 consequence for MV should be confirmed by the owner.
