# Macierz kompatybilnosci API V12.xx

Status: aktywna  
Cel: zaden endpoint nie dziala bez statusu cyklu zycia

## Statusy endpointow

| Status | Znaczenie |
|---|---|
| aktywny | Kanoniczna sciezka V12.xx. |
| deprecated | Sciezka wygaszana, z data wylaczenia. |
| adapter | Sciezka przejsciowa dla migracji M1/M2. |
| usuniety | Endpoint nie jest dostepny. |

## Pola wymagane

| Pole | Opis |
|---|---|
| Endpoint | Metoda i sciezka. |
| Wersja | `v1`, `v2`, `v12xx` albo wersja routera. |
| Status | aktywny / deprecated / adapter / usuniety. |
| Data wejscia | Kiedy status obowiazuje. |
| Data wylaczenia | Wymagana dla deprecated i adapter. |
| Zakres kompatybilnosci | Co jest gwarantowane. |
| Testy | Testy kontraktu. |
| Wlasciciel | Rola odpowiedzialna. |

## Macierz aktywnych endpointow `/api` M0/M1

Data wejscia statusow: 2026-04-24.  
Data wylaczenia dla adapterow: koniec M3, o ile wiersz nie wskazuje inaczej.  
Data wylaczenia dla deprecated: koniec M2, o ile wiersz nie wskazuje inaczej.

| Endpoint | Wersja | Status | Data wejscia | Data wylaczenia | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|---|---|
| `DELETE /api/execution/fault-scenarios/{scenario_id}` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Usuwanie scenariusza zakloceniowego w przejsciowym API execution. | execution fault scenario tests | Architekt API |
| `DELETE /api/projects/{project_id}` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Usuwanie projektu; wymaga audytu destrukcyjnego w M2. | project deletion tests | Architekt API |
| `DELETE /api/study-cases/{case_id}` | v12xx | aktywny | 2026-04-24 | - | Usuwanie kanonicznego przypadku z blokada destrukcyjna. | study case API tests | Architekt domeny |
| `GET /api/analysis-runs/{run_id}` | v12xx | aktywny | 2026-04-24 | - | Odczyt uruchomienia analizy. | analysis run tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/overlay` | v12xx | aktywny | 2026-04-24 | - | Dane nakladki SLD dla wyniku. | overlay contract tests | Architekt SLD |
| `GET /api/analysis-runs/{run_id}/results` | v12xx | aktywny | 2026-04-24 | - | Odczyt wynikow uruchomienia. | result contract tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/automation-trace` | v12xx | aktywny | 2026-04-25 | - | Slad automatyki i skutkow po zakloceniu dla stabilnosci dynamicznej. | canonical analysis API tests, report export tests | Architekt automatyki |
| `GET /api/analysis-runs/{run_id}/results/branches` | v12xx | aktywny | 2026-04-24 | - | Wyniki odcinkow dla SLD i tabel. | branch result tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/buses` | v12xx | aktywny | 2026-04-24 | - | Wyniki wezlow dla SLD i tabel. | bus result tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/dynamic-stability` | v12xx | aktywny | 2026-04-25 | - | Wyniki stabilnosci dynamicznej z proof i statusem raportowym. | canonical analysis API tests, report export tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/index` | v12xx | aktywny | 2026-04-24 | - | Indeks wynikow dla UI. | result index tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/phase-state` | v12xx | aktywny | 2026-04-25 | - | Wyniki stanu fazowego SN z proof i statusem raportowym. | canonical analysis API tests, report export tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/short-circuit` | v12xx | aktywny | 2026-04-24 | - | Wyniki zwarciowe dla raportu i SLD, razem z `proof_ref`, `proof_status` i `reporting_status` dla 1F/2F+Z. | short circuit result tests, report export tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/source-compliance` | v12xx | aktywny | 2026-04-25 | - | Wyniki zgodnosci zrodla z profilem operatora wraz z proof i raportowalnoscia. | canonical analysis API tests, report export tests | Architekt OZE |
| `GET /api/analysis-runs/{run_id}/results/trace` | v12xx | aktywny | 2026-04-24 | - | Slad danych wynikow. | trace tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}` | v12.6 | aktywny | 2026-05-24 | - | Odczyt wyniku akademickiego V12.6 bez zmiany frozen SC/PF API. | v126 academic API tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/proof` | v12.6 | aktywny | 2026-05-24 | - | Deterministyczny proof-pack V12.6 budowany w warstwie application z frozen result i trace. | v126 academic API tests | Architekt proof |
| `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/report` | v12.6 | aktywny | 2026-05-24 | - | Deterministyczny raport V12.6 budowany w warstwie application z frozen result i proof. | v126 academic API tests | Architekt raportow |
| `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/trace` | v12.6 | aktywny | 2026-05-24 | - | WHITE BOX trace wyniku akademickiego V12.6. | v126 academic API tests | Architekt proof |
| `GET /api/analysis-runs/{run_id}/snapshot` | v12xx | aktywny | 2026-04-24 | - | Migawka modelu uzyta do wyniku. | snapshot tests | Architekt ENM |
| `GET /api/analysis-runs/{run_id}/trace` | v12xx | aktywny | 2026-04-24 | - | Slad wykonania uruchomienia. | trace tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/trace/summary` | v12xx | aktywny | 2026-04-24 | - | Skrot sladu wykonania. | trace summary tests | Architekt wynikow |
| `GET /api/cases/{case_id}/analysis-eligibility` | v12xx | aktywny | 2026-04-24 | - | Zdolnosc uruchomienia analiz. | eligibility tests | Architekt walidacji |
| `GET /api/cases/{case_id}/diagnostics` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Diagnostyka przejsciowa modelu. | diagnostics tests | Architekt API |
| `GET /api/cases/{case_id}/diagnostics/preflight` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Diagnostyka przed obliczeniami. | diagnostics preflight tests | Architekt walidacji |
| `GET /api/cases/{case_id}/engineering-readiness` | v12xx | aktywny | 2026-04-24 | - | Agregowana gotowosc inzynierska. | readiness tests | Architekt walidacji |
| `GET /api/cases/{case_id}/enm` | v1 | adapter | 2026-04-24 | koniec M3 | Odczyt i migracja ENM v1 w M1/M2. | test migracji ENM v1->v2 | Architekt API |
| `GET /api/cases/{case_id}/enm/diff` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Porownanie ENM dla UI i audytu. | enm diff tests | Architekt ENM |
| `GET /api/cases/{case_id}/enm/field-view` | v12xx | aktywny | 2026-04-24 | - | Kanoniczny odczyt widoku pol SN z ENM. | field view tests | Architekt UI/UX |
| `GET /api/cases/{case_id}/enm/protection-view` | v12xx | aktywny | 2026-04-24 | - | Kanoniczny odczyt zabezpieczen z ENM. | protection view tests | Projektant zabezpieczen |
| `GET /api/cases/{case_id}/enm/readiness` | v12xx | aktywny | 2026-04-24 | - | Macierz gotowosci ENM. | readiness tests | Architekt walidacji |
| `GET /api/cases/{case_id}/enm/topology` | v12xx | aktywny | 2026-04-24 | - | Topologia dla SLD i inspektora. | topology tests | Architekt SLD |
| `GET /api/cases/{case_id}/enm/topology/summary` | v12xx | aktywny | 2026-04-24 | - | Podsumowanie topologii. | topology summary tests | Architekt SLD |
| `GET /api/cases/{case_id}/enm/v2-projection` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Odczytowa projekcja ENM v1 -> ENM v2.0; bez zapisu, z zachowaniem `ref_id`, wariantem bazowym i migawka lacznikowa. | test endpointu projekcji ENM v2 | Architekt migracji |
| `GET /api/cases/{case_id}/enm/validate` | v1 | adapter | 2026-04-24 | koniec M3 | Walidacja przejsciowa mapowana do severity V12.xx. | test severity mapping | Architekt API |
| `GET /api/cases/{case_id}/wizard/can-proceed` | legacy | deprecated | 2026-04-24 | koniec M2 | Przejscie kreatora utrzymane jako adapter odczytowy; kanoniczny zapis idzie przez operacje domenowe ENM. | wizard migration tests | Architekt migracji |
| `GET /api/cases/{case_id}/wizard/state` | legacy | deprecated | 2026-04-24 | koniec M2 | Stan kreatora; nie jest prawda domenowa. | wizard state tests | Architekt migracji |
| `GET /api/catalog/bess-inverter-types` | v12xx | aktywny | 2026-04-24 | - | Katalog falownikow BESS. | catalog tests | Administrator katalogow |
| `GET /api/catalog/branch-point-types` | v12xx | aktywny | 2026-04-24 | - | Katalog punktow rozgaleznych. | catalog tests | Administrator katalogow |
| `GET /api/catalog/cable-types` | v12xx | aktywny | 2026-04-24 | - | Katalog kabli SN. | catalog tests | Administrator katalogow |
| `GET /api/catalog/ct-types` | v12xx | aktywny | 2026-04-24 | - | Katalog przekladnikow pradowych. | catalog tests | Administrator katalogow |
| `GET /api/catalog/export` | v12xx | aktywny | 2026-04-24 | - | Eksport katalogow. | catalog export tests | Administrator katalogow |
| `GET /api/catalog/line-types` | v12xx | aktywny | 2026-04-24 | - | Katalog linii napowietrznych SN. | catalog tests | Administrator katalogow |
| `GET /api/catalog/load-types` | v12xx | aktywny | 2026-04-24 | - | Katalog obciazen. | catalog tests | Administrator katalogow |
| `GET /api/catalog/lv-apparatus-types` | v12xx | aktywny | 2026-04-24 | - | Katalog aparatow nN. | catalog tests | Administrator katalogow |
| `GET /api/catalog/lv-cable-types` | v12xx | aktywny | 2026-04-24 | - | Katalog kabli nN. | catalog tests | Administrator katalogow |
| `GET /api/catalog/mv-apparatus-types` | v12xx | aktywny | 2026-04-24 | - | Katalog aparatow SN. | catalog tests | Administrator katalogow |
| `GET /api/catalog/protection/curves` | v12xx | aktywny | 2026-04-24 | - | Krzywe zabezpieczeniowe. | protection catalog tests | Projektant zabezpieczen |
| `GET /api/catalog/protection/curves/{curve_id}` | v12xx | aktywny | 2026-04-24 | - | Rekord krzywej zabezpieczeniowej. | protection catalog tests | Projektant zabezpieczen |
| `GET /api/catalog/protection/device-types` | v12xx | aktywny | 2026-04-24 | - | Typy urzadzen zabezpieczeniowych. | protection catalog tests | Projektant zabezpieczen |
| `GET /api/catalog/protection/device-types/{device_type_id}` | v12xx | aktywny | 2026-04-24 | - | Rekord typu zabezpieczenia. | protection catalog tests | Projektant zabezpieczen |
| `GET /api/catalog/protection/export` | v12xx | aktywny | 2026-04-24 | - | Eksport katalogu zabezpieczen. | protection export tests | Projektant zabezpieczen |
| `GET /api/catalog/protection/templates` | v12xx | aktywny | 2026-04-24 | - | Szablony zabezpieczen. | protection template tests | Projektant zabezpieczen |
| `GET /api/catalog/protection/templates/{template_id}` | v12xx | aktywny | 2026-04-24 | - | Rekord szablonu zabezpieczen. | protection template tests | Projektant zabezpieczen |
| `GET /api/catalog/pv-inverter-types` | v12xx | aktywny | 2026-04-24 | - | Katalog falownikow PV. | catalog tests | Administrator katalogow |
| `GET /api/catalog/source-system-types` | v12xx | aktywny | 2026-04-24 | - | Katalog systemow zasilania i zrodel. | catalog tests | Administrator katalogow |
| `GET /api/catalog/switch-equipment-types` | v12xx | aktywny | 2026-04-24 | - | Katalog lacznikow. | catalog tests | Administrator katalogow |
| `GET /api/catalog/transformer-types` | v12xx | aktywny | 2026-04-24 | - | Katalog transformatorow. | catalog tests | Administrator katalogow |
| `GET /api/catalog/vt-types` | v12xx | aktywny | 2026-04-24 | - | Katalog przekladnikow napieciowych. | catalog tests | Administrator katalogow |
| `GET /api/catalog/v126/{namespace}` | v12.6 | aktywny | 2026-05-24 | - | Katalogi pomocnicze analiz akademickich V12.6. | v126 academic API tests | Administrator katalogow |
| `GET /api/ncrfg-tests/catalog` | v12.6 | aktywny | 2026-05-24 | - | Katalog testow procedury PTPiREE NC RfG oraz profile operatorow dla zakladki E-35/ncrfg-tests. | ncrfg ptpiree API tests | Architekt OZE |
| `GET /api/execution/fault-scenarios/{scenario_id}` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Odczyt scenariusza zakloceniowego. | execution tests | Architekt ruchowy |
| `GET /api/execution/fault-scenarios/{scenario_id}/eligibility` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Zdolnosc uruchomienia scenariusza zakloceniowego. | execution eligibility tests | Architekt ruchowy |
| `GET /api/execution/fault-scenarios/{scenario_id}/sld-overlay` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Nakladka SLD scenariusza zakloceniowego. | execution overlay tests | Architekt SLD |
| `GET /api/execution/runs/{run_id}` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Odczyt uruchomienia execution. | execution run tests | Architekt wynikow |
| `GET /api/execution/runs/{run_id}/results` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Wyniki execution. | execution result tests | Architekt wynikow |
| `GET /api/execution/runs/{run_id}/results/v1` | legacy | deprecated | 2026-04-24 | koniec M2 | Stary kontrakt wyniku execution. | legacy result tests | Architekt migracji |
| `GET /api/execution/study-cases/{case_id}/fault-scenarios` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Scenariusze zakloceniowe przypadku. | fault scenario tests | Architekt ruchowy |
| `GET /api/execution/study-cases/{case_id}/runs` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Uruchomienia execution dla przypadku. | execution run tests | Architekt wynikow |
| `GET /api/health` | v12xx | aktywny | 2026-04-24 | - | Healthcheck API. | health tests | Architekt API |
| `GET /api/projects` | v12xx | aktywny | 2026-04-24 | - | Lista projektow. | project API tests | Architekt API |
| `GET /api/projects/{project_id}` | v12xx | aktywny | 2026-04-24 | - | Odczyt projektu. | project API tests | Architekt API |
| `GET /api/projects/{project_id}/analysis-runs` | v12xx | aktywny | 2026-04-24 | - | Uruchomienia analiz projektu. | analysis run tests | Architekt wynikow |
| `GET /api/projects/{project_id}/analysis-runs/{run_id}/export/docx` | legacy | deprecated | 2026-04-25 | koniec M4 | Trasa zwraca `410` i zostaje tylko jako jawny komunikat migracyjny; produkcyjny eksport idzie przez execution/power-flow. | canonical only API tests | Architekt raportow |
| `GET /api/projects/{project_id}/analysis-runs/{run_id}/export/pdf` | legacy | deprecated | 2026-04-25 | koniec M4 | Trasa zwraca `410` i zostaje tylko jako jawny komunikat migracyjny; produkcyjny eksport idzie przez execution/power-flow. | canonical only API tests | Architekt raportow |
| `GET /api/proof/{project_id}/{case_id}/{run_id}/pack` | legacy | deprecated | 2026-04-25 | koniec M4 | Legacy GET proof-pack zwraca `410`; aktywny pozostaje tylko proof-pack zwarc asymetrycznych i kanoniczne eksporty StudyCase. | proof pack tests | Architekt proof |
| `GET /api/protection-engine/v1/curve-types` | legacy | usuniety | 2026-04-24 | 2026-04-25 | Stary endpoint typow krzywych silnika zabezpieczen zostal odciety z `api.main`; kanoniczne zabezpieczenia ida przez katalog i tory StudyCase. | canonical only API tests | Projektant zabezpieczen |
| `GET /api/cases/{case_id}/reference/compliance` | v12xx | aktywny | 2026-07-17 | - | Raport zgodnosci referencyjnej + Reference Score (Reference Engine V1, V12K-060). | tests/api/test_reference_engine_api.py | Architekt API |
| `GET /api/reference/packs` | v12xx | aktywny | 2026-07-17 | - | Lista pakietow referencyjnych (Reference Engine V1). | tests/api/test_reference_engine_api.py | Architekt API |
| `GET /api/reference/packs/{pack_id}` | v12xx | aktywny | 2026-07-17 | - | Pelny pakiet referencyjny (profile pol, slownik symboli). | tests/api/test_reference_engine_api.py | Architekt API |
| `GET /api/reference-patterns/fixtures/{fixture_file}` | v12xx | aktywny | 2026-04-24 | - | Fixture sieci wzorcowych. | reference pattern tests | Architekt testow |
| `GET /api/reference-patterns/fixtures/{fixture_file}/export/docx` | v12xx | aktywny | 2026-04-24 | - | Eksport DOCX fixture. | reference export tests | Architekt testow |
| `GET /api/reference-patterns/fixtures/{fixture_file}/export/pdf` | v12xx | aktywny | 2026-04-24 | - | Eksport PDF fixture. | reference export tests | Architekt testow |
| `GET /api/reference-patterns/patterns` | v12xx | aktywny | 2026-04-24 | - | Lista wzorcow referencyjnych. | reference pattern tests | Architekt testow |
| `GET /api/reference-patterns/patterns/{pattern_id}/fixtures` | v12xx | aktywny | 2026-04-24 | - | Fixture wzorca referencyjnego. | reference pattern tests | Architekt testow |
| `GET /api/result-contract/schema` | v12xx | aktywny | 2026-04-24 | - | Schemat kontraktu wyniku. | result contract tests | Architekt wynikow |
| `GET /api/solver-capabilities` | v12xx | aktywny | 2026-04-27 | - | Kanoniczny kontrakt zdolnosci solverow: typ analizy, proof, raportowalnosc i status implementacji. | advanced solver capability registry tests | Architekt solverow |
| `GET /api/solver-capabilities/analysis-type/{analysis_type}` | v12xx | aktywny | 2026-04-27 | - | Zdolnosci solverow filtrowane po typie analizy dla UI i raportow. | advanced solver capability registry tests | Architekt solverow |
| `GET /api/solver-capabilities/{capability}` | v12xx | aktywny | 2026-04-27 | - | Szczegol pojedynczej zdolnosci solvera z proof support i statusem raportowym. | advanced solver capability registry tests | Architekt solverow |
| `GET /api/study-cases/project/{project_id}` | v12xx | aktywny | 2026-04-24 | - | Przypadki projektu. | study case tests | Architekt domeny |
| `GET /api/study-cases/project/{project_id}/active` | v12xx | aktywny | 2026-04-24 | - | Aktywny przypadek projektu. | study case tests | Architekt domeny |
| `GET /api/study-cases/project/{project_id}/count` | v12xx | aktywny | 2026-04-24 | - | Liczba przypadkow projektu. | study case tests | Architekt domeny |
| `GET /api/study-cases/{case_id}` | v12xx | aktywny | 2026-04-24 | - | Odczyt przypadku. | study case tests | Architekt domeny |
| `GET /api/study-cases/{case_id}/can-calculate` | v12xx | aktywny | 2026-04-24 | - | Gotowosc przypadku do obliczen. | can-calculate tests | Architekt walidacji |
| `GET /api/study-cases/{case_id}/protection-config` | v12xx | aktywny | 2026-04-24 | - | Konfiguracja zabezpieczen przypadku. | protection config tests | Projektant zabezpieczen |
| `GET /api/study-cases/{case_id}/sld-overrides` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Przejscie geometrii SLD; nie jest prawda domenowa. | sld override tests | Architekt SLD |
| `GET /api/switchgear/{station_id}/config` | v12xx | aktywny | 2026-04-24 | - | Konfiguracja rozdzielnicy. | switchgear tests | Architekt SLD |
| `PATCH /api/study-cases/{case_id}` | v12xx | aktywny | 2026-04-24 | - | Aktualizacja przypadku. | study case update tests | Architekt domeny |
| `POST /api/cases/{case_id}/enm/domain-ops` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Walidowane operacje domenowe ENM v1, docelowo single-write ENM v2. | domain ops tests | Architekt ENM |
| `POST /api/cases/{case_id}/runs/power-flow` | v12xx | aktywny | 2026-04-24 | - | Uruchomienie rozplywu mocy. | power flow run tests | Architekt solverow |
| `POST /api/cases/{case_id}/runs/short-circuit` | v12xx | aktywny | 2026-04-24 | - | Uruchomienie obliczen zwarciowych; whitelistuje `fault_type`, `short_circuit_type`, `c_factor`, `thermal_time_seconds`, ignoruje draft ENM i zwraca status dowodowy oraz raportowy dla 1F/2F+Z. | short circuit run tests, draft isolation tests | Architekt solverow |
| `POST /api/cases/{case_id}/runs/v126/{analysis_type}` | v12.6 | aktywny | 2026-05-24 | - | Uruchomienie analizy akademickiej V12.6 z committed ENM i parametrami przypadku. | v126 academic API tests | Architekt solverow |
| `POST /api/catalog/import` | v12xx | aktywny | 2026-04-24 | - | Import katalogow. | catalog import tests | Administrator katalogow |
| `POST /api/catalog/protection/import` | v12xx | aktywny | 2026-04-24 | - | Import katalogu zabezpieczen. | protection import tests | Projektant zabezpieczen |
| `POST /api/comparison/runs` | v12xx | aktywny | 2026-04-24 | - | Porownanie uruchomien. | comparison tests | Architekt wynikow |
| `POST /api/equipment-proof/pack` | v12xx | aktywny | 2026-04-24 | - | Pakiet uzasadnienia dla aparatury. | equipment proof tests | Architekt proof |
| `POST /api/ncrfg-tests/run` | v12.6 | aktywny | 2026-05-24 | - | Deterministyczne uruchomienie pakietu symulacji zgodnosci PTPiREE NC RfG dla DER z trace, proof i raportem PL. | ncrfg ptpiree solver/API tests | Architekt solverow |
| `POST /api/execution/fault-scenarios/{scenario_id}/runs` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Uruchomienie scenariusza zakloceniowego. | execution tests | Architekt ruchowy |
| `POST /api/execution/runs/{run_id}/execute` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Wykonanie runu execution. | execution tests | Architekt ruchowy |
| `POST /api/execution/study-cases/{case_id}/fault-scenarios` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Utworzenie scenariusza zakloceniowego. | fault scenario tests | Architekt ruchowy |
| `POST /api/execution/study-cases/{case_id}/runs` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Utworzenie runu execution. | execution tests | Architekt ruchowy |
| `POST /api/import/xlsx` | v12xx | aktywny | 2026-04-24 | - | Import XLSX do modelu. | xlsx import tests | Architekt migracji |
| `POST /api/projects` | v12xx | aktywny | 2026-04-24 | - | Utworzenie projektu. | project API tests | Architekt API |
| `POST /api/proof/sc-asymmetrical/pack` | v12xx | aktywny | 2026-04-24 | - | Proof-pack dla zwarc asymetrycznych. | asym proof tests | Architekt proof |
| `POST /api/proof/sc3f/pack` | v12xx | aktywny | 2026-07-19 | - | Proof-pack dla zwarcia symetrycznego 3F z fizyka serwerowa ze snapshotu ENM i rozbiciem maszynowym mu/q/i_b dla maszyn wirujacych. | sc3f pack tests, proof pack API tests | Architekt proof |
| `POST /api/protection-engine/v1/curve-time` | legacy | usuniety | 2026-04-24 | 2026-04-25 | Stary endpoint czasu krzywej zabezpieczenia zostal odciety z `api.main`; obliczenia zabezpieczeniowe pozostaja w domenie i raportach kanonicznych. | canonical only API tests | Projektant zabezpieczen |
| `POST /api/protection-engine/v1/execute` | legacy | usuniety | 2026-04-24 | 2026-04-25 | Stary endpoint wykonania silnika zabezpieczen zostal odciety z `api.main`; publiczny tor nie moze tworzyc drugiej prawdy wynikow EAZ. | canonical only API tests | Projektant zabezpieczen |
| `POST /api/protection-engine/v1/validate` | legacy | usuniety | 2026-04-24 | 2026-04-25 | Stary endpoint walidacji silnika zabezpieczen zostal odciety z `api.main`; walidacje publiczne ida przez wspolny kontrakt severity i gotowosc. | canonical only API tests | Projektant zabezpieczen |
| `POST /api/reference-patterns/run` | v12xx | aktywny | 2026-04-24 | - | Uruchomienie wzorca referencyjnego. | reference pattern tests | Architekt testow |
| `POST /api/solver/shunt-compensator-preview` | v12xx | aktywny | 2026-07-18 | - | Podglad baterii kondensatorow SN (Q, prad, moc) z backendu bez zmiany frozen result; zasila kreator kompensacji. | shunt compensator preview tests | Architekt solverow |
| `POST /api/study-cases` | v12xx | aktywny | 2026-04-24 | - | Utworzenie przypadku. | study case tests | Architekt domeny |
| `POST /api/study-cases/activate` | v12xx | aktywny | 2026-04-24 | - | Aktywacja przypadku. | study case tests | Architekt domeny |
| `POST /api/study-cases/compare` | v12xx | aktywny | 2026-04-24 | - | Porownanie przypadkow. | comparison tests | Architekt wynikow |
| `POST /api/study-cases/project/{project_id}/invalidate-all` | v12xx | aktywny | 2026-04-24 | - | Globalna invalidacja przypadkow projektu. | invalidation tests | Architekt wynikow |
| `POST /api/study-cases/{case_id}/clone` | v12xx | aktywny | 2026-04-24 | - | Klonowanie przypadku. | study case tests | Architekt domeny |
| `POST /api/study-cases/{case_id}/invalidate` | v12xx | aktywny | 2026-04-24 | - | Invalidacja przypadku. | invalidation tests | Architekt wynikow |
| `POST /api/study-cases/{case_id}/sld-overrides/reset` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Reset geometrii SLD. | sld override tests | Architekt SLD |
| `POST /api/study-cases/{case_id}/sld-overrides/validate` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Walidacja override SLD. | sld override tests | Architekt SLD |
| `POST /api/switchgear/{station_id}/validate` | v12xx | aktywny | 2026-04-24 | - | Walidacja rozdzielnicy. | switchgear tests | Architekt SLD |
| `PUT /api/execution/fault-scenarios/{scenario_id}` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Aktualizacja scenariusza zakloceniowego. | fault scenario tests | Architekt ruchowy |
| `PUT /api/study-cases/{case_id}/protection-config` | v12xx | aktywny | 2026-04-24 | - | Zapis konfiguracji zabezpieczen. | protection config tests | Projektant zabezpieczen |
| `PUT /api/study-cases/{case_id}/sld-overrides` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Zapis override SLD; docelowo kontrolowany przez warstwe geometrii. | sld override tests | Architekt SLD |
| `PUT /api/switchgear/{station_id}/config` | v12xx | aktywny | 2026-04-24 | - | Zapis konfiguracji rozdzielnicy. | switchgear tests | Architekt SLD |
| `GET /api/oze-analysis/grid-strength` | v12xx | aktywny | 2026-07-17 | - | Sila sieci SCR/WSCR dla zrodel falownikowych (D1). | grid strength tests | Architekt OZE |
| `GET /api/oze-analysis/reactive-adequacy` | v12xx | aktywny | 2026-07-17 | - | Adekwatnosc mocy biernej ukladu (D1). | reactive adequacy tests | Architekt OZE |
| `GET /api/oze-analysis/hosting-capacity` | v12xx | aktywny | 2026-07-17 | - | Zdolnosc przylaczeniowa wezla (D3). | hosting capacity tests | Architekt OZE |
| `GET /api/oze-analysis/pq-area` | v12xx | aktywny | 2026-07-17 | - | Obszar PQ modulu wytworczego (D5). | pq area tests | Architekt OZE |
| `GET /api/oze-analysis/pq-coverage` | v12xx | aktywny | 2026-07-17 | - | Pokrycie wymagan PQ operatora (D4). | pq coverage tests | Architekt OZE |
| `GET /api/oze-analysis/frt-trajectories` | v12xx | aktywny | 2026-07-17 | - | Trajektorie FRT/HVRT modulu DER (D6). | frt trajektorie tests | Architekt OZE |
| `GET /api/oze-analysis/frt-sequence` | v12xx | aktywny | 2026-07-17 | - | Sekwencje zapadow FRT z kontekstem sily sieci (D9). | frt sequence tests | Architekt OZE |
| `GET /api/oze-analysis/lom-protection` | v12xx | aktywny | 2026-07-17 | - | Ochrona przed praca wyspowa LoM (D10). | lom protection tests | Architekt OZE |
| `GET /api/oze-analysis/osd-response` | v12xx | aktywny | 2026-07-17 | - | Ocena odpowiedzi na polecenie OSD (D7). | osd response tests | Architekt OZE |
| `GET /api/oze-analysis/compensation-sizing` | v12xx | aktywny | 2026-07-17 | - | Dobor kompensacji mocy biernej z katalogu (D8/K2, cosfi punktu). | dobor kompensacji tests | Architekt OZE |
| `POST /api/oze-analysis/compliance-certificate` | v12xx | aktywny | 2026-07-17 | - | Certyfikat zgodnosci projektu NC RfG (JSON, D14). | certyfikat zgodnosci tests | Architekt OZE |
| `POST /api/oze-analysis/compliance-certificate.docx` | v12xx | aktywny | 2026-07-17 | - | Certyfikat zgodnosci NC RfG (DOCX deterministyczny, D14). | certyfikat zgodnosci tests | Architekt OZE |
| `POST /api/oze-analysis/compliance-certificate.pdf` | v12xx | aktywny | 2026-07-17 | - | Certyfikat zgodnosci NC RfG (PDF deterministyczny, D16). | certyfikat zgodnosci tests | Architekt OZE |
| `POST /api/oze-analysis/osd-application` | v12xx | aktywny | 2026-07-17 | - | Generator wniosku OSD (JSON, D15). | wniosek osd tests | Architekt OZE |
| `POST /api/oze-analysis/osd-application.docx` | v12xx | aktywny | 2026-07-17 | - | Wniosek OSD (DOCX deterministyczny, D15). | wniosek osd tests | Architekt OZE |
| `POST /api/oze-analysis/osd-application.pdf` | v12xx | aktywny | 2026-07-17 | - | Wniosek OSD (PDF deterministyczny, D16). | wniosek osd tests | Architekt OZE |
| `POST /api/oze-analysis/connection-study` | v12xx | aktywny | 2026-07-17 | - | Dokument studium przylaczeniowego (JSON, D17). | dokument studium tests | Architekt OZE |
| `POST /api/oze-analysis/connection-study.docx` | v12xx | aktywny | 2026-07-17 | - | Dokument studium (DOCX deterministyczny, D17). | dokument studium tests | Architekt OZE |
| `POST /api/oze-analysis/connection-study.pdf` | v12xx | aktywny | 2026-07-17 | - | Dokument studium (PDF deterministyczny, D17). | dokument studium tests | Architekt OZE |
| `GET /api/quality/sanity-bounds` | v12xx | aktywny | 2026-07-17 | - | Wiarygodnosc Ik'' per wezel (D2). | quality analysis tests | Architekt jakosci |
| `GET /api/quality/energy-validation` | v12xx | aktywny | 2026-07-17 | - | Walidacja energetyczna rozplywu (D2). | quality analysis tests | Architekt jakosci |
| `GET /api/quality/flicker` | v12xx | aktywny | 2026-07-17 | - | Migotanie i szybkie zmiany napiecia IEC 61000-3-7 (D11). | migotanie tests | Architekt jakosci |
| `POST /api/quality/as-built-compliance` | v12xx | aktywny | 2026-07-17 | - | Raport zgodnosci powykonawczej z pomiarow (D12). | zgodnosc powykonawcza tests | Architekt jakosci |
| `POST /api/quality/arc-flash` | v12xx | aktywny | 2026-07-20 | - | Arc Flash IEEE 1584-2018 (energia incydentu, granica luku, kategoria PPE) per wezel z przebiegu zwarciowego; Ik''/U z przebiegu, parametry projektowe z zadania. Audyt V12K-059 poz. A. | arc flash view/API tests | Architekt jakosci |
| `POST /api/quality/arc-flash/report` | v12xx | aktywny | 2026-07-20 | - | Raport arc flash (json/text_pl/latex) z widoku IEEE 1584; podsumowanie najgorszego przypadku + rozklad SOI. ZERO fizyki (interpretacja widoku). V12K-074. | arc flash report/API tests | Architekt jakosci |
| `POST /api/quality/arc-flash/report.pdf` | v12xx | aktywny | 2026-07-20 | - | Raport arc flash PDF (reportlab, deterministyczny) do pobrania. V12K-074. | arc flash report/API tests | Architekt jakosci |
| `POST /api/quality/arc-flash/report.docx` | v12xx | aktywny | 2026-07-20 | - | Raport arc flash DOCX (python-docx, deterministyczny) do pobrania. V12K-074. | arc flash report/API tests | Architekt jakosci |

## Blokada wdrozeniowa

Nowy endpoint bez wpisu w tej macierzy blokuje zamkniecie PR.

## Uzupelnienie lifecycle po scaleniu PR 462

Data wejscia statusow: 2026-05-24.

| Endpoint | Wersja | Status | Data wejscia | Data wylaczenia | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|---|---|
| `DELETE /api/v1/projects/{project_id}/audit2-station-config/{station_id:path}` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Usuniecie konfiguracji stacji audit2 w przejsciowym API konfiguratora. | audit2 station config tests | Architekt API |
| `GET /api/analysis-runs/{run_id}/export/proof/json` | v12xx | aktywny | 2026-05-24 | - | Eksport uzasadnienia w JSON z frozen proof. | analysis run export tests | Architekt proof |
| `GET /api/analysis-runs/{run_id}/export/proof/latex` | v12xx | aktywny | 2026-05-24 | - | Eksport uzasadnienia w LaTeX z frozen proof. | analysis run export tests | Architekt proof |
| `GET /api/analysis-runs/{run_id}/export/proof/pdf` | v12xx | aktywny | 2026-05-24 | - | Eksport uzasadnienia PDF z frozen proof. | analysis run export tests | Architekt proof |
| `GET /api/analysis-runs/{run_id}/export/report/docx` | v12xx | aktywny | 2026-05-24 | - | Eksport raportu DOCX z wyniku i uzasadnienia. | analysis run export tests | Architekt raportow |
| `GET /api/analysis-runs/{run_id}/export/report/json` | v12xx | aktywny | 2026-05-24 | - | Eksport raportu JSON z wyniku i uzasadnienia. | analysis run export tests | Architekt raportow |
| `GET /api/analysis-runs/{run_id}/export/report/pdf` | v12xx | aktywny | 2026-05-24 | - | Eksport raportu PDF z wyniku i uzasadnienia. | analysis run export tests | Architekt raportow |
| `GET /api/cases/{case_id}/analysis/eligibility` | v12xx | aktywny | 2026-05-24 | - | Zdolnosc uruchomienia analiz w widoku solver input. | solver input tests | Architekt walidacji |
| `GET /api/cases/{case_id}/analysis/solver-input/{analysis_type}` | v12xx | aktywny | 2026-05-24 | - | Audytowalny podglad wejscia solvera dla typu analizy. | solver input tests | Architekt solverow |
| `GET /api/station-templates` | v12xx | aktywny | 2026-05-24 | - | Lista szablonow stacji. | station template tests | Architekt stacji |
| `GET /api/station-templates/categories` | v12xx | aktywny | 2026-05-24 | - | Kategorie szablonow stacji. | station template tests | Architekt stacji |
| `GET /api/station-templates/{template_id}` | v12xx | aktywny | 2026-05-24 | - | Szczegol szablonu stacji. | station template tests | Architekt stacji |
| `GET /api/v1/catalog/audit2/bess-operation-modes` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Katalog trybow pracy BESS dla audit2. | audit2 catalog tests | Administrator katalogow |
| `GET /api/v1/catalog/audit2/block-transformers` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Katalog transformatorow blokowych audit2. | audit2 catalog tests | Administrator katalogow |
| `GET /api/v1/catalog/audit2/device-withstand` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Katalog wytrzymalosci aparatury audit2. | audit2 catalog tests | Administrator katalogow |
| `GET /api/v1/catalog/audit2/hv-fuses` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Katalog bezpiecznikow WN audit2. | audit2 catalog tests | Administrator katalogow |
| `GET /api/v1/catalog/audit2/mv-neutral-groundings` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Katalog uziemien punktu neutralnego SN audit2. | audit2 catalog tests | Administrator katalogow |
| `GET /api/v1/catalog/audit2/pf-curves` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Katalog krzywych cos phi/P audit2. | audit2 catalog tests | Administrator katalogow |
| `GET /api/v1/catalog/audit2/snapshot` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Snapshot katalogow audit2. | audit2 catalog tests | Administrator katalogow |
| `GET /api/v1/catalog/audit2/tap-changers` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Katalog przelacznikow zaczepow audit2. | audit2 catalog tests | Administrator katalogow |
| `GET /api/v1/projects/{project_id}/audit2-station-config` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Lista konfiguracji stacji audit2. | audit2 station config tests | Architekt stacji |
| `GET /api/v1/projects/{project_id}/audit2-station-config/{station_id:path}` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Odczyt konfiguracji stacji audit2. | audit2 station config tests | Architekt stacji |
| `GET /api/v1/reference-networks` | v12xx | aktywny | 2026-05-24 | - | Lista sieci referencyjnych i benchmarkow. | reference network tests | Architekt testow |
| `GET /api/v1/reference-networks/{network_id}` | v12xx | aktywny | 2026-05-24 | - | Szczegol sieci referencyjnej. | reference network tests | Architekt testow |
| `GET /api/v1/reference-networks/{network_id}/export/json` | v12xx | aktywny | 2026-05-24 | - | Eksport sieci referencyjnej JSON. | reference network tests | Architekt testow |
| `GET /api/v1/reference-networks/{network_id}/export/pdf` | v12xx | aktywny | 2026-05-24 | - | Eksport sieci referencyjnej PDF. | reference network tests | Architekt raportow |
| `GET /api/v1/reference-networks/{network_id}/nc-rfg-compliance` | v12xx | aktywny | 2026-05-24 | - | Ocena zgodnosci NC RfG dla sieci referencyjnej. | reference network tests | Architekt OZE |
| `PATCH /api/projects/{project_id}` | v12xx | aktywny | 2026-05-24 | - | Aktualizacja metadanych projektu. | project API tests | Architekt API |
| `POST /api/cases/audit2-power-flow` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Przejsciowy tor rozplywu audit2. | solver input tests | Architekt solverow |
| `POST /api/fault-loop/compute` | v12xx | aktywny | 2026-05-24 | - | Obliczenie petli zwarcia IEC 60364. | fault loop tests | Architekt solverow |
| `POST /api/projects/{project_id}/cases/{case_id}/generators` | v12xx | aktywny | 2026-05-24 | - | Zapis zrodla/generatora do przypadku przez API projektowe. | generator API tests | Architekt OZE |
| `POST /api/runs/power-flow` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Przejsciowe uruchomienie rozplywu przez unified runs. | unified run tests | Architekt API |
| `POST /api/runs/protection` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Przejsciowe uruchomienie zabezpieczen przez unified runs. | unified run tests | Projektant zabezpieczen |
| `POST /api/runs/short-circuit` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Przejsciowe uruchomienie zwarc przez unified runs. | unified run tests | Architekt API |
| `POST /api/solver/cable-rated-current-preview` | v12xx | aktywny | 2026-07-18 | - | Podglad pradu znamionowego kabla z mocy przylaczeniowej bez mutacji modelu. | cable voltage drop preview tests | Architekt solverow |
| `POST /api/solver/cable-voltage-drop-preview` | v12xx | aktywny | 2026-07-18 | - | Podglad spadku napiecia na kablu SN bez mutacji modelu. | cable voltage drop preview tests | Architekt solverow |
| `POST /api/solver/grid-source-preview` | v12xx | aktywny | 2026-05-24 | - | Podglad parametrow zrodla GPZ bez mutacji modelu. | grid source preview tests | Architekt solverow |
| `POST /api/solver/transformer-rated-currents-preview` | v12xx | aktywny | 2026-07-18 | - | Podglad pradow znamionowych transformatora (I1/I2 z mocy znamionowej) bez mutacji modelu. | transformer rated currents preview tests | Architekt solverow |
| `POST /api/station-templates/{template_id}/apply` | v12xx | aktywny | 2026-05-24 | - | Zastosowanie szablonu stacji przez operacje domenowe. | station template tests | Architekt stacji |
| `POST /api/station-templates/{template_id}/preview` | v12xx | aktywny | 2026-05-24 | - | Podglad skutkow szablonu stacji bez zapisu. | station template tests | Architekt stacji |
| `POST /api/v1/catalog/audit2/build-station-payload` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Budowa payloadu konfiguracji stacji audit2. | audit2 catalog tests | Architekt stacji |
| `POST /api/v1/catalog/audit2/generate-proof-pack` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Generacja pakietu dowodowego audit2. | audit2 proof tests | Architekt proof |
| `POST /api/v1/catalog/audit2/generate-report` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Generacja raportu audit2 z danych kanonicznych. | audit2 report tests | Architekt raportow |
| `POST /api/v1/catalog/audit2/validate-device-withstand` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Walidacja wytrzymalosci aparatury audit2. | audit2 catalog tests | Architekt solverow |
| `POST /api/v1/catalog/audit2/validate-hosting-capacity-export` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Walidacja eksportu hosting capacity audit2. | audit2 catalog tests | Architekt OZE |
| `POST /api/v1/catalog/audit2/validate-vt-grounding` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Walidacja uziemienia przekladnikow napieciowych audit2. | audit2 catalog tests | Architekt uziemien |
| `POST /api/v1/projects/{project_id}/audit2-station-config/_validate-all` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Walidacja wszystkich konfiguracji stacji audit2. | audit2 station config tests | Architekt stacji |
| `POST /api/v1/projects/{project_id}/audit2-station-config/{station_id:path}/_apply-to-network-model` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Zastosowanie konfiguracji audit2 do modelu domenowego. | audit2 station config tests | Architekt ENM |
| `POST /api/v1/reference-networks/similarity-match` | v12xx | aktywny | 2026-05-24 | - | Dopasowanie podobienstwa sieci do benchmarku. | reference network tests | Architekt testow |
| `POST /api/v1/reference-networks/{network_id}/run` | v12xx | aktywny | 2026-05-24 | - | Uruchomienie analiz dla sieci referencyjnej. | reference network tests | Architekt testow |
| `POST /api/v1/reference-networks/{network_id}/validate` | v12xx | aktywny | 2026-05-24 | - | Walidacja sieci referencyjnej. | reference network tests | Architekt testow |
| `POST /api/v1/reference-networks/{network_id}/validate-dynamic` | v12xx | aktywny | 2026-05-24 | - | Walidacja dynamiczna sieci referencyjnej. | reference network tests | Architekt testow |
| `PUT /api/v1/projects/{project_id}/audit2-station-config/{station_id:path}` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Zapis konfiguracji stacji audit2. | audit2 station config tests | Architekt stacji |
