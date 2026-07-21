# INWENTARZ FUNKCJI OBLICZENIOWYCH I POWIERZCHNI UI — 2026-07

**Status:** WIĄŻĄCY dla Programu UI/UX 2026-07 (podrzędny wobec kanonu V12.xx)
**Data inwentaryzacji:** 2026-07-15 (żywy klon, gałąź `claude/power-network-design-ui-ir91mv`, HEAD `95d0576`)
**Rewizja:** 2026-07-20 (Audyt F) — synchronizacja z rzeczywistą powierzchnią kodu na HEAD `b30249d`; delty w §8.
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
| S19 | Regulacja OLTC w rozpływie | Rozpływ z zaczepami transformatora + studia zaczepów | `power_flow_oltc.py`, `power_flow_oltc_studies.py` (wpięte przez `enm/canonical_analysis.py`, `analysis/reporting/oltc_report.py`) |
| S20 | Spadek napięcia na kablu (preview) | Preview spadku napięcia kabla | `cable_voltage_drop.py` (endpoint `/api/solver/cable-voltage-drop-preview`, `/api/solver/cable-rated-current-preview`) |
| S21 | Prądy znamionowe transformatora (preview) | Preview prądów znamionowych | `transformer_rated_currents.py` (endpoint `/api/solver/transformer-rated-currents-preview`) |
| S22 | Kompensator równoległy (preview) | Preview doboru kompensatora bocznikowego | `shunt_compensator_preview.py` (endpoint `/api/solver/shunt-compensator-preview`) |

> Uzupełnienie 2026-07-20: solvery S19–S22 istnieją w `network_model/solvers/` i były pominięte
> w inwentaryzacji 2026-07-15. Pakiet `src/solvers/` (podpakiety `power_flow/`, `short_circuit/`)
> to obecnie puste stuby (`__init__.py` tylko) — fizyka pozostaje w `network_model/solvers/`.

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

Routery wpięte w `main.py` (38, stan HEAD `b30249d`): analysis_runs, audit2_catalogs, audit2_station_config,
catalog, comparison, diagnostics, equipment_proof_pack, health, ncrfg_ptpiree_tests,
power_flow_comparisons, power_flow_runs, reference_networks, project_archive, projects, proof_pack,
protection_comparisons, protection_analysis_runs, reference_patterns, sld, station_templates,
study_cases, xlsx_import, enm, execution_runs, unified_runs, v126_academic, result_contract_v1,
fault_loop, fault_scenarios, generators, grid_source_preview, sld_overrides, switchgear_config,
solver_capabilities, solver_input, **oze_analysis_runs**, **quality_analysis_runs**, **reference_engine**.

Nowe routery wpięte (dodane 2026-07-20, źródło: `api/main.py` include_router):
- **oze_analysis_runs** (`api/oze_analysis_runs.py`) — analizy OZE/DER: `/api/oze-analysis/lom-protection`,
  `/grid-strength`, `/reactive-adequacy`, `/hosting-capacity`, `/pq-area`, `/compensation-sizing`,
  `/frt-trajectories`, `/frt-sequence`, `/pq-coverage`, `/compliance-certificate(.docx/.pdf)`,
  `/osd-application(.docx/.pdf)`, `/osd-response`, `/connection-study(.docx/.pdf)`.
- **quality_analysis_runs** (`api/quality_analysis_runs.py`) — jakość/kontrola: `/api/quality/sanity-bounds`,
  `/energy-validation`, `/flicker`, `/as-built-compliance`, `/arc-flash`, `/arc-flash/report(.pdf/.docx)`.
- **reference_engine** (`api/reference_engine.py`) — Reference Engine: `/api/reference/packs`,
  `/api/reference/packs/{pack_id}`, `/api/cases/{case_id}/reference/compliance`.

Wpięcie pozostałych modułów `src/api/` — ZWERYFIKOWANE 2026-07-15 (U0.3, grep importów w żywym klonie):
- **Wpięte pośrednio** (importowane przez zamontowane routery): analysis_case_context,
  analysis_run_exports, canonical_run_views, domain_ops_policy, protection_runs
  (przez protection_analysis_runs), v125_contracts, cases (w main.py).
- **NIEWPIĘTE do aplikacji** (moduł istnieje, router niezamontowany w `main.py` ani pośrednio):
  analysis_runs_index, analysis_runs_read, archive_diff, batch_execution (ma testy),
  case_runs (ma testy), cloud_backup, design_synth, domain_operations (mutacje ENM idą przez
  router enm.py — moduł do decyzji: wpiąć albo zarchiwizować), incremental_archive,
  protection_coordination, protection_engine_v1, snapshots, topology_links.
  Decyzja wpiąć/zarchiwizować per moduł = karty epików E7/E10/E13/E15 (zero bytów równoległych).

## 5. Powierzchnia frontendu (stan zastany)

### 5a. `frontend/src/ui/` — powierzchnia klasyczna (56 katalogów, listing 2026-07-20)

analysis-eligibility, app-state, audit, canon, catalog, common, comparison, config, context-menu,
contracts, data-manager, engineering-readiness, enm-inspector, fault-scenarios, field, help,
history, icons, inspector, issue-panel, mode-gate, navigation, ncrfg-tests, network-build,
notifications, onboarding, power-distribution, power-flow-comparison, power-flow-results,
project-archive, projects, proof, property-grid, protection, protection-comparison,
protection-coordination, protection-curves, reference-networks, reference-patterns, reports,
results, results-inspector, schema-completeness, selection, settings, shared, shell, sld,
sld-editor, sld-overlay, status-bar, study-cases, tech-card, topology, voltage-profile, workspace
(+ pliki: index.ts, operatingMode.ts, types.ts, `__tests__`).

> Zmiana od 2026-07-15 (rewizja Audyt F): usunięto katalogi `active-case-bar`, `layout`,
> `sensitivity` (63 → 56). Funkcja wrażliwości (`sensitivity`) migruje do `ui2/` (patrz §5b).

### 5b. `frontend/src/ui2/` — nowa powierzchnia klasy przemysłowej (NOWE, dodane 2026-07-20)

Katalog `ui2/` był całkowicie pominięty w inwentaryzacji 2026-07-15. To docelowa powierzchnia
Programu UI/UX (clean-room). Struktura (listing 2026-07-20):
- Rdzeń: `AppRoot.tsx`, `shell/`, `nav/`, `theme/`, `search/`, `freshness/`, `events/`, `model/`,
  `adapters/`, `legacy/`, `referencje/` (Reference Engine), `inspector/` (panel właściwości + zakładki).
- **`spaces/`** (przestrzenie robocze): `projekt`, `model`, `obliczenia`, `wyniki`, `gotowosc`.
- **`kreatory/`** (kreatory elementów): `zrodlo`, `zrodlo-oze`, `transformator`, `pole`, `lacznik`,
  `odbior`, `kompensator`, `magistrala`, `pierscien`, `rama`.
- **`wyniki/`** (ekrany wyników): `zwarcia`, `rozplyw`, `analizy`, `jakosc`, `koordynacja`, `dowod`,
  `porownanie`, `kontrakt-analizy`, `odbior`, `oltc`, `wzorzec`.
- **`oze/`** (analizy OZE/DER): `pulpit` (m.in. `SekcjaSilySieci.tsx`, `SekcjaAdekwatnosciQ.tsx`),
  `frt`, `krzywe`, `lom`, `macierz`, `obszar`, `osd`, `wniosek`, `studium`, `kompensacja`,
  `ranking`, `zdolnosc`, `ncRfgStore.ts`, `api.ts`.

Poza `ui/`/`ui2/`: `designer/` (kreator), `engine/sld-layout/` (silnik layoutu), `modules/`,
harnessy renderu (`screenshot-harness-main.tsx` i pokrewne).

> UWAGA: struktura opisana w `CLAUDE.md` (sekcja Project Structure) jest snapshotem historycznym
> i częściowo rozjechana z powyższym listingiem. Dla powierzchni UI wiążący jest TEN inwentarz.
> `ui2/` jest objęty guardem `scripts/ui_no_physics_guard.py` (zero fizyki w warstwie prezentacji).

## 6. MACIERZ POKRYCIA: funkcja obliczeniowa → API → UI

Status: ✅ pełne pokrycie UI · ◐ częściowe (wymaga przeprojektowania/dokończenia) · ❌ BRAK powierzchni UI (luka).
Dowód dla ❌/◐: `grep -ril <termin> frontend/src` z 2026-07-15.

| Funkcja | Solver/Analiza | API | UI (stan zastany) | Status |
|---|---|---|---|---|
| Zwarcia IEC 60909 | S1 | fault_scenarios, execution_runs, unified_runs | results, results-inspector, sld-overlay, proof | ✅ |
| Zwarcia maszyn | S2 + A7 | ✅ analysis_run/service.py + proof engine (zweryfikowane U0.3) | rozbicie maszynowe (μ/q/i_b) w pakiecie dowodowym SC3F (G-SCM F2, `backend/src/api/proof_pack.py`) renderowanym przez proof-inspector; brak DEDYKOWANEGO modułu `machine_sc` | ◐ (widoczne przez ProofPack SC3F; dedykowany ekran = opcjonalny) |
| Rozpływ NR/GS/FD | S3–S5 | power_flow_runs, power_flow_comparisons | power-flow-results, power-flow-comparison, power-distribution | ✅ |
| Rozpływ niesymetryczny | S6 | ◐ solver poza rejestrem zdolności (PF = tylko NR/GS/FD); wzmianka w reference_networks | częściowe (`unbalanced`: 6 plików) | ◐ |
| Falowniki OZE w LF | S7 | generators, grid_source_preview | designer/wizard, ncrfg-tests | ◐ |
| Obciążenia ZIP | S8 | solver_input | property-grid (parametry) | ◐ |
| Pętla zwarciowa nn IEC 60364 | S9 | fault_loop | szczątkowe (`faultLoop`: 2 pliki) | ◐ |
| Zabezpieczenia IEC 60255 | S10 + A10, A11 | protection_* (5 routerów) | protection, protection-coordination, protection-curves, protection-comparison | ✅ |
| NC RfG / PTPiREE | S11 | ncrfg_ptpiree_tests | ncrfg-tests | ✅ |
| FRT / HVRT | S12 | ncrfg_ptpiree_tests | pokryte (`frt`: 62, `hvrt`: 52 pliki) | ✅ |
| Stabilność RMS | S13 | ✅ v126 (dynamic_stability, voltage_stability) + solver_capabilities | częściowe (`stability`: 20 plików, gł. FRT/NC RfG) | ◐ |
| Estymacja stanu WLS | S14 | ✅ `POST /api/quality/state-estimation` (+ `/requirements`) — quality_analysis_runs.py | ✅ `ui2/wyniki/estymacja` (EkranEstymacji: wejście pomiarów → \|V\|/kąt/rezydua/χ²/LNR + WHITE BOX), zakładka „Estymacja stanu" w WynikiWarsztat | ✅ (backend + UI, 2026-07-21) |
| Stan fazowy SN | S15 | ✅ analysis_runs + execution_runs | częściowe (`phase_state`: 9 plików) | ◐ |
| Podgląd źródła sieciowego | S16 | grid_source_preview | wizard (GridSourceEditor) | ✅ |
| Pakiet akademicki V12.6 | S17 | v126_academic | ekrany E-40..E-50 (workspace) | ✅ |
| Arc flash | A1 | ✅ `/api/quality/arc-flash` (+ `/report.pdf/.docx`) — quality_analysis_runs.py | ui2/wyniki/jakosc (`arcFlash`: 5 plików w ui2) | ◐ (wpięte 2026-07, do potwierdzenia jakościowego) |
| Siła sieci (SCR) | A5 | ✅ `/api/oze-analysis/grid-strength` — oze_analysis_runs.py | ui2/oze/pulpit/SekcjaSilySieci.tsx | ◐ (wpięte 2026-07) |
| Adekwatność mocy biernej | A12 | ✅ `/api/oze-analysis/reactive-adequacy` — oze_analysis_runs.py | ui2/oze/pulpit/SekcjaAdekwatnosciQ.tsx | ◐ (wpięte 2026-07) |
| Stabilność SSCI | A18 | ✅ `GET /api/analysis-runs/{run_id}/results/v126/ssci_impedance/stability` — v126_academic.py (werdykt Nyquista z `analysis/ssci_stability` na bazie przebiegu v126 ssci_impedance) | brak (`ssci`: 0 plików w ui/) | ◐ (backend wpięty 2026-07-21; UI = następna faza) |
| Sanity bounds | A15 | ✅ `/api/quality/sanity-bounds` — quality_analysis_runs.py (+ pośrednio SC→ResultSet v1) | ui2/wyniki/jakosc (`sanity`: 4 pliki w ui2) | ◐ (wpięte 2026-07) |
| Walidacja energetyczna | A4 | ✅ `/api/quality/energy-validation` — quality_analysis_runs.py | ui2/wyniki/jakosc (`energy-validation` w ui2) | ◐ (wpięte 2026-07) |
| Profil napięciowy | A19 | analysis_runs | voltage-profile | ✅ |
| Wrażliwość (LF + ogólna) | A6, A17 | analysis_runs | dedykowany `ui/sensitivity` USUNIĘTY 2026-07; ekspozycja przez ui/workspace/screenCanonRegistry | ◐ (do przeniesienia w ui2/) |
| Zgodność normatywna | A8 | analysis_runs | engineering-readiness, issue-panel | ◐ |
| Porównania scenariuszy | A16 | comparison, *_comparisons | comparison, power-flow-comparison, protection-comparison | ◐ (duplikacja do konsolidacji) |
| Rekomendacje | A13 | analysis_runs | results (rozproszone) | ◐ |
| Pokrycie analizami | A3 | analysis_runs | analysis-eligibility | ◐ |
| Granice (boundary) | A2 | ✅ application/analyses/boundary.py | brak dedykowanego widoku | ◐ |
| Raporty PDF/DOCX | A14 | analysis_run_exports, proof_pack | reports, proof | ◐ |
| Dowody WHITE BOX (wszystkie pakiety §3) | Proof Engine | proof_pack, equipment_proof_pack, result_contract_v1 | proof, results-inspector | ✅ |
| Migotanie (flicker) | `application/analyses/migotanie.py` | ✅ `/api/quality/flicker` | ui2/oze (`migotanie`: 9 plików) | ◐ (nowe 2026-07) |
| Zdolność przyłączeniowa (hosting capacity) | `application/analyses/hosting_capacity.py` | ✅ `/api/oze-analysis/hosting-capacity` | ui2/oze/zdolnosc | ◐ (nowe 2026-07) |
| Obszar/pokrycie P-Q | `application/analyses/pq_area.py`, `pq_coverage.py` | ✅ `/api/oze-analysis/pq-area`, `/pq-coverage` | ui2/oze/obszar, ui2/oze/macierz | ◐ (nowe 2026-07) |
| Dobór kompensacji mocy biernej | `application/analyses/dobor_kompensacji.py` | ✅ `/api/oze-analysis/compensation-sizing` | ui2/oze/kompensacja, ui2/kreatory/kompensator | ◐ (nowe 2026-07) |
| Ochrona przed utratą sieci (LoM) | `application/analyses/ochrona_lom.py` | ✅ `/api/oze-analysis/lom-protection` | ui2/oze/lom | ◐ (nowe 2026-07) |
| Dokumenty przyłączeniowe OSD | `application/analyses/{wniosek_osd,odpowiedz_osd,dokument_studium,certyfikat_zgodnosci,zgodnosc_powykonawcza}.py` | ✅ `/api/oze-analysis/{osd-application,osd-response,connection-study,compliance-certificate}`, `/api/quality/as-built-compliance` (warianty .docx/.pdf) | ui2/oze/{osd,wniosek,studium} | ◐ (nowe 2026-07) |
| Regulacja OLTC w rozpływie | S19 | ✅ pośrednio (enm/canonical_analysis + analysis/reporting/oltc_report) | ui2/wyniki/oltc | ◐ (nowe 2026-07) |
| Preview kabla/transformatora/kompensatora | S20–S22 | ✅ `/api/solver/{cable-voltage-drop,cable-rated-current,transformer-rated-currents,shunt-compensator}-preview` | ui2/kreatory (transformator, kompensator, magistrala) | ◐ (nowe 2026-07) |
| Reference Engine (paczki referencyjne) | — | ✅ reference_engine: `/api/reference/packs`, `/api/cases/{id}/reference/compliance` | ui2/referencje, ui/reference-networks, ui/reference-patterns | ◐ (nowe 2026-07) |
| Import XLSX | — | ✅ xlsx_import (wpięty w main.py) | częściowe (`xlsx`: 11 plików) | ◐ |
| Archiwum projektu (ZIP) | — | project_archive, archive_diff, incremental_archive | project-archive | ✅ |
| Katalog typów | — | catalog, audit2_catalogs | catalog, tech-card, property-grid | ✅ |
| Kreator sieci/stacji | — | station_templates, switchgear_config, design_synth, reference_patterns | designer, network-build, reference-patterns | ◐ |
| Przypadki obliczeniowe | — | study_cases, case_runs, batch_execution | study-cases (dawny `ui/active-case-bar` USUNIĘTY 2026-07) | ◐ |
| SLD + nakładki wyników | — | sld, sld_overrides | sld, sld-editor, sld-overlay | ◐ (OSOBNY WĄTEK — patrz Program §2.3) |

**Bilans (rewizja 2026-07-21c):** 0 funkcji ❌ zero-UI. Ostatnia luka — **Stabilność SSCI**
(`analysis/ssci_stability`) — domknięta backendowo (`GET /api/analysis-runs/{run_id}/results/v126/ssci_impedance/stability`
wystawia werdykt Nyquista z gotowego przebiegu v126 ssci_impedance); UI = następna faza (◐).
Estymacja stanu WLS (S14) wyszła z ❌ dzięki wpięciu backendu
(`POST /api/quality/state-estimation` + `/requirements`); UI = następna faza (◐). Zwarcia maszyn
(S2+A7) skorygowane ❌→◐: rozbicie maszynowe (μ/q/i_b) widoczne przez pakiet dowodowy SC3F
(G-SCM F2, `proof_pack.py`) w proof-inspectorze — dedykowany ekran opcjonalny, nie zero-UI.
Względem 2026-07-15 pięć zdolności (Arc flash, Siła sieci,
Adekwatność mocy biernej, Sanity bounds, Walidacja energetyczna) wyszło z ❌ dzięki wpięciu
routerów `oze_analysis_runs` i `quality_analysis_runs` oraz powierzchni `ui2/`. Dodano też do
macierzy zdolności wcześniej pominięte (migotanie, hosting capacity, P-Q, dobór kompensacji,
LoM, dokumenty OSD, OLTC, preview kabla/transformatora/kompensatora, Reference Engine).
Wszystkie ❌ i ◐ mają obowiązkowe karty zadań w Programie UI/UX.

---

## 7. Reguła aktualizacji

Inwentarz aktualizuje wyłącznie zarządca programu (Fable) po zakończeniu fazy lub po zmianie
powierzchni obliczeniowej backendu. Każda aktualizacja = nowa data + dowody (listing/grep).

---

## 8. Rewizja 2026-07-20 (Audyt F)

Synchronizacja inwentarza z rzeczywistą powierzchnią kodu na HEAD `b30249d` (gałąź
`claude/power-network-design-ui-ir91mv`). Metoda: listing katalogów + grep importów/dekoratorów
`@router` w żywym repo. Każda delta ma odwołanie `plik:symbol`/`plik:endpoint`.

### 8.1 Dodane — solvery (§1)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| S19 Regulacja OLTC w rozpływie | `network_model/solvers/power_flow_oltc.py`, `power_flow_oltc_studies.py`; użycie w `enm/canonical_analysis.py`, `analysis/reporting/oltc_report.py` | Solver istniał, brak w inwentarzu 2026-07-15 |
| S20 Spadek napięcia na kablu (preview) | `network_model/solvers/cable_voltage_drop.py`; endpoint `api/grid_source_preview.py:/api/solver/cable-voltage-drop-preview` | Solver preview pominięty |
| S21 Prądy znamionowe transformatora (preview) | `network_model/solvers/transformer_rated_currents.py`; endpoint `/api/solver/transformer-rated-currents-preview` | Solver preview pominięty |
| S22 Kompensator równoległy (preview) | `network_model/solvers/shunt_compensator_preview.py`; endpoint `/api/solver/shunt-compensator-preview` | Solver preview pominięty |

### 8.2 Dodane — API (§4)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| Router `oze_analysis_runs` wpięty | `api/main.py:oze_analysis_runs_router`; `api/oze_analysis_runs.py` (13 endpointów `/api/oze-analysis/*`) | Nowy router — ujawnia analizy OZE/DER (m.in. grid-strength, reactive-adequacy, hosting-capacity, LoM, P-Q, dokumenty OSD) |
| Router `quality_analysis_runs` wpięty | `api/main.py:quality_analysis_runs_router`; `api/quality_analysis_runs.py` (endpointy `/api/quality/*`) | Nowy router — ujawnia arc-flash, sanity-bounds, energy-validation, flicker, as-built-compliance |
| Router `reference_engine` wpięty | `api/main.py:reference_engine_router`; `api/reference_engine.py:/api/reference/packs` | Nowy router — Reference Engine paczek referencyjnych |
| Zmiana liczby wpiętych routerów 35 → 38 | `api/main.py` include_router | Trzy nowe routery powyżej |

### 8.3 Dodane — frontend (§5)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| Cała powierzchnia `ui2/` (spaces, kreatory, wyniki, oze, inspector, shell, nav…) | `frontend/src/ui2/` (listing) | Katalog całkowicie pominięty w inwentarzu 2026-07-15; to docelowa powierzchnia Programu UI/UX |

### 8.4 Poprawione — macierz pokrycia (§6)

| Delta | Dowód | Uzasadnienie |
|---|---|---|
| Arc flash: ❌ API+UI → ◐ | `api/quality_analysis_runs.py:/api/quality/arc-flash`; `ui2/wyniki/jakosc/` | Zdolność wpięta (API+UI2) |
| Siła sieci (SCR): ❌ API+UI → ◐ | `api/oze_analysis_runs.py:/api/oze-analysis/grid-strength`; `ui2/oze/pulpit/SekcjaSilySieci.tsx` | Zdolność wpięta |
| Adekwatność mocy biernej: ❌ API+UI → ◐ | `api/oze_analysis_runs.py:/api/oze-analysis/reactive-adequacy`; `ui2/oze/pulpit/SekcjaAdekwatnosciQ.tsx` | Zdolność wpięta |
| Sanity bounds: ❌ UI → ◐ | `api/quality_analysis_runs.py:/api/quality/sanity-bounds`; `ui2/wyniki/jakosc/` | Zdolność wpięta |
| Walidacja energetyczna: ❌ UI → ◐ | `api/quality_analysis_runs.py:/api/quality/energy-validation`; `ui2/wyniki/jakosc/` | Zdolność wpięta |
| Nowe wiersze macierzy: migotanie, hosting capacity, P-Q, dobór kompensacji, LoM, dokumenty OSD, OLTC, preview kabla/transformatora/kompensatora, Reference Engine | endpointy `oze_analysis_runs.py`/`quality_analysis_runs.py`/`grid_source_preview.py`/`reference_engine.py`; `application/analyses/*.py` | Zdolności obecne w backendzie i `ui2/`, brak w macierzy 2026-07-15 |
| Wrażliwość: UI `sensitivity` skorygowane | `ui/sensitivity` usunięty; `ui/workspace/screenCanonRegistry.ts` | Katalog usunięty, ekspozycja przez rejestr ekranów |
| Przypadki obliczeniowe: UI `active-case-bar` skorygowane | `ui/active-case-bar` usunięty | Katalog usunięty |

### 8.5 Bez zmian (potwierdzone jako nadal aktualne)

- Lista modułów NIEWPIĘTYCH z §4 (analysis_runs_index, analysis_runs_read, archive_diff,
  batch_execution, case_runs, cloud_backup, design_synth, domain_operations, incremental_archive,
  protection_coordination, protection_engine_v1, snapshots, topology_links) — żaden nie jest
  zamontowany w `api/main.py` na HEAD `b30249d`.
- ❌ pozostające (rewizja 2026-07-21c): BRAK — zero funkcji ❌ zero-UI. Zwarcia maszyn skorygowane
  ❌→◐ (widoczne przez ProofPack SC3F, G-SCM F2 — patrz macierz §6).
- ◐ Stabilność SSCI: backend wpięty 2026-07-21 (`api/v126_academic.py` +
  `application/analyses/ssci_stability` na bazie `analysis/ssci_stability`); werdykt Nyquista
  (Sun 2011 / Wen 2016) z gotowego przebiegu v126 ssci_impedance; UI (ekran werdyktu/metryk/flag) = następna faza.
- ◐ Estymacja stanu WLS: backend wpięty 2026-07-21 (`quality_analysis_runs.py` +
  `application/analyses/state_estimation`); UI (ekran wyników |V|/kąt/χ²) = następna faza.
