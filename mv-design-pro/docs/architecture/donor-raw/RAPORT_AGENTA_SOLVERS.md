> **MATERIAŁ SUROWY SUBAGENTA — NIE JEST DECYZJĄ.**
> Raport agenta SOLVERS z audytu donorów 2026-09-07. Zachowany w repo jako dowód i ślad
> rozumowania (§14/§15 mandatu). **Twierdzenia w tym pliku NIE są zweryfikowane w całości.**
> Wiążące są: `OPEN_SOURCE_DONOR_AUDIT.md` (ustalenia zweryfikowane),
> `DONOR_DECISION_MATRIX.md` (decyzje) i `DONOR_AUDIT_CHECKPOINT.md` (pomiary własne).
> Gdzie ten plik jest sprzeczny z tamtymi — **tamte wygrywają**; sprzeczności wykryte
> przy weryfikacji są nazwane w `OPEN_SOURCE_DONOR_AUDIT.md` §7.

# REPORT_SOLVERS — AGENT SOLVERS, donor audit (2026-09-07)

MV baseline read at HEAD `5adc958d0fed5f783fd6c78d7e407d00354e5a54` (CV-4.3 K6), working tree clean.
Contract: `MV_BASELINE.md`. Decisions per SUBSYSTEM, never per repo.

## 0. Donor provenance (verified at cloned SHA, not from README)

| Donor | Commit SHA (clone) | Date | Version at SHA | License (verified how) |
|---|---|---|---|---|
| pandapower | `fd7346f1bb7cb0d452aef915f99001a8eb13a54f` | 2026-09-05 | `3.5.4` (`pandapower/_version.py`) | **BSD 3-Clause** — `LICENSE` head ("BSD 3-Clause License", Univ. Kassel / Fraunhofer IEE), `pyproject.toml:18 license-files = ["LICENSE","AUTHORS"]`. Per-file headers are copyright-only, no SPDX tags. |
| power-grid-model | `e50f1612b82f55e54a164259430ba9756ec332c1` | 2026-09-07 | `1.13` (`VERSION`) | **MPL-2.0** — `LICENSE` = "Mozilla Public License Version 2.0"; `pyproject.toml:19 license = "MPL-2.0"`; SPDX header in `src/power_grid_model/__init__.py` (`SPDX-License-Identifier: MPL-2.0`); `REUSE.toml` + `LICENSES/` present. |
| GElectrical | `47082c74b39f8075dbca9b643c64d069604bd22f` | 2025-12-17 | n/a (app, not lib) | **GPL-3.0-or-later** — `LICENSE` = GNU GPL v3; `setup.py:22 license="GPL-3.0"`, `setup.py:33` classifier GPLv3. **Measured: 37/37 `.py` files under `gelectrical/` carry the GPL header AND the "(at your option) any later version" clause — zero files without it.** |

**License obligation registered, no legal opinion given:** GElectrical is copyleft (GPL-3.0-or-later) across its entire Python tree. Copying any of its code, or a derivative of it, into MV-DESIGN-PRO is **FORBIDDEN** for the purposes of this audit. STUDY_ONLY, behavioural benchmark, and clean-room re-specification remain available. pandapower (BSD-3) and power-grid-model (MPL-2.0, file-level copyleft) carry no such copy prohibition, but MPL-2.0 attaches per-file obligations to any *modified PGM file* redistributed — irrelevant if PGM is only consumed as an installed dependency.

---

## 1. What I actually read

**MV side (read, not skimmed):**
`backend/src/application/reference_networks/pandapower_bridge.py` (full, 214 L — `enm_to_pandapower_dict`, `run_pandapower_powerflow`, `_require_pandapower`);
`backend/tests/golden/wyrocznie/pandapower.py` (full, 246 L — `zbuduj_siec`, `rozplyw`, `zwarcie_3f`, `_stopnie_z_grupy`, `CZESTOTLIWOSC_HZ`, `LV_TOL_PERCENT`, `GRUPA_DOMYSLNA`);
`backend/tests/golden/wyrocznie/test_pandapower_wyspy.py` (full, 182 L — `TOLERANCJA_U_PU/_KAT_DEG/_MOC_MW/_IK_WZGL`, `test_ext_grid_s_sc_rowne_deklarowanemu_sk`);
`backend/tests/application/reference_networks/test_pandapower_bridge.py` (full, 61 L);
`test_pandapower_cross_validation.py` (head + fixture `pp`, `_build_pandapower_4bus`);
`src/application/reference_networks/frozen_solver_input.py` (docstring + `_slack_bus_and_voltage`, `_transformer_for_tap`);
`expected_values.py` (`ExpectedBusPF`, `ExpectedBranchPF`, `ExpectedShortCircuit`, `_zaokraglij`);
`benchmark_wiring.py` (`CROSS_VALIDATION_PROOF_TYPE`, `FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE`, `build_ieee_benchmark_references`);
`scripts/regenerate_expected_values.py` (full);
`.github/workflows/python-tests.yml` lines 42-51, 180-246 (job `pandapower-cross-validation`);
all 12 `src/application/reference_networks/expected/*.json` (provenance keys, programmatically);
solvers (capability boundaries): `short_circuit_iec60909.py` (`ShortCircuitResult`, `ShortCircuitIEC60909Solver`, `_inverter_transfer_factors`, `_inverter_branch_contributions`), `short_circuit_core.py` (**full** — `build_zbus`, `compute_equivalent_impedance`, `voltage_factor_for_fault`, `compute_ikss`), `power_flow_newton.py` (`solve_power_flow_physics`, `PowerFlowNewtonSolver`), `power_flow_unbalanced.py` (`solve_unbalanced_backward_forward_sweep`, `UnbalancedNetworkInput`);
`src/enm/models.py` (all 75 classes enumerated; `Transformer`, `Source`, `Load`, `ShuntCapacitor`, `Generator`, `GEN_TYPES_PRZEKSZTALTNIKOWE` read in full);
`src/enm/canonical_analysis.py` lines 1860-1930 (the per-fault-node loop);
`backend/pyproject.toml` + `poetry.lock` (python `^3.11`, numpy `1.26.4`, scipy `1.17.0`);
`docs/architecture/DONOR_AUDIT_CHECKPOINT.md` CP-1/CP-2 (PERF-SC-50 measurement of record).

**pandapower @ fd7346f1:** `pandapower/shortcircuit/calc_sc.py` (`calc_sc` signature + full docstring + fault-type guard), `pandapower/shortcircuit/` file list, `pandapower/pf/runpp_3ph.py` (`runpp_3ph`), element creator inventory from `pandapower/create/*.py` (57 `create_*` symbols), `pandapower/converter/` (cim, jao, matpower, opendss, pandamodels, powerfactory, pypower, pypowsybl, ucte), `pandapower/protection/protection_devices/ocrelay.py` (`OCRelay`, curve types, `tms`/`t_grade`), `pandapower/protection/run_protection.py` (`calculate_protection_times`).

**power-grid-model @ e50f1612:** `src/power_grid_model/_core/enum.py` (`CalculationType`, `CalculationMethod`, `FaultType`, `FaultPhase`, `ShortCircuitVoltageScaling`, `WindingType`, `LoadGenType`, `TapChangingStrategy`, `MeasuredTerminalType`), `src/power_grid_model/_core/power_grid_model.py` (`calculate_short_circuit` overloads), `docs/algorithms/sc-algorithms.md` (full), `docs/user_manual/calculations.md` short-circuit + batch sections, `docs/user_manual/components.md` (source attrs `sk`/`rx_ratio`/`z01_ratio`, transformer `uk`/`pk`), `docs/user_manual/performance-guide.md`, `pyproject.toml` (`requires-python >=3.12`, `numpy>=2.0.0`, scikit-build-core), component inventory from `code_generation/data/dataset_class_maps/`.

**GElectrical @ 47082c7:** `gelectrical/model/networkmodel.py` (`NetworkModel.setup_global_nodes` **read in full**, `port_mapping`, `combine_connected_nodes`, `build_graph_model`, `get_upstream_element`/`get_downstream_element`), `gelectrical/model/pandapower.py` (`PandaPowerModel.build_power_model`, `run_diagnostics`, `run_powerflow`, `run_powerflow_timeseries`, `run_sym_sccalc`, `run_linetoground_sccalc`, `update_results`, `export_html_report`), `gelectrical/model/protection.py` (`ProtectionModel.evaluate_curves` incl. `mod_curve`/`iec`/`thermal`/`i2t`, `contains`, `get_time`, `get_current`, `get_thermal_protection_models`), `gelectrical/model/rulescheck.py` (`rules_check`, `electrical_rules_check`), `requirements.txt`.

**I did NOT read** (and therefore make no claim about): pandapower's `estimation/`, `opf/`, `timeseries/`, `control/` internals; PGM's C++ core (`power_grid_model_c/**` `.hpp` sources) beyond enum/doc surface; GElectrical's GTK view layer.

---

## 2. THE CENTRAL FINDING — what CV-4.3 K6 proves about cross-validation

K6 fixed a Z_Q mapping bug (system source impedance missing factor `c`, IEC 60909-0:2016 6.2.1 eq. 6). Solver-vs-solver parity had been GREEN throughout. Reading the oracle's own code (`tests/golden/wyrocznie/pandapower.py`, `zbuduj_siec`) shows exactly why:

```
s_sc_max_mva = c_max * u_kv**2 / abs(z_ohm)      # s_sc reconstructed FROM the IR impedance
```

The bridge **derived pandapower's input from MV's own mapped impedance**. Whatever `Z_Q` the MV mapper produced — right or wrong — was fed back to pandapower as the reference. Both sides then solved the *same wrong network* and agreed to 1e-4. The test `test_ext_grid_s_sc_rowne_deklarowanemu_sk` (added at K6) is the correction: it asserts the reconstructed `s_sc_max_mva` equals the **declared** `Source.sk3_mva`, i.e. it validates the *mapping convention*, not the numerics.

**Conclusion, and it is the contract this audit rests on:**

> Solver-vs-solver parity proves **numerical agreement of two implementations on one mapped network**. It proves **nothing** about whether the mapped network is the network the user declared. Any adapter whose reference inputs are *derived from MV's own mapper output* is a tautology detector, not an oracle.

Therefore an adapter contract must require **two separate assertions**:
1. **Mapping assertion** — every adapter input is compared to the **declared ENM field**, not to an MV-computed intermediate. (`s_sc_max_mva == sk3_mva`, `vk_percent == uk_percent`, `c` from the shared table, etc.)
2. **Numerical assertion** — the two solvers agree within a tolerance **pinned by measurement**, with the physical cause of the residual named.

MV has (2) exemplarily (`TOLERANCJA_*` constants each carry a measured value and a named physical cause: 0.1 mOhm switch model -> ~10 mV on 400 V). MV has (1) at exactly **one** point — the K6 test — for exactly **one** field. That is the gap.

---

## 3. Subsystem matrix

Fields per subsystem: donor - commit - license - read - capability - MV equivalent - gap - benefit - **decision** - target MV module - ENM impact - solver impact - migration risk - test strategy - priority.

### S-1 - ENM->pandapower oracle mapper
- **Donor/commit/license:** pandapower `fd7346f1` - BSD-3 (consumed as dependency, nothing copied)
- **Read:** `tests/golden/wyrocznie/pandapower.py` (`zbuduj_siec`, `rozplyw`, `zwarcie_3f`)
- **Capability:** builds a pandapower net from a real `EnergyNetworkModel` reusing MV's own rules (`enm.mapping._source_positive_impedance_ohm`, `voltage_factor.c_for_node`, `power_flow_newton_internal.transformer_phase_shift_rad`, `solver_input.moc_bierna_wytworcy`, `enm.models.liczba_torow`) — so a divergence is a *solver* divergence, not a bridge divergence. Refuses out-of-scope elements by name (`ValueError`), never silently.
- **MV equivalent:** this **is** the MV artefact. No donor gap.
- **Gap (measured):** covers Bus, OverheadLine/Cable, SwitchBranch/FuseBranch, Transformer (2W), Source, Load(PQ), Generator(sgen/gen). **Refuses**: ZIP loads, `ShuntCapacitor`, any other branch type. **Never reached at all**: `Measurement`, `ProtectionAssignment`, `Bay`/`GPZSection`/`NnSection` runtime, `CableJoint`/`LineRun`, `Transformer.tap_changer` (the V12K-045 canonical tap-changer — only the legacy `tap_*` fields are mapped), `Transformer.hv_neutral`/`lv_neutral` grounding, `Source.r0_ohm`/`x0_ohm`/`z0_z1_ratio` (zero-sequence — so 1F/2F+G are structurally out of oracle reach), `Generator` as an IEC 60909 SC source (`z_wytworcami=False` by construction).
- **Coverage measured:** exercised on **3 of 18** LV scenarios (`02_two_tr_qbc_open`, `05_independent_upstream`, `06_conflict_parallel_sources`) out of `SCENARIUSZ_PO_SLUGU`; the golden registry itself holds **17** `WpisRejestru` entries, none of which the oracle touches.
- **Benefit of hardening:** each newly covered element class converts an *unvalidated mapping convention* into a *checked* one — the K6 class of bug, per element.
- **DECISION: KEEP + HARDEN.** Keep the module as the single ENM->pandapower mapper. Harden along three axes: (a) mapping assertions per element (section 2 rule 1), (b) an explicit closed-list guard so a new ENM element type cannot be added without either oracle coverage or a named refusal, (c) provenance publication (section 5).
- **Target MV module:** `backend/tests/golden/wyrocznie/pandapower.py` + new guard `scripts/oracle_coverage_guard.py`
- **ENM impact:** none. Adapter reads ENM; adds no field.
- **Solver impact:** none (read-only consumer, B-01 respected).
- **Migration risk:** LOW. Additive tests; no production path touched.
- **Test strategy:** per element class, a **pair**: (i) mapping test asserting the pandapower input column equals the declared ENM field, (ii) numerics test with a measured tolerance and a named physical cause. Plus a coverage guard that enumerates `enm.models` element classes and fails on any class that is neither mapped nor explicitly refused by name in `zbuduj_siec`.
- **Priority: P0** (this is where K6-class bugs live).

### S-2 - Legacy dict mapper `pandapower_bridge.py`
- **Donor/commit/license:** n/a (MV-authored) — audited because the brief named it
- **Read:** full file + its only consumer `tests/application/reference_networks/test_pandapower_bridge.py`
- **Capability claimed:** ENM-like dict -> pandapower net + NR power flow.
- **Measured reality:** it is a **second, independent ENM->pandapower mapper** living in `src/` with **zero production consumers**. `grep` for `pandapower_bridge|enm_to_pandapower_dict|run_pandapower_powerflow` across the whole backend returns only its own test file and a docstring mention in `test_wymagane.py`. Meanwhile `tests/golden/wyrocznie/pandapower.py` opens with "**JEDEN most ENM -> pandapower**" ("THE ONE bridge") — a statement its own repo contradicts.
- **Silent defaults it injects (verbatim from the file):** `vkr_percent=0.5`, `pfe_kw=0.5`, `i0_percent=0.1` (comment: "STALE uproszczenie tego mostka (nie czytaja ZADNEGO pola fikstury)"), `max_i_ka=1.0`, `r_ohm_per_km = r_pu * 100.0`, `x_ohm_per_km = x_pu * 100.0`, `c_nf_per_km = b_pu * 10.0` (comment: "rough conversion"). The `100.0` is a hardcoded z-base; the `10.0` has no documented derivation at all.
- **Its tests assert nothing:** `test_ieee_4bus_converts_without_error` (shape only), `len(bus_idx_map)==4`, `abs(v_slack-1.0)<1e-6` (tautological — it is the slack), `0.95 < v_bus2 < 1.001`. **It never compares against an MV solver.** It is not a cross-validation; it is a smoke test of pandapower itself.
- **Gap:** two mappers for one physics path (MV's own ZASADA NR 3: "dwie sciezki tej samej fizyki -> naprawione od razu"); test-only code in `src/` (ZASADA NR 1: "funkcja istniejaca tylko w testach, niewpieta w sciezke uzytkownika, to dlug"); silent fabricated defaults (adapter-contract violation, section 5).
- **DECISION: REPLACE ADAPTER -> delete.** Not "harden". The module has no consumer, no assertion value, and its existence makes the phrase "the pandapower bridge" ambiguous in exactly the area where K6 showed ambiguity is expensive. Delete `pandapower_bridge.py` and `test_pandapower_bridge.py`; if the IEEE-4bus shape check is wanted, it belongs in `wyrocznie/pandapower.py` as a mapping test with real assertions.
- **Target MV module:** delete `src/application/reference_networks/pandapower_bridge.py`, `tests/application/reference_networks/test_pandapower_bridge.py`; update the docstring reference in `test_wymagane.py`.
- **ENM impact:** none. **Solver impact:** none.
- **Migration risk:** LOW — verified zero production consumers by grep across `src/` and `tests/`.
- **Test strategy:** post-deletion, a `grep_zero_guard.py`-style assertion that `enm_to_pandapower_dict` has no occurrences; the coverage guard from S-1 then has a single mapper to enumerate.
- **Priority: P0** (it is live ambiguity in the exact subsystem K6 just corrected).

### S-3 - pandapower short circuit as SC oracle
- **Donor/commit/license:** pandapower `fd7346f1` - BSD-3
- **Read:** `pandapower/shortcircuit/calc_sc.py` — `calc_sc(net, bus, fault, case, lv_tol_percent, topology, ip, ith, tk_s, kappa_method, r_fault_ohm, x_fault_ohm, branch_results, ..., use_pre_fault_voltage)`; guard `if fault not in ["3ph","2ph","1ph"]: raise NotImplementedError`
- **Capability:** IEC/DIN EN 60909 equivalent-voltage-source method; `3ph`/`2ph`/`1ph`; `max`/`min`; `lv_tol_percent` 6 **or** 10 (so `c_max` 1.05 **or** 1.10 for LV — matches MV's `c_for_node`); `ip` (kappa, `kappa_method` B/C), `ith` (thermal equivalent, `tk_s`); `topology` meshed/radial/auto; fault impedance `r_fault_ohm`/`x_fault_ohm`; branch SC results (**flagged beta and unreliable for transformers by the library itself**); superposition "Type C" via `use_pre_fault_voltage`.
- **MV equivalent:** `short_circuit_iec60909.py` (3F/2F/1F/**2F+G**, kappa, I_th with measured `m`/`n`, inverter contributions per V12K-184, machine SC via `machine_sc_iec60909.py`, branch contributions).
- **Gap:** pandapower **cannot do 2F+G** — `NotImplementedError` at the fault-type guard. MV's `compute_equivalent_impedance` implements `z_equiv = z1 + z2*z0/(z2+z0)` for `TWO_PHASE_GROUND`. **MV's 2F+G has no oracle and pandapower cannot ever provide one.** Also unexercised today: `1ph`/`2ph` (MV oracle calls only `fault="3ph"`), `ip`/`ith` (`ip=False, ith=False` in `zwarcie_3f`), machine/inverter contributions.
- **Benefit:** `1ph` + `2ph` + `ip`/`ith` are all reachable **now**, with the mapper MV already has, once `Source.r0_ohm/x0_ohm/z0_z1_ratio` and `Transformer.hv_neutral/lv_neutral` are mapped to pandapower's zero-sequence columns. That is a large, cheap increase in evidential coverage.
- **DECISION: EXTEND (USE ONLY AS ORACLE).** pandapower stays strictly an oracle — MV law 5 (physics only in MV solvers, WHITE BOX mandatory) forbids it in any production path, and nothing here argues otherwise.
- **Target MV module:** `tests/golden/wyrocznie/pandapower.py` — add `zwarcie_1f`, `zwarcie_2f`, and kappa/I_th comparison; extend `zbuduj_siec` with zero-sequence mapping.
- **ENM impact:** none — the fields (`r0_ohm`, `x0_ohm`, `z0_z1_ratio`, `GroundingConfig`) already exist and are already used by MV's solver. This closes an *unmapped-but-present* gap, it does not add ENM surface.
- **Solver impact:** none (read-only).
- **Migration risk:** MEDIUM. Zero-sequence conventions are where oracles most often disagree for reasons that are conventions, not bugs (transformer vector-group zero-sequence path, neutral earthing impedance x3). Every residual must get a named physical cause before its tolerance is pinned, exactly as `TOLERANCJA_IK_WZGL` did.
- **Test strategy:** for each fault type, mapping assertions first (`z0_z1_ratio` -> pandapower source `x0x_max`/`r0x0_max`; `GroundingConfig` -> trafo `vk0_percent`/`mag0_percent`/`si0_hv_partial`), then numerics with measured tolerance. 2F+G explicitly documented in the oracle module as **out of pandapower's reach** — a named refusal, not a silent omission.
- **Priority: P1**

### S-4 - pandapower asymmetric / 3-phase power flow
- **Donor/commit/license:** pandapower `fd7346f1` - BSD-3
- **Read:** `pandapower/pf/runpp_3ph.py` (`runpp_3ph`), element creators `create_asymmetric_load`, `create_asymmetric_sgen`
- **Capability:** sequence-domain 3-phase unbalanced PF. Its own docstring states it "has proved successful only for Earthed transformers (Dyn, Yyn, YNyn, Yzn)".
- **MV equivalent:** `power_flow_unbalanced.solve_unbalanced_backward_forward_sweep` — a **radial BFS** method (`_build_radial_topology`), with `UnbalancedNetworkInput`, `PhasePower`, and a voltage-unbalance-factor computation.
- **Gap:** MV's unbalanced PF has **no oracle at all**. Its algorithm class (BFS, radial-only) differs from pandapower's (sequence-domain, meshed-capable), which makes it a genuinely *independent* check rather than a re-implementation of the same maths — the strongest kind of oracle.
- **Benefit:** first independent validation of a solver that today rests entirely on MV's own tests. Restriction to earthed vector groups is acceptable — Dyn11/Dyn5 is the MV/LV distribution case that matters.
- **DECISION: EXTEND (oracle).**
- **Target MV module:** `tests/golden/wyrocznie/pandapower.py` — new `rozplyw_niesymetryczny()`; ENM `Load`/`Generator` per-phase data must map to `create_asymmetric_load`/`create_asymmetric_sgen`.
- **ENM impact:** **needs checking before work starts** — I did not verify that ENM carries per-phase load data. If it does not, this subsystem's precondition is an ENM question, not an adapter question, and must be routed as such rather than solved by inventing per-phase values in the adapter (that would be a silent default).
- **Solver impact:** none.
- **Migration risk:** MEDIUM — radial-vs-meshed and BFS-vs-sequence differences will surface as real residuals needing physical explanation.
- **Test strategy:** restrict to radial earthed-vector-group networks where both methods are valid; compare per-phase |V| and the unbalance factor.
- **Priority: P2** (blocked on the ENM per-phase question above).

### S-5 - `pp.diagnostic()` as an adapter self-refusal channel
- **Donor/commit/license:** pandapower `fd7346f1` - BSD-3; pattern also seen in GElectrical (GPL — pattern only, no code)
- **Read:** `GElectrical/gelectrical/model/pandapower.py::PandaPowerModel.run_diagnostics` (maps pandapower diagnostic codes — `disconnected_elements`, per-table `switch`/`line`/`trafo`/`trafo3w`/`load`/`gen`/`sgen`/`ext_grid` — back to user-visible element `ref` fields)
- **Capability:** the adapter runs the third-party library's own consistency diagnostics and **translates them into domain-language messages naming the user's elements**.
- **MV equivalent:** `NetworkValidator` runs on the MV side. The pandapower oracle currently discards pandapower's opinion entirely.
- **Gap:** if pandapower considers the mapped net inconsistent (isolated bus, nominal-voltage mismatch across a switch, implausible impedance) the MV oracle either does not see it or lets it surface as a numerical residual — the failure mode that hides mapping bugs.
- **Benefit:** turns adapter-side disagreement into a **named refusal** instead of a tolerance miss. Directly targets the K6 class.
- **DECISION: REWRITE_CLEAN_ROOM** (pattern is GPL-observed in GElectrical; the pandapower API being called is BSD and freely callable — write MV's own mapping of diagnostic codes to ENM `ref_id`s).
- **Target MV module:** `tests/golden/wyrocznie/pandapower.py` — call `pp.diagnostic(..., return_result_dict=True)` after `zbuduj_siec` and fail the oracle on any diagnostic that is not on an explicitly justified allowlist.
- **ENM impact:** none. **Solver impact:** none.
- **Migration risk:** LOW-MEDIUM — pandapower diagnostics are chatty; the allowlist must be justified per code, in writing, or it becomes a suppression mechanism (which would be the mistake, see section 6).
- **Test strategy:** a test asserting the allowlist is non-empty-justified and that an intentionally broken ENM (isolated bus) makes the oracle fail with the element's `ref_id` in the message.
- **Priority: P1**

### S-6 - pandapower converters (CIM/CGMES, PowerFactory, OpenDSS, MATPOWER, UCTE, pypowsybl)
- **Donor/commit/license:** pandapower `fd7346f1` - BSD-3
- **Read:** `pandapower/converter/` directory inventory only — I did **not** read the converter implementations.
- **Capability:** import from external grid-data formats.
- **MV equivalent:** none.
- **Gap/benefit:** a real capability MV lacks, but it is an **import** feature, not a solver feature, and it would create a second path by which data enters the system — the exact shape MV law 1 guards ("no third-party solver model may become a second source of truth"). Any import must land in ENM through the normal validated path.
- **DECISION: STUDY_ONLY** — out of AGENT SOLVERS' scope; flag to whoever owns data ingest. I make no capability claim beyond the directory listing.
- **Priority: P2**

### S-7 - pandapower protection (`OCRelay`, `Fuse`)
- **Donor/commit/license:** pandapower `fd7346f1` - BSD-3
- **Read:** `pandapower/protection/protection_devices/ocrelay.py` (`OCRelay`, `curve_type` in standard/very/extremely/long inverse, `tms`, `t_grade`, `I_s`, `alpha`, trip-time formula `t = tms*k/((I/Is)^alpha - 1) + t_grade`), `pandapower/protection/run_protection.py::calculate_protection_times`
- **MV equivalent:** `protection_iec60255.py` (`compute_idmt_generic`, `compute_ieee_c37112_generic`, `compute_curve_trip_time`, `compute_i2t_thermal_energy`, `check_selectivity_pair`, `run_protection_coordination`) + `src/protection/curves/{iec,ieee}_curves.py`, `curve_calculator.py` + `protection_lv_curves.py` (which already carries IEC 60898-1 band logic via `lv_mcb_bands_iec60898.PASMA_MAGNETYCZNE`).
- **Gap:** MV's coverage here is *broader*, not narrower. pandapower adds a grid-coupled auto time-grading loop MV does not have, but its curve maths is a subset.
- **DECISION: STUDY_ONLY** — and explicitly **defer the verdict to AGENT PROTECTION**; I am not the owner of that subsystem and will not adjudicate it from a solver seat.
- **Priority: P2**

### S-8 - Reference-value provenance and version pinning
- **Donor/commit/license:** n/a (MV-authored, audited because the brief asks whether the bridge publishes provenance)
- **Read:** all 12 `expected/*.json` (programmatic key extraction), `scripts/regenerate_expected_values.py` (full), `.github/workflows/python-tests.yml:238`
- **Measured:**
  - **Good:** the three MATPOWER-derived files (`ieee_9bus`, `ieee_14bus`, `ieee_39bus`) carry a real `provenance` block — `reference_tool: "pandapower 3.4.0"`, `reference_source`, `generated_by_script`, and an `assumptions` object that *names what was deliberately NOT generated* ("sc": "NOT GENERATED. MATPOWER case9 carries no short-circuit data ... would require fabricating that data"). This is exemplary and should be the template.
  - **Gap 1 — version drift:** references were generated with **pandapower 3.4.0**; CI installs **pandapower 3.5.4** (`python-tests.yml:238`, and the SHA I audited *is* 3.5.4). Nothing asserts the installed version matches the recorded one. A pandapower behaviour change between 3.4.0 and 3.5.4 would surface as an MV solver failure.
  - **Gap 2 — 9 of 12 files have no `provenance` key at all** (`cigre_lv_benchmark`, `cigre_mv`, `iec60909_example`, `ieee_13bus`, `ieee_34bus`, `ieee_4bus`, `oze_pv_bess`, `pandapower_iec60909_radial`, `pp_simple_four_bus`) — including `pandapower_iec60909_radial.json`, whose free-text `source` says "pandapower.shortcircuit.calc_sc" but records **no version** for the tool that produced it.
  - **Gap 3 — a script that does not do what it says.** `regenerate_expected_values.py` module docstring: "Dla kazdej sieci **uruchamia aktualny solver** (NR/BFS...)". Its body: `# In a real implementation we would invoke the actual solver here.` followed by `write_text(json.dumps(existing, ...))` and `print("  ✓ Normalized JSON formatting")`. It **re-serialises the file it just read**. A maintainer running `--confirm --all` is told the values were regenerated; nothing was regenerated. Under MV's Zero-Debt rule this is a defect to fix at source, and under KLASA-NIE-INSTANCJA rule 4 ("deklaracja bez testu = falszywa pewnosc") the docstring is the more dangerous half.
  - **Gap 4 — no runtime provenance:** `pandapower.__version__` is recorded **nowhere** in `tests/golden/wyrocznie/` or `tests/application/reference_networks/` (grep: zero hits). The live oracle publishes no provenance whatsoever.
- **DECISION: HARDEN** (all four).
- **Target MV modules:** `expected/*.json` (+ a schema guard requiring `provenance`), `scripts/regenerate_expected_values.py` (make it regenerate or make it honest — not both), `tests/golden/wyrocznie/pandapower.py` (emit provenance).
- **ENM impact:** none. **Solver impact:** none.
- **Migration risk:** LOW.
- **Test strategy:** a guard asserting every `expected/*.json` has a `provenance` block with `reference_tool` including a version; a session-scoped test asserting the installed `pandapower.__version__` equals the version recorded in the references it is about to validate against (fail loudly on drift, do not auto-accept).
- **Priority: P0** for Gaps 1 and 3 (a lying script and an unpinned oracle are both silent-failure generators); **P1** for 2 and 4.

### S-9 - power-grid-model as a second independent solver adapter — **core verdict**
- **Donor/commit/license:** power-grid-model `e50f1612` (v1.13) - MPL-2.0
- **Read:** `_core/enum.py`, `_core/power_grid_model.py` (`calculate_short_circuit`), `docs/algorithms/sc-algorithms.md`, `docs/user_manual/calculations.md`, `docs/user_manual/components.md`, `docs/user_manual/performance-guide.md`, `pyproject.toml`, component inventory
- **Capability (verified):** `CalculationType` = power_flow | state_estimation | short_circuit. `CalculationMethod` = linear, newton_raphson, iterative_linear, iterative_current, linear_current, **iec60909**. `FaultType` = three_phase, single_phase_to_ground, two_phase, **two_phase_to_ground**. Native symmetric *and* asymmetric datasets (`asym_load`, `asym_gen`, `asym_line`, `asym_*_sensor`). `three_winding_transformer`, `generic_branch`, `transformer_tap_regulator`, `voltage_regulator`, `link`, `shunt`, `fault`. Batch API with dependent/independent updates, topology caching, `threading` (default `-1` = sequential). Source attrs `sk`, `rx_ratio`, `z01_ratio` — the same shape as ENM `Source`.
- **Hard blockers, measured:**
  1. **`requires-python = ">=3.12"`.** MV is `python = "^3.11"`, interpreter 3.11.15, CI `python-version: '3.11.x'`. PGM v1.13 **cannot be installed** in any current MV environment.
  2. **`numpy>=2.0.0`.** MV locks **numpy 1.26.4**, and the numpy pin is load-bearing for golden solver hashes (the same reason `pandapower` already needs an isolated venv over `scipy<1.17`). PGM would require a *second* isolated environment, on a *different Python*.
  3. **WHITE BOX (MV law 5).** PGM's numerics are a C++ core behind a C ABI. It exposes results, not Y-bus / Z-thevenin / Jacobian intermediates. **It can therefore never be an MV production solver.** Its only admissible role is oracle — the same role pandapower already fills.
- **Capability blockers as an SC oracle, from PGM's own docs (`docs/algorithms/sc-algorithms.md`):**
  4. *"In power-grid-model we only use the value for a 10% voltage tolerance."* — `c_max = 1.10` for `U_nom <= 1 kV`, always. MV uses `c_max = 1.05` (6% tolerance, IEC 60909-0 Tab. 1) via `voltage_factor.c_for_node`, and the pandapower oracle deliberately passes `lv_tol_percent=6` to match. **PGM would disagree with MV by ~4.8% on every LV bus, by construction.** MV's LV domain (`NnSection`, LV bays, `fault_loop_iec60364`) is not a corner of the product.
  5. PGM **deviates from IEC 60909 on prefault voltage**: it uses the *source's* rated voltage, not the *fault node's*, introducing `k = (u1*u_rated2)/(u2*u_rated1)` — documented as "roughly 0.97 to 1.03 on a practical grid", with the suggested remedy "simply leave a margin of ~1.03". MV maps `Transformer.uhv_kv`/`ulv_kv` independently of `Bus.voltage_kv`, so `k != 1` is the normal case, not the exception. A +/-3% unexplained bias is larger than every tolerance MV currently pins (`TOLERANCJA_IK_WZGL = 1e-4`) by more than two orders of magnitude — it would either be papered over with a loose tolerance (destroying the oracle's value) or misread as an MV bug.
  6. *"Short-circuit calculations are currently implemented in the phase (abc) domain and therefore require a grounded network."* Polish MV distribution networks are commonly compensated (Petersen coil) or resistance-earthed. ENM models this explicitly (`GroundingConfig`, `Transformer.hv_neutral`/`lv_neutral`). This is a domain-central limitation.
  7. PGM SC ignores loads and generation entirely — only `source` provides infeed. It therefore **cannot** validate `machine_sc_iec60909.py` or the inverter SC contributions (V12K-184) at all. pandapower can (gen `xdss_pu`, `motor`, sgen IEC 60909 k-factor).
- **The one genuine unique value:** **`FaultType.two_phase_to_ground`.** MV implements 2F+G (`z_equiv = z1 + z2*z0/(z2+z0)`); pandapower raises `NotImplementedError`. PGM is the only audited donor that could ever oracle it. But blockers 4-6 mean that even for 2F+G, PGM's answer would carry an unexplained +/-3% prefault-voltage bias and an LV `c` mismatch — so it would validate the *shape* of MV's 2F+G formula, not its *value*.
- **DECISION: REJECT for now — revisit only under a named precondition.** Not "adopt"; not "never". A second oracle is only worth two isolated CI environments if it can answer a question pandapower cannot answer *cleanly*. Today it cannot: its unique fault type comes bundled with three systematic deviations (LV `c`, prefault voltage, grounding requirement) that would each need to be modelled away before a single assertion could be pinned. **Precondition to revisit:** MV moves to Python >=3.12 **and** numpy >=2 for independent reasons, **and** PGM either adopts the 6%-tolerance `c` or MV accepts a documented per-bus correction factor whose derivation is written down. Absent that, the honest answer is no.
- **Target MV module:** none (rejected).
- **ENM impact:** none. **Solver impact:** none.
- **Migration risk if adopted anyway:** HIGH — a second isolated CI environment on a second Python version, plus three documented physics deviations that must be corrected for in the comparison layer. Correction factors in a comparison layer are exactly how a tautology detector gets built (section 2).
- **Test strategy if the precondition is ever met:** start with 2F+G only, on a solidly-earthed MV network, with the prefault-voltage factor `k` computed explicitly and asserted equal to 1.0 for the chosen fixture (i.e. pick fixtures where PGM's deviation vanishes) — never with a widened tolerance.
- **Priority: P2 / defer.**

### S-10 - power-grid-model batch API vs PERF-SC-50
- **Donor/commit/license:** power-grid-model `e50f1612` - MPL-2.0
- **Read:** `docs/user_manual/calculations.md` batch section, `docs/user_manual/performance-guide.md`, `calculate_short_circuit(update_data=..., threading=...)` overloads
- **Capability:** dependent/independent batch updates, topology caching, factorization reuse, shared-memory multithreading.
- **MV problem of record (from `DONOR_AUDIT_CHECKPOINT.md` CP-2 F-1):** SC on a ~50-station network = **170 866.7 ms**, against a 2026-07-29 calibration of ~32 s -> **~5.3x regression**; budget 240 000 ms, margin 1.40x; cause **undiagnosed**; CPU contention and BLAS differences already excluded.
- **What I found instead (MV-internal, and it changes the answer):** `short_circuit_core.compute_equivalent_impedance` calls `build_zbus(graph)` on **every invocation**, and `build_zbus` performs a **full dense `np.linalg.inv(y_bus)`**. `enm/canonical_analysis.py:1878` iterates `for node_id in reportable_fault_node_ids:` and calls the solver once per node. So the Z-bus — *which depends only on the graph, and the graph does not change inside the loop* — is inverted once per fault node. That is O(N^4).
  The asymmetry is visible in the same function's signature: `z0_bus` and `z2_bus` are **hoisted** — computed once by the caller (`canonical_analysis.py:1863 z0_bus = wejscie.z0_bus`) and passed in. Only `z1` is rebuilt inside. The hoisting pattern is already established; Z1 was simply missed.
  **Measurement (this machine, complex128 dense inverse):** n=200 -> 2.8 ms (x200 = 0.6 s); n=400 -> 11.1 ms (x400 = 4.4 s); n=800 -> 78.3 ms (x800 = **62.6 s**); n=1200 -> 164.5 ms (x1200 = **197.4 s**). The observed 170.9 s sits between the n=800 and n=1200 curves — i.e. **repeated Z-bus inversion alone is sufficient to explain the entire runtime** for a 50-station network in the ~1000-1200 node range. I did not profile the actual run, so I state this as a *sufficient structural explanation matching the measured magnitude*, not as a confirmed profile.
- **Gap/benefit:** hoisting `build_zbus` out of the fault loop is a pure memoisation on an unchanged graph — **identical numerics, identical White Box trace, identical golden hashes** — with an expected reduction of order N (hundreds of x).
- **DECISION: REJECT the donor for this problem. Fix inside MV.** Adopting a C++ solver to make an O(N^4) loop finish faster would buy a black-box physics path (violating MV law 5) to avoid diagnosing a defect that is one hoist away. And per the brief's own caution: this is neither a solver-speed deficiency nor a worker-isolation problem — it is an algorithmic defect in MV's own call structure.
- **Target MV module:** `src/network_model/solvers/short_circuit_core.py` (`compute_equivalent_impedance` must accept a `z1_bus`/`builder` the way it already accepts `z0_bus`/`z2_bus`), `src/network_model/solvers/short_circuit_iec60909.py` (lines 638-644, 783-785, 907-909 each call `build_zbus` independently), `src/enm/canonical_analysis.py` (hoist above the loop, alongside `z0_bus`).
- **ENM impact:** none. **Solver impact:** signature change to a FROZEN-adjacent solver — **additive optional parameter only**, numerics untouched. Requires B-01 handling if the core is frozen; this is a bounded, reviewable change, not a rewrite.
- **Migration risk:** LOW-MEDIUM. The risk is *not* numerical (same matrix) but *architectural*: the same graph must be provably used for every fault node in a run. That must be asserted, not assumed.
- **Test strategy:** (1) a determinism test asserting byte-identical `ShortCircuitResult.to_dict()` and unchanged golden hashes before/after; (2) a **klasa-nie-instancja** test that the hoisted Z-bus is invalidated if the graph identity changes mid-run (the predicate that *builds* the matrix and the predicate that *reuses* it must come from one source of truth — otherwise this fix is itself the section-2 bug class); (3) a runtime assertion on the 50-station fixture against the 240 000 ms budget, with the measured value recorded.
- **Priority: P0** — this is MV's own measured regression with an identified sufficient cause.

### S-11 - power-grid-model state estimation as an oracle
- **Donor/commit/license:** power-grid-model `e50f1612` - MPL-2.0
- **Read:** `_core/enum.py` (`CalculationType.state_estimation`, `MeasuredTerminalType`, `AngleMeasurementType`), component list (`sym_power_sensor`, `asym_power_sensor`, `sym_voltage_sensor`, `sym_current_sensor`, ...). I did **not** read the WLS implementation.
- **MV equivalent:** `state_estimation_wls.py` + `state_estimation_synthetic_benchmark.py`; ENM has a first-class `Measurement` element.
- **Gap:** MV's WLS state estimator has no independent oracle. PGM's is a natural fit (iterative_linear WLS, rich sensor model).
- **Blocker:** identical to S-9 — Python >=3.12, numpy >=2, and a second isolated environment. pandapower also ships `estimation/` (which I did not read) and is **already installed** in an isolated job, so if a WLS oracle is wanted, pandapower is the cheaper first stop by a wide margin.
- **DECISION: REJECT (PGM) / STUDY_ONLY (pandapower `estimation/`, unread — no capability claim made).**
- **Priority: P2**

### S-12 - GElectrical schematic -> network generation
- **Donor/commit/license:** GElectrical `47082c7` - **GPL-3.0-or-later — COPY FORBIDDEN**
- **Read:** `gelectrical/model/networkmodel.py::NetworkModel.setup_global_nodes` **in full**, plus `combine_connected_nodes`, `build_graph_model`
- **Capability:** derives the electrical network from drawing sheets.
- **Mechanism, verbatim from the source:** `self.port_mapping = dict()  # Maps (page,x,y) -> global_node`, then `map_port = (k1, *port)` and `self.port_mapping[map_port] = gnode`. **Global node identity is keyed by drawing page plus XY coordinates.** Two element ports landing on the same `(page, x, y)` become the same electrical node. Node numbers are then re-derived from scratch on every rebuild (`subs_dict = {gnode:new_gnode for new_gnode, gnode in enumerate(sorted(gnodes), start=1)}`).
- **Verdict against MV canonical law:** violates **law 3** ("Geometry NEVER creates connectivity ... no 'similar XY => same net'") as its *core mechanism*, and **law 4** ("Persistent identity is independent of placement") because node identity is regenerated positionally on every rebuild. This is not a detail to be adapted — it is the load-bearing design.
- **DECISION: REJECT** (mechanism), independent of licence. It is also a **useful negative benchmark**: it is precisely the architecture MV's ADR-013/ADR-014 exist to prevent, and it is worth citing as such.
- **Target MV module:** none. **ENM impact:** none. **Solver impact:** none.
- **Test strategy:** n/a. (Related MV-side note already logged by the orchestrator at CP-2 F-3: `sld/v2/geometry/cadRoutingContract.ts::findNearestPort` + `PORT_SNAP_THRESHOLD_PX` is geometric port association with zero production consumers — the same anti-pattern sitting dormant in MV. Not my subsystem; flagged, not adjudicated.)
- **Priority: P0 as a documented rejection** (so nobody re-proposes it), no implementation work.

### S-13 - GElectrical protection curve **band** model + coordination containment
- **Donor/commit/license:** GElectrical `47082c7` - **GPL-3.0-or-later — COPY FORBIDDEN; STUDY_ONLY / clean-room**
- **Read:** `gelectrical/model/protection.py` — `ProtectionModel.evaluate_curves` (nested `mod_curve`, `iec`, `thermal`, `i2t`, `point`), `contains(geometry, curve='upper'|'lower', direction, i_max, scale)`, `get_time(I, mode)`, `get_current(t, mode)`, `get_thermal_protection_models(prot_class, magnetic)`
- **Capability worth studying (the pattern, not the code):**
  1. A protection characteristic is modelled as a **band** — `curve_u` / `curve_l` — generated from one nominal curve plus manufacturer tolerances `i_tol` (current %), `t_tol` (time %), and `t_tol_f` (fixed time offset), combined as `max`/`min` over three variants (`k_t*tms`, `tms + t_tol_f`, `k_i*i_n`) with a `t_min` floor and pole compensation near `I -> I_n`. Tolerance is applied **to the curve's inputs**, not as a post-hoc envelope — a meaningfully different and more defensible construction.
  2. Coordination is expressed as a **geometric containment predicate** — `contains(geometry, curve, direction, i_max)` — i.e. "does this damage curve / downstream band lie inside that band, on that side". This generalises pairwise selectivity to the cable/transformer/motor **damage-curve** comparison uniformly.
  3. Device families: IEC 60255 inverse (`k`, `c`, `alpha`), IEC 60255-8 thermal (`t = tms*ln((I^2 - I_p^2)/(I^2 - I_n^2))`), `I2t`, thermal-magnetic classes (10A/10/20/30 with tabulated `tms` pairs).
- **MV equivalent:** `protection_iec60255.py` (IDMT/IEEE C37.112, `check_selectivity_pair`, `SelectivityVerdict`, `compute_i2t_thermal_energy`), `protection_lv_curves.py` — which **already implements banded LV MCB tripping** against `lv_mcb_bands_iec60898.PASMA_MAGNETYCZNE` and explicitly refuses when the band is unknown ("pasmo NIEZNANE, zero fabrykacji domyslnej wartosci"). MV also has `conductor_thermal_withstand.py` and `equipment_checks/cable_thermal_aging.py`.
- **Gap:** MV has bands for **LV MCBs specifically**, from a normative table. It does **not** appear to have a general "curve + manufacturer tolerance triple -> upper/lower band" construction usable for MV relays, nor a uniform containment predicate spanning device-vs-device and device-vs-damage-curve. That is a genuine architectural idea worth having.
- **DECISION: STUDY_ONLY -> REWRITE_CLEAN_ROOM if adopted.** No GElectrical code, no GElectrical expression strings, no derived constants may be copied. Specify the band construction from the norms (IEC 60255-151 tolerance classes) and implement independently.
- **Explicit non-transferable:** GElectrical evaluates its curves via **`eval()` on strings** (`protection.py:354,356,365,374,386`) and its ERC rules likewise (`rulescheck.py:175`). That is an arbitrary-code-execution surface and unauditable under MV's WHITE BOX rule. Under no circumstances port this shape.
- **Target MV module:** `src/network_model/solvers/protection_iec60255.py` (band construction), `src/protection/curves/curve_calculator.py` (containment predicate) — **but the verdict belongs to AGENT PROTECTION**, who owns the thin `src/protection/` (~1.1k LOC) gap. I am registering the pattern, not claiming the work.
- **ENM impact:** likely — tolerance parameters would have to come from the catalog (`catalog_ref`), never from adapter defaults. That is a catalog/ENM question.
- **Solver impact:** additive to a non-frozen solver.
- **Migration risk:** MEDIUM — bands change selectivity verdicts, so existing `SelectivityVerdict` goldens will move. That must be a deliberate, reviewed change, not a side effect.
- **Test strategy:** band construction verified against published manufacturer curves (not against GElectrical's output — that would import its assumptions); containment predicate tested as an **iloczyn cech**: {device-vs-device, device-vs-cable-damage, device-vs-transformer-damage} x {upper band, lower band} x {selective, non-selective, marginal}.
- **Priority: P1 for AGENT PROTECTION; P2 from the solver seat.**

### S-14 - GElectrical ERC (`rules_check` / `electrical_rules_check`)
- **Donor/commit/license:** GElectrical `47082c7` - **GPL-3.0-or-later — STUDY_ONLY**
- **Read:** `gelectrical/model/rulescheck.py` (`get_message_data_struct`, `rules_check`, `electrical_rules_check`, `eval_`)
- **Capability:** post-solve rule evaluation over network + simulation results, producing pass/fail message structures per element.
- **MV equivalent:** `NetworkValidator`, `compliance/`, `analysis/normative/`, `readiness_codes_guard.py`, `engineering-readiness` UI module.
- **Gap:** MV's coverage is broader and normatively grounded; GElectrical's rules are string expressions evaluated with `eval()`.
- **DECISION: REJECT.** No capability MV lacks; the mechanism is inadmissible.
- **Priority: P2** (documented rejection only).

### S-15 - GElectrical end-to-end integration pattern (schematic -> PF -> SC -> protection -> report)
- **Donor/commit/license:** GElectrical `47082c7` - **GPL-3.0-or-later — STUDY_ONLY**
- **Read:** `gelectrical/model/pandapower.py::PandaPowerModel` — `build_power_model(mode)`, `run_powerflow(pf_type, runpp_3ph)`, `run_powerflow_timeseries`, `run_sym_sccalc(lv_tol_percent=6, r_fault_ohm, x_fault_ohm, show_impedances)`, `run_linetoground_sccalc(...)`, `update_results`, `export_html_report`, `export_json`
- **Patterns worth registering (three, and only three):**
  1. **`lv_tol_percent=6` as the default** in both SC entry points — independent confirmation that 6% (`c_max = 1.05` for LV) is the practising-engineer default for LV distribution work, matching MV's `voltage_factor.c_for_node` and the MV oracle's `LV_TOL_PERCENT = 6`. This is the constant PGM hardcodes to 10% (S-9 blocker 4). Two of three donors agree with MV; PGM is the outlier.
  2. **Max and min in one call** — `run_sym_sccalc` computes `res_3ph_max` and `res_3ph_min` back to back from the same model. Relevant to open card **K7 (S''_kQmin in the model)**: the MAX/MIN pair is a property of one run, not two independent runs that might silently share MAX data. Pattern only; K7's design is not mine to settle.
  3. **`update_results` as a distinct, named step** between solve and display — results are written back to the domain elements through one explicit function rather than read ad hoc from `res_*` tables. MV's equivalent boundary is the canonical result contract; the donor confirms the shape is right.
- **Not transferable:** the `PandaPowerModel` object holds **three** parallel pandapower models (`power_model`, `power_model_lf`, `power_model_gf`) as mutable state alongside the domain model. That is a second source of truth (MV law 1).
- **DECISION: STUDY_ONLY.** Three registered observations; no code, no port.
- **Priority: P2**

---

## 4. Summary decision matrix

| # | Subsystem | Donor @ SHA | License | Decision | Target MV module | ENM impact | Solver impact | Prio |
|---|---|---|---|---|---|---|---|---|
| S-1 | ENM->pp oracle mapper | pandapower `fd7346f1` | BSD-3 | **KEEP + HARDEN** | `tests/golden/wyrocznie/pandapower.py` + new coverage guard | none | none | **P0** |
| S-2 | legacy dict mapper | MV-internal | — | **REPLACE ADAPTER -> delete** | delete `pandapower_bridge.py` + its test | none | none | **P0** |
| S-3 | SC oracle (`calc_sc`) | pandapower `fd7346f1` | BSD-3 | **EXTEND (oracle only)** — 1F/2F/kappa/I_th; 2F+G impossible here | `wyrocznie/pandapower.py` | none (fields exist) | none | P1 |
| S-4 | asymmetric PF (`runpp_3ph`) | pandapower `fd7346f1` | BSD-3 | **EXTEND (oracle)** — blocked on ENM per-phase question | `wyrocznie/pandapower.py` | **needs checking** | none | P2 |
| S-5 | `pp.diagnostic()` refusal channel | pandapower `fd7346f1` (+GPL pattern) | BSD-3 | **REWRITE_CLEAN_ROOM** | `wyrocznie/pandapower.py` | none | none | P1 |
| S-6 | converters (CIM/PF/OpenDSS/...) | pandapower `fd7346f1` | BSD-3 | **STUDY_ONLY** (not my scope; unread) | — | — | — | P2 |
| S-7 | protection (`OCRelay`/fuse) | pandapower `fd7346f1` | BSD-3 | **STUDY_ONLY** -> AGENT PROTECTION | — | — | — | P2 |
| S-8 | reference provenance / versions | MV-internal | — | **HARDEN** (4 gaps) | `expected/*.json`, `regenerate_expected_values.py`, oracle | none | none | **P0**/P1 |
| S-9 | second solver adapter | power-grid-model `e50f1612` | MPL-2.0 | **REJECT (revisit on named precondition)** | none | none | none | P2/defer |
| S-10 | batch API vs PERF-SC-50 | power-grid-model `e50f1612` | MPL-2.0 | **REJECT donor — fix inside MV (Z-bus hoist)** | `short_circuit_core.py`, `short_circuit_iec60909.py`, `canonical_analysis.py` | none | additive param, numerics identical | **P0** |
| S-11 | state-estimation oracle | power-grid-model `e50f1612` | MPL-2.0 | **REJECT** / STUDY_ONLY pandapower `estimation/` | — | — | — | P2 |
| S-12 | schematic->network | GElectrical `47082c7` | **GPL-3.0-or-later** | **REJECT** (violates laws 3 & 4) | none | none | none | P0 (documented rejection) |
| S-13 | protection curve **bands** + containment | GElectrical `47082c7` | **GPL-3.0-or-later** | **STUDY_ONLY -> REWRITE_CLEAN_ROOM** | `protection_iec60255.py` (AGENT PROTECTION owns) | likely (catalog) | additive | P1 (protection) / P2 (solvers) |
| S-14 | ERC `rules_check` | GElectrical `47082c7` | **GPL-3.0-or-later** | **REJECT** | none | none | none | P2 |
| S-15 | end-to-end integration pattern | GElectrical `47082c7` | **GPL-3.0-or-later** | **STUDY_ONLY** (3 observations) | — | — | — | P2 |

---

## 5. ADAPTER CONTRACT (binding on every adapter endorsed above)

An adapter is a **read-only consumer of ENM that produces comparison evidence**. It is never a source of truth.

**MUST publish, with every result it emits:**
1. `solver_version` — the third-party library's own `__version__`, read at runtime (`pandapower.__version__`), never hardcoded, never inferred from a lockfile.
2. `mapper_version` — a version of the ENM->adapter mapping itself, bumped whenever a mapping rule changes. Two runs agreeing under different mapper versions are not comparable evidence.
3. `enm_revision` / `enm_hash` — from the existing `enm/hash.py` (`compute_input_hash` for solver-relevant input, `compute_semantic_hash` where identity matters) and `enm/rewizje.py`. A stored comparison result whose `enm_hash` differs from the current model is **stale** and must be marked stale, not silently reused or silently recomputed.
4. `scope` — the explicit list of ENM element classes the adapter mapped, and the explicit list it **refused by name**. A class in neither list is a contract violation.
5. `tolerance` **with its measured value and named physical cause** — MV already does this correctly (`TOLERANCJA_U_PU = 1e-4`, cause: 0.1 mOhm closed-switch model vs pandapower's ideal switch, ~10 mV on 400 V). A tolerance without a named cause is a suppression.

**MUST NOT:**
6. **Hold domain truth.** No adapter state outlives the comparison. No adapter-side model is consulted by anything other than the comparison. (GElectrical's three persistent `power_model*` objects are the counter-example — S-15.)
7. **Extend ENM with hidden values.** If the adapter needs a quantity ENM does not carry, it **refuses by name** (`ValueError` naming the element) — as `zbuduj_siec` already does for ZIP loads, shunt capacitors and unknown branch types. It never invents one. (`pandapower_bridge.py`'s `vkr_percent=0.5, pfe_kw=0.5, i0_percent=0.1, max_i_ka=1.0` are exactly the forbidden shape — S-2.)
8. **Introduce silent defaults.** Every value handed to the third-party solver traces to a declared ENM field or to a constant with a normative citation (`LV_TOL_PERCENT = 6` -> IEC 60909-0 Tab. 1). No `or 0.0`, no "rough conversion", no unexplained scale factors (`* 100.0`, `* 10.0`).
9. **Derive its own inputs from MV's computed intermediates.** This is the K6 lesson (section 2) stated as a prohibition. Adapter inputs come from **declared** ENM fields. Where reconstruction from an MV intermediate is unavoidable, a **mapping assertion** against the declared field is mandatory in the same commit — `test_ext_grid_s_sc_rowne_deklarowanemu_sk` is the template for every such site.
10. **Be a production physics path.** MV law 5. Oracles compare; they never answer the user.

**Staleness rule:** any persisted adapter comparison carries `enm_hash`; on model change the stored verdict is marked stale and is not shown as current. This aligns with ADR-018 (result provenance/freshness/canonical hash) and ADR-026 (selective invalidation), both of which already exist — the adapter must *join* that mechanism, not build a parallel one.

---

## 6. Adversarial review — what would make each adoption a mistake

- **S-1 HARDEN -> mistake if** the new mapping assertions are written by reading the mapper and asserting what it does. That reproduces the K6 bug in test form. Each assertion must be derived from the **norm or the declared ENM field**, by someone reading the norm, not the mapper. Also a mistake if the coverage guard's allowlist becomes a place to park unmapped element classes — the refusal must be in `zbuduj_siec`, raising by name, where a developer will hit it.
- **S-2 delete -> mistake if** `pandapower_bridge.py` turns out to be reachable through a path my grep missed (dynamic import, entry point, script). I grepped `src/` and `tests/` for all three public symbols and found only its own test plus a docstring mention; a full-repo grep before deletion is still the right gate.
- **S-3 EXTEND -> mistake if** the zero-sequence residuals are absorbed by widening `TOLERANCJA_IK_WZGL`. Zero-sequence disagreements are usually *convention* disagreements (transformer zero-sequence path, 3xZ_N earthing). Widening the tolerance converts a discovered convention mismatch into permanent invisible error. If a residual cannot be explained, the correct outcome is a **failing test and an open card**, not a bigger number. Also a mistake if 2F+G is quietly left uncovered without a written refusal — it would read as covered.
- **S-4 EXTEND -> mistake if** the per-phase data ENM lacks is manufactured in the adapter to make the comparison run. That is contract item 7 and it would be a self-inflicted K6.
- **S-5 diagnostics -> mistake if** the allowlist grows unjustified. A diagnostic allowlist with unexplained entries is a mute button on the only channel that reports mapping errors.
- **S-8 provenance -> mistake if** the version assertion auto-updates the recorded version on mismatch. The whole point is that a pandapower upgrade must be a *deliberate, reviewed* revalidation, with references regenerated and diffed. Auto-accept destroys the reference's meaning. Equally a mistake to "fix" `regenerate_expected_values.py` by softening the docstring while leaving the body inert — the script must either regenerate or be deleted.
- **S-9 REJECT -> mistake if** MV genuinely needs 2F+G validated and I have talked us out of the only donor that could do it. I hold the rejection because PGM's 2F+G arrives bundled with a hardcoded LV `c = 1.10`, a documented +/-3% prefault-voltage deviation, and a grounded-network requirement — but if 2F+G validation becomes a hard requirement and no better oracle exists, the honest path is to revisit with those three deviations modelled explicitly and asserted (not tolerated). It would also be a mistake to read this rejection as "PGM is a weak library": it is a strong, well-documented library whose IEC 60909 interpretation simply does not match MV's, and whose Python/numpy floor MV cannot meet today.
- **S-10 Z-bus hoist -> mistake if** the cached Z-bus is reused across a graph change. The hoist must derive "may reuse" and "must rebuild" from **one** predicate (KLASA-NIE-INSTANCJA rule 3), or this fix becomes a correctness bug that testing on a static-topology fixture will never catch. It is also a mistake to claim this *is* the PERF-SC-50 root cause without profiling — I have shown it is *sufficient* to explain the magnitude, and I have not shown it is the *only* contributor. Profile first, then hoist, then re-measure. And a third mistake would be to treat the fix as complete without re-running the 50-station budget check and recording the number.
- **S-12 REJECT -> mistake if** it is read as "GElectrical is bad software". It is a coherent, working GPL application whose central design choice is simply incompatible with MV's canonical law. Its value to this audit is as a clear, legible instance of the architecture MV's ADRs forbid.
- **S-13 clean-room -> mistake if** anyone "checks the implementation against GElectrical's output" during development. That is how a clean-room becomes a derivation. Validate against published manufacturer curves and the norms. It is also a mistake to introduce bands without accepting that existing selectivity goldens will move — silently regenerating those goldens would hide whether the band model changed a verdict for a good reason.
- **Whole-audit mistake:** treating any of this as license to add a solver. Every adoption above is an **oracle, a guard, or an MV-internal fix**. MV's physics stays in `network_model/solvers/`, white-box, deterministic. If a proposal here ever reads as "let a third-party library answer the user", it has been misread.

---

## 7. Unverified / explicitly not claimed

- I did **not** profile the actual 50-station SC run. The Z-bus finding is a *structural* explanation whose measured magnitude matches the recorded regression; it is not a profile.
- I did **not** read pandapower's `estimation/`, `opf/`, `timeseries/`, `control/`, or converter implementations — only directory inventories and, for protection, one device file.
- I did **not** read power-grid-model's C++ core. All PGM capability claims come from its enums, its Python API type stubs, and its own documentation at the cloned SHA.
- I did **not** verify whether ENM carries per-phase load/generation data (S-4's precondition).
- I did **not** run any MV test suite; no CI evidence was produced by this audit. The only numbers I measured myself are the dense-inverse timings in S-10, on this machine.
- PGM's Python/numpy floors are read from `pyproject.toml` **at the audited SHA** (v1.13). Older PGM releases supported Python 3.11; pinning one would mean auditing a different code state than the one reported here.
- pandapower's version at the audited SHA (3.5.4) **matches** the CI pin, so the live oracle runs the code I read. The committed IEEE references (3.4.0) do not — that is S-8 Gap 1.
