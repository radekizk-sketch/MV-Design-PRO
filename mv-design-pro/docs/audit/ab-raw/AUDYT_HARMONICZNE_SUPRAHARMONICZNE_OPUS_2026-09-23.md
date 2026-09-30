# [RAW, NIEWIĄŻĄCY] Audyt harmonicznych, supraharmonicznych i impedancji częstotliwościowej — Claude Opus 5.5, 2026-09-23

Surowy raport subagenta Opus 5.5 (ETAP 5 mandatu kontynuacji; tryb tylko-odczyt; sondy w
scratchpadzie sesji: `probe_pq1.py`, `probe_pq2.py`, `probe_pq3.py`, `probe_ssci.py`,
`probe_island.py`, `probe_taut.py`). Stan: worktree r10, HEAD `ef9f6228`. Ścieżki względem
`mv-design-pro/`. Decyzje (ADOPT/ADAPT/REWRITE/KEEP_RESEARCH_ONLY/REJECT) podejmuje plan
`docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §3b/§11 — ten plik jest dowodem pomiarowym.

## Verdict

- **One solver, and it is wrong.** The whole harmonic capability is one function, `_power_quality`, in the FROZEN solver `backend/src/network_model/solvers/v126_academic.py:393-520`. The UI reaches it through screen E-40 and `POST /api/cases/{id}/runs/v126/power_quality_harmonics`.
- **The idea is right, the physics is not.** Solving Y(h)·V = I per harmonic is the right approach. The implementation mixes voltage levels in ohms with no transformer ratio. Transformer R is 1/U² too small. The upstream grid is replaced by a 1e6 S "infinite bus" on whichever bus is listed first. Capacitor banks and loads are dropped.
- **Invalid inputs pass silently.** Harmonic orders outside a hard-coded list of 18 are thrown away while the sanity block still says "zweryfikowany" (verified).
- **The product's own demo scene shows absurd numbers.** It computes THD_U = 3049 % at the LV bus and 64 % on MV buses, and CI pins those numbers as golden.
- **Nothing independent checks it.** No test compares against an oracle. Supraharmonics, interharmonics, filters, spectrum import and measurement handling do not exist anywhere in the repo.
- **Changing it needs the owner.** The solver is frozen under B-01 (`scripts/solver_input_substitute_guard.py:885`), so any fix needs owner approval or a new solver package next to it.

## STEP 1 — Inventory (file:line, what it is)

**Solver (physics)**
- `backend/src/network_model/solvers/v126_academic.py`
  - :28 — solver version 1.2.
  - :131 — dispatches `POWER_QUALITY_HARMONICS`.
  - :240-296 — `_ybus(harmonic)`: its own admittance matrix in ohms.
  - :298-332 — `_grid_source_shunt_admittance`: fixed split R = 0.15·Z, X = 0.99·Z; used on the SSCI path only.
  - :334-383 — `_driving_point_impedance`: pseudo-inverse of Y.
  - :385-391 — `_solve_linear`: silently falls back to the pseudo-inverse.
  - :393-520 — `_power_quality`: harmonic load flow, THD, TDD, K-factor, Z-scan, "resonances", limits, sanity block.
  - :540-549 — SSCI sweep, 1–250 Hz, 61 points.
  - :551-675 — Z_conv(f) model (Sun / Cespedes / Wen).
  - :686-878 — SSCI Z_grid(f) and minor-loop gain.
  - :1736-1776 — fifth-harmonic earth-fault detection option.
  - :1808-1866 — inrush second-harmonic share and ferroresonance flag.
- `backend/src/network_model/solvers/power_flow_unbalanced.py:24,263` — voltage unbalance factor VUF = |V2|/|V1| per IEC 61000-4-30. Fundamental frequency only.
- `backend/src/network_model/core/ybus.py:29-248` — the canonical per-unit admittance builder, which does handle transformer ratio. It is 50 Hz only and is not used by the harmonic solver.

**Contracts and ENM bridge**
- `backend/src/solver_input/v126_contracts.py`
  - :30-40 bus; :43-71 branch; :74-100 transformer (carries `vector_group`, which is never used).
  - :103-114 `V126HarmonicSourceInput`: integer orders, magnitudes in % only, no phase; provenance defaults to `"KATALOG"`.
  - :184-194 `V126AcademicInput`: has no capacitors, filters or load impedances.
  - :460-462 converter kinds: `wind_inverter` is missing, although `enm/models.py:563` includes it.
  - :473-491 reads the spectrum from the catalog card.
  - :494-523 manual spectra (`harmonic_spectra`, orders 2..50).
  - :552-655 single evaluation point for the converter card.
  - :737-944 `build_v126_input_from_enm`: base current = rated current (:832-842); fault level taken from `source.sk3_mva` only (:854-856).
- `backend/src/enm/models.py:523,1711` — `ShuntCapacitor` exists in the model but is never mapped into the harmonic input.

**API**
- `backend/src/api/v126_academic.py`
  - :179-184 — raw `parameters.harmonic_sources` override, which bypasses the catalog and gets the false provenance `KATALOG`.
  - :194-286 — `POST /cases/{id}/runs/v126/{type}`.
  - :289-327 — result endpoint, including `zrodla_widma` and `pominiete_zrodla`.
  - :330/381/400 — trace, proof and report endpoints.
  - :412-425 — `/catalog/v126/harmonic-limits`: 8 / 5 / 5 %, plus individual limits {5: 6, 7: 5, 11: 3.5, 13: 3} %.
- `backend/src/api/quality_analysis_runs.py:218-222` — `/api/quality/flicker`.

**Application layer**
- `backend/src/application/analyses/v126_katalog.py:244-246` — threshold constants.
- `v126_katalog.py:337-409` — analysis card. It claims "rzędy 2–49" (orders 2–49), use of the source short-circuit power, and "wykrywanie rezonansów" (resonance detection). All three claims are false.
- `backend/src/application/analyses/v126_gotowosc.py:392-460,940-1011` — readiness gate for missing spectrum or missing card.
- `backend/src/application/analyses/v126_wzory.py:185-187` — LaTeX of the THD formula.
- `backend/src/application/solvers/solver_capability_registry.py:219-231` — marked "implemented" and reportable. The version string is stale (1.0) and the reference test is the determinism test.
- `backend/src/domain/canonical_operations.py:1212-1227` — readiness code `generator.harmonic_spectrum_missing`.
- `backend/src/application/analyses/migotanie.py:46-57,243,312-331` — flicker: Pst_i = c·Sn/Sk, cubic summation (m = 3), Plt = Pst.

**Catalog**
- `backend/src/network_model/catalog/types.py:1397-1403,1463-1480,4382,4395` — `ConverterType.harmonic_spectrum_percent` (orders 2..50, % of rated current).
- `backend/src/network_model/catalog/niezmienniki_katalogu.py:312-392` — invariants KAT-T-014..016.
- Converter catalog data: **0 of 179 entries carry a spectrum** (probe).
- `backend/src/network_model/catalog/mv_converter_catalog.py:1170-1274` — `flicker_c` values come from literature, not certificates.
- `backend/src/network_model/catalog/mv_shunt_capacitor_catalog.py:20-41` — only `rated_mvar`, `rated_kv`, `loss_kw`. No detuning p %, no reactor.
- `backend/src/network_model/catalog/mv_cable_line_catalog.py:9-11` — only R20, X at 50 Hz, C. No skin effect, no tan δ, no screen.

**NC RfG**
- `backend/src/network_model/solvers/ncrfg_ptpiree/engine.py:217-223,1068-1108` — test T20 compares a device "THD_U źródła" against a limit.
- `backend/src/catalog/profiles/nc_rfg/warstwy/procedura_ptpiree.yaml:16-20,44-45` — `thd_u_max_pct: 8.0`, with status NIEUSTALONE (unestablished).
- `backend/src/network_model/solvers/ncrfg_ptpiree/contracts.py:74`.
- `backend/src/application/ncrfg_compliance/model_bridge.py:71-72` — this field is always None from the model.

**Other power-quality**
- `backend/src/analysis/normative/kryteria_napiecia.py:57-97` and `backend/src/analysis/sanity_bounds/power_flow_bounds.py:51-125` — EN 50160 ±10 % Un voltage band.
- `backend/src/application/station_templates/templates/przemyslowe.py:114-119` — the text "analizatorami jakości EN 50160" (EN 50160 quality analysers); no data behind it.

**Frontend**
- `frontend/src/ui/workspace/screenCanonRegistry.ts:984-1000` — E-40 route.
- `frontend/src/ui/workspace/WorkspaceSurfaceRouter.tsx:2872,3000` — E-40 routing.
- `frontend/src/ui/workspace/types.ts:801` — tabs `widmo`, `z-f`, `flicker` declared as metadata only.
- `frontend/src/ui2/wyniki/akademickie/prezentacja.ts:238-270` — shows only THD, TDD, K and status. Its "next step" text refers to a Z-scan view and a filter, neither of which exists.
- `frontend/src/ui2/wyniki/akademickie/EkranAnalizAkademickich.tsx:873` — reference panel showing `harmonic-limits`.
- `EkranAnalizAkademickich.tsx:1206-1230,1950` — harmonic sources panel.
- `frontend/src/ui2/wyniki/akademickie/parametry.ts:129-206,404-496` and `FormularzParametrow.tsx:28-87` — manual spectrum form.
- `frontend/src/ui2/wyniki/akademickie/strings.ts:229-235,354-360` — labels for the spectrum form and sources panel.
- `frontend/src/ui2/wyniki/akademickie/api.ts:41,91-115` — result types for the analysis.
- No frontend code consumes `u_h`, `z_scan`, `resonance_peaks` or `violated_limits` (grep: zero hits).
- `frontend/src/ui2/oze/macierz/macierzModel.ts:78,347`, `PanelModulu.tsx:73` and `frontend/src/ui/workspace/surfaces/NcRfgTestsTab.tsx:95,192,584` — manual THD_U input for T20.
- `frontend/src/ui/network-build/der-configurator-v2/derConfiguratorContract.ts:105` — "Harmoniczne (THDi/THDu)" readiness axis. `DerConfiguratorSidebar` has no importer, so this is dead.
- `frontend/src/ui/types.ts:69`, `frontend/src/ui/context-menu/actions.ts:359` — `PowerQualityMeter` exists in the UI only; the backend `Measurement` type allows only CT/VT (`enm/models.py:738`).

**Tests**
- `backend/tests/test_v126_academic_solver.py:19-104`. The fixture puts a 110/15 kV transformer between two 15 kV buses. The only check is `thd >= 0`.
- `backend/tests/test_v126_sanity_bounds.py:218-233,262-277` — sanity status only.
- `backend/tests/api/test_v126_converter_widmo_gate_api.py:108-225` — gates only.
- `backend/tests/solver_input/test_most_v126_bez_podstawien.py:660-697` — tautological. The generator has no card, so there are zero sources and it compares zero lists (probe).
- Also present: `tests/application/analyses/test_v126_gotowosc.py`, `test_v126_wzory.py`, `tests/ci/test_v126_rodzaje_parytet.py`, `tests/test_advanced_solver_capability_registry.py`.
- `backend/tests/application/analyses/test_migotanie.py` — flicker, with hand-calculated oracles.
- `backend/tests/ci/test_fixtury_harnessu.py:494-498` — pins `frontend/src/harness-fixtures/generated/akademickie_scena_biegi.json` byte-for-byte to backend output.
- `frontend/e2e/v126-okna-zrzuty.spec.ts` — screenshots only, no numeric assertions.

**Docs**
- `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md:89,239,567` — rates harmonics "CZĘŚCIOWE" (partial). It calls the capacitor mapping "niezweryfikowane" (unverified); in fact capacitors are absent.
- `docs/plan/SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md:194-195,503` — W6-7 plan.
- `docs/twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md:39,99,150,192-194,210` — target design: shared `admittance(h)` and a `HarmonicView`.
- `docs/v12xx/KANON_V12_6_PROFESORSKI.md:28`.
- `docs/audit/INWENTARZ_STALYCH_V126_2026-08-08.md:40,180`.
- `docs/plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md:70` — the only mention of interharmonics.
- Supraharmonics, 2–150 kHz and 9 kHz: zero hits in code, docs and scripts.

**CI**
- `.github/workflows/python-tests.yml:345` — the mutation job covers dynamics only.
- `.github/workflows/p0-extended-guards.yml:342` — `v126_contract_text_guard` checks text only.

## STEP 2 — Verify, reproduce, falsify

**What the code actually implements (`v126_academic.py`)**
- **Cables and lines:** single lumped pi. R stays at R50 (R20 from the catalog). X = h·X50 and B/2 = h·B50/2 (:257-272).
- **Transformers:** z_base = U_HV²/Sn. R = pk_kw/(1000·Sn²), which is missing the U² factor. The whole of u_k is used as X, then X·h (:282-289). There is no turns ratio, no magnetising branch and no vector group.
- **Grid:** `ybus[0,0] += 1e6` on the first bus in the model (:294-295). The source short-circuit power is ignored on the harmonic path.
- **Capacitors, reactors, loads, motors, filters, converter Norton admittance:** absent.
- **Harmonic orders:** fixed at {2,3,5,7,11,13,17,19,23,25,29,31,35,37,41,43,47,49} (:394).
- **Injections:** `complex(I,0)`, i.e. phase 0 for every source, so contributions add coherently and arithmetically (:433).
- **THD:** √(Σ|U_h|²)/(Un/√3) — divided by the nominal voltage, not the power-flow fundamental (:451).
- **TDD:** RSS of the sources' injected currents divided by the bus load current, floored at 1 A (:452-453).
- **K-factor:** √(Σ I_h²h²)/I_load (:463). This is non-standard.
- **Unbalance:** `voltage_unbalance_u2_u1` is hard-coded to 0.0 (:412).
- **Branch currents:** `i_h` is never filled.
- **Z-scan:** 50–2500 Hz in 10 Hz steps, but only odd multiples of 50 Hz are stored, i.e. 25 points (:470-485).
- **"Resonance":** every sweep point with |Z| > 10·Z50 is reported (:486-489).
- **WHITE BOX trace:** contains only the list of orders and the number of sources — no Y(h), no I_h (:491-500).

**Executed evidence**

| # | Probe | Result |
|---|---|---|
| T | Existing tests (`test_v126_academic_solver`, `test_v126_sanity_bounds`, `test_v126_converter_widmo_gate_api`) | 29 passed. None has a numeric oracle. |
| T | Flicker tests (`test_migotanie`) | 18 passed. These do have hand oracles. |
| P1 | 2-bus network, cable 4 km 0.206+j0.118 Ω/km, 2.4 A at h=5 | Solver U5 = 5.999 V, equal to the hand value **with zero grid impedance**. With Sk = 250 MVA the correct value is 16.5 V (2.75× higher). `i_h` = [], unbalance = 0.0. |
| P2 | Change Sk from 250 to 20 MVA | THD stays 0.0693 % — Sk is ignored. |
| P3 | Spectrum of {4, 9, 15, 21 or 50}: 10 % | THD = 0.0 with sanity "zweryfikowany" — the orders are silently dropped. Catalog and UI accept 2..50. |
| P4 | Swap bus order so the source bus is first | THD at the source bus = 0.0 — it has become the 1e6 reference. |
| P5 | Source bus with no load | TDD = 240 % (1 A floor), flagged as an IEEE 519 violation, sanity still "zweryfikowany". |
| P6 | K-factor, 100 A with 20 % h5 and 14 % h7 | Solver 3.64; UL 1561 K = 2.79. |
| P7 | 16 MVA, 110 kV, pk = 90 kW | Solver R = 0.00035 Ω; hand value 4.254 Ω (ratio 1/110²). |
| P8 | 110/15 kV transformer + 15 kV cable, source on 15 kV bus | U5 = 3.995 kV vs correct 0.0994 kV (×40). THD 46.1 % vs 1.15 %. Sanity passes. |
| P9 | 20 km cable, B = 9.42e-5 S/km | The Z-scan maximum at 1150 Hz matches the lumped-pi hand value of 1152 Hz, so the branch stamp itself is correct. But the "resonance" list has **188 entries** for a single resonance, and the distributed quarter-wave frequency is 1279 Hz (the lumped model is −10 % off). |
| P10 | Two sources at 5 % vs one at 10 % | Identical U5 (coherent sum), while TDD differs (3.67 % vs 5.20 %). U and I are aggregated inconsistently. |
| P11 | Full ENM path (bridge + solver): GPZ 15 kV Sk = 300 MVA, cable, 2 Mvar capacitor, 15/0.4 kV transformer, 0.1 MVA PV with {5: 4 %, 7: 3 %} | Capacitor absent from the solver input. LV-bus THD = **394.8 %** vs oracle **0.30 %**. The MV bus reports 152 "resonance peaks" and the LV bus 200, all false. The real parallel resonance at h ≈ 10–12 (√(Sk/Qc) = 12.2) is missed. |
| P12 | Source on an island | THD = 0.0 via the pseudo-inverse; sanity "zweryfikowany". |
| P13 | SSCI Z_grid for a converter on a 0.4 kV bus | 21.15 Ω at 47.7 Hz vs ≈ 0.0158 Ω correct (referred to 15 kV, ×1400). |
| P14 | The bridge test at `test_most_v126_bez_podstawien.py:660-697` | `harmonic_sources` = [], max \|U_h\| = 0 — the test compares zero lists. |
| F | Harness fixture `akademickie_scena_biegi.json` | THD_U: `bus_nn` 3049.1 %, MV buses about 64 %, sanity "poza zakresem wiarygodności" (out of credibility range). CI pins this as golden through `test_fixtury_harnessu.py:494`. |

## STEP 3 — Classification

1. **`_power_quality` harmonic load flow (:393-520) — REWRITE.** The per-h nodal approach is sound. The per-voltage-level referral, transformer R, reference/grid model, missing elements, fixed order list, aggregation, TDD/K definitions and resonance logic are wrong (P1–P12). Because it is frozen under B-01, the practical route is a new HarmonicView solver on the canonical admittance, then retiring this function.
2. **`_ybus(harmonic)` (:240-296) — REWRITE.** Replace it with the canonical per-unit builder (`core/ybus.py`) extended with frequency f. Keep only the pi-branch stamping idea, which P9 confirms.
3. **Z-scan and resonance flags (:469-489) — REWRITE.** It needs the full Y(f) including capacitors and the source, true local maxima and minima with phase, and user-set resolution and band.
4. **`_grid_source_shunt_admittance` (:298-332) — ADAPT.** Take R/X from the ENM `Source` (`rx_ratio`, `r_ohm`, `x_ohm`) instead of the fixed 0.15/0.99, and use it on the harmonic path too.
5. **SSCI Z_conv(f) (:551-675) — ADAPT.** The model is literature-based and states its assumptions. Its Z_grid depends on the broken Y (P13), so it must move to the shared Y(f).
6. **`V126HarmonicSourceInput` (contracts :103-114) — REWRITE.** It becomes a typed source model: kind, frequency (real-valued), magnitude, phase, operating point, provenance, version, validation status.
7. **`ConverterType.harmonic_spectrum_percent` (types.py:1397) — ADAPT.** The shape validation is good. It needs a phase field, the reference current, spectra per operating point, a source document and a status. No catalog entry has data today.
8. **Bridge harmonic part (contracts :737-944) — ADAPT.** The single-evaluation-point card logic and honest missing-data codes are good. It must add capacitors, source impedance, load models, vector group and an operating-point current (today it uses rated current), and include `wind_inverter`.
9. **Readiness gate `_warunki_harmoniczne` and readiness code — ADOPT.** Missing data is honestly gated, and screen and run use the same predicate.
10. **Manual spectra (API `harmonic_spectra` and UI form) — ADAPT.** Add phase, and reject orders the solver cannot use. Today orders 2..50 are accepted and then silently dropped.
11. **Raw `parameters.harmonic_sources` override (api :179-184) — REJECT.** It bypasses the catalog and gets false provenance `KATALOG` by default (contracts :114).
12. **Limits 8/5/5 % and the `harmonic-limits` catalog (solver :455-460, katalog :244-246, api :420-425) — REWRITE.** They belong in a regulatory requirement registry (document, version, level, point, statistic). Individual limits are displayed but never evaluated.
13. **NC RfG T20 THD_U ≤ 8 % (engine :1068-1108, yaml :44-45) — REJECT the criterion.** A device-level voltage THD is compared with a supply-voltage value whose origin the profile itself marks NIEUSTALONE. It should be replaced with a current-emission check at the connection point against the operator's (OSD) allocated limits.
14. **Flicker (`migotanie.py`) — ADAPT.** Pst = c·Sn/Sk and m = 3 are the correct form, with hand oracles. It sits in the wrong layer (application, not solver), c does not depend on ψk, Plt = Pst is assumed, and the planning level is used as if it were an emission limit.
15. **VUF (`power_flow_unbalanced`), EN 50160 ±10 % voltage bands — ADOPT.** Outside harmonic scope; cited correctly.
16. **E-40 presentation (`prezentacja.ts:238-270`) — ADAPT.** It must show U_h, I_h, Z(f) and resonances. The "next step" text points to a scan view and a filter that do not exist.
17. **Tabs `widmo`/`z-f`/`flicker` (`types.ts:801`), DER "THDi/THDu" axis (unmounted), UI-only `PowerQualityMeter` — REJECT** until there is a real backend.
18. **Capability registry entry (:219-231) — ADAPT.** Status, version and reference test are false.
19. **Tests — REWRITE.** Solver determinism test (bad fixture, `>= 0` assertion), the tautological bridge test, and the golden fixture that pins 3049 %. The sanity tests can stay as sanity tests.
20. **Card claims (`v126_katalog.py:346-349,393`) and `MAPA_DOMKNIECIA:239` — REWRITE.** Orders 2–49, use of source Sk and resonance detection are false statements.

## STEP 4 — Gap matrices

### Harmonic gap matrix

Status legend: ISTNIEJE (exists) / CZĘŚCIOWE (partial) / POZORNE (only appears to exist) / BRAK (missing).

| Capability | Current state (file:line) | Status | Class | Depends on | Evidence required |
|---|---|---|---|---|---|
| Harmonic load flow Y(f_h)V = I | v126:421-447 | POZORNE (P8, P11) | REWRITE | shared Y(f), element models | 2- and 3-bus hand oracles; OpenDSS harmonic mode (external); mutation on ratio, R, h; E2E ENM→UI |
| Arbitrary f ∈ R+ (interharmonics) | int orders contracts:107, list v126:394 | BRAK | REWRITE | above | oracle at non-integer f; contract test |
| Shared Y(f) = PF Ybus at h = 1 | private ohmic v126:240-296; canonical 50 Hz ybus.py:29-248 | CZĘŚCIOWE | REWRITE (extend canonical) | none | parity Y(h=1) vs PF on reference networks (twin doc S-03); ratio oracle |
| V_h per bus with phase | v126:444-446; sources at phase 0 | CZĘŚCIOWE | ADAPT | source phases | phase oracle with two phase-shifted sources |
| I_h in branches, flows | `i_h` never filled (v126:404) | POZORNE | REWRITE | Y(f) | KCL check; branch oracle |
| Source→bus / source→branch contribution, contribution matrix, transfer sensitivity | none | BRAK | new | Y(f) | superposition test: sum of contributions = total |
| THD_U | v126:451 (nominal U1, 18 orders) | CZĘŚCIOWE | ADAPT | power-flow U1 | known-spectrum oracle |
| THD_I / TDD | v126:452-453 (1 A floor, RSS) | POZORNE (P5) | REWRITE | I_h | oracle; guard against the floor |
| K-factor | v126:463 non-standard (P6) | POZORNE | REWRITE on transformer current, or REJECT | I_h in transformer | UL 1561 oracle |
| Individual-harmonic view, dominant source, critical bus, propagation direction | UI shows THD/TDD/K only (prezentacja:248-264) | BRAK | new | contributions | E2E UI |
| Explicit aggregation (phasor / arithmetic / IEC 61000-3-6 α) | implicit coherent phase 0, RSS for TDD (P10) | POZORNE | REWRITE | source phases | oracles per method |
| Background distortion (U_background, U_plant, U_combined) | none | BRAK | new | contract | oracle |
| Source model kinds CURRENT / VOLTAGE / NORTON / THEVENIN / MEASURED / FREQ-DEP with metadata | %-of-rated magnitude only (contracts:103-114); 0/179 catalog entries | CZĘŚCIOWE | REWRITE | catalog | contract and validation tests |
| Operating-point dependence of emission | rated current (contracts:832-842) | BRAK | new | power-flow snapshot | P-sweep test |
| Cable R(f), L(f), C(f), G(f), distributed model, quality flag | R constant, lumped pi (v126:257-272); catalog R20/X50/C | BRAK (P9 −10 %) | REWRITE | catalog fields | quarter-wave oracle; skin-effect oracle |
| Transformer Z(f) (R(f), ratio, vector group, zero sequence, triplen) | R missing U², no ratio (P7, P8) | POZORNE | REWRITE | canonical builder | ratio oracle; triplen blocking by Dyn |
| Grid source Z(f) | absent in PQ (v126:294); fixed R/X in SSCI | BRAK | REWRITE | ENM `Source` | Sk-sensitivity oracle |
| Capacitors / reactors with validity range | ENM `ShuntCapacitor` not mapped (P11); no detuning p % | BRAK | new | catalog | f_r = f1·√(Sk/Qc) oracle |
| Loads / motors harmonic models | none | BRAK | new | model choice declared | damping oracle |
| Passive filters (tuned, high-pass, C-type) with before/after | text only (prezentacja:266-269) | BRAK | new | Y(f) | series-resonance oracle |
| Z_th(f) scan with magnitude and phase | 25 stored points (v126:470-485) | CZĘŚCIOWE | REWRITE | Y(f) | dense-scan oracle |
| Resonance / antiresonance extrema | threshold on every point (P9: 188 entries; P11: false positives, missed peak) | POZORNE | REWRITE | scan | extrema oracle; mutation |
| Causal resonance analysis (modal / participation, dominant element) | none | BRAK | new | scan | modal oracle |
| Sensitivity sweeps (cable length, C, L, TR, BESS, PV, topology) | none | BRAK | new | scan | monotonic-trend tests |
| Sequence handling (triplen zero-seq, 5th neg-seq) | single positive-sequence network for all h | BRAK | new | Y012(f) | Dyn blocks 3rd harmonic |
| WHITE BOX trace (Y(h), I_h, V_h) | trace v126:491-500 | POZORNE | REWRITE | — | trace-completeness test |
| Singular / island handling | pseudo-inverse silent (P12) | POZORNE | REWRITE | — | named refusal test |
| Readiness and provenance gate | gotowosc:392-460 | ISTNIEJE | ADOPT | — | already tested |
| UI reachability (E-40) | screenCanonRegistry:984, POST endpoint | ISTNIEJE; presentation CZĘŚCIOWE | ADAPT | — | E2E with numeric assertions |

### Supraharmonic gap matrix

Everything is missing (BRAK); repo-wide grep finds zero hits. Classification for all rows is "new". Nothing in the existing code is reusable except the Y(f) concept once it has been rewritten.

| Capability | Dependency | Evidence required |
|---|---|---|
| `SupraharmonicBand` contract (f_min, f_max, resolution, aggregation bandwidth, method, source document, version) | a document register; candidate sources are IEC 61000-4-7 Annex B, IEC 61000-4-30 Ed.3 Annex C, CISPR 16-1-1 | contract test rejecting a band with no source |
| Emission model E(f, P, Q, U, mode); BESS E(f, P, Q, U, SOC, mode) | catalog section; switching frequency (f_sw) exists only as a comment (mv_converter_catalog:1160) | measured-vs-model metrics |
| Propagation I_s(f) → Y(f) → V_i(f) up to 150 kHz | distributed cables, transformer capacitances | oracle up to 150 kHz |
| Transfer function H_{i←j}(f) | Y(f) | reciprocity test |
| Phase coupling Y_abc(f) | phase-domain Y(f); `power_flow_unbalanced` is 50 Hz only | 3-phase oracle |
| Measured spectrum import (CSV / XLSX / PQ analyser) with parameters (fs, resolution, window, aggregation, RBW, duration, noise floor, calibration) | measurement contract | parser fixtures |
| Validation metrics (peak f and amplitude, band energy, transfer ratio, spectral distance) | import | metric oracles |
| Time-frequency (STFT, spectrogram) — later item | import | — |

### Multi-physics gap matrix

| Capability | Current state | Status | Class | Depends on | Evidence |
|---|---|---|---|---|---|
| Power flow → harmonic (U1, P/Q per source) | THD uses nominal U; rated current | BRAK | new | Y(f) | parity test |
| RMS → operating-point snapshot → spectral model | `dynamika/kontrakty.py:207-217` takes `PunktPracy` as input only; no spectral output | BRAK | new | spectral contract | chain E2E |
| Switching frequency never inside the RMS equations | no switching model in `dynamika/` | ISTNIEJE (by absence) | ADOPT as an invariant | — | guard |
| Scenario chain PF → RMS → snapshot → spectral → harmonic solve | none | BRAK | new | all of the above | E2E |
| One admittance for PF / SC / harmonic | duplicated ohmic Y (v126) vs `core/ybus.py` | BRAK | REWRITE | — | parity test |
| Catalog sections (fundamental, short-circuit, dynamic, harmonic, supraharmonic, certification, measurement, validation) each with status | converter has fundamental + SSCI fields + empty spectrum + literature `flicker_c`; `catalog/der_dynamic`; `ptpiree_wykaz_snapshot.json`; no per-section status | CZĘŚCIOWE | ADAPT | — | catalog invariant tests |
| SSCI Z_conv / Z_grid | v126:551-878; Z_grid wrong for LV (P13) | CZĘŚCIOWE | ADAPT | Y(f) | Nyquist oracle |
| BESS SOC-dependent emission | none | BRAK | new | QSTS / SOC | — |
| Time-series statistics for EN 50160 (95 % of weekly 10-min values) | none | BRAK | new | QSTS | — |

### Regulatory gaps

Every power-quality limit found in the repo:

- **THD_U 8 % "PN-EN 50160"** (v126:455-456; katalog:244,357-367; api:421). No edition. No voltage-level scope, although it is applied to every bus including 110 kV. No statistic (95 % of weekly 10-min values, orders up to 40); a single snapshot at rated emission is used instead. Point should be the supply terminals. A supply-voltage characteristic is being used as a design and emission criterion (compatibility→emission).
- **THD_U 5 % "IEEE 519"** (v126:457-458; katalog:245). No edition. The 2014 edition has 8 % at ≤1 kV and 2.5 % at 69–161 kV, but 5 % is applied to every bus. Not binding in Poland. The PCC point and the statistic are ignored.
- **TDD 5 % "IEEE 519 default"** (v126:459-460; api:423). Ignores the Isc/IL table (5 / 8 / 12 / 15 / 20 %). Computed at arbitrary buses from source injection current, not at the PCC against maximum demand.
- **Individual limits {5: 6, 7: 5, 11: 3.5, 13: 3} %** (api:424). No document, version, level or statistic; they match EN 50160 Table 1 but are never evaluated — display only (`EkranAnalizAkademickich.tsx:873`).
- **NC RfG T20 THD_U ≤ 8 %** (`procedura_ptpiree.yaml:44-45`). The profile states the value's origin is NIEUSTALONE (:16-20). A device quantity is compared with a supply-voltage value (device→installation and compatibility→emission).
- **Flicker planning levels Pst 0.9 / Plt 0.7 for MV** (`migotanie.py:50-52`). Document and version are cited (IEC/TR 61000-3-7:2008 Table 1). The planning level is used directly as the plant's emission limit, with no stage-2 allocation and no background.
- **IEC 61000-3-12 cited for MV converter spectra** (types.py:1397; contracts:637). That standard covers LV equipment of 16–75 A per phase (LV→MV and device-scope transfer).
- **IEC 61000-4-7 orders 2..50** (`niezmienniki_katalogu.py:375-381`). Correct scope, but inconsistent with the solver's 18 orders.
- **±10 % Un PN-EN 50160** (`kryteria_napiecia.py:57-97`). Correctly labelled, but no edition and no statistic.
- **Missing entirely:** Polish system regulation (rozporządzenie systemowe) harmonic tables; any IRiESD harmonic limits (operator profiles carry titles only); IEC/TR 61000-3-6 emission allocation; IEC 61000-2-2 / 2-12 compatibility levels; any supraharmonic document.

### Model gaps

Cable (no skin, proximity or dielectric loss; lumped pi; R20 not at operating temperature), transformer (R bug, ratio, vector group, R(f), magnetising branch), grid source (absent), capacitor (not mapped; no p %, no rating at 1.3·In), reactor, filters, loads, motors, converter Norton admittance, synchronous-machine X''·h, sequence and triplen behaviour, validity-range and quality flags per element — none of these exist.

### Oracle gaps

- No independent numeric oracle exists for any harmonic quantity. Existing tests check determinism, ≥0, sanity ranges and gates; one is tautological.
- Required oracles: 2-bus and 3-bus hand calculations; transformer ratio referral; parallel resonance h_r = √(Sk/Qc); detuned-filter series resonance; cable quarter-wave frequency; an IEEE harmonic benchmark network; OpenDSS harmonic mode as an external cross-check (not in repo dependencies).

### Measurement gaps

- No PQ-meter element in the backend (`Measurement` is CT/VT only, `enm/models.py:738`).
- No spectrum, PQDIF or COMTRADE import, and no FFT/STFT (grep: zero hits); `application/xlsx_import` imports networks only.
- No measurement parameters (fs, window, RBW, aggregation, noise floor, calibration) and no model-vs-measurement validation metrics.

### CI and mutation gaps

- The mutation job covers dynamics only (`python-tests.yml:345`).
- No guard catches silently dropped orders, the 1e6 reference or missing ratio.
- The golden harness fixture pins THD 3049 % (`test_fixtury_harnessu.py:494`).
- The capability registry's reference test is the determinism test.
- E2E is screenshots only.
- The solver is frozen under B-01, so every REWRITE above needs owner approval or a new solver package beside the frozen core, as the twin document proposes (`MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md:150,192-194,210`).
