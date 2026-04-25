# Raport M0 - inwentaryzacja startowa V12.xx

Status: wykonany zakres dokumentacyjno-architektoniczny  
Data: 2026-04-24  
Cel: zamrozenie punktu startowego przed migracja ENM v1 -> ENM v2.0

## 1. Stan repozytorium

| Obszar | Wynik |
|---|---|
| Katalog roboczy | `mv-design-pro` |
| Aktywny katalog kanonu V12.xx | `docs/v12xx/` |
| Liczba plikow dokumentacji po utworzeniu kanonu | 298 |
| Istniejaca zmiana nieobjeta tym pakietem | `backend/mv_design_pro.db` |
| Decyzja dla bazy SQLite | Nie ruszac bez jawnej decyzji migracyjnej. |

## 2. Aktywne moduly backendu

Moduly najwyzszego poziomu w `backend/src`: `analysis`, `api`, `application`, `compliance`, `diagnostics`, `domain`, `enm`, `infrastructure`, `network_model`, `protection`, `solvers`, `solver_input`, `whitebox`.

## 3. Aktywne routery API

Routery zamontowane w `backend/src/api/main.py`:

- `analysis_runs_router`
- `analysis_runs_router` z prefiksem `/api`
- `catalog_router`
- `comparison_router`
- `diagnostics_router`
- `equipment_proof_pack_router`
- `health_router`
- `power_flow_comparisons_router`
- `power_flow_runs_router`
- `project_archive_router`
- `projects_router`
- `proof_pack_router`
- `protection_comparisons_router`
- `reference_patterns_router`
- `sld_router`
- `study_cases_router`
- `xlsx_import_router`
- `enm_router`
- `execution_runs_router`
- `result_contract_v1_router`
- `fault_scenarios_router`
- `protection_engine_v1_router`
- `sld_overrides_router`
- `switchgear_config_router`

Wniosek M0: kazdy z tych routerow musi zostac wpisany do `MACIERZ_KOMPATYBILNOSCI_API.md` w fazie M1 albo oznaczony jako legacy/deprecated/adapter w fazie M2.

Aktualizacja M1: aktywne trasy `/api` zostaly wypisane z aplikacji FastAPI i wpisane do `MACIERZ_KOMPATYBILNOSCI_API.md` ze statusem cyklu zycia, data wejscia, data wylaczenia dla adapterow/deprecated, testami i wlascicielem.

## 4. Aktywne obszary UI

UI zawiera rozbudowane moduly SLD, katalogow, gotowosci, wynikow, zabezpieczen, porownan, przypadkow, topologii i raportowania. Wniosek M0: V12.xx nie moze byc realizowane przez jeden ekran ani jeden refaktor komponentu. Wymagane sa macierze interakcji, draft vs committed, API lifecycle i migracja stopniowa.

## 5. Strazniki uruchomione w M0

| Bramka | Wynik |
|---|---|
| `npm run guard:v12xx-canon` | PASS |
| `npm run guard:docs-archive` | PASS |
| `npm run guard:ui-terminology` | PASS |
| `poetry run pytest tests\enm\test_v2_projection.py -q` | PASS |
| `poetry run ruff check src\enm\v2_projection.py tests\enm\test_v2_projection.py` | PASS |
| `poetry run pytest tests\enm\test_v2_projection.py tests\enm\test_enm_api.py -q` | PASS |
| `poetry run ruff check src\enm\v2_projection.py src\api\enm.py tests\enm\test_v2_projection.py tests\enm\test_enm_api.py` | PASS |
| `npm run verify:v12.5.1` | PASS wedlug `verification_v12_5_1.md`: 17/17 krokow, 0 bledow |
| `py -3 -m pytest scripts\test_v12xx_canon_guard.py -q` | PASS |
| `npm run test -- --run src/ui/enm-inspector/__tests__/api.test.ts src/types/__tests__/enm-types.test.ts` | PASS |
| `poetry run pytest tests/api/test_analysis_run_report_exports.py tests/application/analysis_run/test_analysis_run_service.py::test_analysis_run_lifecycle_pf` | PASS |
| `poetry run ruff check src\api\v125_contracts.py src\domain\analysis_run.py tests\api\test_analysis_run_report_exports.py tests\application\analysis_run\test_analysis_run_service.py` | PASS |
| `poetry run pytest tests\enm\test_canonical_analysis_draft_isolation.py tests\enm\test_enm_api.py::TestRunDispatch tests\enm\test_v2_projection.py -q` | PASS |
| `npm run test -- --run src/ui/study-cases/__tests__/api.draft-isolation.test.ts src/ui/study-cases/__tests__/runStore.test.ts src/ui/enm-inspector/__tests__/api.test.ts src/types/__tests__/enm-types.test.ts` | PASS |
| `npm run test -- src/ui/sld/export/__tests__/sld-export.test.ts` | PASS |
| `npm run type-check` | PASS |
| `poetry run pytest tests/enm/test_enm_validator.py tests/enm/test_fix_action_generation.py::TestDeterminism::test_sorting_by_severity_then_code_then_element tests/enm/test_golden_network_enm.py::TestGoldenNetworkValidation::test_issues_deterministic_order` | PASS |
| `poetry run pytest tests\enm\test_enm_mapping.py -q` | PASS |
| `poetry run pytest tests\enm\test_canonical_analysis_draft_isolation.py tests\enm\test_enm_api.py::TestRunDispatch tests\enm\test_enm_mapping.py -q` | PASS |

## 6. Ograniczenia raportu M0

Pelny `npm run verify:v12.5.1` zostal wykonany i raport `verification_v12_5_1.md` pokazuje 17/17 PASS. Domyka to aktywny pakiet V12.5.1 end-to-end, ale nadal nie zamyka calej V12.xx, bo pelna wersja wymaga implementacji M2/M3/M4, kompletnego ENM v2.0, snapshotow katalogowych wynikow, stanu fazowego, stabilnosci dynamicznej, automatyki i pelnych modeli OZE/BESS/FW/FRT.

## 7. Blokady domkniecia M1

- Rozszerzyc projekcje ENM v1 -> ENM v2.0 poza kontrakt startowy M1.
- Dodac docelowa persystencje snapshotow katalogowych, poza addytywnym tuple `catalog_materialization_*` w result contract.
- Rozpisac testy migracji dla docelowych snapshotow katalogowych i wariantow wynikowych.
- Oznaczyc wszystkie sciezki legacy zwiazane z `OperatingCase`.
- Utrzymac ochrone przed modyfikacja `backend/mv_design_pro.db` bez decyzji migracyjnej.

## 8. Zrealizowany start M1 w tej iteracji

Dodano read-only projekcje `enm.v2_projection`, ktora tworzy naglowek ENM v2.0, element references, wariant bazowy, migawke stanow lacznikowych, konfiguracje sieci zerowej, ostrzezenia migracyjne i deterministyczny hash projekcji. Projekcja jest dostepna przez endpoint `/api/cases/{id}/enm/v2-projection`, ma test API i nie przelacza zapisu domenowego ani nie zmienia ENM v1.

Dodano frontendowy typ `EnergyNetworkModelV2Projection` i klienta read-only `fetchEnmV2Projection`, z testem kontraktu API. Dodano tez addytywny tuple reprodukowalnosci w aktywnym kontrakcie wynikow V12.5 oraz w legacy `AnalysisRun`, bez zmiany zamrozonego `ResultSetV1`.

Domknieto kontrakt draft vs committed dla uruchomien obliczen: backend zamraza snapshot przy `create_run`, endpoint uruchomienia ignoruje wstrzykniete dane ENM w ciele zadania, a frontend `createRun` serializuje tylko pola kontraktu uruchomienia. To zamyka `V12-BL-105` w zakresie solvera i sciezki run request.

Domknieto rozdzielenie motywu ekranowego i eksportowego dla SLD: eksport PNG/PDF domyslnie uzywa `light_technical`, a jawny tryb `screen` zachowuje zachowanie ekranowe. Domknieto tez centralny slownik severity dla ENMValidator przez `enm.severity`, bez zmiany publicznych wartosci API `BLOCKER`, `IMPORTANT`, `INFO`, `OK`, `WARN`, `FAIL`.

Rozpoczeto domykanie `V12-BL-203`: dodano osobny helper budowy `z0_bus` z danych ENM dla linii, kabli i zrodel. Test potwierdza, ze helper nie zmienia wyniku 3F, a jednoczesnie pozwala uruchomic 1F oraz 2F+Z z `z0_ohm` w white-box trace.

Rozszerzono kanoniczny run ENM o jawny `fault_type`. Domyslne zachowanie 3F pozostaje kompatybilne, a `1F` i `2F+Z` wymagaja committed Z0 w ENM. Test API potwierdza, ze endpoint przyjmuje tylko parametry uruchomienia i ignoruje wstrzykniety draft ENM.

Domknieto `V12-BL-203` bez skracania zakresu: pakiet zwarc asymetrycznych `1F` i `2F+Z` ma pelny status dowodowy i raportowy. Raw result, wiersze wynikow, result set, trace export, JSON report i JSON export przenosza `proof_ref`, `proof_status=complete`, `reporting_status=reportable`, dopuszczalnosc raportowa oraz powiazanie z krokami white-box trace.

Domknieto `V12T-012`: kontrakt `enm.severity` jest jedynym miejscem definicji publicznych severity i statusow walidacji, boundary API uzywa helperow kontraktu, a `severity_contract_guard.py` jest podlaczony do `v12xx_canon_guard.py` i pelnego `verify:v12.5.1`.

Domknieto `V12T-013`: E2E lifecycle pelnej weryfikacji ma zabezpieczenie przed zawieszeniem. Detekcja Chromium w `playwright-env.mjs` obsluguje cache Playwright Chromium i ma limit `PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS`, `playwright-setup.mjs` uzywa `playwright.cmd` na Windows i nie uruchamia fallbacku APT na tej platformie, `verify_v12_5.py` ma timeout per krok, a `playwright.config.ts` uruchamia realny backend przez `cwd: backendCwd` bez shellowego `Set-Location`. `v12xx_canon_guard.py` blokuje regresje tych kontraktow.

Po domknieciu tej iteracji raport `verification_v12_5_1.md` przechodzi 17/17 krokow, w tym repo guards, backend lint/format/test, frontend lint/type-check/tests, harness wydajnosci, goldeny i E2E. Oznacza to, ze aktywny pakiet V12.5.1 ma zsynchronizowany kod, guardy, testy i dokumentacje operacyjna.
