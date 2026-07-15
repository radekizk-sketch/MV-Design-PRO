# INWENTARZ FUNKCJI OBLICZENIOWYCH I POWIERZCHNI UI — 2026-07

**Status:** WIĄŻĄCY dla Programu UI/UX 2026-07 (podrzędny wobec kanonu V12.xx)
**Data inwentaryzacji:** 2026-07-15 (żywy klon, gałąź `claude/power-network-design-ui-ir91mv`, HEAD `95d0576`)
**Metoda:** listing katalogów + grep w żywym repo (bez zgadywania). Każdy wpis ma źródło w postaci ścieżki.
**Cel:** gwarancja „ŻADNA funkcja obliczeniowa nie zostaje pominięta" w przebudowie UI/UX.
**Reguła nadrzędna:** każda pozycja z §1–§3 MUSI mieć przypisaną powierzchnię UI w §6 (macierz pokrycia).
Pozycja bez powierzchni UI = luka do zaprojektowania w Programie UI/UX, nie do zignorowania.

---

## 1. Solvery (fizyka; `backend/src/network_model/solvers/`)

| # | Moduł | Funkcja | Plik(i) |
|---|---|---|---|
| S1 | Zwarcia IEC 60909 | Prądy zwarciowe I''k, ip, Ith, wkłady źródeł | `short_circuit_iec60909.py`, `short_circuit_core.py`, `short_circuit_contributions.py` |
| S2 | Zwarcia maszyn IEC 60909 | Wkłady silników/generatorów | `machine_sc_iec60909.py` |
| S3 | Rozpływ mocy Newton–Raphson | Load flow NR (+ wariant wewnętrzny) | `power_flow_newton.py`, `power_flow_newton_internal.py` |
| S4 | Rozpływ mocy Gauss–Seidel | Load flow GS | `power_flow_gauss_seidel.py` |
| S5 | Rozpływ mocy Fast Decoupled | Load flow FD | `power_flow_fast_decoupled.py` |
| S6 | Rozpływ niesymetryczny | Load flow dla stanów niesymetrycznych | `power_flow_unbalanced.py` |
| S7 | Modele falowników w rozpływie | Źródła OZE (inwertery) w LF | `power_flow_inverter.py` |
| S8 | Modele obciążeń ZIP | Obciążenia napięciowo-zależne | `power_flow_zip.py` |
| S9 | Pętla zwarciowa IEC 60364 (nn) | Impedancja pętli, warunek samoczynnego wyłączenia | `fault_loop_iec60364.py`, `fault_loop_builder.py` |
| S10 | Charakterystyki zabezpieczeń IEC 60255 | Krzywe czasowo-prądowe przekaźników | `protection_iec60255.py` |
| S11 | Testy NC RfG / PTPiREE | Zgodność przyłączeniowa modułów wytwarzania | `ncrfg_ptpiree/` (pakiet) |
| S12 | FRT / HVRT | Przejazd przez zapady/wzrosty napięcia | `frt_hvrt/` (pakiet) |
| S13 | Stabilność RMS | Symulacje stabilności RMS | `stability_rms/` (pakiet) |
| S14 | Estymacja stanu WLS | Weighted Least Squares + benchmark syntetyczny | `state_estimation_wls.py`, `state_estimation_synthetic_benchmark.py` |
| S15 | Stan fazowy SN | Analiza stanu fazowego sieci SN | `phase_state_sn.py` |
| S16 | Podgląd źródła sieciowego | Parametry zwarciowe źródła zasilania (preview) | `grid_source_preview.py` |
| S17 | Pakiet akademicki V12.6 | Ekrany E-40..E-50 (analizy akademicko-przemysłowe) | `v126_academic.py` |
| S18 | Infrastruktura WHITE BOX rozpływu | Trace, typy, wynik (FROZEN) | `power_flow_trace.py`, `power_flow_result.py`, `power_flow_types.py` |

## 2. Analizy (interpretacja, bez fizyki; `backend/src/analysis/`)

| # | Moduł | Funkcja |
|---|---|---|
| A1 | `arc_flash` | Analiza łuku elektrycznego (arc flash) |
| A2 | `boundary` | Identyfikacja granic (BoundaryIdentifier — TYLKO tu, nie w modelu) |
| A3 | `coverage_score` | Ocena pokrycia analizami |
| A4 | `energy_validation` | Walidacja energetyczna |
| A5 | `grid_strength` | Siła sieci (SCR/miary sztywności) |
| A6 | `lf_sensitivity` | Wrażliwość rozpływu mocy |
| A7 | `machine_short_circuit` | Interpretacja zwarć maszynowych |
| A8 | `normative` | Zgodność normatywna |
| A9 | `power_flow` + `power_flow_interpretation` | Interpretacja wyników rozpływu |
| A10 | `protection_curves_it` | Krzywe I–t zabezpieczeń |
| A11 | `protection_insight` | Wnioski / diagnostyka zabezpieczeń |
| A12 | `reactive_adequacy` | Adekwatność mocy biernej |
| A13 | `recommendations` | Rekomendacje |
| A14 | `reporting` | Generacja raportów (PDF/DOCX) |
| A15 | `sanity_bounds` | Kontrola granic wiarygodności wyników |
| A16 | `scenario_comparison` | Porównania scenariuszy |
| A17 | `sensitivity` | Analiza wrażliwości |
| A18 | `ssci_stability` | Stabilność SSCI (interakcje podsynchroniczne, OZE) |
| A19 | `voltage_profile` | Profil napięciowy |

## 3. Proof Engine (WHITE BOX — dowody obliczeń)

Pakiety dowodowe (źródło: `backend/tests/proof_engine/`, `docs/proof_engine/`):
SC3F (zwarcie 3-fazowe, z obowiązkowymi I_dyn oraz I_th), VDROP (spadek napięcia), Equipment
(wytrzymałość cieplna/dynamiczna), Power Flow, Losses/Energy (straty), Protection (nadprądowe),
Earthing (ziemnozwarciowe), LF Voltage, pakiet akademicki V12.6.
Eksport: `proof.json`, `proof.tex`, `proof.pdf`, DOCX. Matematyka wyłącznie w LaTeX `$$...$$`.

## 4. Powierzchnia API (`backend/src/api/`, 62 moduły)

Routery wpięte w `main.py` (35, stan HEAD): analysis_runs, audit2_catalogs, audit2_station_config,
catalog, comparison, diagnostics, equipment_proof_pack, health, ncrfg_ptpiree_tests,
power_flow_comparisons, power_flow_runs, reference_networks, project_archive, projects, proof_pack,
protection_comparisons, protection_analysis_runs, reference_patterns, sld, station_templates,
study_cases, xlsx_import, enm, execution_runs, unified_runs, v126_academic, result_contract_v1,
fault_loop, fault_scenarios, generators, grid_source_preview, sld_overrides, switchgear_config,
solver_capabilities, solver_input.

Moduły obecne w `src/api/`, których wpięcie wymaga weryfikacji per moduł (zadanie U0.3 Programu —
mogą być wpinane pośrednio, np. przez router ENM): analysis_case_context, analysis_run_exports,
analysis_runs_index, analysis_runs_read, archive_diff, batch_execution, canonical_run_views,
case_runs, cases, cloud_backup, design_synth, domain_operations, domain_ops_policy,
incremental_archive, power_flow (porównania/przebiegi j.w.), protection_coordination,
protection_engine_v1, protection_runs, snapshots, topology_links, v125_contracts.

## 5. Powierzchnia frontendu (stan zastany)

`frontend/src/ui/` (63 pozycje, listing 2026-07-15): active-case-bar, analysis-eligibility,
app-state, audit, canon, catalog, common, comparison, config, context-menu, contracts,
data-manager, engineering-readiness, enm-inspector, fault-scenarios, field, help, history, icons,
inspector, issue-panel, layout, mode-gate, navigation, ncrfg-tests, network-build, notifications,
onboarding, power-distribution, power-flow-comparison, power-flow-results, project-archive,
projects, proof, property-grid, protection, protection-comparison, protection-coordination,
protection-curves, reference-networks, reference-patterns, reports, results, results-inspector,
schema-completeness, selection, sensitivity, settings, shared, shell, sld, sld-editor, sld-overlay,
status-bar, study-cases, tech-card, topology, voltage-profile, workspace (+ pliki: index.ts,
operatingMode.ts, types.ts, `__tests__`).

Poza `ui/`: `designer/` (kreator), `engine/sld-layout/` (silnik layoutu), `modules/`,
harnessy renderu (`screenshot-harness-main.tsx` i pokrewne).

> UWAGA: struktura opisana w `CLAUDE.md` (sekcja Project Structure) jest snapshotem historycznym
> i częściowo rozjechana z powyższym listingiem. Dla powierzchni UI wiążący jest TEN inwentarz.

## 6. MACIERZ POKRYCIA: funkcja obliczeniowa → API → UI

Status: ✅ pełne pokrycie UI · ◐ częściowe (wymaga przeprojektowania/dokończenia) · ❌ BRAK powierzchni UI (luka).
Dowód dla ❌/◐: `grep -ril <termin> frontend/src` z 2026-07-15.

| Funkcja | Solver/Analiza | API | UI (stan zastany) | Status |
|---|---|---|---|---|
| Zwarcia IEC 60909 | S1 | fault_scenarios, execution_runs, unified_runs | results, results-inspector, sld-overlay, proof | ✅ |
| Zwarcia maszyn | S2 + A7 | do weryfikacji (U0.3) | brak (`machine_sc`: 0 plików) | ❌ |
| Rozpływ NR/GS/FD | S3–S5 | power_flow_runs, power_flow_comparisons | power-flow-results, power-flow-comparison, power-distribution | ✅ |
| Rozpływ niesymetryczny | S6 | do weryfikacji (U0.3) | częściowe (`unbalanced`: 6 plików) | ◐ |
| Falowniki OZE w LF | S7 | generators, grid_source_preview | designer/wizard, ncrfg-tests | ◐ |
| Obciążenia ZIP | S8 | solver_input | property-grid (parametry) | ◐ |
| Pętla zwarciowa nn IEC 60364 | S9 | fault_loop | szczątkowe (`faultLoop`: 2 pliki) | ◐ |
| Zabezpieczenia IEC 60255 | S10 + A10, A11 | protection_* (5 routerów) | protection, protection-coordination, protection-curves, protection-comparison | ✅ |
| NC RfG / PTPiREE | S11 | ncrfg_ptpiree_tests | ncrfg-tests | ✅ |
| FRT / HVRT | S12 | ncrfg_ptpiree_tests | pokryte (`frt`: 62, `hvrt`: 52 pliki) | ✅ |
| Stabilność RMS | S13 | do weryfikacji (U0.3) | częściowe (`stability`: 20 plików — zweryfikować czy to RMS) | ◐ |
| Estymacja stanu WLS | S14 | do weryfikacji (U0.3) | brak (`state_estimation`: 0 plików) | ❌ |
| Stan fazowy SN | S15 | do weryfikacji (U0.3) | do weryfikacji | ◐ |
| Podgląd źródła sieciowego | S16 | grid_source_preview | wizard (GridSourceEditor) | ✅ |
| Pakiet akademicki V12.6 | S17 | v126_academic | ekrany E-40..E-50 (workspace) | ✅ |
| Arc flash | A1 | do weryfikacji (U0.3) | brak (`arc_flash`: 0 plików) | ❌ |
| Siła sieci (SCR) | A5 | do weryfikacji (U0.3) | brak (`grid_strength`: 0 plików) | ❌ |
| Adekwatność mocy biernej | A12 | do weryfikacji (U0.3) | brak (`reactive_adequacy`: 0 plików) | ❌ |
| Stabilność SSCI | A18 | do weryfikacji (U0.3) | brak (`ssci`: 0 plików) | ❌ |
| Sanity bounds | A15 | do weryfikacji (U0.3) | brak (`sanity_bounds`: 0 plików) | ❌ |
| Walidacja energetyczna | A4 | do weryfikacji (U0.3) | brak (`energy_validation`: 0 plików) | ❌ |
| Profil napięciowy | A19 | analysis_runs | voltage-profile | ✅ |
| Wrażliwość (LF + ogólna) | A6, A17 | analysis_runs | sensitivity | ✅ |
| Zgodność normatywna | A8 | analysis_runs | engineering-readiness, issue-panel | ◐ |
| Porównania scenariuszy | A16 | comparison, *_comparisons | comparison, power-flow-comparison, protection-comparison | ◐ (duplikacja do konsolidacji) |
| Rekomendacje | A13 | analysis_runs | results (rozproszone) | ◐ |
| Pokrycie analizami | A3 | analysis_runs | analysis-eligibility | ◐ |
| Granice (boundary) | A2 | analysis_runs | do weryfikacji | ◐ |
| Raporty PDF/DOCX | A14 | analysis_run_exports, proof_pack | reports, proof | ◐ |
| Dowody WHITE BOX (wszystkie pakiety §3) | Proof Engine | proof_pack, equipment_proof_pack, result_contract_v1 | proof, results-inspector | ✅ |
| Import XLSX | — | xlsx_import | do weryfikacji | ◐ |
| Archiwum projektu (ZIP) | — | project_archive, archive_diff, incremental_archive | project-archive | ✅ |
| Katalog typów | — | catalog, audit2_catalogs | catalog, tech-card, property-grid | ✅ |
| Kreator sieci/stacji | — | station_templates, switchgear_config, design_synth, reference_patterns | designer, network-build, reference-patterns | ◐ |
| Przypadki obliczeniowe | — | study_cases, case_runs, batch_execution | study-cases, active-case-bar | ◐ |
| SLD + nakładki wyników | — | sld, sld_overrides | sld, sld-editor, sld-overlay | ◐ (OSOBNY WĄTEK — patrz Program §2.3) |

**Bilans:** 8 funkcji ❌ (zero UI), ~17 ◐ (częściowe/do przeprojektowania), reszta ✅ (do podniesienia
jakościowego w ramach epików). Wszystkie ❌ i ◐ mają obowiązkowe karty zadań w Programie UI/UX.

---

## 7. Reguła aktualizacji

Inwentarz aktualizuje wyłącznie zarządca programu (Fable) po zakończeniu fazy lub po zmianie
powierzchni obliczeniowej backendu. Każda aktualizacja = nowa data + dowody (listing/grep).
