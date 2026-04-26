# Macierz testow V12.xx

Status: aktywna  
Cel: dowod akceptacji kanonu, migracji i zakresu domenowego

## Bramki istniejace

| Bramka | Komenda | Status dla V12.xx |
|---|---|---|
| Weryfikacja V12.5.1 | `npm run verify:v12.5.1` | Zachowac jako regresje przejsciowa. |
| Terminologia UI | `npm run guard:ui-terminology` | Rozszerzyc o slowa zakazane V12.xx. |
| Archiwum dokumentacji | `npm run guard:docs-archive` | Zachowac, plus guard V12.xx. |
| Import graph | `npm run guard:import-graph` | Zachowac. |
| Testy frontend | `npm run test` | Rozszerzyc o V12.xx. |
| E2E | `npm run test:e2e` | Rozszerzyc o SLD, warianty, wyniki i raport. |

## Nowe testy obowiazkowe

| Kod | Obszar | Scenariusz | Kryterium akceptacji |
|---|---|---|---|
| V12-TST-001 | governance | Komplet plikow `docs/v12xx/` | Guard przechodzi. |
| V12-TST-002 | migracja | ENM v1 -> ENM v2 | Zachowane `ref_id`, deterministyczny hash. |
| V12-TST-003 | draft | Draft formularza nie zasila solvera, raportu ani proof | Backend uzywa snapshotu frozen, HTTP ignoruje wstrzykniety snapshot, frontend nie wysyla danych ENM w run request. |
| V12-TST-004 | identyfikatory | Zmiana `name` nie zmienia `ref_id` | Wyniki i proof nadal linkuja obiekt. |
| V12-TST-005 | katalogi | Run ma snapshot katalogowy | Wynik zawiera hash i wersje katalogu. |
| V12-TST-006 | warianty | Wariant i migawka lacznikowa rozdzielone | Wynik wskazuje oba byty. |
| V12-TST-007 | invalidacja | Zmiana dlugosci odcinka | Invaliduje zwarcia, rozplyw i zalezne proofy. |
| V12-TST-008 | zwarcia | 3F/1F/2F/2F+Z | Z0 jest budowane z ENM bez zmiany 3F; kanoniczny run 1F i 2F+Z wymaga committed Z0, zwraca `z0_ohm`, `proof_ref`, `proof_status=complete`, `reporting_status=reportable` i przechodzi przez API, result set, trace export oraz raport JSON. |
| V12-TST-009 | FRT | Profil FRT z zapadem napiecia | Ocena zgodnosci i proof dostepne. |
| V12-TST-010 | BESS | Ladowanie, rozladowanie, postoj | P/Q i wklad zwarciowy zgodny z trybem. |
| V12-TST-011 | FW | PMSG/DFIG/SCIG | Typ generatora wplywa na model i raport. |
| V12-TST-012 | stan fazowy | UA/UB/UC i IA/IB/IC | Nakladka SLD i proof dostepne. |
| V12-TST-013 | stabilnosc | Stabilny i niestabilny scenariusz | Czas krytyczny i status raportowy rozroznione. |
| V12-TST-014 | automatyka | SPZ/FDIR po zakloceniu | Slad pokazuje co odlaczylo, kiedy i dlaczego. |
| V12-TST-015 | eksport | Dark SCADA vs jasny eksport | Eksport SLD PNG/PDF domyslnie uzywa `light_technical`, a tryb `screen` nie nadpisuje klona. |
| V12-TST-016 | walidacje | Wspolny slownik severity ENM | Publiczne wartosci API sa stabilne, sortowanie walidacji uzywa centralnego rankingu, a `severity_contract_guard.py` blokuje inline severity/status w boundary walidacji. |
| V12-TST-017 | API lifecycle | Aktywna trasa `/api` z `api.main` | `api_lifecycle_guard.py` blokuje trase bez wiersza w macierzy, statusu, testow, wlasciciela, zakresu kompatybilnosci i daty wylaczenia dla `adapter`/`deprecated`. |
| V12-TST-018 | E2E lifecycle | Wykrywanie przegladarki i backend realny Playwright | `playwright-env.mjs` wykrywa cache Playwright Chromium, ma limit `PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS`, `playwright-setup.mjs` uzywa `playwright.cmd` na Windows, `playwright.config.ts` startuje backend przez `cwd: backendCwd`, a `verify_v12_5.py` ma timeout kroku. |
| V12-TST-019 | kanoniczny case ref | Publiczny klient runow nie przyjmuje `operating_case_id` | `power-flow-results/api.ts` i `results-browser/api.ts` wymagaja `study_case_id`, a testy frontendu zglaszaja blad kontraktu przy jego braku. |
| V12-TST-020 | martwe sciezki UI | Naruszenia i eksport Excel w przegladarce wynikow | UI nie probuje `GET /violations`, liczy naruszenia z aktywnego payloadu PF, a `GET /power-flow-runs/{run_id}/export/xlsx` zwraca poprawny workbook XLSX. |
| V12-TST-021 | macierz interakcji | Minimalny zestaw obiektow SLD ma jawny kontrakt interakcji | `interaction_matrix_guard.py` blokuje brak wiersza lub puste pola dla obiektu pierwszej klasy. |
| V12-TST-022 | sieci wzorcowe | Kody `V12-GN-001..007` maja stale dowody w repo | `reference_networks_guard.py` blokuje brak kodu albo brak pliku dowodowego dla sieci i scenariuszy wzorcowych. |
| V12-TST-023 | ENM v2 / OZE | Projekcja ENM v2 materializuje profile PV/BESS/FW PMSG/DFIG/SCIG | `test_v2_projection.py` potwierdza `source_profiles`, `frt_profiles`, `q_u_profiles`, `cos_phi_p_profiles`, `operator_profiles`, precyzyjny typ `FW_PMSG` i blokade migracji przy niespojnym modelu generatora. |
| V12-TST-024 | zgodnosc zrodel | FW PMSG/DFIG/SCIG wymaga zgodnego modelu generatora | `test_source_compliance.py` potwierdza aliasy PMSG/DFIG/SCIG, brak `generator_model` jako `not_reportable` oraz niespojna technologie jako `non_compliant` z pelnym statusem proof. |
| V12-TST-025 | publiczne API legacy | Router publiczny nie moze przywrocic `OperatingCase` ani `operating_case_id` | `legacy_public_path_guard.py` i jego testy blokuja aktywne publiczne importy/nazwy/stringi legacy w routerach zarejestrowanych w `api.main`. |
| V12-TST-026 | UI / SLD / OZE | Typy FW PMSG/DFIG/SCIG przechodza od ENM do etykiet, selekcji i SLD | Testy `generatorTypeLabels`, `selectionResolution`, `topologyInputReader` i `catalog-first-modals` potwierdzaja precyzyjne typy FW bez splaszczania do legacy `wind_inverter`. |
| V12-TST-027 | API / EAZ legacy | Publiczny `protection-engine/v1` jest odciety | `test_production_canonical_only_api.py` potwierdza 404 dla `/api/protection-engine/v1/*`, a `v12xx_canon_guard.py` blokuje aktywna trase albo status inny niz `usuniety` w macierzy API. |
| V12-TST-028 | pokrycie end-to-end | Kazdy wymog macierzy pokrycia ma status `WDROZONE` | `check_end_to_end_coverage_matrix()` w `v12xx_canon_guard.py` blokuje brak dokumentu, puste komorki albo status inny niz `WDROZONE`. |
| V12-TST-029 | dark SCADA | Kazdy ekran dziedziczy ekranowy motyw dark SCADA, a jasny motyw jest ograniczony do eksportu | `App.routes.test.tsx` potwierdza root `mv-dark-scada`, a `check_dark_scada_screen_theme()` blokuje brak globalnej warstwy dark SCADA, jasny domyslny renderer pola/SLD albo utrate `light_technical` dla eksportu. |

## Sieci wzorcowe

| Kod | Nazwa | Zakres |
|---|---|---|
| V12-GN-001 | Siec zwarciowa pelna | 3F, 1F, 2F, 2F+Z, Ik'', ip, IB, Ith. |
| V12-GN-002 | Siec z izolowanym punktem neutralnym | Pojemnosci doziemne i ziemnozwarcie. |
| V12-GN-003 | Siec z asymetria obciazenia | Stan fazowy SN i porownanie symetryczne. |
| V12-GN-004 | Siec z FRT | PV/BESS/FW, FRT i praca po zakloceniu. |
| V12-GN-005 | Siec ze SPZ i FDIR | Automatyka eliminacyjna i restytucyjna. |
| V12-GN-006 | Siec stabilna dynamicznie | Resynchronizacja i wynik raportowy. |
| V12-GN-007 | Siec niestabilna dynamicznie | Utrata stabilnosci i wynik analityczny. |
