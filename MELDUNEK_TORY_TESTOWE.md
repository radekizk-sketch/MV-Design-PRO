# Meldunek — karta TORY-TYLKO-W-TESTACH (2026-09-30)

Baza: `615f3b24` (gałąź `claude/mv-design-pro-twin-audit-u4lhy0-wip-partia-6-p6d`).
Commit z kodem: `acdb504b`. Ten plik jest w osobnym commicie, który integrator pomija.

## 1. Wynik i dowody

W produkcie każde z obliczeń tej klasy ma teraz jedną ścieżkę: bieg kanoniczny. Ścieżki
obliczeń bez konsumenta w produkcie zostały skasowane. Każdą chroni bramka wskrzeszenia.
Warstwa `backend/src/analysis/**` sprowadza z `network_model.solvers*` wyłącznie nazwy
z zamkniętej listy typów wyników i kontraktów. Pilnuje tego `arch_guard`, a iniekcja
importu lub wywołania solvera daje RC=1.

Dowody (kody wyjścia łapane bezpośrednio):

| Bramka | Wynik |
|---|---|
| Pełna regresja backendu `pytest -m "not pandapower and not andes"` | **26 981 passed, 10 failed, 6 errors**, rc=1. Wszystkie 16 czerwonych **identyczne na bazie `615f3b24`** (sprawdzone w osobnym drzewie roboczym na bazie: te same 10 failed + 6 errors). Żadne nie dotyczy plików karty — szczegóły w §5. |
| `guardy_z_ci.py` | 105 z 106 bramek zielonych. Lint black/ruff (src, tests, `../scripts`, `scripts`), `npm run type-check` i `npm run lint` zielone. Samotesty `pytest ../scripts`: **3368 passed**. Czerwony `tsconfig_gate_guard` (dług typów frontendu 81 > budżet 80). Jest czerwony na bazie; frontend w karcie ma zerową różnicę (`git diff --stat 615f3b24 HEAD -- frontend` pusty) — §5. |
| `arch_guard.py` na żywym drzewie | `OK, przeskanowano 1670 plikow backendu`, rc=0 |
| Samotest `scripts/test_arch_guard.py` | 13 scenariuszy iniekcji przez `main()`: import i wywołanie `PowerFlowNewtonSolver().solve()`, `import modułu`, `import … as`, `from network_model import solvers`, funkcja `build_power_flow_result_v1` z modułu z listy, `*`, typ spoza listy, `importlib.import_module`, `__import__`, import pod `TYPE_CHECKING` spoza listy → **RC=1**. Pary zielone: typy z listy w kodzie produktu, solver w teście `tests/analysis`, dynamiczny import innego modułu → RC=0. Treść dawnego `analysis/power_flow/solver.py` na drzewie syntetycznym → naruszenie. Pomiar AST: lista zamknięta = dokładnie to, co `src/analysis/**` dziś sprowadza. |
| `no_direct_fault_params_guard` | rc=0. Iniekcja osieroconego klucza zapadki przez `main()` na żywym drzewie → **RC=1** (`[fault-params-zapadka-osierocona]`). |
| `legacy_public_path_guard` | rc=0. Nowe iniekcje wskrzeszenia (4 ścieżki, 7 definicji, 3 formy nazwy solvera w pakiecie fazowym) są czerwone; para zielona `_build_violations` w `reactive_adequacy` jest zielona. |
| Pliki złote / determinizm | Zero zmian w plikach złotych (`git status` bez `golden`). Parytety złote i determinizmu są w pełnej regresji i są zielone. Kasowane ścieżki nie miały konsumenta, więc wynik produktu się nie zmienił. |
| Bieg kanoniczny vs rachunek ręczny | Ik''max szyna nN = 15 544,18 A, szyna SN = 7 160,67 A — dokładnie wartości rachunku ręcznego. Dotąd dowodzone na skasowanym adapterze, teraz przez `execute_run`. |

## 2. Inwentarz klasy i decyzje

### 2a. Tory istniejące tylko w testach

| Pozycja | Pomiar | Decyzja |
|---|---|---|
| `analysis/power_flow/solver.py` (`PowerFlowSolver`, `solve_power_flow`) | wywołanie solvera NR w interpretacji; 0 importerów w `src` | **SKASOWANE** |
| `analysis/power_flow/analysis.py` (`assemble_power_flow_result`, `_build_violations`, `_summarize_violations`, `_build_balance_note`) | jedyny konsument: `solver.py` | **SKASOWANE**. Pokrycie wielkości w produkcie sprawdzone (§3). |
| `analysis/power_flow/_internal.py` | reeksport `*` wnętrza solvera, 0 importerów | **SKASOWANE** |
| `application/solvers/short_circuit_binding.execute_short_circuit` + `_resolve_c_factor`, `ShortCircuitBindingError`, `_ANALYSIS_TYPE_TO_SC_TYPE` | tylko testy (`test_sc_lv_min_max`, `test_pr18_sc_integration`, `test_result_mapping_ref_id`, `test_fault_scenario_v2_determinism`) | **SKASOWANE**. `ShortCircuitBindingResult` zostaje jako typ wejścia zamrożonego mappera (§4). |
| Gałąź awaryjna `PhaseStateSNProofPack.materialize_payload` (solver liczony w pakiecie) | bieg kanoniczny zawsze podaje `solver_result` | **SKASOWANE**. `solver_result` jest teraz obowiązkowy (keyword-only). `packs/phase_state_sn.py` nie jest rdzeniem B-01 (B-01 = `network_model/solvers/phase_state_sn.py`, nietknięty). |
| `analysis/machine_short_circuit/` | 0 konsumentów w `src`; wkłady maszyn z wywodem daje `POST /api/proof/sc3f/contributions` i pakiet SC3F | **SKASOWANE**, razem z testem i prefiksami w `no_direct_fault_params_guard` |
| `application/result_mapping/short_circuit_to_resultset_v1.py`, `sc_binding_meta.py` (+ `protection_to_resultset_v1.py`) | 0 konsumentów w produkcie | **ZATRZYMANE — B-01**. Zamrożone decyzją właściciela CV-3.3-A2 (`resultset_v1_schema_guard`). Testy kontraktu dostają wejście z `tests/utils/wynik_wiazania_zwarcia.py`, złożone z tych samych ogniw co assembler. |
| Łańcuch uziemień P19: `application/analyses/earthing/ground_fault_bridge.py` → `packs/earthing_ground_fault_sn.py` → `ProofGenerator.generate_earthing_ground_fault_proof` | **nowe znalezisko**: pomiar osiągalności importów od `api.main` + `api.celery_app` — moduł nieosiągalny; wołany tylko z testów | **ZATRZYMANE do decyzji właściciela** (§4) |

### 2b. Importy `network_model.solvers*` w `backend/src/analysis/**` (pomiar AST po kasacji)

| Plik | Nazwy | Decyzja |
|---|---|---|
| `analysis/power_flow/types.py` | kontrakt wejścia (`PowerFlowInput`, `PowerFlowOptions`, `SlackSpec`, `PQSpec`, `PVSpec`, `ShuntSpec`, `TransformerTapSpec`, `BusVoltageLimitSpec`, `BranchLimitSpec`) | lista zamknięta — dane bez obliczeń, publiczne API pakietu |
| `analysis/voltage_profile/segment_decomposition.py` | `PowerFlowResultV1` | lista zamknięta — typ wyniku FROZEN |

### 2c. Importy solverów w `backend/src/application/**`

Warstwa aplikacji jest warstwą wiązania: wołanie solvera przez bieg kanoniczny i pakiety
dowodowe to jej rola, a fizyka zostaje w solverach. Każdy moduł z importem solvera
zmierzyłem pod kątem konsumenta produkcyjnego (import z `api/**` albo z modułu
osiągalnego). Wszystkie mają konsumenta, **poza `earthing/ground_fault_bridge.py`**
(§2a, zatrzymane).

Moduły z konsumentem: `dokument_studium`, `fault_loop/{route,service}`, `frt_sekwencja`,
`frt_trajektorie`, `kontyngencje_n1`, `lv_domain/upstream_equivalent`, `nn_circuit_sheet`,
`nn_device_selection`, `ocena_doboru_magistrali`, `odpowiedz_osd`, `pq_coverage`,
`prad_zwarciowy_galezi`, `protection/czas_wylaczenia_galezi`, `sekcja_zgodnosci_ncrfg`,
`state_estimation/service`, `swz/{service,werdykt}`, `voltage_profile_view`,
`wytrzymalosc_cieplna_przewodow`, `ncrfg_compliance/{bieg,frt_input,model_bridge,ocena_wymagan}`,
`proof_engine/{lv_circuit_verification_binding,vdrop_chain_binding,proof_generator}`,
`packs/{lv_circuit_verification,sc_asymmetrical,sc_symmetrical,p14_power_flow,p16_losses}`,
`protection_analysis/engine`, `solvers/{power_flow_binding,solver_capability_registry,short_circuit_binding}`,
`dynamika/{opis_scenariusza,opis_wyniku}`.

Wejścia w solver z parametrami zwarcia są już objęte zapadką
`no_direct_fault_params_guard` (`api/proof_pack.py`, `packs/sc_symmetrical.py`,
`enm/canonical_analysis.py`) albo białą listą warstwy wiązania.

## 3. Naruszenia napięć i obciążeń — pokrycie w produkcie (warunek kasacji `_build_violations`)

| Wielkość w martwej detekcji | Warunek | Produkt |
|---|---|---|
| Napięcie szyny poniżej/powyżej limitu | tylko gdy `bus_limits` podane — **żaden producent w `src` ich nie wypełniał** | `analysis/energy_validation/builder.py::_check_voltage_deviation` (każda szyna, progi `analysis/normative/kryteria_napiecia.py`), `analysis/power_flow_interpretation/builder.py` (ustalenia napięć), eksponowane przez `api/canonical_run_views.py::build_power_flow_interpretation` i `application/analyses/energy_validation/service.py` |
| Prąd gałęzi (linia/kabel) ponad In zacisku | liczone zawsze | `energy_validation/builder.py::_check_branch_loading` przez tę samą funkcję `analysis/obciazenie_galezi.py` (iloczyn cech zacisków w `tests/analysis/test_obciazenie_zaciskow_miejsca.py`, nadal zielony) |
| Obciążenie transformatora | liczone zawsze | `energy_validation/builder.py::_check_transformer_loading` (prąd strony / I_r strony) |
| `S > s_max_mva` | tylko z jawnego `BranchLimitSpec` — brak producenta | brak odpowiednika. To wielkość bez źródła danych w produkcie (nie ma pola modelu ani UI). Obciążenie transformatora ocenia definicja prądowa (decyzja O-51). |

Każda wielkość, którą martwa detekcja liczyła z danych istniejących w produkcie, ma
pokrycie. Pole `PowerFlowResult.violations` (FROZEN) zostaje bez zmian.

## 4. Pozycje zatrzymane do decyzji właściciela (z pomiarem)

1. **`BusVoltageLimitSpec` / `BranchLimitSpec` i pola `PowerFlowInput.bus_limits` /
   `branch_limits`** — po kasacji detekcji nie mają konsumenta poza walidacją wejścia
   w `network_model/solvers/power_flow_newton_internal.py:355-407`. To rdzeń **B-01**
   (`scripts/rdzenie_b01.py`), więc nie ruszam. Kasacja wymaga zgody właściciela na edycję
   `validate_input` rdzenia NR.
2. **Mappery ResultSet v1 SC/Protection i `sc_binding_meta.py`** — 0 konsumentów
   produkcyjnych. Zamrożone decyzją właściciela CV-3.3-A2 (B-01).
3. **Łańcuch uziemień P19** (`ground_fault_bridge.py` → `earthing_ground_fault_sn` →
   `generate_earthing_ground_fault_proof`, testy `test_earthing_*`,
   `test_vector_group_earth_fault_touch_voltage.py`). Pomiar: moduł mostu nieosiągalny
   z `api.main`/`api.celery_app`, pakiet i metoda dowodu wołane tylko przez most i testy.
   Produkt liczy napięcia rażeniowe INNĄ metodą: `EARTHING_SAFETY` w V12.6
   (`v126_academic._earthing`, IEEE 80: U_touch, U_step, dopuszczalne). P19 liczy podział
   I_u = r·I″k1 / I_p i uproszczone U_d = I_u·R_u. Wielkości nie są tożsame, więc wg
   reguły karty nie kasuję. Decyzja produktowa: wpiąć P19 w bieg SC_1F (most jest gotowy)
   albo skasować go na rzecz IEEE 80.

## 5. Czerwone na bazie, poza kartą (pomiar)

- `tests/test_protection_settings_w3c2_identity.py` (6 błędów):
  `git show a16f8d2b:…` → „Not a valid object name". Klon sesji jest płytki i nie ma
  tego commitu w historii. To środowisko, nie kod.
- `tests/enm/migrations/test_nn_field_specs_promocja_aparat.py` (8 failed): test odwołuje
  się do `_materializuj_aparat` / `materialize_catalog_binding`, których
  `enm/migrations/nn_field_specs_promocja.py` po `3c246c08` nie ma.
- `tests/domain/test_rejestr_kodow_bram_katalogowych.py`: `catalog.assign_failed`
  (`nn_field_specs_promocja.py:279`) bez wpisu w `READINESS_CODES`.
- `tests/enm/test_nazwy_jedno_zrodlo.py`: lokalny predykat nazwy w `enm/validator.py:100`.
- `tsconfig_gate_guard`: dług typów frontendu 81 > 80.

Wszystkie pochodzą z commitu scalającego partii 6 (`3c246c08`/`1c7cadc4`, warstwa
migracji aparatów nN i walidatora — karty równoległe). Są identyczne na `615f3b24`.
Nie naprawiałem ich w tej karcie, żeby nie wejść w kolizję z integracją partii 6.
Wymagają karty integracyjnej.

## 6. Zmiany poboczne

- Dokumenty zgodne z drzewem: `docs/analysis/LOAD_FLOW_GUARDS.md` §3.2–3.3 (realny
  skrypt `load_flow_no_heuristics_guard.py`, `SCAN_DIRS`),
  `docs/analysis/LOAD_FLOW_CANONICAL_ARCHITECTURE.md` (§2.2, §7.1, §9.1, §12 — bieg
  kanoniczny zamiast skasowanych `AnalysisRunService`/`PowerFlowSolver`),
  `analysis/power_flow/README.md`, `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` (A7, A9),
  `docs/plan/PLAN_SC_MASZYNY_DER_2026-07.md` (poz. 12), `CLAUDE.md` (18 modułów analiz).
- `no_direct_fault_params_guard`: zdjęty osierocony klucz
  `application/analysis_run/service.py` (budżet 5 wejść w solver dla nieistniejącego
  pliku) oraz nowa `check_legacy_callers_freshness`.
- `test_power_flow_v1`: asercja bilansu mocy wzmocniona. Wcześniej sprawdzała tylko
  „klucz `power_balance` obecny w śladzie", teraz: slack + zadane PQ − straty < 1e-6 pu
  przy zbieżności.
- `v2_feature_flags.pv_enabled` była wyprowadzana z wejścia (tautologia). Zastąpiłem ją
  dowodem z solvera: napięcie zadane PV utrzymane (|U|=1,02 pu) albo jawne przełączenie
  PV→PQ w śladzie NR.
