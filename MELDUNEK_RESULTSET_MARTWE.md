# MELDUNEK — karta RESULTSET-MARTWE-MAPPERY (2026-09-30 / 2026-10-01)

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-resultset-martwe`, baza `f3c435b6`
(TORY-TYLKO-W-TESTACH). Zgoda B-01: decyzja O-59 (OD-18 (a)/(b)/(c)).
Commity karty: `c4ed101b` (kod + strażniki), `adb5c6c2` (dokumenty), `0a2f075f` (pin
`solver_input_substitute_guard` + samotest bramki źródeł-widm); czubek przed meldunkiem:
`0a2f075f`.

## 1. Wynik i dowody

| Bramka | Wynik |
|---|---|
| Pełna regresja backendu `pytest -m "not pandapower and not andes"` (na `c4ed101b`; kolejne commity nie zmieniają `backend/`) | RC=1: **26 934 passed**, 10 failed, 6 errors, 37 deselected (68 min). Wszystkie 16 czerwonych pozycji = czerwień bazy partii 6 z listy karty (niżej) |
| Ta sama czerwień zmierzona na bazie `f3c435b6` (osobne drzewo robocze, te same 4 pliki) | RC=1: **10 failed, 6 errors** — identyczne identyfikatory |
| `python ../scripts/guardy_z_ci.py` z `backend/` (po `0a2f075f`, po `npm ci`) | RC=1 — jedyny czerwony: `tsconfig_gate_guard` (czerwień bazy, lista karty). Zielone m.in.: `resultset_v1_schema_guard`, `solver_boundary_guard`, `backend_no_physics_guard`, `legacy_public_path_guard`, `no_direct_fault_params_guard`, `solver_input_substitute_guard`, `verification_phantom_paths_guard`, `mypy_ratchet_guard`, `werdykt_wyjasnialny_guard`, `npm run type-check`, `npm run lint` |
| `tsconfig_gate_guard` na karcie i na bazie `f3c435b6` | RC=1 w obu: „81 POZA BRAMKA (budżet 80)" — identyczny komunikat, czerwień bazy |
| Samotesty strażników `pytest ../scripts` (w `guardy_z_ci`) | **3420 passed**, 0 failed |
| Test V12S-011 na żywym mapperze `tests/application/test_result_mapping_ref_id.py` | 19 passed |
| Samotest `scripts/test_resultset_v1_schema_guard.py` | zielony (w 3420) |
| Iniekcja na REALNYM drzewie: przywrócenie każdego z 4 plików (treść z `f3c435b6`) → `python scripts/resultset_v1_schema_guard.py` | `short_circuit_to_resultset_v1.py` RC=1, `protection_to_resultset_v1.py` RC=1, `sc_binding_meta.py` RC=1, `domain/protection_engine_v1.py` RC=1 (10 trafień: plik + definicje); po sprzątnięciu RC=0, drzewo czyste |
| Mutacja: budowniczy `result_builder_v1.py` z `element_ref_id=None` | test V12S-011 czerwony (10 z 19), plik przywrócony |
| 0 importerów | `grep -rn "short_circuit_to_resultset_v1\|protection_to_resultset_v1\|sc_binding_meta\|protection_engine_v1\|ShortCircuitBindingResult" backend/src --include=*.py` — wyłącznie komentarze historyczne/docstringi; 0 importów, 0 definicji |
| black `--check --config pyproject.toml` (src, tests, ../scripts), ruff | zielone |
| Schemat JSON `schemas/resultset_v1_schema.json` i `domain/result_contract_v1.py` | **bit w bit** (nietknięte, `git diff f3c435b6 -- …` puste) |

Czerwień bazy partii 6 (nienaprawiana, zgodnie z kartą — naprawiana równolegle):
`tests/enm/migrations/test_nn_field_specs_promocja_aparat.py` (8),
`tests/domain/test_rejestr_kodow_bram_katalogowych.py` (1), `tests/enm/test_nazwy_jedno_zrodlo.py` (1),
`tests/test_protection_settings_w3c2_identity.py` (6 errors, płytki klon), `tsconfig_gate_guard`.
Innej czerwieni nie napotkano poza własną (samotest `solver_input_substitute_guard` po kasacji —
naprawiony w `0a2f075f`).

**Złote hashe / sygnatury:** w testach nie ma przypiętych hashy `ResultSetV1`; golden testy
w pełnej regresji zielone. Uczciwie: `deterministic_signature` żywych wyników ZMIENIA się dla
biegów, których wiersze trafiają w `ref_id` modelu (pole `element_ref_id` przestaje być `null`) —
to zamierzony skutek wdrożenia V12S-011, schemat i model bez zmian.

## 2. Co zrobiono

1. **Kasacja** (0 importerów w `src`): `application/result_mapping/short_circuit_to_resultset_v1.py`,
   `protection_to_resultset_v1.py`, `sc_binding_meta.py`, `domain/protection_engine_v1.py`,
   `ShortCircuitBindingResult` (+ zbędny `Scenario`, import `ExecutionAnalysisType`) z
   `application/solvers/short_circuit_binding.py`; testy `test_pr18_sc_integration.py`,
   `tests/utils/wynik_wiazania_zwarcia.py`, `test_protection_engine_v1.py`.
2. **Rozbieżność decyzji z kodem (zmierzona):** V12S-011 („wyniki niosą `element_ref_id`,
   wypełniane w `result_mapping`") był zrealizowany WYŁĄCZNIE w martwym mapperze; jedyny żywy
   producent `canonical_run_to_resultset_v1.py` pola nie wypełniał, a budowniczy je gubił. Wariant
   zgodny z intencją: mapper wypełnia `element_ref_id = element_ref` ⇔ migawka ENM biegu zna ten
   `ref_id` (jedno źródło prawdy, `ref_id_modelu`), inaczej `None`; budowniczy przenosi pole.
3. **Intencje skasowanych testów** przeniesione na żywy mapper (`test_result_mapping_ref_id.py`):
   iloczyn {zwarcia, rozpływ, zabezpieczenia} × {ref_id obecny, brak} + predykat parami na
   każdym wierszu, determinizm sygnatury, wpływ `element_ref_id` na sygnaturę, sortowanie po
   `element_ref`, domyślne `None` i serializacja. Fizyka testów PR-18 jest już dowodzona na
   biegu kanonicznym (`test_short_circuit_migracja_e3_golden.py`, `test_canonical_sc_c_per_pasmo.py`),
   punkty IDMT — `test_protection_idmt_w3a_merge.py`; sanity Ik'' — `application/analyses/sanity_bounds.py`.
4. **`resultset_v1_schema_guard.py`**: `PROTECTED_FILES` = `domain/result_contract_v1.py`,
   `domain/result_builder_v1.py`, `schemas/resultset_v1_schema.json`,
   `application/result_mapping/canonical_run_to_resultset_v1.py`; `SANCTIONED_CHANGES` dla mappera
   (ODMOWA-DANYCH `7f08ecea` już na gałęzi + V12S-011) i budowniczego (V12S-011);
   `check_resultset_dead_mappers_resurrection` (4 pliki + 16 nazw definicji, także pod inną
   ścieżką); samotest `scripts/test_resultset_v1_schema_guard.py` (iniekcja przez `main()` na kopii
   realnego `backend/src` — `scripts/conftest.py` zakazuje zapisu w drzewie repo w autotestach;
   iniekcja na realnym drzewie wykonana ręcznie, tabela wyżej).
5. **Strażniki pokrewne:** `solver_boundary_guard.py` — wpisy `protection_engine_v1` zdjęte z
   `WATCHED_PATHS` i `SANCTIONED_CHANGES` (tym samym commitem co kasacja);
   `backend_no_physics_guard.py` — `ZASTANE` puste (ostatni „trwały wyjątek" był martwym mapperem),
   pin w samoteście; `no_direct_fault_params_guard.py` — osierocony wpis `WHITELISTED_PATHS`;
   `solver_input_substitute_guard.py` — dwa wpisy-widma `CONTRACT_SOURCES`
   (`domain/protection_current_source.py` od W3-A, `domain/protection_engine_v1.py`) + NOWA bramka
   „źródło kontraktu wskazuje nieistniejący plik" z samotestem; pin 4116 → 4098 pól (−18, wyłącznie
   pola skasowanych klas — lista w komentarzu testu), pliki 561 → 558, application 245 → 242;
   `legacy_public_path_guard.py` + testy — komentarze/docstringi „B-01 STOP" zaktualizowane, jedna
   bramka na klasę (W3-A nie dubluje nazw).

## 3. Inwentarz klasy (`application/result_mapping/**`, `domain/*_v1.py`)

| Moduł | Konsument produkcyjny (osiągalność z `api.main`) | Decyzja |
|---|---|---|
| `result_mapping/canonical_run_to_resultset_v1.py` | `api/result_contract_v1.py` (router w `api.main`), `comparison/service.py`, `power_flow_comparison/service.py`, `protection_comparison/service.py`, `lv_domain/projection_v1.py` | żywy, JEDYNY producent, chroniony |
| `result_mapping/zwarcia_delta_overlay_v1.py` | `api/zwarcia_porownania.py` (router w `api.main:147`) | żywy (nakładka delty zwarć, inny kontrakt — nie ResultSetV1) |
| `result_mapping/short_circuit_to_resultset_v1.py` | 0 | skasowany |
| `result_mapping/protection_to_resultset_v1.py` | 0 | skasowany |
| `result_mapping/sc_binding_meta.py` | 0 | skasowany |
| `domain/result_contract_v1.py` | mapper, API, porównania | żywy, chroniony |
| `domain/result_builder_v1.py` | mapper | żywy, chroniony |
| `domain/result_contract_power_flow_unbalanced_v1.py` | `enm/rozplyw_niesymetryczny_wynik.py` ← `enm/canonical_analysis.py` | żywy |
| `domain/protection_engine_v1.py` | 0 | skasowany |

Klasa rozszerzona (ta sama klasa defektu — wpisy strażników wskazujące skasowane pliki):
`no_direct_fault_params_guard.WHITELISTED_PATHS`, `solver_input_substitute_guard.CONTRACT_SOURCES`
(2 widma, w tym jedno z W3-A), `backend_no_physics_guard.ZASTANE` — wszystkie zdjęte, a dla
`CONTRACT_SOURCES` dodana brakująca bramka (dla zapadki/wykluczeń istniała, dla źródeł nie —
predykaty parami).

## 4. Zmiany dokumentów (`adb5c6c2`)

Nowy wiersz `RESULTSET-MARTWE-MAPPERY` w `docs/v12xx/REJESTR_KONFLIKTOW.md`; OD-18 i jego
uzupełnienie w `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` → **ROZSTRZYGNIĘTE (O-59)** (+ wiersz
185 i wzmianki 941/949/970/992); V12S-011 „wdrożone 2026-09-30" w `REJESTR_DECYZJI_SEMANTYCZNYCH.md`
i `UIUX_SLD_REDESIGN_EXECUTION.md`; żywe odwołania przepięte w `ARCHITECTURE.md`, `SYSTEM_SPEC.md`,
`INWENTARZ_FUNKCJI_2026-07.md`, `CONVERGENCE_ROADMAP.md` (adnotacja CV-3.3-A2), `KARTY_OTWARTE`,
`KARTA_W3_KONWERGENCJA_FIZYKI`, `PROTECTION_SYSTEM_CANONICAL.md` (żywe miejsca zweryfikowane grepem),
noty „archiwalny" w `PROTECTION_ENGINE_V1.md`, `PROTECTION_CONTRACTS.md`,
`PROTECTION_CANONICAL_ARCHITECTURE.md`; jednozdaniowe adnotacje w 4 dokumentach stanu bieżącego.
Przy okazji: ścieżka `analysis/voltage_profile/` w `ARCHITECTURE.md`, nieistniejący selektor prądu
w `SYSTEM_SPEC.md`, nieistniejący `proof-hash-chain.spec.ts` oznaczony pomiarem. Raporty
historyczne/audytowe pozostawione bez zmian. Guardy dokumentów: `docs_guard`,
`verification_phantom_paths_guard`, `utf8_mojibake_guard`, `claude_md_struktura_guard` — RC=0.

## 5. Czego nie zrobiono i dlaczego

1. **Martwy model PR-14 w `backend/src/domain/execution.py`** (`Run`, `ResultSet`, `ElementResult`,
   `new_run`, `build_result_set`, `compute_solver_input_hash`, `compute_result_signature`,
   `_canonicalize`/`_stable_sort_key`/`_DETERMINISTIC_LIST_KEYS`) — po kasacji mapperów 0 importerów
   w `src` (pomiar AST); żyje wyłącznie w testach (`test_execution_domain.py`,
   `test_pr19_fault_scenario.py::TestResultSetExtension`, `test_sc_lv_min_max.py::
   TestDispatchInputHashDifferentiatesScenario`). Ta sama klasa (drugi model zestawu wyników bez
   konsumenta). Próba kasacji w tej sesji została ODRZUCONA przez system uprawnień jako zakres spoza
   karty — pozostawiona do decyzji właściciela; wpisana do wiersza rejestru konfliktów.
   Proponowany zakres: kasacja tych symboli (zostają `RunStatus`, `StanBiegu`, `stan_biegu`,
   `ExecutionAnalysisType` — żywi konsumenci w `api/**`, `domain/run_batch.py`), test hasha
   scenariusza przepisany na `enm.canonical_analysis._compute_input_hash` (opcje MAX/MIN).
2. Brak konsumenta frontendu dla `element_ref_id` — frontend czyta wyniki po `element_ref`, który
   w żywej ścieżce jest już `ref_id` ENM, gdy element istnieje; pole jest teraz prawdziwe w
   kontrakcie (dotąd zawsze `null`), bez potrzeby zmian UI.
3. Czerwień bazy partii 6 — nienaprawiana zgodnie z kartą (duplikat napraw w innej karcie).
