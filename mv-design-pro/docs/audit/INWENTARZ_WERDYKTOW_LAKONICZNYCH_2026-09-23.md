# Inwentarz powierzchni z lakonicznym werdyktem — klasyfikacja migracji (2026-09-23)

**Status:** dowód dla `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §8 i zapadka strażnika
`werdykt_wyjasnialny_guard` (kontrakt `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md` §12).
**Metoda:** pięć niezależnych przeglądów Claude Opus 5.5 (tylko odczyt) na stanie `ef9f6228` +
niezacommitowana praca AB-1a, po jednym na obszar: (B) `analysis` / `compliance` / `diagnostics` /
`solver_input`; (A) `network_model` (solvery, walidacja, raportowanie) / `solvers` / `protection`;
(C) `application` / `api` / `enm` / `domain`; (D) `frontend/src/ui2`; (E) `frontend/src/ui`,
`engine`, `types`. Każdy wiersz: `plik:linia` · typ/pole · wartości · elementy kontraktu obecne i
brakujące (SUBJ przedmiot · CRIT kryterium · MEAS wynik z jednostką · LIM limit z jednostką · SRC
źródło limitu · MARG margines · WHY przyczyna · BASIS podstawa normatywna · EVID dowód/status
modelu · DOM zakres ważności) · dokąd trafia · klasa.
**Klasy:** `MIGRACJA` — trafia do użytkownika / raportu / dowodu bez kompletu elementów: migracja
natychmiastowa (przypisanie do przyrostu w planie §8); `ENUM_WEWNETRZNY` — status maszynowy
używany wyłącznie do agregacji, filtrów, bramek gotowości albo zawsze z kompletem w tym samym
rekordzie: pozostaje (z uzasadnieniem na liście dozwolonej strażnika); `LEGACY_USUNAC` — bez
konsumenta produkcyjnego albo przewidziany do kasacji: usunięcie, nie migracja.
**Zastrzeżenie:** raporty agentów są dowodem pomiarowym (plik:linia), nie decyzją — decyzję o
klasie i przyrostu migrującym podejmuje plan §8; rozbieżności między raportem a planem
rozstrzyga plan.

---

## 0. Podsumowanie i zapadka

| Obszar | Wiersze | MIGRACJA | ENUM_WEWNETRZNY | LEGACY_USUNAC |
|--------|---------|----------|-----------------|---------------|
| A — `network_model` / `solvers` / `protection` | 43 | 27 | 11 | 5 |
| B — `analysis` / `compliance` / `diagnostics` / `solver_input` | 24 | 12 | 6 | 6 |
| C — `application` / `api` / `enm` / `domain` | 56 | 42 | 8 | 6 |
| D — `frontend/src/ui2` | 78 | 66 (18 lekkich) | 10 | 2 |
| E — `frontend/src/ui`, `engine`, `types` | 82 | 34 | 19 | 29 |
| **Razem** | **283** | **181** | **54** | **48** |

**Zapadka strażnika (`werdykt_wyjasnialny_guard`):** 181 pozycji MIGRACJA na stanie `ef9f6228`
— liczba może tylko maleć; 54 pozycje ENUM_WEWNETRZNY = lista dozwolona z uzasadnieniem (każda z
wiersza tego dokumentu); 48 pozycji LEGACY_USUNAC = kasacja, nie migracja (fala WW-0 planu §8).

**Wzorce klasy (powtarzalne we wszystkich obszarach):**
1. limit bez źródła i stanu (jedyne kompletne: `criterion_source` solvera NC RfG i `zrodlo_k`
   wytrzymałości cieplnej); zakres ważności nieobecny w KAŻDYM rekordzie;
2. „brak danych" zamieniony w werdykt (`_WYNIK_Z_STATUSU` WARN→SPELNIA, `.get(status, SPELNIA)`,
   brak podstawy → FAIL w dowodzie aparatury, `unit_check_passed = True` zaszyte);
3. puste „PASS/OK" bez sprawdzenia (0 par selektywności → OK, brak zabezpieczeń → PASS, straty
   transformatora „policzone" → PASS, VT grounding `(True, "")`, „zgodny" domyślnie w jakości energii);
4. werdykt liczony w interfejsie (progi 80/100 %, 5 %, 0,8/1,5/3,0, agregacja TCC, heurystyka
   porównania, dopasowanie DER, kolor po dopasowaniu tekstu);
5. dane wyjaśniające istnieją w kontrakcie, ale nie są renderowane (`evidence_by_test`, `metrics`,
   `utilization_*`, `margines` SWZ, `details`/`formulas_latex`, `znamiona`, `zapas_alf`);
6. ta sama wielkość oceniana sześcioma różnymi regułami (odchylenie napięcia: walidacja
   energetyczna, profil napięć, interpretacja rozpływu, wrażliwość, wiarygodność, adekwatność Q)
   z różnymi znakami marginesu;
7. etykiety nadużywające znaczenia („zweryfikowany" dla pasma wiarygodności, „Model: zwalidowany"
   z gotowości, „Zgodność przyłączeniowa" z osi kompletności danych).

Fale migracji i przypisanie do przyrostów: `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §8.

---

## Obszar A — `network_model/**`, `solvers/**`, `protection/**`: 43 wiersze

`$S` = `backend/src`. `solvers/**` zawiera tylko trzy jednolinijkowe `__init__.py` — brak ustaleń. Legenda: S = przedmiot, C = kryterium (tekst/LaTeX), M = wynik z jednostką i punktem krytycznym, L = limit z jednostką i źródłem, Mg = margines, R = przyczyna, N = podstawa normatywna, E = dowód/status modelu, D = zakres ważności.

### A. Zabezpieczenia SN (koordynacja nadprądowa)
| # | file:line | field and values | present | missing | reaches user | class | why |
|---|---|---|---|---|---|---|---|
| 1 | `$S/protection/curves/curve_calculator.py:41,51,146,304` | `CoordinationStatus` COORDINATED / MARGIN_LOW / NOT_COORDINATED / UNKNOWN, labels "Skoordynowane / Nieskoordynowane" | S, M, Mg, R (`recommendation_pl`), L value (`min_required_margin_s`) | L source (0.05+0.05+0.1 s hard-coded), C, N, E, D; 999.999 sentinel for infinity | none: no importer of `check_coordination`/`CoordinationStatus` outside `protection/curves` (not even tests) | LEGACY_USUNAC | Dead code; the analyzer imports only the curve helpers. |
| 2 | `$S/network_model/solvers/protection_iec60255.py:54,242,290,758,931` | `SelectivityVerdict` PASS / MARGINAL / FAIL; `SelectivityPairResult.verdict`, `ProtectionCoordinationResult.overall_verdict` | S (relay ids, I_fault), M (t_up/t_down s), Mg | L source (0.3 s and 0.2 s hard-coded :754-755), C, R, E, D; N only in trace; "neither relay trips → PASS" :812-815 | only `tests/test_protection_iec60255.py` + re-export in `solvers/__init__.py` | LEGACY_USUNAC | Selectivity part has no production consumer; the IDMT engine in the same file (`compute_curve_trip_time`, `compute_idmt_generic`) is production and stays. |
| 3 | `$S/network_model/reporting/protection_report_docx.py:46-56,117-126,159-164,225-244,267-287,307-326`, `protection_report_pdf.py:50-60,171-205,233-238,305,348,394` | prints "Wynik analizy: Prawidłowa / Margines niski / Nieskoordynowane", "Werdykt" column, pass/fail counters, raw code when unknown | S (id cut to 12 chars), M (I_min, I_pickup, t, Δt), Mg (% or Δt) | L (required k or Δt_req) and source, C, R, N, E, D | `GET /protection-coordination/{run_id}/export/pdf|docx` (`api/protection_coordination.py:666,716`) ← FE `ui/protection-coordination/api.ts:176,183` | MIGRACJA | Standalone verdict in a deliverable report, no limit or basis. |

### B. Zabezpieczenia nN (pasma charakterystyk)
| 4 | `$S/network_model/solvers/protection_lv_curves.py:81,102,335,599` | `GwarancjaNormy` brak_wyzwolenia_gwarantowany / wyzwolenie_gwarantowane / nieokreslony / dane_niekompletne; MCCB `stopien` | S (In, class), M (`i_query_a`), L (thresholds A, `t_umowny_s`), N (`podstawa_pl`), trace | R and E partial | 5 consumers (`swz/werdykt.py`, `nn_circuit_sheet`, `nn_device_selection`, `lv_circuit_verification` pack, package init) | ENUM_WEWNETRZNY | Classification against normative bands; user-facing SWZ verdict is built in `application/`. |

### C. Kryteria aparaturowe
| 5 | `$S/network_model/solvers/conductor_thermal_withstand.py:47-49,212,720-789,692` | `status` PASS / FAIL / UNAVAILABLE + `criteria[].status` | C (`warunek_pl`, LaTeX trace), M, L (`granica`, `jednostka`, `k_justification.zrodlo_k`), Mg (A and %), R (`decision_reason_pl`), N (`STANDARD_REFS` with clause), D (`assumptions`), partial E (`kompletne`, `braki_pl`) | S (added by caller), catalog verification status | 6 consumers (`nn_proof`, `quality_analysis_runs`, `nn_circuit_sheet`, `wytrzymalosc_cieplna_przewodow`, LV pack, `der_selection_preview`) | MIGRACJA (minor) | Reference pattern; only two fields missing. |
| 6 | `$S/network_model/solvers/equipment_checks/slad.py:21-23,26` | `STATUS_PASS`/`FAIL`/`UNAVAILABLE`, `werdykt_zbiorczy` (FAIL > UNAVAILABLE > PASS) | n/a | n/a | rows 7–10 | ENUM_WEWNETRZNY | Constants + aggregation rule. |
| 7 | `.../equipment_checks/ct_burden_saturation.py:138` | `status`, `status_obciazenia`, `status_nasycenia` | M (VA, ALF_eff), Mg (`zapas_alf`, utilisation), C text (`formula_ref`), trace, D, partial E (`wariant_alf`) | S; L: Sn and ALF_wym not in record; N (IEC 61869-2 only docstring); R | `POST /api/solver/ct-burden-check`, FE `ui2/kryteria/wyposazenieApi.ts`; `domain/dobor_przekladnika.py` | MIGRACJA | Limit and basis missing from record. |
| 8 | `.../equipment_checks/vt_burden_voltage_drop.py:124` | `status`, `status_obciazenia`, `status_spadku` | M (ΔU %), L (`limit_delta_u_procent` + winding category), C (`formula_ref`), D | S, Sn limit, N (IEC 61869-3 docstring), Mg, R, E | `/api/solver/vt-burden-check`, FE as row 7 | MIGRACJA | Partial. |
| 9 | `.../equipment_checks/cable_thermal_aging.py:71,120` | PASS if V ≤ 1 else FAIL | M (Δθ, V), L value (θ_rated), C, D | S, L source, N (Montsinger empirical → FAIL is not a norm violation), R, E | `/api/solver/cable-thermal-aging`, FE `wyposazenieApi.ts:188` | MIGRACJA | FAIL label on a heuristic with no normative basis. |
| 10 | `.../equipment_checks/transformer_losses.py:69,131` | PASS = "calculation done" (docstring :73) | M | no criterion at all | `/api/solver/transformer-losses`, FE `wyposazenieApi.ts:197` | MIGRACJA | PASS literal with no criterion. |

### D. NC RfG / PTPiREE
| 11 | `$S/network_model/solvers/ncrfg_ptpiree/contracts.py:21,24,127,142`; `engine.py:295-310,1128` | test `verdict` pass/fail/no_data/not_required; module `overall_status` zgodny/niezgodny/brak_danych/nie_dotyczy | S, M (`metrics`; units only in key names), R (`summary_pl`, `required_reason_pl`), L source (`criterion_source`) for normative tests, partial E (`criterion_source.status`, `certificate_status`) | C (formula only in trace), L value in record, Mg (in trace), N clause (`procedure_basis_pl` in catalog, not result), D | 7 consumers (`api/ncrfg_ptpiree_tests`, `oze_analysis_runs`, `certyfikat_zgodnosci`, `wniosek_osd`, `ncrfg_compliance/bieg`, `model_bridge`, `dowod_ncrfg`); FE `ui2/oze/macierz`, `ui2/oze/pulpit` | MIGRACJA | "zgodny/niezgodny" reaches OSD application and certificate. |
| 12 | `$S/network_model/solvers/ncrfg_ptpiree/engine.py:1179-1206` | `report_pl`: "Status: zgodny; PASS: n; FAIL: n", "- T01 …: pass - …" | S, summary | everything else | FE `ui/workspace/surfaces/NcRfgTestsTab.tsx:697` shows raw | MIGRACJA | Literal PASS/FAIL text. |

### E. FRT/HVRT
| 13 | `$S/network_model/solvers/frt_hvrt/contracts.py:30,45,55`; `engine.py:96,104,109,138` | `status` ok/der_dropped/no_module/input_invalid + `stayed_connected` | S, trajectory, Mg (`margin_to_curve_pu`), P recovery time | C, L: fixed 0.05 pu for first 150 ms ("MVP simplification"), N, R, E (fixed K=2, time constants), D | `application/analyses/frt_trajektorie.py`, `frt_sekwencja.py` → FE `ui2/oze/frt/sekwencjaModel.ts:67` | MIGRACJA | Verdict not tested against a real FRT curve. |

### F. RMS stability (old)
| 14 | `$S/network_model/solvers/stability_rms/contracts.py:85,120` | `StabilityStatus` ok/diverged/no_module/input_invalid | margin (min damping ratio) | L, C, N, R | only `tests/solvers/test_pr15_pr16_solvers.py` | LEGACY_USUNAC | No production importer. |

### G. RMS dynamics (`dynamika`)
| 15 | `$S/network_model/solvers/dynamika/wynik.py:58-61` | `WlasnosciBiegu.zbiegl` | steps, rejected steps, residuals, tolerance, integrator, dt | n/a | `resultset_dynamic_v1` | ENUM_WEWNETRZNY | Numerical convergence with full context. |
| 16 | `.../dynamika/obserwable.py:128-137` | quality ROZROZNIALNA / NIEROZROZNIALNA / NIEDOSTEPNA per sample | value, uncertainty (Hz), description | n/a | resultset | ENUM_WEWNETRZNY | The evidence-quality element itself. |

### H. Stan fazowy SN
| 17 | `$S/network_model/solvers/phase_state_sn.py:69,101,223-225`; default `$S/enm/canonical_analysis.py:1454` | `voltage_unbalance_alert`, `current_unbalance_alert`, `losses_unbalance_alert` | M (indices %) | L in result (10 % threshold input only, no source), C (max deviation/mean ≠ VUF), N, R, E, D | FE `ui2/wyniki/stan-fazowy/stanFazowyModel.ts:154-170` (`werdyktZFlagi`) | MIGRACJA | Verdict vs arbitrary threshold. |

### I. OLTC
| 18 | `$S/network_model/solvers/power_flow_oltc_studies.py:242-254,548,592` | `within_deadband` dict (tri-state by key presence), `steps_outside_deadband`, `feasible` | S, M (kV), C (`wywod` LaTeX), L + source (`FeasibilityCriterion`) at result level | L in annual-profile step, Mg, R, E, D; N should say "regulator setting from model" | FE `ui2/wyniki/oltc`, `ui2/oze/obszar`, `ui2/oze/studium` | MIGRACJA (minor) | Nearly complete. |

### J. Dobór DER
| 19 | `$S/network_model/solvers/der_selection_preview.py:77,116,346,604` | `RejectedCandidate.reason_code` | S (catalog_ref), M and L in reason text, thresholds at result level, `formula_ref`, D (cable derating) | L source (ΔU_dop, loadability, tolerances inputs without source), Mg, N, E | `api/der_sn_documents.py`, `api/grid_source_preview.py` | MIGRACJA (minor) | Rejection is a verdict; limit has no basis. |

### K. V12.6 (`v126_academic.py`) — all reach `GET /api/analysis-runs/{run_id}/results/v126/{type}` + `/proof` + `/report`, FE `ui2/wyniki/akademickie/prezentacja.ts`
| 20 | `:45` (`_status`), `:1909` | motor starting `verification_status` zgodny/niezgodny (ΔU ≤ 15 % AND I²t ≤ 1 AND torque) | S, M, torque margin | L source (15 % hard-coded; cosφ 0.9 assumed), C, R (which criterion failed), N, E, D | FE `:552-571` | MIGRACJA | Compound verdict with hard-coded limit. |
| 21 | `:413,:458-466` | power quality `compatibility_status` zgodny/niezgodny + `violated_limits` | S, M (THD, TDD); limit and norm only when violated | Mg; bus without harmonic data is "zgodny" by default; E, D | FE `:242-259` | MIGRACJA | Silent "zgodny", mixed norms. |
| 22 | `:488` | `resonance_peaks[].severity` "ALERT" (\|Z\| > 10·Z50) | S, f, \|Z\| | L source, N, R | API/report | MIGRACJA (minor) | Arbitrary factor 10. |
| 23 | `:1239-1244,:1284` | earthing `safety_status` bezpieczny/wymaga_ochrony/niezgodny | M and L (touch/step V), clearing time | N in record (IEEE 80/EN 50522 comments only), 1.25× band source, Mg, R, E, D | FE `:374` | MIGRACJA | |
| 24 | `:1508` | Petersen `tuning_status` dostrojony/rozstrojony_poza_10pct | M (I_res), assumed detuning | L source (10 %; detuning 0.05, damping assumed), N, R, E | FE `:643` | MIGRACJA | |
| 25 | `:1601-1627` | NER `thermal_check.status` zgodny/niezgodny + `thermal_ok` | M (J), L value (J), t_clear | C in record, L source, N, Mg, R | FE `:643,682` | MIGRACJA | |
| 26 | `:1690` | IEC 60071 `verification_status` spelniony/niespelniony (margin ≥ 20 % AND TOV ≤ 1.25·MCOV) | S (bus), M, BIL, margin | L source for 20 %; fallback defaults (U_res = 2.8·MCOV, TOV 1.4/1.15) not flagged; N, R, E | FE `:423-452` | MIGRACJA | Verdict can rest on invented values. |
| 27 | `:1772` | `relay_support_status` spelniony/brak_w_przekazniku | S, method | C, L, N, R; relay p0 = 1.0, i5 = 3.0 hard-coded | FE `:468` | MIGRACJA | |
| 28 | `:1854,1858,1861` | `trv_status` spelniony/niespelniony (min margin ≥ 10 %), `blocking_87t_recommended` (≥ 10 %), `ferroresonance.risk` | Mg (%) | L source, N in record (IEC 62271-100 only trace), R, E, D | FE `:509,535,538` | MIGRACJA | |
| 29 | `:2229,:2254` | `benchmark_validation` row/overall PASS/FAIL | S, Δ %, tolerance %, proof_type | calculated/reference values, tolerance source, R | hidden in FE (`nieprezentowane.ts`) but returned by `/report` | MIGRACJA | Bare PASS/FAIL in API report. |
| 30 | `:53-72,:1148-1153,:879` | `sanity.status` zweryfikowany / poza zakresem / dane niekompletne + `violations` | check name, text | M and L per check; mixes engineering results (>100 % N-1 overload, absence of SSCI mechanism → "not credible") | FE `:211` ("wyniki wiarygodne") | MIGRACJA (minor) | Credibility misused as engineering verdict. |
| 31 | `:897` | SSCI `z_conv_negative_resistance.present` | Re_min Ω, f; 0 Ω threshold physical | n/a | API | ENUM_WEWNETRZNY | Physical indicator with value. |

### L. Zwarcia
| 32 | `$S/network_model/solvers/machine_sc_iec60909.py:144,427,442-447` | `motors_negligible` (ΣI″k,M ≤ 0.05·I″k, §6.6) | S, standard, rule, sum, `small_motor_limit_a` | defaults True when I″k = 0 | SC results | ENUM_WEWNETRZNY | Applicability decision explained in white box. |

No verdicts in `short_circuit_iec60909`, `short_circuit_core`, `short_circuit_contributions`, `short_circuit_asymmetrical_quantities`, `fault_loop_iec60364`, `fault_loop_builder`.

### M. Estymacja stanu
| 33 | `$S/network_model/solvers/state_estimation_wls.py:143,653` | `chi_square_flag`, `lnr_flag` | value, threshold, dof, α, r_N threshold, residuals; E (`validation_status` SYNTETYCZNY) | source for r_N = 3.0 and α = 0.01, R | `application/analyses/state_estimation/service.py`, `zgodnosc_powykonawcza.py` | MIGRACJA (minor) | Threshold source missing. |

### N. Statusy obliczeniowe rozpływu
| 34 | `power_flow_result.py:47`, `power_flow_newton.py:36`, `power_flow_unbalanced.py:116`, `power_flow_oltc_studies.py:83` | solved/not_solved; `converged` | iterations, mismatch, tolerance | n/a | PF results | ENUM_WEWNETRZNY | Numerical status. |

### O. Dowód rozpływu (stary silnik)
| 35 | `$S/network_model/proof/power_flow_proof_document.py:66,255,367`; `power_flow_proof_export.py:524-541,558-574,816,838-841`; `power_flow_proof_builder.py:817-834` | `passed`, `unit_check_passed`, `all_checks_passed`; prints PASS/FAIL, "ZBIEŻNE/NIEZB." | `unit_consistency = True` hard-coded; `energy_balance` copies `converged` | everything | only `tests/test_p21_power_flow_proof.py`; API `/power-flow-runs/{id}/export/proof/*` → 410 GONE (`api/power_flow_runs.py:784-818`) | LEGACY_USUNAC | Dead; fabricated PASS. |

### P. Katalog (audit2)
| 36 | `$S/network_model/catalog/audit2_catalogs.py:1314-1411,1414` | `ok`, `i_dyn_ok`, `i_th_ok`, `message_pl` "OK: … / BLOKER: … / NIEUSTALONE: …" | S, M and L (kA) in text, utilisation % | C in record, L source (catalog ref + verification status), N (IEC 60909/62271-1 docstring), E, D; missing device → `utilization = 0` | `POST /api/v1/catalog/audit2/validate-device-withstand` → FE `WalidacjaWytrzymalosciAparaturySekcja.tsx`; `proof_engine/packs/audit2_validation.py`; `wytrzymalosc_aparatury_pol.py` | MIGRACJA | Literal "OK:" shown to user. |
| 37 | `$S/network_model/catalog/audit2_catalogs.py:1277-1311` | `(bool, message)`; pass returns `(True, "")` | fail message includes U_th and IEC 61869-3 | pass carries nothing | `/validate-vt-grounding` → FE `WalidacjaVtPolaSekcja.tsx`; `audit2_validation` pack | MIGRACJA | Bare positive verdict. |
| 38 | `$S/network_model/catalog/audit2_catalogs.py:1504-1546` | `status` no_export/normal_export/high_export_warning/requires_ramp_down | M (kW, ratio) | L source (0.8/1.5/3.0 none), N, E; message claims "within standard hosting capacity", "REQUIRED: NC RfG study" | `/validate-hosting-capacity-export`, `audit2_validation` pack | MIGRACJA | Pseudo-criterion with no basis. |
| 39 | `$S/network_model/catalog/drift_detection.py:30,79` | `DriftSeverity`, `has_breaking_drifts` | S, fields | n/a | only tests | LEGACY_USUNAC | No production importer. |

### Q. Walidacja modelu i jakość dowodu
| 40 | `$S/network_model/validation/validator.py:35,68,78` (+ `semantic_rules.py`, `oze_validators.py`) | `is_valid`, severity ERROR/WARNING | S, code, message | n/a | pre-solver gate | ENUM_WEWNETRZNY | Model admissibility gate. |
| 41 | `$S/network_model/core/autorytet_wyniku_zwarciowego.py:71,287` | `ZrodloWynikuZwarciowego`, `wynik_jest_miarodajny` | blocking reasons | n/a | gate | ENUM_WEWNETRZNY | Fail-closed evidence gate. |
| 42 | `$S/network_model/catalog/types.py:106,113,1423`; ncrfg `certificate_status` | `CatalogVerificationStatus`, `CatalogStatus`, `ptpiree_status` | evidence element itself | n/a | catalog | ENUM_WEWNETRZNY | E field; no MIGRACJA row propagates it. |
| 43 | `$S/network_model/catalog/niezmienniki_katalogu.py:137,700-790` | catalog credibility review | rule, basis, justification, value | n/a | `api/catalog.py:35-40` | ENUM_WEWNETRZNY | Data-QA signal with basis. |

### Patterns across MIGRACJA rows
- Hard-coded limits with no source: 0.3 s/0.2 s selectivity, 0.05 pu FRT, 10 % unbalance, 15 % motor dip, 20 % BIL margin and 1.25·MCOV, 10 % TRV, 10 % Petersen detuning, 10× resonance, 1.25× touch-voltage band, 0.8/1.5/3.0 export ratio, r_N = 3.0.
- Silent positive verdicts: power-quality default "zgodny"; "neither relay trips → PASS"; VT grounding `(True, "")`; PASS for transformer losses only calculated; `unit_consistency = True` in PF proof.
- Evidence status never travels with the verdict: catalog verification status missing from every MIGRACJA record; only NC RfG (`criterion_source.status`) and conductor thermal (`zrodlo_k`) carry part of it.

**Totals:** MIGRACJA 27 (3, 5, 7–13, 17–30, 33, 36–38) · ENUM_WEWNETRZNY 11 (4, 6, 15, 16, 31, 32, 34, 40–43) · LEGACY_USUNAC 5 (1, 2, 14, 35, 39). 43 rows.

---

## Obszar B — `analysis` / `compliance` / `diagnostics` / `solver_input`: 24 wiersze


All paths are relative to `backend/src/`. Consumers found by grep over `backend/src`, `backend/tests` and `frontend/src`. "only tests" = no production module imports or calls the thing.

Elements: subject (SUBJ), criterion (CRIT), measured value with unit (MEAS), limit with unit (LIM), limit source (SRC), margin (MARG), reason (WHY), normative basis (BASIS), evidence/model status (EVID), validity domain (DOM).

**No record in scope has a structured validity-domain field. No record has a structured normative-basis field on the record itself.**

### A. normative
1. `analysis/normative/models.py:17,25,84` — `NormativeStatus` {PASS, FAIL, WARNING, NOT_COMPUTED, NOT_EVALUATED} + `NormativeSeverity` in `NormativeItem`. Present: SUBJ, MEAS (observed_value+unit), LIM (limit_value+limit_unit, threshold rules only), MARG (observed−limit), WHY. CRIT only as title text. Missing: SRC, BASIS, EVID, DOM, LaTeX. Reach: only `pokrycie_analiz.py:60` (NOT_COMPUTED count → `/api/insights/analysis-coverage`); `NormativeReport.to_dict` never called in production; production feeds only LOAD_FLOW_VOLTAGE proof which no rule matches → every production item NOT_COMPUTED. Class: ENUM_WEWNETRZNY (must migrate if exposed).
2. `analysis/normative/evaluator.py:356-370, 417-430, 441-454, 491-498, 548-555` — PASS used to mean "data present" (NR_P19_002 PASS when no limits configured; NR_P11_001 PASS when SC3F available; NR_P17_001 PASS when loss profile computed); NR_P18_001..004 pass through "OK"/"NOT_OK" with "Warunek spełniony./niespełniony." and no values. Class: LEGACY_USUNAC (PASS without criterion).

### B. energy_validation
3. `analysis/energy_validation/models.py:36,44,64`, `builder.py:435-452, 476-481, 513` — `EnergyValidationStatus` {PASS, WARNING, FAIL, NOT_COMPUTED} per item + summary counts. Present: SUBJ, CRIT (white_box text+LaTeX), MEAS (derived "%", physical kA/MVA/kV only in white-box text), LIM (limit_warn/limit_fail, no unit), MARG (margin_pct vs fail only), WHY. Missing: SRC/BASIS (80/100 % and 5/10 % losses = config defaults; cos φ 0.9/0.8 hard-coded `builder.py:435`; voltage limits from `kryteria_napiecia` but `podstawa` not attached), EVID, DOM. Forbidden word: `_WERDYKT_PL` (line 476) "Werdykt: ZGODNY/PRZEKROCZENIE" as last white-box step. Reach: `/api/quality/energy-validation` → FE `ui2/wyniki/jakosc/EkranJakosci`, `ui2/wyniki/rozplyw/adapters/rozplywAdapter`; consumers hosting_capacity, pq_area (FAIL binding), kontyngencje_n1 (`/api/insights/n-1-contingency`), werdykt_projektowy (`/api/quality/design-verdict`), `wniosek_osd:224` (fail_count → "niespelnione"). Class: MIGRACJA.

### C. voltage_profile
4. `analysis/voltage_profile/models.py:9,17,32`, `builder.py:89` — `VoltageProfileStatus` {PASS, WARNING, FAIL, NOT_COMPUTED} per row. Present: SUBJ, MEAS (u_kv, u_pu, delta_pct). View level only: thresholds (%); basis text added at payload level `application/analyses/voltage_profile_view.py:229`. Missing per row: LIM, MARG, WHY, CRIT, EVID, DOM. Reach: `/api/quality/voltage-profile` (FE `ui/power-flow-results/types.ts`; LV SLD voltage-drop badge reads delta_pct); input to SensitivityBuilder; coverage score. Class: MIGRACJA.

### D. sensitivity
5. `analysis/sensitivity/models.py:14,43,51`, `builder.py:414,466` — `SensitivityDecision` {PASS, FAIL, NOT_COMPUTED} (base, minus, plus; rule margin ≥ 0). Present: SUBJ (English `parameter_label`), MARG+unit, delta_pct. Missing: MEAS; applied limit (`_voltage_margin` line 466 silently switches 5 % warn / 10 % fail → bus at 7 % FAIL here, WARNING in voltage profile); SRC/BASIS (`source` field holds codenames P20/P21/P22a/C-P22); WHY, EVID, DOM. Reach: `/api/insights/sensitivity` → FE `ui2/wyniki/wrazliwosc/EkranWrazliwosci` (`strings.ts:73` maps PASS/FAIL → "spełnione/przekroczone"). Class: MIGRACJA.

### E. recommendations
6. `analysis/recommendations/models.py:14,44`, `builder.py:51-62, 147-198` — `RecommendationEffect` {PASS, STILL_FAIL, NOT_COMPUTED}. Present: SUBJ, value+unit, required_delta %, confidence_note (codenames P20/P25/P26). Missing: LIM, SRC, BASIS, EVID, DOM. Reach: only `pokrycie_analiz.py:62`; view never serialized. Class: ENUM_WEWNETRZNY (output unused → LEGACY candidate).

### F. protection_insight / protection_curves_it
7. `analysis/protection_insight/models.py:9,39,57`, `builder.py:180-210` — `ProtectionSelectivityStatus` {OK, NOT_SELECTIVE, NOT_EVALUATED} + buckets. Present: SUBJ, MEAS/LIM Ik''/ip/I²t vs Icu/Idyn/Ith (units in field names), margins %, WHY (codename "P20"). Missing: selectivity criterion, SRC, BASIS, EVID, DOM. Reach: builder used only by tests (production passes None). Class: LEGACY_USUNAC.
8. `analysis/protection_curves_it/models.py:90`, `builder.py:176-218`, `renderer_svg.py:212-215`, `renderer_pdf.py:100,107` — aggregated `normative_status`; why text "Reguły: NR_P18_… Status: PASS"; SVG legend "Status: PASS"; PDF "Status:"/"decision=". Reach: tests only. Class: LEGACY_USUNAC.

### G. power_flow_interpretation
9. `analysis/power_flow_interpretation/models.py:25,45,71,99`, `builder.py:212-253, 353-403, 494-504` — `FindingSeverity` {INFO, WARN, HIGH}; descriptions end "– w normie / wymaga uwagi / istotny problem"; branch findings graded by losses 2/5 kW "niskie/podwyższone/wysokie". Present: SUBJ (IDs cut to 12 chars), MEAS (v_pu, deviation_pct vs 1.0 pu; losses kW/kvar), WHY, evidence_ref. Limits misleading: only result-level `trace.thresholds` (unused 70/90 % branch loading), losses limits 2/5 kW marked "P22b BINDING" no source. Missing: MARG, SRC, BASIS, EVID, DOM. Reach: `/api/power-flow-runs/{id}/interpretation` (`api/power_flow_runs.py:823`) → FE `ui/power-flow-results/*`, `ui/issue-panel/IssuePanel`. Class: MIGRACJA.

### H. reactive_adequacy
10. `analysis/reactive_adequacy/models.py:47-49, 188-251`, `builder.py:471-514` — view-level `verdict` string ("wystarczajaca rezerwa Q"/"rezerwa Q wyczerpana"/"dane niekompletne") + `is_adequate`; violation `kind_pl`. Present: SUBJ, CRIT (why + LaTeX), MEAS (Mvar, p.u.), LIM, MARG (headroom Mvar), WHY, EVID (ProvenanceTag). Missing: per-violation limit source (bus card vs 0.95–1.05 default), BASIS (ENTSO-E/IEEE 1547 only docstring), DOM. Reach: `/api/oze-analysis/reactive-adequacy` → FE `ui2/oze/pulpit/SekcjaAdekwatnosciQ`. Class: MIGRACJA.

### I. grid_strength
11. `analysis/grid_strength/models.py:35-38, 106-128`, `builder.py:33` — per-bus `verdict` ("mocna/słaba/bardzo słaba/brak danych") + `is_weak`; `wscr_verdict`. Present: SUBJ, MEAS (SCR; S_sc'', S_n MVA), LIM (view-level thresholds), WHY, LaTeX. Missing: MARG, SRC/BASIS (IEEE 1204, CIGRE TB 671, ERCOT, "PROMPT §8C.4" only docstring), EVID, DOM. Reach: `/api/oze-analysis/grid-strength` → FE `ui2/oze/pulpit/SekcjaSilySieci`; embedded in `frt_sekwencja`. Class: MIGRACJA.

### J. ssci_stability
12. `analysis/ssci_stability/models.py:63-66, 158-178`, `builder.py:169-207` — `verdict` ("stabilny/ryzyko SSCI/niestabilny/brak danych") + `is_risk`. Present: SUBJ, CRIT (Nyquist/Sun 2011 + LaTeX), MEAS, LIM (view-level), MARG (phase margin), WHY, EVID (ProvenanceTag). Missing: structured basis; source for 30° risk limit; DOM. Reach: `/analysis-runs/{id}/results/v126/ssci_impedance/stability` → FE `ui2/wyniki/ssci/EkranSsci`. Class: MIGRACJA (closest to target shape).

### K. arc_flash
13. `analysis/arc_flash/models.py:129,735,782`, `reporting/arc_flash_report.py:99-111,245,331` — `ArcFlashStatus` (computation path/coefficient provenance, label_pl, caveat, URLs); `ppe_category` always "dane niekompletne — tablice NFPA 70E". Reach: `/api/quality/arc-flash` + report. Class: ENUM_WEWNETRZNY (it is the evidence-quality axis).
14. `analysis/arc_flash/models.py:848` — `osd_arc_flash_gate` → (ready, blockers). Reach: tests only. Class: LEGACY_USUNAC.

### L. sanity_bounds
15. `analysis/sanity_bounds/short_circuit_bounds.py:29-31, 35-133` — status "zweryfikowany / poza zakresem wiarygodności / dane niekompletne" + `in_range`, `blocks_osd_package`. Present: MEAS (kA, kV), band, LIM (lower_ka/upper_ka), WHY. Missing: SRC (150/50/63/80 kA bands only docstring), MARG, BASIS, DOM. Overclaiming label "zweryfikowany" for a plausibility-band pass. Reach: `/api/quality/sanity-bounds` (FE `ui2/wyniki/jakosc`), `application/result_mapping/short_circuit_to_resultset_v1.py:152` (ikss_sanity), `werdykt_projektowy.py:1213` maps OUT_OF_RANGE → NIE_SPELNIA (mixes credibility with compliance). Class: MIGRACJA.
16. `analysis/sanity_bounds/power_flow_bounds.py:98,176,252` — voltage/branch-loading/losses sanity verdicts (same strings + in_range). Present: MEAS, LIM, WHY; losses `threshold_why_pl` (only per-record source justification in scope). Voltage `norm_ref` attached only at payload level `application/analyses/sanity_bounds.py:268`. Missing: MARG, per-record source for voltage and In, DOM. Reach: `/api/quality/sanity-bounds` (FE `SekcjaPasmRozplywu`), werdykt_projektowy. Class: MIGRACJA.

### M. reporting
17. `analysis/reporting/audit2_report.py:41-54, 92-100, 159-166, 188, 242-266, 299-312` — prints "[OK]/[BLOKER]", "Wynik calosciowy OK / BLOKERY OBECNE"; JSON pass_count/fail_count/all_pass. Present: only summary_pl per proof. Reach: POST `/api/audit2/generate-report` (`api/audit2_catalogs.py:242`) ← FE `WorkspaceSurfaceRouter.tsx:1104`. Class: MIGRACJA.

### N. power_flow (deprecated adapter)
18. `analysis/power_flow/analysis.py:171-261`, `result.py:64` — `violations` dicts {type, id, value, limit, severity ratio, direction}. Missing units, SRC, WHY, BASIS. Reach: only `analysis/power_flow/solver.py::PowerFlowSolver` (deprecated, 4 test files). Class: LEGACY_USUNAC.

### O. compliance
19. `compliance/nc_rfg_modul.py:57` — `modul_nc_rfg` → "A"/"B"/"C"/"D". Reach: bare `{"modul": X}` from `/api/ncrfg-tests/modul` (FE AddDerWizard, DerSurfaces, SldDetailDrawer, derRemoteCatalogs); acceptance check 422 in `api/generators.py:525`. Missing: inputs (P_max, U), thresholds with units, source, BASIS (NC RfG art. 5); documented unresolved YAML vs URE threshold conflict (1 MW vs 200 kW; 50 MW vs 10 MW). Class: MIGRACJA.

### P. diagnostics
20. `diagnostics/models.py:23,40,77`, `engine.py:88-93`, `preflight.py:44-61,118`, `rules.py:386-399` — `DiagnosticStatus` {OK, WARN, FAIL}; `PreflightReport.ready`/`overall_status`; `AnalysisAvailability`; rule I-D01 "model jest kompletny". Issues carry code, message, refs, hints. Model-readiness gate. Reach: `/api/cases/{id}/diagnostics`, `/diagnostics/preflight`, `/execution/runs/{id}/diagnostics`; FE `ui/enm-inspector/DiagnosticsPanel` (OK/WARN/FAIL directly), `ui2/.../PanelDiagnozy`. Class: ENUM_WEWNETRZNY.
21. `diagnostics/rules.py:299-351` — W-D02 "przekracza typowy zakres": hidden unsourced limits length > 100 km, R > 10 Ω/km, U > 400 kV; message gives value not limit. Class: MIGRACJA.

### Q. solver_input
22. `solver_input/contracts.py:66,337`, `eligibility.py:295` — `EligibilityResult`/`AnalysisEligibilityEntry.eligible` + issues (input-completeness gate). Reach: `api/solver_input.py`, `api/protection_coordination.py`; FE `ui/analysis-eligibility`, `engineering-readiness`, `study-cases`, `fault-scenarios`. Class: ENUM_WEWNETRZNY.
23. `solver_input/dowod_ncrfg.py:39-40, 146-199`, `provenance.py:70,112,168,188` — reporting_status / proof_status / `EvidenceTier.regulatory_evidence_eligible` (evidence-quality axis; not yet attached to any analysis-layer verdict). Reach: NC RfG run, certyfikat_zgodnosci, wniosek_osd, enm/canonical_analysis. Class: ENUM_WEWNETRZNY.
24. `solver_input/provenance.py:711` — `osd_card_gate` → (ready, blockers). Reach: tests only. Class: LEGACY_USUNAC.

### Checked, no verdict produced
lf_sensitivity, boundary, comparison_diffs (run lifecycle), coverage_score (0–100 + LUKA-*), machine_short_circuit, koperta_kontekstu, odcisk_kontekstu, voltage_profile/segment_decomposition, reporting/oltc_report (convergence yes/no; tests only), solver_input builder, audit2_* modules, v126_contracts, moc_bierna_wytworcy, uklad_sieci_nn.

### Cross-cutting findings
- Same quantity, six different judgments: voltage deviation classified by energy_validation & voltage_profile (PASS/WARNING/FAIL), power_flow_interpretation (INFO/WARN/HIGH vs 1.0 pu), sensitivity (PASS/FAIL, warn/fail reference switching), sanity_bounds (credibility), reactive_adequacy (0.95–1.05 band).
- Margin signs differ: normative observed−limit; energy_validation observed−fail; sensitivity & protection_insight (limit−observed)/limit.
- Forbidden words emitted literally: "ZGODNY" energy_validation white-box (production); "w normie" power_flow_interpretation (production); "OK/BLOKER/Wynik calosciowy OK" audit2 (production); "zweryfikowany" SC sanity (production); "Warunek spełniony." normative (internal); "Status: PASS" protection curves SVG/PDF (tests).
- Codenames in output fields: sensitivity `source` P20/P21/P22a/C-P22 (serialized by `/api/insights/sensitivity`, not displayed); recommendations P20/P25/P26 (never serialized); protection_insight P20 (tests).
- Downstream aggregators turning statuses into SPEŁNIA-style verdicts: `application/analyses/werdykt_projektowy.py`, `wniosek_osd.py:224`, `migotanie.py:62-64` (own VERDICT_* strings).

### Totals
| Class | Count | Rows |
|---|---|---|
| MIGRACJA | 12 | 3, 4, 5, 9, 10, 11, 12, 15, 16, 17, 19, 21 |
| ENUM_WEWNETRZNY | 6 | 1, 6, 13, 20, 22, 23 |
| LEGACY_USUNAC | 6 | 2, 7, 8, 14, 18, 24 |
| Total | 24 | |

---

## Obszar C — `application` / `api` / `enm` / `domain`: 56 wierszy

Ścieżki względem `backend/src/`. Elementy: S = przedmiot, K = kryterium, W = wynik z jednostką, P = punkt krytyczny, L = limit z jednostką, Ls = źródło limitu i jego stan, M = margines, R = przyczyna, N = podstawa normatywna, E = dowód/status modelu, D = zakres ważności. "FE n" = liczba nietestowych plików frontendu wołających trasę. Klasa: LEGACY_USUNAC = brak nietestowego wołającego poza modułem i re-eksportem `__init__`; ENUM_WEWNETRZNY = status procesu/bramki/dostępności danych, nie werdykt inżynierski; MIGRACJA = reszta.

### A. Werdykt projektowy (struktura odniesienia)
**1.** `application/analyses/werdykt_projektowy.py:436` · `OcenaElementu.wynik` SPELNIA / NIE_SPELNIA / BRAK_PODSTAW. Present: S, K (`warunek_pl`, `warunek_latex`), W (`wartosc`, `jednostka`), L (`odniesienie`, `odniesienie_dolne`, `odniesienie_ostrzegawcze`), M (`margines` + `margines_wzor_latex`), R (`uzasadnienie_pl`, `wniosek_pl`), N (`norma_pl`, criterion-level), `dowod` = {run_id, element_id}. Lacks: (1) limit source status — `norma_pl` is free text ("progi z konfiguracji walidacji energetycznej", "Warunki przylaczenia OSD (dokument projektu)" without reference/date), no ZWERYFIKOWANE/WSKAZANE/NIEUSTALONE (pattern exists in NC RfG `NcRfgZrodloKryterium`); (2) evidence/model status — only `ZrodloWerdyktu.aktualny` per source kind; no proof/reporting status; thermal provider drops `czas_wylaczenia`/`uzasadnienie_k`; no Ik'' authority; (3) validity domain — none (thermal valid only for `fault_node_id`, PF for one operating state, DER-SN from nameplates); (4) uncertainty — none; (5) critical point beyond element id; M for PASMO/ZGODNOSC; DER-SN elements without numeric wartosc/odniesienie. Defects: `_WYNIK_Z_STATUSU` (:855) maps WARN/WARNING→SPELNIA (DER-SN `kaskada_prad_pole_brak` = missing data becomes SPELNIA); `_pozycja_wiarygodnosci` (~:1225) `.get(status, WYNIK_SPELNIA)` fails open ("zweryfikowany" → SPELNIA); thermal branches trivially passing (`i_fault=0`) → SPELNIA with no numbers. Reach: GET `/api/quality/design-verdict` → `ui2/wyniki/ocena`, `co-wymaga-uwagi` (FE 4). **MIGRACJA** (target structure; must gain Ls, E, D, uncertainty).
**2.** `werdykt_projektowy.py:496/:558/:1456` · `PozycjaWerdyktu.stan`, `WerdyktProjektowy.werdykt`, counters. Overall has no L/M/N; contradicts row 37 (`ZAKRES_POZA_AUTOMATEM` says no selectivity verdict, yet coordination analyzer gives one). **MIGRACJA** (aggregate of full records with explicit scope).

### B. NC RfG / dokumenty OSD
**3.** `application/analyses/certyfikat_zgodnosci.py:91` · `_WERDYKT_PL {"pass":"spełnia","fail":"nie spełnia"}`, rows :235-251 (`werdykt`, `werdykt_pl`). Present: S; R (`wartosci_pl`); E (`podstawa`). Missing: K; structured W/L; Ls (solver `criterion_source` and `metrics` dropped); M; N; D. Reach: POST `/api/oze-analysis/compliance-certificate` + `.docx` (:415) / `.pdf` (:551) (FE 1). **MIGRACJA**.
**4.** `certyfikat_zgodnosci.py:98, :260-261, :320-330` · module status + `werdykt_zbiorczy` "Projekt zgodny / niezgodny", DOCX (:372-381), PDF (:507-518). Only S + counts; `modulow_niezgodnych` = "not zgodny" (:232, :277) → `brak_danych`/`nie_dotyczy` count as non-compliant; `_STATUS_MODULU_PL` lacks `nie_dotyczy`. **MIGRACJA**.
**5.** `application/analyses/wniosek_osd.py:245-272` · `zgodnosc_nc_rfg` status/`etykieta_pl`, DOCX (:449-459), PDF (:602-611). Reach: POST `/api/oze-analysis/osd-application` + `.docx`/`.pdf` (FE 2). **MIGRACJA**.
**6.** `wniosek_osd.py:214, :220, :221-226, :351-358` · `bilans_q_status`/`straty_status` + `_status_pl`; DOCX (:415-423), PDF (:573-577) print "cos φ … — spełnia". Present: W only. Missing: K, L, Ls, M (`margin_pct` dropped), R (`why_pl` dropped), N, E, D. **MIGRACJA**.
**7.** `application/analyses/dokument_studium.py:293-310, :334, :558-560, :713-714` · `pokrycie_pq.werdykt_pl` "Pokryte / Niepokryte". Present: S; R. Missing: structured W/L/M, Ls, N, E, D. Reach: POST `/api/oze-analysis/connection-study` + `.docx`/`.pdf` (FE 1). **MIGRACJA**.
**8.** `application/analyses/pq_coverage.py:74-99, :146-152, :112/:120` · per-point `pokryty`, overall `werdykt.pokryty`, ślad "POKRYTE / NIEPOKRYTE". Present: S; K (LaTeX); W/L Mvar; M; R; Ls partial. Missing: Ls status; N; E; D. Reach: GET `/api/oze-analysis/pq-coverage` (FE 5). **MIGRACJA**.
**9.** `application/analyses/frt_trajektorie.py:70-94, :261-282` · `werdykt_pl` "w obwiedni / poza obwiednią / moduł wypadł"; wywód :159-166 ends "SPELNIONE / NIESPELNIONE". Present: S; W; M; K (LaTeX); L (view); E (`ocena_dowodowa` = UNVALIDATED_MODEL, view). Missing: Ls status; N; D; P. Reach: GET `/api/oze-analysis/frt-trajectories` (FE 4). **MIGRACJA**.
**10.** `application/analyses/frt_sekwencja.py:55-81, :228` · `werdykt_sekwencji_pl`; per-dip :171-189. Aggregate has no M/L/N. Reach: GET `/api/oze-analysis/frt-sequence` (FE 4). **MIGRACJA**.
**11.** `application/ncrfg_compliance/bieg.py:47-109` · `NcRfgPtpireeRunResponse` re-exposes `verdict`, `overall_status`, counts, `report_pl`. Present per test: S; R; W/L unstructured `metrics`; Ls (`criterion_source`); E (`evidence_by_test`, fail-closed). Missing: K, N per test; M; D. Reach: POST `/api/ncrfg-tests/run`, GET `/cases/{id}/compliance` (FE 4 + 8). **MIGRACJA** (most complete in family).

### C. Kryteria jakości PF/SC
**12.** `application/analyses/warunki_przylaczenia.py:58-60, :73-101, :131-137` · `PozycjaOceny.status` PASS/FAIL/UNAVAILABLE, `status_ogolny`. Present: K key; W; L (`wymagana`); R. Missing: Ls; M; N; E; D. Reach: GET `/api/quality/connection-conditions` (FE 2). **MIGRACJA**.
**13.** `application/analyses/energy_validation/service.py:45-68` (re-exposes `EnergyValidationItem.status`). Present: S; W; L; M; R; K. Missing: Ls (hard-coded 80/100 %, 5/10 %); N; E; D. Reach: GET `/api/quality/energy-validation` (FE 4). **MIGRACJA**.
**14.** `application/analyses/kontyngencje_n1.py:354-371` · `naruszenia_*` from FAIL items. Present: W; L; R; trace. `margin_pct` dropped; Ls, N, E, D missing. Reach: GET `/api/insights/n-1-contingency` (FE 1). **MIGRACJA**.
**15.** `hosting_capacity.py:110, :180`, `pq_area.py:126, :171` · internal FAIL to pick binding criterion. **ENUM_WEWNETRZNY**.
**16.** `application/analyses/wytrzymalosc_cieplna_przewodow.py:105-165, :168-181` · status PASS/FAIL/UNAVAILABLE + summary. Present: S; W; L; M; R; K; N (view `normy`); E partial. Missing: D; explicit units; uncertainty. **:315-333 emits "PASS … spełnione trywialnie" with no numbers for branches outside the fault path.** Reach: GET `/api/quality/conductor-thermal-withstand` + `/proof` (FE 2). **MIGRACJA**.
**17.** `application/analyses/sanity_bounds.py:104-121` · "zweryfikowany / poza zakresem wiarygodności / dane niekompletne", `in_range`, `blocks_osd_package`. Present: W; L band; R. Missing: Ls; M; N; D. Overclaiming label; re-emitted in `application/v126_artifacts.py:126-128`. Reach: GET `/api/quality/sanity-bounds` (FE 4). **MIGRACJA** (should be an E attribute of Ik'', not a design criterion).
**18.** `application/analyses/migotanie.py:282-287, :356-367` · `verdict_pl`. Present: S; W; L; K; N (text only). Missing: M; Ls status; E; D; `d_percent` no limit. Reach: GET `/api/quality/flicker` (FE 2). **MIGRACJA**.
**19.** `application/analyses/zgodnosc_powykonawcza.py:56-60, :242-253, :271-351, :509-516` · `werdykt` "w tolerancji / poza tolerancją / …". Present: S; W; L; Ls ("jawna (żądanie)"); R. Missing: M; N; E (measurement uncertainty); D. Reach: POST `/api/quality/as-built-compliance` (FE 3). **MIGRACJA**.
**20.** `application/analyses/dobor_kompensacji.py:348-388` · `spelnia_*` bools. Present: S; W. Missing: L in record; Ls; M; R; N; E; D. Reach: GET `/api/oze-analysis/compensation-sizing` (FE 4). **MIGRACJA**.
**21.** `application/analyses/ochrona_lom.py:133-235, :499-600, :626-629` · per-check severity OK/INFO/WARN/ERROR, field `status` ("OK" when no checks — vacuous). Present: S; W; L (string); N (NC RfG art. 13); R; K. Missing: M; structured L; Ls status; E; D; SPZ always INFO. Reach: GET `/api/oze-analysis/lom-protection` (FE 4). **MIGRACJA**.
**22.** `application/analyses/grid_strength.py:207`, `reactive_adequacy.py:144` · re-expose verdicts. Present: S; W; L (view); R; E (reactive only). Missing: Ls; M; N; D. (FE 3 + 2). **MIGRACJA**.
**23.** `application/analyses/ssci_stability/service.py:84-113` · verdict + `is_risk`. Present: S; W; P; L (view); M; R; E. Missing: Ls (30° convention); N; D. **MIGRACJA**.
**24.** `api/v126_academic.py:289, :400`, `application/v126_artifacts.py:36-59` · raw re-exposure of V12.6 statuses; `_metric_rows` flattens payload to ≤24 rows, reads first list element → status printed without limit; L/Ls/N in `v126_katalog.py` not joined. **MIGRACJA**.

### D. Łańcuch nN
**25.** `application/analyses/swz/werdykt.py:69-72, :104-127` · `SwzStatus` enum values ARE user labels ("spełnia"/"nie spełnia"/"nierozstrzygalne"), `SwzResult`. Present: W; L; M (unitless; `float('inf')` at :320); R; K, N, partial D in trace. Missing: unit on margin; E; explicit D. Reach: GET `/api/cases/{id}/enm/swz` (FE 1), rows 27-30. **MIGRACJA** (enum must become machine code).
**26.** Envelope `status: "OK" / "brak danych" / "nie dotyczy" / "nierozstrzygalne"` in six producers (`swz/service.py:239-251`, `fault_loop/service.py:560, :660`, `nn_device_selection.py:783`, `nn_circuit_sheet.py:177-190`, `lv_domain/projection_v1.py:313`, `lv_domain/upstream_equivalent.py:207`). Data-availability flag. **ENUM_WEWNETRZNY**.
**27.** `application/analyses/nn_device_selection.py:103-106, :216-243, :486` · `KryteriumStatus` "spełnia / nie spełnia / nierozstrzygalne", `kwalifikuje_sie`. Present: K; W, L, sometimes Ls/N in `wartosci` dict; R. Missing: units; M; E; D. Reach: GET `/api/cases/{id}/enm/nn-device-selection` (FE 0). **MIGRACJA**.
**28.** `application/analyses/nn_circuit_sheet.py:465-478, :740-790` · `i2t.wytrzymuje`, re-exposure of `status_doboru`. Present: S; W; L; M; N; E. Missing: Ls; D; K. (FE 0). **MIGRACJA**.
**29.** `api/analysis_run_exports.py:1640+` (`build_nn_circuit_report_section`) · re-exposes SWZ verdict with provenance supplied by the caller (`run_id`, `revision_id`, `przypadek_decydujacy`, `ib_a`, `iz_prime_a`, `ik_max_ka` from request body). Reach: POST `/api/nn-proof/circuit/report`. **MIGRACJA** (E server-side).
**30.** `application/proof_engine/packs/lv_circuit_verification.py:306-307, :594, :655, :749-778, :942-960` · statuses; summary `overall_status` PASS/FAIL/NIEROZSTRZYGALNE; `key_results` "\text{SWZ}" = status; LaTeX `\Rightarrow \text{PASS}` (:774). Per-step complete; summary lacks L, M, N, E, D. Reach: POST `/api/nn-proof/circuit/pack`, `/preview`. **MIGRACJA**.

### E. Aparatura
**31.** `application/analyses/wytrzymalosc_aparatury_pol.py:144-184, :354` · per-row `werdykt` from `audit2_catalogs.py:1314-1411`; `ok` (collapses NIEUSTALONE into False), `i_dyn_ok`/`i_th_ok`, `message_pl` "OK:/BLOKER:/NIEUSTALONE:". Present: S; L; E partial; utilisation. Missing: K; N; Ls status; D; explicit M. Reach: POST `/api/cases/{id}/enm/wytrzymalosc-aparatury` (FE 2). **MIGRACJA**.
**32.** `api/audit2_catalogs.py` · `/validate-vt-grounding` {ok, message_pl} :102-113; `/validate-device-withstand` :119-128; `/validate-hosting-capacity-export` :136; `/generate-proof-pack` `all_pass` :183-231; `/generate-report` :242; `proof_engine/packs/audit2_validation.py:33-55` (`pass_status`), :358-380 (`all_pass`). Missing: structured W/L; Ls; M; N; E (currents from caller; `proof_id` random uuid4 → non-deterministic); D. **MIGRACJA**.
**33.** `application/equipment_proof/generator.py:27-33, :71-79, :240-255, :280-300`, `types.py:78-129` · check status PASS/FAIL/NIE_DOTYCZY; `overall_status`; `key_results` `*_ok` → "OK_{overall}" = PASS; `unit_check_passed` hard-coded True. **"Brak podstawy" emitted as FAIL.** Missing: units; M; N; Ls; E; D. Reach: POST `/api/equipment-proof/pack` (FE 0). **MIGRACJA**.
**34.** `api/equipment_checks.py:82-85, :179-182, :290-291, :361-362` · CT/VT burden, cable ageing, transformer-loss `status*`. Present: W; partial L; M (`zapas_alf`); `formula_ref`; white box. Missing: L/M pairing per status; Ls status; D. **MIGRACJA**.
**35.** `domain/dobor_przekladnika.py:64, :105-150` · `Kryterium.werdykt`, `dobor_potwierdzony`. Present: S; K; N (`podstawa_pl`); W/L strings; R; trace. Missing: structured numbers; M; Ls; E; D. Reach: GET `/api/projects/{p}/cases/{c}/generators/{g}/instrument-transformers` (FE 3). **MIGRACJA**.
**36.** `api/grid_source_preview.py:413-460` · `CableAmpacityDeratingResponse.ok`. Present: W; L; utilisation; Ls-ish; K. Missing: N; E (rated ampacity from caller); D; comparison in API layer. **MIGRACJA**.

### F. Zabezpieczenia
**37.** `domain/protection_device.py:66-96` · `CoordinationVerdict` PASS/MARGINAL/FAIL/ERROR + `VERDICT_LABELS_PL`; checks :392/:428/:473. Present: S; W; L; M; R. Missing: Ls (1.5/1.2/CTI config defaults or client `api/protection_coordination.py:133-144`); N; E; D. `analyzer.py:863-888` `overall_verdict` treats ERROR as FAIL and empty check lists as PASS. POST `/run` returns only `overall_verdict` + counts (:172-173, :498-512); exports :666-761. FE 11. **MIGRACJA**.
**38.** `domain/protection_device.py:514` (`ProtectionCoordinationResult`), :618/:663/:708/:759 (`Instantaneous*Check`, `SPZFromInstantaneousCheck`). No non-test caller. **LEGACY_USUNAC**.
**39.** `application/protection_read_model.py:671-716` · `verification_status` SPELNIONE/NIESPELNIONE/BRAK_DANYCH — SPELNIONE = no sanity diagnostics fired; `margin_pct` always None. Reach: GET `/api/cases/{id}/enm/protection-view` (FE 4+), `api/enm.py:1283`. **MIGRACJA**.
**40.** `application/protection_settings/engine.py:411-423` (`passed` k_cz ≥ 1.5 hard-coded), `is_valid`/`range_valid`; `proof_engine/packs/protection_settings.py:416` (`overall_status`). Missing: Ls; N, M, E, D in summary. Reach: GET `/api/analysis-runs/{id}/pakiet-dowodowy-nastaw`, `/nastawy`. **MIGRACJA**.
**41.** `proof_engine/proof_generator.py:3143-3200, :3440-3455` (OK/NOT_OK), `equation_registry.py:1664-1760`, `proof_inspector/inspector.py:372-446`, `types.py:170-196`. No production caller. **LEGACY_USUNAC**.
**42.** `domain/protection_analysis.py:27-33` · `TripState`. Physical state. **ENUM_WEWNETRZNY**.
**43.** `application/analyses/protection/catalog/validator.py:12-59` · (ok, violations) for catalog setting ranges. **ENUM_WEWNETRZNY**.

### G. Silnik dowodowy — ogólne
**44.** `proof_engine/types.py:284-320` · `UnitCheckResult.passed`, `ProofSummary.unit_check_passed`, `all_passed`; `passed=True` hard-coded at `proof_generator.py:1572, 2996, 5113, 5160, 5209, 5268`; `packs/protection_settings.py:177, 226, 276, 321, 363`; `packs/p14_power_flow.py:411, 483, 558, 627`; `packs/qu_regulation.py:162, 216`; equipment proof. Printed "Weryfikacja jednostek: PASS/FAIL" (`latex_renderer.py:232-237`), "OK/BŁĄD" (`proof_inspector/exporters.py:290`). **ENUM_WEWNETRZNY** (internal QA flag; stop printing; replace hard-coded True with a real check).
**45.** `proof_engine/packs/p14_power_flow.py:330, :394-399, :616` · `overall_status` PASS/WARN; LaTeX `\Rightarrow \text{PASS}` for convergence. Reach: GET `/api/analysis-runs/{id}/pakiet-dowodowy`. **ENUM_WEWNETRZNY** (numerical-quality attribute; not to be printed as PASS).
**46.** `proof_engine/packs/qu_regulation.py:207-216, :372` · `overall_status`, `within_limits`; missing-data levels skipped → all-missing yields PASS. No production caller. **LEGACY_USUNAC**.
**47.** `application/stability/voltage_trajectory.py:176-210` · `check_trajectory_against_envelope` with hard-coded NC RfG envelope. No caller. **LEGACY_USUNAC**.
**48.** `api/proof_pack.py:155-190` · small-motor rule "SPELNIONA / NIESPELNIONA". Present: K; W; L; N. Missing: M; D. Reach: POST `/api/proof/sc3f/contributions`. **MIGRACJA** (minor).

### H. Stabilność dynamiczna
**49.** `application/stability/dynamic_stability.py:139-180, :226-235` · `stable`, STABLE/UNSTABLE, `checks{}`, `violated_checks`. Present: W; L/M only for clearing time; `limiting_factor`; E and `threshold_criteria` at run level (`enm/canonical_analysis.py:1680-1705`). Missing: L for angle/voltage/frequency; Ls; N; D; `stability_index` undefined meaning. **MIGRACJA**.

### I. Wzorce referencyjne
**50.** `application/reference_patterns/base.py:31-51, :60-100, :177-203` · `ReferenceVerdict` ZGODNE/GRANICZNE/NIEZGODNE, `CheckStatus`; producers `pattern_line_i_doubleprime_thermal_spz.py:475-735`, `wzorzec_c_generacja_lokalna.py`. Present: S; R; unitless details. Missing: K, units, L, Ls, M, N, E, D. Reach: `/api/reference-patterns/run`, fixtures, PDF/DOCX printing "Werdykt: ZGODNE" (`api/reference_patterns.py:331-336, :491-496`) (FE 2). **MIGRACJA**.
**51.** `application/reference_patterns/reporting.py:103-110, :235-247, :306-332, :651` · duplicate DOCX/PDF verdict renderer; only re-exported. **LEGACY_USUNAC**.

### J. DER-SN
**52.** `application/analyses/raport_zgodnosci.py:37-69, :197-220, :243-266` · item status PASS/WARN/FAIL with ✓/⚠️/❌; `werdykt` ZGODNY/ZGODNY_Z_UWAGAMI/NIEZGODNY; counts. `grupa_polaczen` (:116-124) always passes when vector group exists; "bieg_analiz" from client `run_status` query (`api/der_sn_documents.py:215-248`); tolerances not shown. Missing: W/L structured; Ls; M; N; E; D. Reach: GET `/api/der-sn/{case}/compliance-report` (FE 1); persisted RAPORT_ZGODNOSCI; feeds row 1. **MIGRACJA**.

### K. ENM, domena, statusy procesu
**53.** `enm/severity.py:13-21`, `enm/validator.py:104-160` · `ValidationStatus` OK/WARN/FAIL (model-completeness gate). **ENUM_WEWNETRZNY**.
**54.** Process/evidence enums: `domain/der_readiness.py:40`, `domain/eligibility_models.py:51`, `application/network_wizard/schema.py:20`, `v126_gotowosc.py:114-130`, `application/result_freshness.py:68-76` (+ `study_case/status_wynikow.py`), `enm/canonical_analysis.py` reporting/proof status :253, :423-426, :1478-1512 (hard-coded "reportable/complete" for SC and phase state), :1680-1705; `dokumentacja_wykonawcza/gotowosc.py:53`; `station_templates/apply.py` log "OK". **ENUM_WEWNETRZNY** (ResultFreshness + proof/reporting status = natural source of E).
**55.** `domain/result_set.py:51` · `OverlayElement.visual_state`. Only re-exported. **LEGACY_USUNAC**.
**56.** `domain/result_builder_v1.py:50-73` · SLD overlay legend labels INFO "Poprawne — Element poprawny" from validation issues. **MIGRACJA** (label only).

Modules without verdict: SC3F, VDROP, P16 losses (`overall_status` "COMPUTED"), LF voltage, earthing packs (`computed_status`), `arc_flash_view` (evidence tier), `odpowiedz_osd`, `granice_sieci`, `pokrycie_analiz`, comparison modules.

### Totals
| Class | Rows | Count |
|---|---|---|
| MIGRACJA | 1-14, 16-25, 27-37, 39, 40, 48, 49, 50, 52, 56 | 42 |
| ENUM_WEWNETRZNY | 15, 26 (6 producers), 42, 43, 44, 45, 53, 54 | 8 |
| LEGACY_USUNAC | 38, 41, 46, 47, 51, 55 | 6 |
| Total | | 56 |

### Patterns
1. Missing data turned into a verdict: rows 1, 33, 37, 44-46. 2. Vacuous PASS/OK with nothing checked: rows 16, 21, 37, 39, 46. 3. Verdict inputs supplied by the client: rows 29, 32, 36, 37, 52. 4. Ls almost universally missing (only NC RfG `criterion_source` complete; certyfikat/wniosek/dokument_studium drop it). 5. D missing in every row.

---

## Obszar D — `frontend/src/ui2/**`: 78 wierszy

`$UI2` = `frontend/src/ui2`. Elementy: K = kryterium · W = wynik z jednostką · L = limit z jednostką i źródłem · M = margines · P = przyczyna · N = podstawa · D = jakość dowodu/status modelu · Z = zakres ważności. Jedyne werdykty spełniające regułę już dziś: wiersze per element w „Ocena" (`wyniki/ocena`) i panel dowodu cieplnego (`PanelDowoduCieplnego`) — wzorzec dla reszty.

### OZE › macierz / certyfikat
1. `$UI2/oze/macierz/strings.ts:171-184` `ETYKIETY_WERDYKTU`/`KLASA_WERDYKTU` → `MacierzNcRfg.tsx:633-664` (cell + legend `:681-689`), `SzczegolWerdyktu.tsx:56-63`. spełniony / niespełniony / brak danych / niewymagany. Cell shows label only; row header adds K (`ability_pl`), N (`procedure_basis_pl`); detail adds P (`summary_pl`), N (`required_reason_pl`), D (tier_pl + rationale), trace. Missing: W (raw `metrics` without unit), L, M, Z. Backend: `NcRfgTestResult.verdict`, untyped `metrics`. **MIGRACJA** (backend contract needs structured measured/limit/source).
2. `MacierzNcRfg.tsx:691-714` project summary "zgodne N / niezgodne N / Spełnione wymagane X/Y". **MIGRACJA.**
3. `MacierzNcRfg.tsx:716-786` + `strings.ts:187-191` per-module zgodny / niezgodny / brak danych + counts. Backend `overall_status`. **MIGRACJA.**
4. `MacierzNcRfg.tsx:741-758` + `oze/ncRfgStore.ts:37-43,135-140` "Walidacja LVRT/HVRT: <tekst>" coloured by `istotnosc` — FRT verdict copied into store as text + colour only. **MIGRACJA.**
5. `MacierzNcRfg.tsx:474-518` certificate preview: `werdykt_zbiorczy.etykieta_pl` + counts; per-test `werdykt_pl`, `wartosci_pl`, `zalozenia_i_zrodla` in contract (`oze/api.ts:1178-1219`) not rendered. **MIGRACJA.**
6. `SekcjaZgodnosciPrzekrojowej.tsx:42-53` (`ETYKIETA_STATUSU`/`KLASA_STATUSU`), `:138-160`, `:210-216`, `:274-294`. Present: K, P, per-module D (`reporting_status`). Missing: W, L, M, N, Z. Status map duplicates `strings.ts:187-191`. **MIGRACJA.**
7. `macierzModel.ts:479-499,519-521`, `zgodnoscPrzekrojowaModel.ts:93-116` (aggregation/filtering). **ENUM_WEWNETRZNY.**

### OZE › pulpit
8. `$UI2/oze/pulpit/strings.ts:152-165` `ETYKIETY_STATUSU_PULPITU` → `PulpitOze.tsx:185-191`, `SekcjaZgodnosci.tsx:34-90`. K + P only for failed tests. `pulpitModel.ts:180` filters `verdict==='fail'` ignoring `required` (contradicts `macierzModel.testyNiespelnione`). **MIGRACJA.**
9. `SekcjaSilySieci.tsx:46-52,141-149` + `strings.ts:171-182` `klasaWerdyktuSily`: mocna / słaba / bardzo słaba. Present: W, P, D, trace. Missing: L + source, M, N, Z. **MIGRACJA.**
10. `SekcjaAdekwatnosciQ.tsx:46-53,145-153` + `strings.ts:188-192` `klasaWerdyktuQ` (colour by matching text 'wyczerpana'). Present: W, M, P, D. Missing: L source, N, Z. **MIGRACJA.**

### OZE › wniosek
11. `$UI2/oze/wniosek/EkranWniosku.tsx:538-566` NC RfG badge (`zgodnosc.status`) + counts + procedure. **MIGRACJA.**
12. `wniosek/strings.ts:126-136` `STATUS_WALIDACJI_WNIOSEK_PL` (PASS→'spełnia'), `EkranWniosku.tsx:471-484`, summary `:486-500`. Missing: L, M, N, P. Backend `bilans_q_status`, `straty_status`. **MIGRACJA.**

### OZE › studium
13. `$UI2/oze/studium/studiumModel.ts:302-307` `werdyktPokryciaPL` (Pokryte / Niepokryte) → `:389`, `KreatorStudium.tsx:998`; detail panel `:241-305` has no coverage section (`strings.ts:129 szczegolPokrycie` unused). All eight elements missing though `werdykt.min_margines_mvar`, `opis_pl` in payload. **MIGRACJA.**

### OZE › ranking / zdolność
14. `$UI2/oze/zdolnosc/zdolnoscModel.ts:112-121` `statusScenariuszaPL`/`istotnoscScenariusza` → `ranking/EkranRankingu.tsx:161-173`, `zdolnosc/EkranZdolnosci.tsx:156-168`. W/L in contract (`binding.observed_value`, `unit`, `limit_fail`, `api.ts:289-297`) not rendered; M, N, D, Z missing. **MIGRACJA.**

### OZE › krzywe, FRT, kompensacja, LoM, obszar
15. `$UI2/oze/krzywe/EkranKrzywych.tsx:127-137` banner + `krzyweModel.ts:117-131` (Pokryty / Niepokryty). Present: W, L, M, P, trace. Missing: N, D, Z. **MIGRACJA (light).**
16. `$UI2/oze/frt/frtModel.ts:239-263` `werdyktCalosciFrt` (banner `EkranFrt.tsx:120-127`) + column `:179-214` — overall verdict built in UI by ranking backend text strings. Present: W, M, D, operator. Missing: numeric L + source, N, Z. **MIGRACJA (light).**
17. `frt/sekwencjaModel.ts:115-121` `werdyktSekwencji` (prefix match on text), badge `SekcjaSekwencjiZapadow.tsx:103-110`. **MIGRACJA (light).**
18. `$UI2/oze/kompensacja/kompensacjaModel.ts:29-31,51,90-103` `werdyktKompPL`. Present: W (cosφ). L only in assumptions (`EkranKompensacji.tsx:173-176`) no source. Missing: M, P, N, D, Z. **MIGRACJA.**
19. `$UI2/oze/lom/strings.ts:86-96` `statusLomPL`/`istotnoscLom`, `EkranLom.tsx:111,121-125,215-218`. Row detail: W, L, source, P, trace. Missing: M, D, Z. **MIGRACJA (light).**
20. `$UI2/oze/obszar/obszarModel.ts:196-199` tag "Pasmo pracy / Brak pasma" + `opisGranicy`. Missing: limit source, M, N, D. **MIGRACJA (light).**

### Wyniki › wzorzec (shared)
21. `$UI2/wyniki/wzorzec/TabelaWynikow.tsx:500-504` + `strings.ts:25` tag "Poza zakresem" for any cell flagged `ostrzezenie`; cell type (`wzorzecModel.ts:57-58`) has no slot for limit/source/margin; ~12 adapters. **MIGRACJA — root cause.**
22. `$UI2/wyniki/wzorzec/SladSekcyjny.tsx:56-72,168-181` ✓/✗/i checklist; `pozycja_pl` + `wartosc_pl` free text. Consumer `zwarcia/WkladyZwarciowe.tsx:178-183`; backend `walidacja_iec[]`. **MIGRACJA.**

### Wyniki › rozpływ
23. `rozplyw/adapters/rozplywAdapter.ts:111-117` + `rozplyw/strings.ts:139-146` `napiecePozaZakresem` (bus tag; comparison in UI; L/N only in assumptions). **MIGRACJA.**
24. `rozplywAdapter.ts:233-250` `komorkaObciazenia` → `TabelaGalezi.tsx`; `PozycjaObciazenia` drops `limit_warn`/`limit_fail`. **MIGRACJA.**

### Wyniki › zwarcia
25. `zwarcia/aparatura/WeryfikacjaAparatury.tsx:259-277` + `api.ts:105-110` — verdict only inside `komunikat_pl`; `znamiona`, `utilization_*_percent`, `i_dyn_ok`/`i_th_ok` in contract not rendered; N generic "IEC 60909". **MIGRACJA.**

### Wyniki › porównanie
26. `porownanie/porownanieModel.ts:205-220,321-331,611-620,672-681` + `strings.ts:144-153` (`WAGA_PROG_TAG=4` threshold chosen in UI). Missing: K/L behind codes, M, N. **MIGRACJA.**

### Wyniki › estymacja
27. `estymacja/EkranEstymacji.tsx:401-429` χ²/LNR tags with value + threshold; α in assumptions. Missing: M, N, Z. **MIGRACJA (light).**
28. `EkranEstymacji.tsx:541-553` summary chips (zbieżny / brak zbieżności; χ² chip without threshold). **MIGRACJA (light).**
29. `estymacja/model.ts:363-371` residual tags + "podejrzany"; L only in assumptions; M missing. **MIGRACJA.**

### Wyniki › składowe
30. `skladowe/model.ts:125,146-149,163` `werdyktPL` ("Werdykt raportowalności"); detail `EkranSkladowych.tsx:311-333` shows P, D. Missing: K, N, Z. **MIGRACJA (light).**

### Wyniki › akademickie
31. `akademickie/prezentacja.ts:196-216` + per-kind maps `:372-390,466-474,507-515,641-650` → `EkranAnalizAkademickich.tsx:888-970` `PanelWerdyktu`. Present: K, L + source, N (`podstawa_oceny`), W with reference (`:974-1015`), Z (`zakres_pl` `:505`). Missing: M; D not on same card. **MIGRACJA (light).**
32. `EkranAnalizAkademickich.tsx:906-921` + `strings.ts:279-280` "kryterium spełnione dla N z M węzłów". **MIGRACJA.**
33. `EkranAnalizAkademickich.tsx:1088-1100` per-object chips (spełnione / niespełnione); per-row limit and M missing. **MIGRACJA.**
34. `EkranAnalizAkademickich.tsx:1145-1176` `PanelWiarygodnosci` chip + `detail_pl`; no criterion/threshold per check. **MIGRACJA (light).**
35. `EkranAnalizAkademickich.tsx:510-545` `ListaWarunkow` readiness "spełniony / niespełniony" badge. **MIGRACJA (wording).**

### Wyniki › ocena
36. `ocena/model.ts:67-89` `wynikPL`/`klasaWyniku` → `EkranOceny.tsx:170-270`: K, W + unit, L, M + formula, N (`norma_pl`, `warunek_latex`), P; D (runs + freshness + hash `:79-133`), Z (`zakres_oceny` `:288-292`) on same screen. **ENUM_WEWNETRZNY — reference implementation.**
37. `EkranOceny.tsx:135-162` counters + `ocenaCalosciowaPL` over fully explained rows. **ENUM_WEWNETRZNY.**

### Wyniki › jakość
38. `jakosc/strings.ts:402-423` `STATUS_WALIDACJI_PL` (PASS→'Zgodny', FAIL→'Przekroczenie'); `jakoscModel.ts:274-290`, `EkranJakosci.tsx:487-578`, chips `:477-480`. Present: W, L, M, P, trace. Missing: source/N, D, Z. **MIGRACJA (light).**
39. `EkranJakosci.tsx:314-365` + `jakoscModel.ts:149-166` Ik″ credibility raw `status` + tag + band + `why_pl`. Missing: M, N, D. **MIGRACJA (light).**
40. `jakoscModel.ts:318-341` flicker tag from UI `pst > pst_limit` + `verdict_pl`; detail `EkranJakosci.tsx:608-720` limits without source, no measured Pst/Plt. **MIGRACJA.**
41. `EkranJakosci.tsx:836-918` + `strings.ts:336-340` arc flash `istotnoscArcFlash` by method. Present: W, P, D. Missing: PPE threshold + source, M, Z. **MIGRACJA (light).**
42. `jakoscModel.ts:419-453` `ocenaWarunkuPL` (Spełnione / Naruszone / Niesprawdzone). Present: K, W, L. Missing: M, source/N, D. **MIGRACJA (light).**
43. `jakoscModel.ts:541-590` thermal "✔ Spełnione / ✖ Naruszone" → `PanelDowoduCieplnego.tsx` (energy balance, sub-criteria, k basis + source, sensitivity, remedies, norms with clauses). **ENUM_WEWNETRZNY — complete.**
44. `PanelDowoduCieplnego.tsx:141` sensitivity table PASS/FAIL derived in UI (`wykorzystanie <= 1`). **MIGRACJA.**
45. `SekcjaPasmRozplywu.tsx:76-89,134-145,179-185` raw status + tag + band + `norm_ref` + `why_pl`. Missing: M, D. **MIGRACJA (light).**

### Wyniki › kontyngencje, koordynacja, odbiór, OLTC, SSCI
46. `kontyngencje/model.ts:70-93` tags + `EkranKontyngencji.tsx:103-137` list (value + reason; limit claimed but not shown; thresholds only in assumptions `model.ts:116-124`). **MIGRACJA.**
47. `koordynacja/SekcjaNastaw.tsx:434-477` `overall_valid` ("Nastawy spełniają warunki doboru.") + `range_valid` + I>> limits. Missing: source/N, M. **MIGRACJA.**
48. `SekcjaNastaw.tsx:505-515` thermal "Przewód (NIE) wytrzymuje" + I_th,dop + margin; missing actual I·√t, N. **MIGRACJA.**
49. `SekcjaNastaw.tsx:90-104` "Aparat zgodny / NIEZGODNY" + violations. Missing: K/L per capability, N. **MIGRACJA.**
50. `SekcjaNastaw.tsx:61-85` `WierszWarunku` prop `spelniony` — 0 callers. **LEGACY_USUNAC.**
51. `odbior/strings.ts:119-136` `WERDYKT_ZGODNOSCI`/`istotnoscWerdyktu`, `odbiorModel.ts:213-275`, `EkranOdbioru.tsx:69,85,155-210`. Present: W, model value, deviation, L (user tolerance), trace. Missing: M, N, D, Z. **MIGRACJA (light).**
52. `oltc/oltcBadaniaModel.ts:232-234` `fmtDopuszczalna`, `EkranBadanOltc.tsx:296,376`. Missing: M, D, Z. **MIGRACJA (light).**
53. `ssci/model.ts:21-47`, chip `EkranSsci.tsx:80-100` + `why_pl` + metrics. Missing: L (Nyquist/phase-margin thresholds) + source, N, D, Z. **MIGRACJA.**

### Wyniki › stabilność, stan fazowy, wrażliwość, zbieżność, co-wymaga-uwagi
54. `stabilnosc/model.ts:363-367` STABILNY / NIESTABILNY block `EkranStabilnosci.tsx:170-209` with M, P, criteria value + unit + source, D, Z note. **ENUM_WEWNETRZNY.** (uwaga planu: cały tor T1 do kasacji — patrz macierz dynamiki)
55. `EkranStabilnosci.tsx:236-265` per-quantity "Spełnione / Naruszone" without own threshold/margin. **MIGRACJA (light).**
56. `stan-fazowy/stanFazowyModel.ts:131-173` + `EkranStanuFazowego.tsx:386-403` PRZEKROCZENIE / w normie / bez werdyktu; contract row has no alarm threshold (`:12-14`). **MIGRACJA** (backend field needed).
57. `wrazliwosc/strings.ts:72-77` `DECYZJE_PL` in "Werdykt bazowy" column `model.ts:128-137`, tag from UI `margines<0`. Present: K, M. Missing: W, L + source, N; explanation strings `strings.ts:44-46` unused. **MIGRACJA.**
58. `wrazliwosc/strings.ts:82-86` `istotnoscDecyzji` — no references. **LEGACY_USUNAC.**
59. `zbieznosc/EkranZbieznosci.tsx:177-201,245` ZBIEŻNY / NIEZBIEŻNY; tolerance in assumptions, mismatch per iteration. **ENUM_WEWNETRZNY.**
60. `co-wymaga-uwagi/model.ts:97-171` + `EkranCoWymagaUwagi.tsx:73-84` — "Napięcie wysokie/niskie" from UI comparison; "N naruszeń"; global "Sieć w normie". Missing: L, M, N, D. **MIGRACJA.**

### Kryteria
61. `$UI2/kryteria/strings.ts:99-115` `etykietaWerdyktu` → `SekcjaBilansuCtVt.tsx:217-224,265-269`. Present: W, L, `formula_ref`. Missing: `zapas_alf`/M, ALF limit, `assumptions`, `white_box_trace` (in contract, not rendered), source/N, D. Also consumed by `ui/network-build/station-der/DoborPrzekladnikowSekcja.tsx`. **MIGRACJA.**
62. `SekcjaKartyKatalogu.tsx:142` cable ageing verdict without criterion/limit. **MIGRACJA.**
63. `SekcjaKartyKatalogu.tsx:250` transformer losses "Stan rachunku" via PASS/FAIL labels, no criterion. **MIGRACJA.**

### Kreatory
64. `kreatory/zrodlo-oze/PodsumowanieAutoBieg.tsx:15-31,67-101` + `strings.ts:486-491` "Projekt zgodny / zgodny z uwagami / niezgodny" + ✓/⚠️/❌ + "Spełnione: N…"; `parametr`, `zastosowano`, `propozycja` in contract not rendered; verdict too broad. **MIGRACJA.**
65. `kreatory/magistrala/magistralaModel.ts:298-337` `ocenaDoboru` with hard-coded `LIMIT_SPADKU_PCT=5`; `KreatorMagistralaSn.tsx:497-515` "OK / Do sprawdzenia"; `:301-303,450-454` `iznamPrzekroczony` UI comparison. **MIGRACJA.**
66. `kreatory/ogranicznik/ogranicznikModel.ts:75-84` + `KreatorOgranicznikaSn.tsx:213-217` "Niezgodne" replaces U_m (UI rule U_m ≥ U_n). **MIGRACJA.**
67. `kreatory/kompensator/kompensatorModel.ts:78-87` + `KreatorKompensatoraSn.tsx:235-239` "Niezgodne" from UI tolerance 0.5 kV. **MIGRACJA.**
68. `kreatory/stacja/PodgladRozdzielnicySn.tsx:72-80,97-106` VALID/INVALID → "Konfiguracja przyjęta / odrzucona"; reason only in tooltip. **MIGRACJA.**
69. `kreatory/rama/gotowosc.tsx:59-83` `KreatorGotowosc` (Kompletne / Sprawdź / Brak). **ENUM_WEWNETRZNY** (vehicle for 65–67).
70. `kreatory/zrodlo-oze/GotowoscDer.tsx:90-104` readiness axes + `blockers.message_pl`. **ENUM_WEWNETRZNY.**

### Spaces
71. `spaces/gotowosc/SekcjaZgodnosciReferencyjnej.tsx:39-51,166-174,187-210` score % by UI thresholds (100 / ≥80) + ✓/✗ + `message_pl`; contract `ReferenceComplianceCheck` (`ui/enm-inspector/types.ts:135-141`) has no value/limit. **MIGRACJA** (backend extension).
72. `spaces/model/ZgodnoscReferencyjna.tsx:195-212` same ✓/✗. **MIGRACJA.**
73. `spaces/gotowosc/SekcjaPokryciaAnaliz.tsx:18-24,97-126` coverage score by UI thresholds + ✗ gaps. **MIGRACJA (low priority).**
74. `spaces/projekt/KafelPrzylaczenia.tsx:245-253` + `pulpitAdapter.ts:231-248` "w limicie OSD / przekracza limit OSD" computed in UI (sum P > capacity). Missing: M, N, D, Z. **MIGRACJA.**
75. `spaces/gotowosc/adapters/gotowoscAdapter.ts:275-316` `statusGotowosci` OK/WARN/FAIL (documented "null→OK" debt). **ENUM_WEWNETRZNY.**

### Inspector / shell / proces
76. `inspector/SekcjaPetlaZwarcia.tsx:106` `status==='OK'` render branch. **ENUM_WEWNETRZNY.**
77. `shell/CaseBar.tsx:99-103` + `shellStatus.ts:101` "Model: zwalidowany" green dot from `gotowosc.ready`. **MIGRACJA (low priority).**
78. `wyniki/jakosc/SekcjaPorownaniaMetod.tsx:220` neutral chips only; `proces/**` no verdicts.

Not verdicts (excluded): run/freshness tags (`SeriePanel.tsx:54-65`, `WierszPrzebiegu.tsx:15-16`, `MenedzerPrzypadkow.tsx:36`, `KartaPrzypadku.tsx:34`, `KafelOstatniegoPrzebiegu`, `ListaPrzypadkow`, `KafelSpojnosci`, `CaseBar` results dot, `StatusBar`, `FreshnessBadge`), import outcomes (`EkranArchiwum.tsx:126-133`, `EkranImportuArkusza.tsx:116-122`), diagnostics (`PanelDiagnozy.tsx:60,242`), document readiness, `KafelGotowosci`, `PanelGotowosci`, `kontyngencje STATUSY_PL`, `porownanie stanZadzialaniaPL`/`STATE_CHANGE_LABELS`.

### Tests pinning laconic verdict text
`oze/macierz/__tests__/macierzNcRfg.test.tsx:97-98,242`; `sekcjaZgodnosciPrzekrojowej.test.tsx:229-230`; `macierzModel.test.ts:164-165`; `oze/pulpit/__tests__/pulpitModel.test.ts:32,35`; `oze/wniosek/__tests__/model.test.ts:122-123`; `oze/studium/__tests__/studiumModel.test.ts:269,326`, `KreatorStudium.test.tsx:204`, `KreatorStudiumDokument.test.tsx:200`; `oze/ranking/__tests__/EkranRankingu.test.tsx:161-162`; `oze/zdolnosc/__tests__/EkranZdolnosci.test.tsx:142-143`, `zdolnoscModel.test.ts:127,138`; `oze/krzywe/__tests__/krzyweModel.test.ts:81,88`, `EkranKrzywych.test.tsx:159`; `wyniki/wzorzec/__tests__/sladSekcyjny.test.tsx:104,107`; `wyniki/stabilnosc/__tests__/stabilnoscModel.test.ts:87-88`; `wyniki/zwarcia/aparatura/__tests__/WeryfikacjaAparatury.test.tsx:149`; `kreatory/zrodlo-oze/__tests__/podsumowanieAutoBieg.test.tsx:80`, `KreatorZrodlaOze.test.tsx:402`; `kreatory/stacja/__tests__/KreatorStacjiSnNn.test.tsx:1812,1835`; `spaces/gotowosc/__tests__/sekcjaZgodnosciReferencyjnej.test.tsx:235-236`; `spaces/model/__tests__/ZgodnoscReferencyjna.test.tsx:175,185`; `spaces/projekt/__tests__/pulpitProjektu.test.tsx:241`.

### Class-wide patterns
- One shared root cause: `TabelaWynikow` cell type (`wzorzecModel.ts:57-58`) and `SladSekcyjny` checklist have no structured slot for limit/source/margin — fixing those two covers ~15 adapters.
- Verdicts computed in the UI (physics in UI): `rozplyw/strings.ts:139-146` (also co-wymaga-uwagi); `jakoscModel.ts:334,337`; `PanelDowoduCieplnego.tsx:141`; `wrazliwosc/model.ts:120`; `magistralaModel.ts:298-337`; `ogranicznikModel.ts:75-84`; `kompensatorModel.ts:78-87`; `pulpitAdapter.ts:247-248`; score thresholds in `SekcjaZgodnosciReferencyjnej`, `SekcjaPokryciaAnaliz`; colour/verdict by text matching: `klasaWerdyktuQ`, `werdyktCalosciFrt`, `werdyktSekwencji`.
- Backend sends explanation data the UI never shows: `binding.observed_value`/`limit_fail` (zdolność), `znamiona`/`utilization_*` (aparatura), `zapas_alf`/`white_box_trace`/`assumptions` (CT/VT), certificate `testy[].werdykt_pl`/`wartosci_pl`, DER report `parametr`/`zastosowano`/`propozycja`, `WerdyktPQ.min_margines_mvar`/`opis_pl` (studium).
- Backend contract gaps: `NcRfgTestResult.metrics` untyped; `ReferenceComplianceCheck` no value/limit; stan-fazowy row no alarm threshold.
- Duplicate definitions: two maps for NC RfG module status (`SekcjaZgodnosciPrzekrojowej.tsx:42-53` vs `strings.ts:187-191`); two "failed tests" predicates (`pulpitModel.ts:180` vs `macierzModel.ts:519-521`).
- Out of ui2 but relevant: `ui/protection-coordination/ProtectionCoordinationPage` embedded in `EkranKoordynacji`; `ui/workspace/WorkspaceSurfaceRouter.tsx` mounts seven of these screens.

### Totals
| Class | Count |
|---|---|
| MIGRACJA | 66 (18 light) |
| ENUM_WEWNETRZNY | 10 (rows 7, 36, 37, 43, 54, 59, 69, 70, 75, 76) |
| LEGACY_USUNAC | 2 (rows 50, 58) |
| Total | 78 |

---

## Obszar E — `frontend/src/ui/**`, `engine/**`, `types/**`: 82 wierszy

Osiągalność produkcyjna: jedyne wejście buildu `index.html` → `src/main.tsx` → `ui2/AppRoot` (strony `*-harness.html` = harness deweloperski); graf importów zbudowany symbolowo z `main.tsx`, potwierdzony grepem konsumentów i punktów montażu. Warstwa `ui/` dociera do produkcji przez `WorkspaceSurfaceRouter` (montowany w `ui2/legacy/LegacySurface`, `LegacyWarsztat`, `LegacyInspektor`, `ui2/spaces/dokumentacja/MostDokumentacji`), `EkranKoordynacji` → `ProtectionCoordinationPage`, `SldCanvasV3Workspace` → `SldDetailDrawer`/`LvDomainPortal`, `EnmInspectorPage`, `InspectorEngineeringView`. Elementy: K, W, L, M, P, N, D, Z (+ obecny, ~ częściowy, − brak). Ścieżki względem `frontend/src/`. **Żaden żywy werdykt nie spełnia pełnego kontraktu** (brak D i Z wszędzie); najbliżej: dobór przekładników (#41), karta konfliktu selektywności (#11), panel SWZ obwodu nN (#77).

### Shared maps (ui/shared)
1. `ui/shared/verdict-messages.ts:31-45,76-93,107-173,183-222` `VERDICT_UI_LABELS`, `COORDINATION_VERDICT_UI_LABELS`, `*_DESCRIPTIONS`, `*_COLORS`, `buildCoordinationVerdictMessage` — ZGODNE/GRANICZNE/NIEZGODNE, PASS/MARGINAL/FAIL/ERROR → "Zgodne"/"Na granicy dopuszczalności"/"Wymaga korekty"/"Wystąpił błąd"; canned "Wszystkie kryteria spełnione". P (notes) + canned effect/recommendation; −K −W −L −M −N −D −Z. Reachable via `protection-coordination/types.ts:19-22`, `ResultsTables.tsx:26-28`. **MIGRACJA** (single label/colour source of live coordination badges).
2. `ui/shared/normativeLabels.ts:89-483` voltage/branch/SC verdict labels, `NETWORK_VERDICT_LABELS`, `traceLabels.ok`, `successVerdict`; hard-codes 80 %, 100 %, 15 %; consumers only dead rows 14, 16. **LEGACY_USUNAC.**

### protection-coordination (LIVE: `ui2/wyniki/koordynacja/EkranKoordynacji.tsx:24,104`, `WorkspaceSurfaceRouter.tsx:2919`)
3. `ui/protection-coordination/ResultsTables.tsx:52-81` `VerdictBadge` — PASS bare badge no tooltip; non-PASS tooltip with P + canned text; −K −W −L −M −N −D −Z. **MIGRACJA** (archetypal standalone badge).
4. `ResultsTables.tsx:137-178` `SensitivityTable` — +W (I_min, I_pickup [A]), +M (%), ~P; −L (1.5/1.2 from UI `DEFAULT_CONFIG` `types.ts:569`, sent by page `ProtectionCoordinationPage.tsx:800`); ~N (subtitle "IEC 60909"); −D (`sc_run_id`/`pf_run_id` never shown); −Z. **MIGRACJA.**
5. `ResultsTables.tsx:241-291` `SelectivityTable` — +W, +M (Δt), ~L ("min: X" no source); −P (notes only tooltip non-PASS); ~N; −D −Z. **MIGRACJA.**
6. `ResultsTables.tsx:360-404` `OverloadTable` — as row 4. **MIGRACJA.**
7. `ResultsTables.tsx:425-465` + `ProtectionCoordinationPage.tsx:353-383` `SummaryCard` counters + green bar; backend `error` count dropped. **MIGRACJA.**
8. `ProtectionCoordinationPage.tsx:341-351` `SummaryTab` overall `VerdictBadge(overall_verdict)` + canned "Koordynacja prawidłowa, wszystkie kryteria spełnione."; `overall_verdict_pl` ignored. **MIGRACJA.**
9. `TccChart.tsx:77-105,111-141,161-208` (mounted 543-545) `SelectivityAssessment` OK / NA GRANICY / NIE OK aggregated in UI (empty list → OK, ERROR → NA_GRANICY); canned "Dlaczego / Co dalej". **MIGRACJA** (aggregate from backend with worst pair).
10. `TccInterpretationPanel.tsx:167-212,226-234,316-330` header chips/empty state "Brak konfliktów", "Wszystkie sprawdzenia … przeszły pomyślnie" — vacuous pass with 0 pairs. **MIGRACJA.**
11. `TccInterpretationPanel.tsx:86-125,241-310` per-conflict card: badge + W (A, s), M (Δt), ~L (in cause text), P (cause composed in UI; recommendation UI arithmetic); −N −D −Z; only FAIL/MARGINAL shown. **MIGRACJA** (best in module).
12. `protection-coordination/types.ts:425,430,511-513,560-567,569-577` `LABELS.verdict`, `verdictVerbose`, `VERDICT_STYLES`, `DEFAULT_CONFIG` thresholds. **MIGRACJA.**
13. `protection-coordination/types.ts:31,97-128,185-193` `CoordinationVerdict` + check interfaces (API contract; no limit-source/basis fields; `verdict_pl` unused). **ENUM_WEWNETRZNY.**

### power-flow-results (dead)
14. `ui/power-flow-results/PowerFlowResultsInspectorPage.tsx:208-261,279-321,476-496,631-655,718-748,790-879,921-941` `getVoltageVerdict`, `getBranchLoadingVerdict`, `calculateNetworkVerdict` — UI verdicts ("no data" → PASS; losses > 0.1 MW → MARGINAL; no criteria → PASS); only `power-flow-results/index.ts` imports it (docstring "dead-code bez trasy renderu"). **LEGACY_USUNAC.**
15. `ui/power-flow-results/PowerFlowSldOverlay.tsx:118,247,289,308` default 'OK'. Unreachable. **LEGACY_USUNAC.**

### results-inspector / results
16. `ui/results-inspector/shortCircuitVerdict.ts:41-99` UI margin (Icu − Ik)/Icu, PASS > 15 %; test-only. **LEGACY_USUNAC.**
17. `ui/results-inspector/types.ts:236-245` `reporting_status(_pl)`, `proof_status(_pl)`, `dopuszczalnosc_raportowa` — evidence fields never rendered in `ui/`. **ENUM_WEWNETRZNY.**
18. `ui/results/ResultStatusBar.tsx:66-76,192` freshness colours, tooltip "model nie spełnia wymagań"; only `results/index.ts`. **LEGACY_USUNAC.**

### sld-overlay
19. `ui/sld-overlay/RawToTypedOverlayAdapter.ts:21-37` severity → visual_state; INFO → 'OK', unknown severity → 'OK' (fail-open); typed payload not drawn on v3 canvas (`SldCanvasV3.tsx:1135-1138`). **ENUM_WEWNETRZNY.**
20. `ui/sld-overlay/ShortCircuitFlowOverlayAdapter.ts:109-115,172` fault-point 'CRITICAL' marker. **ENUM_WEWNETRZNY.**
21. `ui/sld-overlay/cableLoadingOverlay.ts:15-75` low/normal/high/overload with UI thresholds 50/80/100 %; no importers. **LEGACY_USUNAC.**
22. `ui/sld-overlay/overlayTypes.ts:19,170,235-241` `coordination_verdict`, `VISUAL_STATE_STYLE`; no producer/renderer. **LEGACY_USUNAC.**
23. `OverlayLegend.tsx:30-45`, `OverlayEngine.ts:186-187`, `LoadFlowOverlayAdapter.ts:43-44`, `ZeroSequenceOverlayAdapter.ts:56-57`, `OltcOverlayAdapter.ts:57` (converged → 'OK'); unreachable. **LEGACY_USUNAC.**

### proof / reports
24. `ui/proof/TraceMetadataPanel.tsx:288` hard-coded "Obliczenia zgodne z normą IEC 60909"; unreachable. **LEGACY_USUNAC.** (`ui/reports/**` no verdict renderers.)

### engineering-readiness / analysis-eligibility / issue-panel / schema-completeness
25. `ui/engineering-readiness/DataGapPanel.tsx:470-482,544-553`, `ReadinessLivePanel.tsx:284-296,325-335`, `EngineeringReadinessPanel.tsx:43-53,255` — ✓ "Układ przygotowany do obliczeń", OK/WARN/FAIL; unreachable (`ui2/legacy/legacyRegistry.ts:64` bridge removed). **LEGACY_USUNAC.**
26. `ui/engineering-readiness/readinessVisualState.ts:14,41` used by `networkBuildStore.ts:7`. **ENUM_WEWNETRZNY.**
27. `ui/analysis-eligibility/AnalysisEligibilityPanel.tsx:25-31,156-179` ELIGIBLE/INELIGIBLE; unreachable. **LEGACY_USUNAC.**
28. `ui/types.ts:470,537-540` eligibility labels; router uses `eligible` boolean (`WorkspaceSurfaceRouter.tsx:1905-1924`). **ENUM_WEWNETRZNY.**
29. `ui/issue-panel/IssuePanel.tsx:24-31` severity labels; only unreachable `ui/index.ts`. **LEGACY_USUNAC.**
30. `ui/schema-completeness/SchemaCompletenessPanel.tsx:230-234` "Model kompletny"; unreachable. **LEGACY_USUNAC.**

### workspace surfaces (LIVE via WorkspaceSurfaceRouter)
31. `ui/workspace/surfaces/NcRfgTestsTab.tsx:110-122,239-245,656-673` per-test badge (spełniony/niespełniony/brak danych/niewymagany); +K, +P; −W −L −M (`metrics` never rendered); −N (`procedure_basis_pl` not shown); −D (`evidence_by_test`, `reporting_status`, `proof_status`, `evidence_note_pl` ignored); −Z. Mounted `WorkspaceSurfaceRouter.tsx:1055-1056`. **MIGRACJA.**
32. `NcRfgTestsTab.tsx:636-651` raw `overall_status` enum + "PASS / FAIL" counter. **MIGRACJA.**
33. `ui/workspace/WorkspaceSurfaceRouter.tsx:2163-2170` ModelGapsSurface "Układ spełnia reguły projektowe." (readiness worded as design compliance). **MIGRACJA.**
34. `WorkspaceSurfaceRouter.tsx:1983-1997,2257-2287` + `ui/network-build/station-der/catalogs.ts:338-383` (`validateHostingCapacityExport`) — no_export/normal_export/high_export_warning/requires_ramp_down decided in UI; ratios 0.8/1.5/3.0 unsourced ("Reguła operatora") under "NC RfG Art. 17"; +W (kW), +P; −L source −M −N; −D (nameplate sum, not load flow); −Z. **MIGRACJA** (move to backend).
35. `WorkspaceSurfaceRouter.tsx:2478-2503` + `ui/workspace/routerPureHelpers.ts:38-48` audit2 proof pack "Weryfikacja pozytywna / Wymaga sprawdzenia" + rows `summary_pl`; `details`, `formulas_latex` not rendered. **MIGRACJA.**
36. `ui/workspace/routerContractRows.ts:39` + `analysisRunContract.ts:131-147` "Brama jakości" row; `quality_gate` 'ok' → "poprawne", 'passed' → "spełnione". **MIGRACJA.**
37. `ui/workspace/surfaces/DerSurfaces.tsx:861` (+615-626) row "Zgodność przyłączeniowa" whose value is a readiness axis. **MIGRACJA** (relabel/bind).
38. `DerSurfaces.tsx:1041-1048` green "zgodne z modelem" chip (= certificate bound). **MIGRACJA** (relabel).
39. Process/readiness states — `ui/workspace/routerCardComponents.tsx:101-124` (`StatusPill`), `WorkspaceSurfaceRouter.tsx:2201-2219` + `routerFixActionHelpers.ts:117-122`, `WorkspaceSurfaceRouter.tsx:1169-1188` ("Raport gotowy"). **ENUM_WEWNETRZNY.**
40. `ui/workspace/WorkspaceOperationalBar.tsx:46-265` ok/warn/error tones; only barrel export. **LEGACY_USUNAC.**

### network-build / station-der / station-configurator
41. `ui/network-build/station-der/DoborPrzekladnikowSekcja.tsx:144-178,229-251,278-295,395-408` spełnione/niespełnione/do rozważenia/brak danej; +K, ~W/~L (strings), +N (`podstawa_pl`), +P, +trace, +input provenance; −M, ~D, −Z. Reached via `DerSurfaces.tsx:22`. **MIGRACJA** (closest in `ui/`).
42. `station-configurator/cards/WalidacjaVtPolaSekcja.tsx:139-172` — on pass backend `message_pl` replaced by fixed "zgodny z siecią…"; +W (F_v), ~N; −L (1.9/1.2 not shown) −M −D −Z; backend contract `{ok, message_pl}` (`station-der/audit2-api.ts:234-237`). **MIGRACJA.**
43. `station-configurator/cards/WalidacjaWytrzymalosciAparaturySekcja.tsx:131-176` green/red + `message_pl`; `utilization_*`, `i_dyn_ok`, `i_th_ok` (`audit2-api.ts:247-254`) not rendered; −D (currents from stored `audit2Config.bay_device_withstand`, `StationConfiguratorSurface.tsx:1100,1194-1198`, not SC run). **MIGRACJA.**
44. `station-configurator/cards/StationConfigProtectionCard.tsx:58-70,136-138` "Selektywność" column; `relays` always `[]` (`StationConfiguratorSurface.tsx:116,1189`). **LEGACY_USUNAC** (dead data path).
45. `StationConfigProtectionCard.tsx:177`, `StationConfigSnSwitchgearCard.tsx:93` presence flags. **ENUM_WEWNETRZNY.**
46. `ui/network-build/InspectorEngineeringView.tsx:352-355` (+3131) "Tor pola spełnia wymagania: Tak/Nie"; backend `verification.whole_power_path_ok`; via `ui2/legacy/LegacyInspektor.tsx:38`. **MIGRACJA.**
47. `ui/network-build/cards/BayCard.tsx:505-509` same field; `cards/**` no production importer. **LEGACY_USUNAC.**
48. `ui/network-build/bay-configurator/BayConfigurator.tsx:63-70` "✓ pole zgodne z regułami" vs "N błędów"; rules in `bayValidation.ts` not listed on pass; via `BayConfiguratorSurface.tsx:97`. **MIGRACJA.**
49. `ui/network-build/station-der/AddDerWizard.tsx:1944-1962` "zgodne z wariantem"; `fitsStationTransformerCapacity` (615-622) true when capacity unknown (fail-open); via `StationConfiguratorSurface.tsx:1355`. **MIGRACJA.**
50. `station-der/readiness.ts:109-157` `validateHostingCapacity` ("OK: …", 80/100 %); no consumer. **LEGACY_USUNAC.**
51. `station-der/antiIslandingValidator.ts:44-170`, `frtEnvelopeValidator.ts:46,84-115` UI verdicts; test-only. **LEGACY_USUNAC.**
52. `ui/network-build/forms/voltageDropValidator.ts:34-152` ok/warning/error with UI limits 5/8/80 %, "w normie"; test-only. **LEGACY_USUNAC.**
53. `network-build/build-sidebar/ReadinessSection.tsx:48`, `der-configurator-v2/derConfiguratorContract.ts:52,98`, `DerConfiguratorSidebar.tsx:91`; unreachable. **LEGACY_USUNAC.**
54. `station-der/MacierzAnalizSekcja.tsx:26-37` + `macierzAnaliz.ts:170-183` completeness + availability, no verdict. **ENUM_WEWNETRZNY** (compliant pattern).
55. Contract types with bare ok/pass flags — `station-der/audit2-api.ts:234-254,403-418`; `forms/cableVoltageDropApi.ts:95` (`ok: boolean`, used by ui2); `ui/ncrfg-tests/api.ts:2,73,94` (`NcRfgVerdict`, `overall_status`). **ENUM_WEWNETRZNY** (laconic contracts block migration of consumers).

### tech-card / fault-scenarios
56. `ui/tech-card/buildTechCardSubject.ts:429-433` + `TechCard.tsx:68-74` completeness dot; `SemanticIssuesBanner.tsx:33-44` severity. **ENUM_WEWNETRZNY.**
57. `ui/fault-scenarios/FaultScenariosPanel.tsx:155-156` "Analiza dostępna / zablokowana" + issues. **ENUM_WEWNETRZNY.**

### comparison
58. `ui/comparison/ResultsComparisonPage.tsx:46-61,178-182` + `types.ts:162-181` Poprawa / Pogorszenie / Bez zmian — UI heuristic (negative ΔU = "Poprawa"; < 1 % no change); +W; −K −L −N −D; reachable (router 'compare'). **MIGRACJA** (or remove judgement).
59. `ui/comparison/comparisonDeltaVisualization.ts:10-92` unreachable. **LEGACY_USUNAC.**
60. `ui/protection-comparison/types.ts:33-38` `STATE_CHANGE_LABELS` (used by `ui2 porownanieModel.ts:648`). **ENUM_WEWNETRZNY.**

### enm-inspector (LIVE via `ui2/spaces/model/ModelWarsztat`, `LegacyWarsztat`)
61. `ui/enm-inspector/ReferencePanel.tsx:31-41,162-167,168-180` score % by UI thresholds (100 / ≥80); ✓/✗ + `element_ref` + `message_pl`; `rule_code` hidden; ~N, +P; −W −L −M −D −Z. **MIGRACJA.**
62. `ui/enm-inspector/DiagnosticsPanel.tsx:121-150` + `types.ts:114-118` "Model poprawny"; rule set not named. **MIGRACJA (low priority).**
63. `ui/enm-inspector/PreflightMatrix.tsx:96-105` AVAILABLE/BLOCKED + reason. **ENUM_WEWNETRZNY.**

### inspector / property-grid / reference-patterns / study-cases
64. `ui/inspector/InspectorPanel.tsx:69-79,255-290` "W normie / Przekroczenie" 80/100 %; unreachable. **LEGACY_USUNAC.**
65. `ui/property-grid/ValidationBadge.tsx:175-179` "OK Brak błędów walidacji" (form validation). **ENUM_WEWNETRZNY.**
66. `ui/reference-patterns/types.ts:28-30,158-195` + `ReferencePatternsPage.tsx:142-172,285-305,829-832` ZGODNE/"Spełnione"; unreachable. **LEGACY_USUNAC.**
67. `ui/study-cases/ProtectionCaseConfigPanel.tsx:251` "Zgodne z biblioteka"; unreachable. **LEGACY_USUNAC.**

### protection / protection-curves
68. `ui/protection-curves/types.ts:107-112,303-308,339-344` "Skoordynowane / Nieskoordynowane"; no consumer. **LEGACY_USUNAC.**
69. `ui/protection/sanity-types.ts:21-50` + `useSanityChecks.ts:34-120` (fixtures kept in production file, `USE_FIXTURE_DATA = false`). **ENUM_WEWNETRZNY.**

### sld v2
70. `ui/sld/v2/canvas/SldDetailDrawer.tsx:2134-2167` cable "spadek" tab — UI traffic-light thresholds (95/75 %, 8/5 %) + static row "Klasa zgodności: PN-EN 50160 (±10%)"; values always null on live path (`ui/sld/shared/detailDrawerData.ts:593-594`; branch 847-903 documented dead). **LEGACY_USUNAC.**
71. `SldDetailDrawer.tsx:2186-2190` "Komunikacja: OK / BŁĄD" — null `communication_ok` (`detailDrawerData.ts:978`) shows "OK" (fail-open). **MIGRACJA.**
72. `SldDetailDrawer.tsx:2384-2389` invented empty-state "Rozdzielnica SN: układ pól zgodny z typem stacji." **MIGRACJA.**
73. `ui/sld/v2/proof/DerComplianceBadge.tsx:20,61-74`, `renderer/EquipmentProofBadge.tsx:29-31,95-104`, `renderer/equipmentProofValidator.ts:37-142`, `proof/ProofPackFreshnessBadge.tsx:60`, `canvas/SldPowerBalancePanel.tsx:92`, `renderer/GpzOperatorHeader.tsx:31`; no production importers. **LEGACY_USUNAC.**
74. `ui/sld/v2/station-rozdzielnia/StationRozdzielniaSN.tsx:933-936`, `OzeSourceArchetype.tsx:296-338`, `canon/sldCanonKit.tsx:266-271` ✓/✗ Ik″max ≤ Icw, U, ip; only harness/tests. **LEGACY_USUNAC.**

### sld v3 (LIVE)
75. `ui/sld/v3/lv-domain/LvDomainView.tsx:1473-1503` `SwzBadge` "SWZ ✓/✗/?" — +W (Ik₁min [A]), ~L (Ia only on fail; t ≤ [s]); −M (`margines` never rendered); ~N/~D only overlay header (506-513); −Z (TN-only not stated); via `SldCanvasV3Workspace.tsx:151`. **MIGRACJA.**
76. `LvDomainView.tsx:1409-1412` (+1426, 1463, 1477, 1506) + `visualGrammar.ts:645-658` (`tonWerdyktuSeverity`) verdict dot at overview zoom — colour only. **MIGRACJA.**
77. `LvDomainView.tsx:695-792` `LvFeederPanel` "SWZ: spełnia" — +W, +P (`przyczyna_pl`), +assumptions, +model revision; −M, t_wymagany missing, −N in panel, −Z. **MIGRACJA.**
78. `ui/sld/v3/canvas/SldCanvasV3.tsx:1366-1463` main-canvas SWZ glyph without `<title>`; nothing fills `swzByOwnerRef` in production (`overlay.ts:300` + tests). **LEGACY_USUNAC.**
79. `ui/sld/v3/canvas/overlay.ts:311-389` (SWZ mapper; drops `fault_loop_min_scenario`, `missing_data`, `reason_pl`) + `theme/colorTokens.ts:311-320`. **ENUM_WEWNETRZNY.**
80. `SldCanvasV3.tsx:2030-2105,2127-2140` + `colorTokens.ts:341-375` (`resultSeverityColor`) result labels coloured by severity + "⚠" glyph; +W with units, provenance in aggregate popover; −K −L −M −N −D on label; "dlaczego?" only via element result panel. **MIGRACJA.**

### types / engine
81. `types/enm.ts:1210-1219` `BayVerificationResult` 8 bare `*_ok` booleans (only `whole_power_path_ok` rendered, row 46). **ENUM_WEWNETRZNY** (contract needs backend enrichment).
82. `types/enm.ts:1518-1530,1578-1581`, `ui/types.ts:436` OK/WARN/FAIL validation/readiness statuses. **ENUM_WEWNETRZNY.** (`engine/sld-layout/**` — no verdict mapping.)

### Tests pinning laconic verdicts
Live: `ui/protection-coordination/__tests__/TccInterpretationPanel.test.tsx:44-49` ("Brak konfliktów" for empty list); `ResultsTables.test.tsx:148-156`; `ProtectionCoordinationPage.test.tsx:373`; `ui/workspace/__tests__/ModelGapsSurface.test.tsx:66`; `routerPureHelpers.test.ts:14`; `ui/comparison/__tests__/comparison.test.ts:28-34`; `ui/enm-inspector/__tests__/referencePanel.test.tsx:140`; `ui/sld/v3/canvas/__tests__/swzBadge.test.tsx:76,87`; `ui/sld/v3/lv-domain/__tests__/LvDomainView.test.tsx:63`; `ui/network-build/station-der/__tests__/DoborPrzekladnikowSekcja.test.tsx:185`. Dead: `getVoltageVerdict.test.ts`, `shortCircuitVerdict.test.ts`, `InspectorPanel.test.tsx:81,116`, `ReferencePatternsPage.test.tsx:72,85-86`, `DerComplianceBadge.test.tsx:69-71`, `badges.test.tsx:15,31`, `equipmentProofValidator.test.ts`, `voltageDropValidator.test.ts`, `antiIslandingValidator.test.ts`, `cableLoadingOverlay.test.ts`.

### Cross-cutting (live paths)
- Verdicts/criteria decided in UI: TCC aggregation (#9); hosting-capacity ratios (#34); comparison heuristic (#58); DER device fit (#49); reference-score thresholds (#61); coordination thresholds from UI `DEFAULT_CONFIG` (#4, #12).
- Fail-open "OK" defaults: #19 (unknown severity), #49 (unknown capacity), #71 (missing comms data), #9/#10 (no selectivity checks); dead #14 ("no data" → PASS).
- Evidence available but not rendered: NC RfG `evidence_by_test`/`metrics` (#31); withstand `utilization_*_percent` (#43); SWZ `margines` (#75, #77); audit2 `details`/`formulas_latex` (#35).

### Totals
MIGRACJA 34 (1, 3–12, 31–38, 41–43, 46, 48, 49, 58, 61, 62, 71, 72, 75–77, 80) · ENUM_WEWNETRZNY 19 (13, 17, 19, 20, 26, 28, 39, 45, 54–57, 60, 63, 65, 69, 79, 81, 82) · LEGACY_USUNAC 29 (2, 14–16, 18, 21–25, 27, 29, 30, 40, 44, 47, 50–53, 59, 64, 66–68, 70, 73, 74, 78). Razem 82.

---
