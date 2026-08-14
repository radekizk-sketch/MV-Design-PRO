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
| `GET /api/analysis-runs/{run_id}/pakiet-dowodowy` | v12xx | aktywny | 2026-08-07 | - | Pakiet dowodowy przebiegu (ZIP: dowod, zrodlo LaTeX, wykaz plikow, odcisk); rodzaj pakietu z danych biegu. Rodzaje zwarciowe przyjmuja `punkt` = punkt zwarcia (wymagany). Pakiet rozplywu jest ZBIORCZY (rozplyw + straty + spadek napiecia) i przyjmuje `punkt` = ODCINEK linii/kabla, NIEOBOWIAZKOWO: brak odcinkow w biegu nie odbiera bilansu mocy, a odcinek spoza biegu = 422 (karta PACK-BEZ-KONSUMENTA, 2026-08-08). | pakiet dowodowy biegu API tests | Architekt dowodow |
| `GET /api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc` | v12xx | aktywny | 2026-08-07 | - | Dostepnosc pakietu dowodowego przebiegu: rodzaj, punkty wyboru (punkty zwarcia albo odcinki linii/kabla — zaleznie od rodzaju), `punkty_etykieta_pl` (jak SERWER nazywa ten wybor; pole ADDYTYWNE od 2026-08-08), opis zawartosci zalezny od danych biegu, powod braku PL. | pakiet dowodowy biegu API tests | Architekt dowodow |
| `GET /api/analysis-runs/{run_id}/pakiet-dowodowy-nastaw` | v12xx | aktywny | 2026-08-13 | - | Pakiet dowodowy nastaw zabezpieczen I>/I>> (ZIP): kotwica `run_id` musi byc zakonczonym zwarciem trojfazowym gałęzi maksymalnej (c_max); serwer sam liczy w pamieci wariant zwarcia 3F i 2F przy `c_min` oraz wariant rozplywu na TEJ SAMEJ migawce (karta PACK-NASTAWY, domkniecie PACK-DLUG-NASTAWY). Wymagane parametry: `linia` (chroniony odcinek), `nastepna_szyna` (szyna warunku selektywnosci); opcjonalne: `c_min` (domyslnie 1.0), `delta_t_s`, `k_b`, `k_bth`. Brak danych = 422 z powodem PL. | protection settings batch run tests | Architekt dowodow |
| `GET /api/analysis-runs/{run_id}/pakiet-dowodowy-nastaw/dostepnosc` | v12xx | aktywny | 2026-08-13 | - | Dostepnosc pakietu nastaw dla przebiegu-kotwicy: lista linii/kabli z kompletem danych katalogowych (przekroj, material, prad znamionowy) i dla kazdej — kandydujace szyny kolejnej strefy selektywnosci. Wybor nalezy do inzyniera. | protection settings batch run tests | Architekt dowodow |
| `GET /api/analysis-runs/{run_id}/overlay` | v12xx | aktywny | 2026-04-24 | - | Dane nakladki SLD dla wyniku. | overlay contract tests | Architekt SLD |
| `GET /api/analysis-runs/{run_id}/results` | v12xx | aktywny | 2026-04-24 | - | Odczyt wynikow uruchomienia. | result contract tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/automation-trace` | v12xx | aktywny | 2026-04-25 | - | Slad automatyki i skutkow po zakloceniu dla stabilnosci dynamicznej. | canonical analysis API tests, report export tests | Architekt automatyki |
| `GET /api/analysis-runs/{run_id}/results/branches` | v12xx | aktywny | 2026-04-24 | - | Wyniki odcinkow dla SLD i tabel. | branch result tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/buses` | v12xx | aktywny | 2026-04-24 | - | Wyniki wezlow dla SLD i tabel. | bus result tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/dynamic-stability` | v12xx | aktywny | 2026-04-25 | - | Wyniki stabilnosci dynamicznej z proof i statusem raportowym. | canonical analysis API tests, report export tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/dynamic-stability/time-series` | v12xx | aktywny | 2026-07-22 | - | Przebieg czasowy U(t)/f(t) biegu stabilnosci (na zadanie, addytywnie; ST-1/V12K-130). | dynamic stability time-series API tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/index` | v12xx | aktywny | 2026-04-24 | - | Indeks wynikow dla UI. | result index tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/phase-state` | v12xx | aktywny | 2026-04-25 | - | Wyniki stanu fazowego SN z proof i statusem raportowym. | canonical analysis API tests, report export tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/short-circuit` | v12xx | aktywny | 2026-04-24 | - | Wyniki zwarciowe dla raportu i SLD, razem z `proof_ref`, `proof_status` i `reporting_status` dla 1F/2F+Z. | short circuit result tests, report export tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/short-circuit/rozplyw` | v12xx | aktywny | 2026-07-30 | - | Rozplyw galeziowy JEDNEGO punktu zwarcia na zadanie (`target_id` w zapytaniu) - wiersze zbiorcze nie niosa juz rozplywu (V12K-281/K13). | short circuit rozplyw API tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/source-compliance` | v12xx | aktywny | 2026-04-25 | - | Wyniki zgodnosci zrodla z profilem operatora wraz z proof i raportowalnoscia. | canonical analysis API tests, report export tests | Architekt OZE |
| `GET /api/analysis-runs/{run_id}/results/trace` | v12xx | aktywny | 2026-04-24 | - | Slad danych wynikow. | trace tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/results/v126/ssci_impedance/stability` | v12.6 | aktywny | 2026-07-21 | - | Werdykt stabilnosci SSCI (kryterium impedancyjne Nyquista, Sun 2011 / Wen 2016) z gotowego przebiegu ssci_impedance; warstwa analizy interpretuje frozen wynik solvera (ZERO fizyki w API). | v126 SSCI stability API tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}` | v12.6 | aktywny | 2026-05-24 | - | Odczyt wyniku akademickiego V12.6 bez zmiany frozen SC/PF API. | v126 academic API tests | Architekt solverow |
| `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/proof` | v12.6 | aktywny | 2026-05-24 | - | Deterministyczny proof-pack V12.6 budowany w warstwie application z frozen result i trace. | v126 academic API tests | Architekt proof |
| `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/report` | v12.6 | aktywny | 2026-05-24 | - | Deterministyczny raport V12.6 budowany w warstwie application z frozen result i proof. | v126 academic API tests | Architekt raportow |
| `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/trace` | v12.6 | aktywny | 2026-05-24 | - | WHITE BOX trace wyniku akademickiego V12.6. | v126 academic API tests | Architekt proof |
| `GET /api/analysis-runs/{run_id}/snapshot` | v12xx | aktywny | 2026-04-24 | - | Migawka modelu uzyta do wyniku. | snapshot tests | Architekt ENM |
| `GET /api/analysis-runs/{run_id}/trace` | v12xx | aktywny | 2026-04-24 | - | Slad wykonania uruchomienia. | trace tests | Architekt wynikow |
| `GET /api/analysis-runs/{run_id}/trace/summary` | v12xx | aktywny | 2026-04-24 | - | Skrot sladu wykonania. | trace summary tests | Architekt wynikow |
| `GET /api/cases/{case_id}/analysis-eligibility` | v12xx | aktywny | 2026-04-24 | - | Zdolnosc uruchomienia analiz. | eligibility tests | Architekt walidacji |
| `GET /api/cases/{case_id}/diagnostics` | v12xx | aktywny | 2026-04-24 | - | Diagnostyka modelu przypadku (D7: promocja z adaptera do kanonu — powierzchnia „Diagnoza przebiegu" konsumuje ja produkcyjnie). | tests/api/test_diagnoza_przebiegu_api.py | Architekt API |
| `GET /api/cases/{case_id}/diagnostics/preflight` | v12xx | aktywny | 2026-04-24 | - | Kontrola przed obliczeniem — macierz dostepnosci analiz (D7: promocja z adaptera do kanonu). | tests/api/test_diagnoza_przebiegu_api.py | Architekt walidacji |
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
| `GET /api/catalog/bay-apparatus-kinds` | v12xx | aktywny | 2026-08-13 | - | Rodzaje aparatu glownego dopuszczalne dla rol pol SN (readout kreatora stacji; jedno zrodlo prawdy BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE, karta KOMPLETNOSC-POLA-TR). | catalog tests | Administrator katalogow |
| `GET /api/catalog/bay-protection-codes` | v12xx | aktywny | 2026-07-30 | - | Kanoniczne funkcje zabezpieczeniowe wymagane dla rol pol SN (readout kreatora stacji; jedno zrodlo prawdy z operacjami domenowymi, K9-B). | catalog tests | Administrator katalogow |
| `GET /api/catalog/mv-protection-device-types` | v12xx | aktywny | 2026-07-30 | - | Zabezpieczenia z kanonicznego katalogu MV (przestrzen ZABEZPIECZENIE) - te same pozycje, ktore przyjmuje brama katalogowa `add_relay` (K9-B). | catalog tests | Administrator katalogow |
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
| `GET /api/catalog/v126/{namespace}` | v12.6 | aktywny | 2026-05-24 | - | Katalogi pomocnicze analiz akademickich V12.6; konsument: `ui2/wyniki/akademickie` (lista rodzajow + sekcja danych odniesienia). | v126 academic API tests | Administrator katalogow |
| `GET /api/ncrfg-tests/catalog` | v12.6 | aktywny | 2026-05-24 | - | Katalog testow procedury PTPiREE NC RfG oraz profile operatorow dla zakladki E-35/ncrfg-tests. | ncrfg ptpiree API tests | Architekt OZE |
| `GET /api/ncrfg-tests/cases/{case_id}/compliance` | v12.6 | aktywny | 2026-07-21 | - | Zgodnosc NC RfG liczona z MODELU (most build_der_compliance_list_from_enm -> NcRfgComplianceChecker) per zrodlo DER dla wskazanego operatora; uczciwy stan zerowy bez DER (V12K-087). | ncrfg model bridge tests | Architekt OZE |
| `GET /api/execution/batches/{batch_id}` | v12xx | aktywny | 2026-08-07 | - | Szczegoly serii przebiegow (wsadu) nad scenariuszami zwarciowymi: status, odcisk serii, identyfikatory biegow kanonicznych. | test_batch_execution.py | Architekt ruchowy |
| `GET /api/execution/fault-scenarios/{scenario_id}` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Odczyt scenariusza zakloceniowego. | execution tests | Architekt ruchowy |
| `GET /api/execution/fault-scenarios/{scenario_id}/eligibility` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Zdolnosc uruchomienia scenariusza zakloceniowego. | execution eligibility tests | Architekt ruchowy |
| `GET /api/execution/fault-scenarios/{scenario_id}/sld-overlay` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Nakladka SLD scenariusza zakloceniowego. | execution overlay tests | Architekt SLD |
| `GET /api/execution/runs/{run_id}` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Odczyt uruchomienia execution. | execution run tests | Architekt wynikow |
| `GET /api/execution/runs/{run_id}/diagnostics` | v12xx | aktywny | 2026-08-13 | - | Diagnoza przebiegu (D7): dlaczego solver nie zbiegl. Interpretacja istniejacych artefaktow biegu, zero fizyki. | tests/api/test_diagnoza_przebiegu_api.py | Architekt wynikow |
| `GET /api/execution/runs/{run_id}/results` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Wyniki execution. | execution result tests | Architekt wynikow |
| `GET /api/execution/runs/{run_id}/results/v1` | legacy | deprecated | 2026-04-24 | koniec M2 | Stary kontrakt wyniku execution. | legacy result tests | Architekt migracji |
| `GET /api/execution/study-cases/{case_id}/batches` | v12xx | aktywny | 2026-08-07 | - | Lista serii przebiegow przypadku, najnowsze pierwsze; pusta lista = uczciwe zero. | test_batch_execution.py | Architekt ruchowy |
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
| `POST /api/cases/{case_id}/enm/wytrzymalosc-aparatury` | v12xx | aktywny | 2026-07-31 | - | Werdykty wytrzymalosci I_dyn/I_th aparatury WSZYSTKICH pol stacji: aparaty z modelu (katalog APARAT_SN), zapisana konfiguracja stacji nadrzedna tam, gdzie istnieje; kazdy wiersz niesie zrodlo i kody gotowosci. Pola addytywne. | tests/api/test_wytrzymalosc_aparatury_api.py, tests/analysis/test_wytrzymalosc_aparatury_pol.py | Architekt wynikow |
| `POST /api/cases/{case_id}/runs/power-flow` | v12xx | aktywny | 2026-04-24 | - | Uruchomienie rozplywu mocy. | power flow run tests | Architekt solverow |
| `POST /api/cases/{case_id}/runs/short-circuit` | v12xx | aktywny | 2026-04-24 | - | Uruchomienie obliczen zwarciowych; whitelistuje `fault_type`, `short_circuit_type`, `c_factor`, `thermal_time_seconds`, ignoruje draft ENM i zwraca status dowodowy oraz raportowy dla 1F/2F+Z. | short circuit run tests, draft isolation tests | Architekt solverow |
| `POST /api/cases/{case_id}/runs/v126/{analysis_type}` | v12.6 | aktywny | 2026-05-24 | - | Uruchomienie analizy akademickiej V12.6 z committed ENM i parametrami przypadku. | v126 academic API tests | Architekt solverow |
| `POST /api/catalog/import` | v12xx | aktywny | 2026-04-24 | - | Import katalogow. | catalog import tests | Administrator katalogow |
| `POST /api/catalog/protection/import` | v12xx | aktywny | 2026-04-24 | - | Import katalogu zabezpieczen. | protection import tests | Projektant zabezpieczen |
| `POST /api/comparison/runs` | v12xx | aktywny | 2026-04-24 | - | Porownanie uruchomien. | comparison tests | Architekt wynikow |
| `POST /api/equipment-proof/pack` | v12xx | aktywny | 2026-04-24 | - | Pakiet uzasadnienia dla aparatury. | equipment proof tests | Architekt proof |
| `POST /api/ncrfg-tests/run` | v12.6 | aktywny | 2026-05-24 | - | Deterministyczne uruchomienie pakietu symulacji zgodnosci PTPiREE NC RfG dla DER z trace, proof i raportem PL. | ncrfg ptpiree solver/API tests | Architekt solverow |
| `POST /api/execution/batches/{batch_id}/execute` | v12xx | aktywny | 2026-08-07 | - | Sekwencyjne wykonanie serii torem kanonicznym (realny solver, zero fabrykacji); pierwsza awaria = FAILED, biegi wczesniejsze pozostaja; odcisk tresci scenariusza weryfikowany wzgledem przypietego przy tworzeniu serii. | test_batch_execution.py | Architekt ruchowy |
| `POST /api/execution/fault-scenarios/{scenario_id}/runs` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Uruchomienie scenariusza zakloceniowego. | execution tests | Architekt ruchowy |
| `POST /api/execution/runs/{run_id}/execute` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Wykonanie runu execution. | execution tests | Architekt ruchowy |
| `POST /api/execution/study-cases/{case_id}/batches` | v12xx | aktywny | 2026-08-07 | - | Utworzenie serii przebiegow (PENDING) nad scenariuszami zwarciowymi przypadku; wszystkie scenariusze jednego typu analizy; odciski tresci przypinane przy tworzeniu (predykaty parami z wykonaniem). | test_batch_execution.py | Architekt ruchowy |
| `POST /api/execution/study-cases/{case_id}/fault-scenarios` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Utworzenie scenariusza zakloceniowego. | fault scenario tests | Architekt ruchowy |
| `POST /api/execution/study-cases/{case_id}/runs` | v12xx.m1 | adapter | 2026-04-24 | koniec M3 | Utworzenie runu execution. | execution tests | Architekt ruchowy |
| `POST /api/import/xlsx` | v12xx | aktywny | 2026-04-24 | - | Import arkusza XLSX do NOWEGO projektu: wezly/galezie/zrodla/odbiory + migawka aktywna, transakcyjnie; odpowiedz niesie bramke katalogowa. | tests/test_xlsx_import.py, tests/api/test_xlsx_import_api.py | Architekt migracji |
| `POST /api/import/xlsx/preview` | v12xx | aktywny | 2026-08-07 | - | Podglad zawartosci arkusza XLSX BEZ zapisu (liczby per rodzaj + zastrzezenia per wiersz). | tests/api/test_xlsx_import_api.py | Architekt migracji |
| `POST /api/projects` | v12xx | aktywny | 2026-04-24 | - | Utworzenie projektu. | project API tests | Architekt API |
| `POST /api/proof/sc-asymmetrical/pack` | v12xx | aktywny | 2026-04-24 | - | Proof-pack dla zwarc asymetrycznych. | asym proof tests | Architekt proof |
| `POST /api/proof/sc3f/contributions` | v12xx | aktywny | 2026-07-22 | - | Rozbicie maszynowe wkladow zwarciowych per zrodlo (mu/q/i_b, IEC 60909 par. 6.6) dla sekcji Wklady ekranu zwarc (R3-B / V12K-109). | tests/api/test_proof_pack_api.py | Architekt proof |
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
| `GET /api/der-sn/{case_id}/compliance-report` | v12xx | aktywny | 2026-07-24 | - | Raport zgodnosci toru DER-SN (checklista walidacji D1 + biegu, D4/wymaganie 13); JSON, opt-in magazyn F-E8.3. | der sn documents api tests | Architekt OZE |
| `GET /api/der-sn/{case_id}/bom` | v12xx | aktywny | 2026-07-24 | - | Lista materialowa toru DER-SN z materializowanych elementow (D4/BOM); JSON, opt-in magazyn F-E8.3. | der sn documents api tests | Architekt OZE |
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
| `GET /api/insights/sensitivity` | v12xx | aktywny | 2026-08-07 | - | Wrazliwosc wynikow rozplywu: LF (czynniki wplywu na profil napiec) + ogolna (marginesy przy ±delta%) z przebiegu PF (ROUTERY-4A). | analysis insights tests | Architekt jakosci |
| `GET /api/insights/analysis-coverage` | v12xx | aktywny | 2026-08-07 | - | Pokrycie analizami przypadku: punktacja 0-100 + braki po polsku (ROUTERY-4A). | analysis insights tests | Architekt jakosci |
| `GET /api/insights/n-1-contingency` | v12xx | aktywny | 2026-08-13 | - | Macierz skutkow kontyngencji N-1 (D8): wariant wejscia bez elementu + bieg istniejacego solvera rozplywu per kontyngencja; przeciazenia, odchylenia napiec, odbiory bez zasilania, ranking dotkliwosci. Parametr `element_refs` zawezajacy enumeracje. | kontyngencje N-1 API tests | Architekt jakosci |
| `GET /api/insights/network-boundary` | v12xx | aktywny | 2026-08-07 | - | Granica sieci (wezel przylaczenia) z biezacego modelu ENM przypadku (ROUTERY-4A). | analysis insights tests | Architekt jakosci |
| `GET /api/quality/sanity-bounds` | v12xx | aktywny | 2026-07-17 | - | Wiarygodnosc Ik'' per wezel (D2). | quality analysis tests | Architekt jakosci |
| `GET /api/quality/energy-validation` | v12xx | aktywny | 2026-07-17 | - | Walidacja energetyczna rozplywu (D2). | quality analysis tests | Architekt jakosci |
| `GET /api/quality/flicker` | v12xx | aktywny | 2026-07-17 | - | Migotanie i szybkie zmiany napiecia IEC 61000-3-7 (D11). | migotanie tests | Architekt jakosci |
| `GET /api/quality/conductor-thermal-withstand` | v12xx | aktywny | 2026-07-25 | - | Wytrzymalosc zwarciowa przewodow per galaz wg IEC 60949 (karta F-K1, znalezisko Z1 audytu FLOW). | wytrzymalosc cieplna tests | Architekt jakosci |
| `GET /api/quality/conductor-thermal-withstand/proof` | v12xx | aktywny | 2026-07-25 | - | Pakiet dowodowy kryterium cieplnego dla wskazanej galezi; krok 1 nazywa ZRODLO czasu trwania zwarcia (nastawa zabezpieczenia albo zalozenie przypadku) — karta F-K1 faza 5, V12K-209. | dowod cieplny tests | Architekt jakosci |
| `GET /api/quality/connection-conditions` | v12xx | aktywny | 2026-07-25 | - | Ocena warunkow przylaczenia OSD wobec rozplywu: moc i cosfi w punkcie przylaczenia (karta F-K2, znalezisko Z2 audytu FLOW). | warunki przylaczenia tests | Architekt jakosci |
| `GET /api/quality/design-verdict` | v12xx | aktywny | 2026-07-25 | - | Agregat werdyktu projektowego: rejestr kryteriow projektu E1-E6 z trzema stanami i jawnym zakresem poza automatem (karta F-K3, znalezisko Z3 audytu FLOW). Parametr to case_id, bo werdykt obejmuje wiele biegow. | werdykt projektowy tests | Architekt jakosci |
| `POST /api/quality/as-built-compliance` | v12xx | aktywny | 2026-07-17 | - | Raport zgodnosci powykonawczej z pomiarow (D12). | zgodnosc powykonawcza tests | Architekt jakosci |
| `POST /api/quality/arc-flash` | v12xx | aktywny | 2026-07-20 | - | Arc Flash IEEE 1584-2018 (energia incydentu, granica luku, kategoria PPE) per wezel z przebiegu zwarciowego; Ik''/U z przebiegu, parametry projektowe z zadania. Audyt V12K-059 poz. A. | arc flash view/API tests | Architekt jakosci |
| `POST /api/quality/arc-flash/report` | v12xx | aktywny | 2026-07-20 | - | Raport arc flash (json/text_pl/latex) z widoku IEEE 1584; podsumowanie najgorszego przypadku + rozklad SOI. ZERO fizyki (interpretacja widoku). V12K-074. | arc flash report/API tests | Architekt jakosci |
| `POST /api/quality/arc-flash/report.pdf` | v12xx | aktywny | 2026-07-20 | - | Raport arc flash PDF (reportlab, deterministyczny) do pobrania. V12K-074. | arc flash report/API tests | Architekt jakosci |
| `POST /api/quality/arc-flash/report.docx` | v12xx | aktywny | 2026-07-20 | - | Raport arc flash DOCX (python-docx, deterministyczny) do pobrania. V12K-074. | arc flash report/API tests | Architekt jakosci |
| `GET /api/quality/state-estimation/requirements` | v12xx | aktywny | 2026-07-21 | - | Wymagane wejscia estymacji stanu WLS: mapa wezel->indeks Y-bus, slack, minimalna liczba pomiarow. ZERO fizyki. Domkniecie wyspy z inwentarza (solver WLS bez punktu wejscia). | quality state estimation API tests | Architekt jakosci |
| `POST /api/quality/state-estimation` | v12xx | aktywny | 2026-07-21 | - | Estymacja stanu WLS (IEEE/Abur-Exposito) na bazie przebiegu rozplywu (PF): Y-bus z grafu + pomiary telemetrii (SCADA/PMU) w zadaniu -> estymowany stan (moduly napiec i katy), rezydua, chi2, detekcja zlych danych (LNR). Solver liczy fizyke; API mapuje/serializuje. Brak pomiarow -> 422 (bez fabrykacji). WHITE BOX (H/G/rezydua). | quality state estimation API tests | Architekt jakosci |

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
| `GET /api/analysis-runs/{run_id}/gotowosc-dokumentacji-wykonawczej` | v12xx | aktywny | 2026-08-13 | - | Werdykt bramy dokumentacji wykonawczej dla migawki biegu (ten sam, ktorym backend odmawia eksportu profilu wykonawczego) - generator raportu pokazuje stan przed kliknieciem. | analysis run export tests | Architekt raportow |
| `GET /api/analysis-runs/{run_id}/export/report/json` | v12xx | aktywny | 2026-05-24 | - | Eksport raportu JSON z wyniku i uzasadnienia. | analysis run export tests | Architekt raportow |
| `GET /api/analysis-runs/{run_id}/export/report/pdf` | v12xx | aktywny | 2026-05-24 | - | Eksport raportu PDF z wyniku i uzasadnienia. | analysis run export tests | Architekt raportow |
| `GET /api/projects/{project_id}/documents` | v12xx | aktywny | 2026-07-23 | - | Lista wygenerowanych dokumentow projektu z magazynu (cykl zycia; F-E8.3/V12K-094). | document store API tests | Architekt raportow |
| `GET /api/documents/{document_id}/content` | v12xx | aktywny | 2026-07-23 | - | Strumien tresci dokumentu z magazynu (pobranie/podglad; F-E8.3). | document store API tests | Architekt raportow |
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
| `PATCH /api/projects/{project_id}/cases/{case_id}/generators/{generator_ref:path}/bindings` | v12xx | aktywny | 2026-07-27 | - | Wiazania katalogowe i profile zgodnosci wytworcy (kanoniczna operacja set_der_catalog_bindings). Pominiecie pola zostawia wiazanie bez zmian, jawny null je usuwa. | test_generators_api.py (5 testow) + test_set_der_catalog_bindings.py | Architekt OZE |
| `GET /api/projects/{project_id}/cases/{case_id}/generators/{generator_ref:path}/protection-functions` | v12xx | aktywny | 2026-07-27 | - | Wymagane funkcje zabezpieczeniowe pola wytworcy WYPROWADZONE z faktow o obiekcie (tryb uziemienia punktu neutralnego, zrodlo pradu i napiecia zerowego) plus ocena wybranego urzadzenia: braki funkcji i niezgodnosc przeznaczenia aplikacyjnego. ZERO nastaw i zero fizyki — odpowiedz mowi, jakie funkcje sa wymagane, czym je zmierzyc i czy aparat je realizuje. | test_generators_api.py (2 testy) + test_der_protection_functions.py (28 testow) | Architekt zabezpieczen |
| `GET /api/projects/{project_id}/cases/{case_id}/generators/{generator_ref:path}/instrument-transformers` | v12xx | aktywny | 2026-07-28 | - | Dobor przekladnika pradowego i napieciowego pola wytworcy: kryteria normowe IEC 61869-2/-3 z JAWNYM rachunkiem (wymagane vs dostepne) — przekladnia, rodzaj rdzenia/uzwojenia, ALF, wytrzymalosc cieplna i dynamiczna, wspolczynnik napieciowy, zgodnosc z wejsciem przekaznika, obciazalnosc, tor napiecia zerowego. Prad roboczy toru z solvera `compute_transformer_rated_currents`, Ik''/ip z wiersza wyniku zwarciowego; brak przebiegu zostaje NAZWANYM brakiem danej, nigdy zgodnoscia. | test_generators_api.py (2 testy) + test_dobor_przekladnika.py (14) + test_dobor_przekladnika_napieciowego.py (38) | Architekt zabezpieczen |
| `GET /api/projects/{project_id}/cases/{case_id}/generators/{generator_ref:path}/readiness` | v12xx | aktywny | 2026-07-27 | - | Gotowosc analiz wytworcy z KANONICZNEJ reguly domenowej (`domain/der_readiness.py`): 14 osi w stalej kolejnosci, statusy ORAZ nazwane powody z kodem i miejscem naprawy. Klasa przekladnika pochodzi z katalogu (IEC 61869-2), regula jej nie zgaduje. | test_generators_api.py (1 test) + test_der_readiness.py, test_der_readiness_parity.py | Architekt gotowosci |
| `POST /api/runs/power-flow` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Przejsciowe uruchomienie rozplywu przez unified runs. | unified run tests | Architekt API |
| `POST /api/runs/protection` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Przejsciowe uruchomienie zabezpieczen przez unified runs. | unified run tests | Projektant zabezpieczen |
| `POST /api/runs/short-circuit` | v12xx.m1 | adapter | 2026-05-24 | koniec M4 | Przejsciowe uruchomienie zwarc przez unified runs. | unified run tests | Architekt API |
| `POST /api/solver/cable-rated-current-preview` | v12xx | aktywny | 2026-07-18 | - | Podglad pradu znamionowego kabla z mocy przylaczeniowej bez mutacji modelu. | cable voltage drop preview tests | Architekt solverow |
| `GET /api/readiness/registry` | v12xx | aktywny | 2026-07-25 | - | Kanoniczny rejestr kodow gotowosci (komunikat PL, poziom, priorytet, akcja naprawcza, nawigacja) RAZEM z lukami: odwzorowanie kodow walidatora ENM na kanon, kody bez odpowiednika z powodem, rezerwacje kodow bez emitera (karta F-K6, znalezisko Z8). | readiness registry api tests | Architekt domeny |
| `GET /api/protection/overcurrent-settings` | v12xx | aktywny | 2026-07-25 | - | Nastawy nadpradowe biegu `protection.overcurrent.v0` w postaci PREZENTACYJNEJ: wartosc albo jawny stan NIEDOSTEPNA z powodem i akcja naprawcza z kanonicznych kodow gotowosci (karta F-K5, dlug V12K-189). Parametr `run_id` albo `case_id` (najnowszy bieg przypadku). | protection overcurrent settings api tests | Architekt analiz |
| `POST /api/solver/cable-voltage-drop-preview` | v12xx | aktywny | 2026-07-18 | - | Podglad ZMIANY napiecia na kablu SN bez mutacji modelu; opcjonalne `flow_direction` (load/generation) i `reactive_character` (inductive/capacitive) — brak pol odtwarza dawne zachowanie (odbior indukcyjny) co do bitu, wynik niesie `is_voltage_rise` (V12K-203). | cable voltage drop preview tests | Architekt solverow |
| `POST /api/solver/der-selection-preview` | v12xx | aktywny | 2026-07-24 | - | Kaskadowy dobor toru DER-SN (TR blokowy, kabel SN, aparat pola SN) z realnych katalogow bez mutacji modelu; propozycja z pelnym sladem WHITE BOX, zasila kreator zrodla OZE; opcjonalne `reactive_character` wybiera przypadek pracy toru (pobor/oddawanie Q) i wplywa na dobrany przekroj, wynik niesie `is_voltage_rise` + echo kierunkow (V12K-203). | der selection preview tests | Architekt solverow |
| `GET /api/solver/cable-laying-conditions` | v12xx | aktywny | 2026-07-25 | - | Nazwane zestawy warunkow ULOZENIA kabla (wspolczynniki korekcyjne obciazalnosci) z udokumentowana podstawa + powod krotkiej listy; kreator NIE MOZE miec wlasnej listy wspolczynnikow, bo to dane doborowe (karta F-K7, znalezisko Z6). | cable laying conditions api tests | Architekt solverow |
| `POST /api/solver/cable-ampacity-derating-preview` | v12xx | aktywny | 2026-07-25 | - | Obciazalnosc SKORYGOWANA warunkami ulozenia (I'z = Iz * f_grunt * f_wiazka * f_grupa) plus werdykt I_obl <= I'z; przenosi kryterium doborowe z warstwy prezentacji do backendu (karta F-K7). | cable ampacity derating api tests | Architekt solverow |
| `POST /api/station-templates/user` | v12xx | aktywny | 2026-07-31 | - | B-8: zapis biezacej konfiguracji kreatora stacji jako szablonu UZYTKOWNIKA. Osobny zbior i osobna przestrzen identyfikatorow (`user_…`) — szablony wbudowane pozostaja nietkniete. Identyfikator wyprowadzony z TRESCI (SHA-256), wiec powtorny zapis nadpisuje wpis zamiast mnozyc duplikaty; serializacja kanoniczna, zapis atomowy. Konfiguracja przechowywana BEZ ZMIAN (backend jej nie interpretuje). | test_station_user_templates.py (7 testow) | Architekt stacji |
| `GET /api/station-templates/user` | v12xx | aktywny | 2026-07-31 | - | Lista szablonow zapisanych przez uzytkownika (kolejnosc deterministyczna po identyfikatorze). | test_station_user_templates.py | Architekt stacji |
| `DELETE /api/station-templates/user/{template_id}` | v12xx | aktywny | 2026-07-31 | - | Usuniecie szablonu uzytkownika; szablonu WBUDOWANEGO usunac sie nie da (404). | test_station_user_templates.py | Architekt stacji |
| `POST /api/short-circuit-comparisons` | v12xx | aktywny | 2026-07-31 | - | Porownanie A/B wynikow zwarciowych PER PUNKT: wartosci A i B oraz delty bezwzgledne i wzgledne (Ik'', ip, Ith, Sk'' + pelny bilans Rk/Xk/Zk/X-R/I²t). Delty liczy DOMENA (`domain/zwarcia_porownanie.py`) — do tej pory liczyl je ekran (dlug V12K-290, ta sama klasa co L-13). A = 0 ⇒ pole procentowe NIE ISTNIEJE i jest pomijane (`response_model_exclude_none`); punkt bez odpowiednika ma jawny znacznik `obecny_w`. Wersja raportu 1.1.0 (podbicie MINOR: pola procentowe addytywne). | test_zwarcia_porownanie.py (11) + test_zwarcia_porownania_api.py | Architekt zwarciowy |
| `POST /api/short-circuit-comparisons/sld-overlay` | v12xx | aktywny | 2026-08-06 | - | DRUGA POSTAC tego samego porownania A/B: nakladka ROZNIC na SCHEMAT (kontrakt overlay v1 — elementy po refie modelu, metryki `DELTA_*` z jednostka i podpowiedzia formatu, waga INFO/WARNING, legenda PL, `content_hash`). Zamyka dlug „klient bez dostawcy" (V12K-326): klient nakladki wolal `/api/execution/comparisons/{id}/sld-delta-overlay` — trase, ktorej zaden router nie serwuje (`api/batch_execution.py` NIEWPIETY, a jego usluga trzyma przebiegi we wlasnej pamieci). Ref elementu = `element_id ?? target_id` (ta sama regula co akcja „Pokaz na schemacie"). Punkty bez odpowiednika i bez porownywalnych danych NIE sa elementami nakladki, ale ich liczba jest jawna (cztery rozlaczne liczniki, suma = liczba punktow). | test_zwarcia_delta_overlay_v1.py (14) + test_zwarcia_porownania_api.py | Architekt zwarciowy |
| `GET /api/catalog/mv-protection-device-types/{device_type_id}/curves` | v12xx | aktywny | 2026-07-31 | - | JAWNE powiazanie pozycji KANONICZNEGO katalogu zabezpieczen (przestrzen ZABEZPIECZENIE, brama `add_relay`) z wpisem BIBLIOTEKI ANALITYCZNEJ koordynacji: funkcje i charakterystyki czasowo-pradowe dobranego przekaznika. Referencja jest DANA KATALOGU (`analytical_library_ref`), nie dopasowaniem po nazwie w UI; brak odpowiednika daje kod gotowosci `protection.curve_library_missing`, zerwana referencja — `protection.curve_library_ref_broken` (karta KD-3 poz. 9). | test_protection_catalog_link.py (6 testow) | Architekt zabezpieczen |
| `POST /api/solver/ct-burden-check` | v12xx | aktywny | 2026-07-31 | - | Bilans mocy wtornej i nasycenie przekladnika pradowego (IEC 61869-2 § 5.6): S2obl = S_aparatow + I2n²·Rp, ALF_eff = ALF·(Sn+Sw)/(S2obl+Sw). Wielkosci znamionowe WYLACZNIE z katalogu (`ct_catalog_ref`), dane obwodu od projektanta. Wariant PELNY gdy katalog niesie Rct, inaczej UPROSZCZONY — NAZWANY w wyniku + kod gotowosci. Zdolnosc bez dostawcy z DLUG_FIZYKA_W_UI §7.4 poz. 1 (karta KD-3). | test_equipment_checks_api.py + test_equipment_checks.py | Architekt solverow |
| `POST /api/solver/vt-burden-check` | v12xx | aktywny | 2026-07-31 | - | Bilans mocy wtornej i ZMIANA NAPIECIA obwodu przekladnika napieciowego (IEC 61869-3): I2 = S2obl/U2n, ΔU% = I2·Rp/U2n·100 z limitem 0,5 % (uzwojenie pomiarowe) albo 1,0 % (zabezpieczeniowe) wyprowadzonym z KLASY katalogowej tego uzwojenia. Zdolnosc bez dostawcy z §7.4 poz. 2 (karta KD-3). | test_equipment_checks_api.py + test_equipment_checks.py | Architekt solverow |
| `POST /api/solver/cable-thermal-aging` | v12xx | aktywny | 2026-07-31 | - | Wzgledne starzenie izolacji kabla wg reguly Montsingera (V = 2^(ΔT/10), L = 1/V). Temperatura odniesienia i typ izolacji z pozycji katalogowej; brak ktorejkolwiek danej = kod gotowosci, nigdy wartosc typowa. Zdolnosc bez dostawcy z §7.4 poz. 3 (karta KD-3). | test_equipment_checks_api.py + test_equipment_checks.py | Architekt solverow |
| `POST /api/solver/transformer-losses` | v12xx | aktywny | 2026-07-31 | - | Straty transformatora ΔP(β) = P0 + β²·Pk i optymalny wspolczynnik obciazenia β_opt = √(P0/Pk); P0/Pk z pozycji katalogowej. Zdolnosc bez dostawcy z §7.4 poz. 4 (karta KD-3). | test_equipment_checks_api.py + test_equipment_checks.py | Architekt solverow |
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

## Uzupelnienie KD-9 — koncowki odsloniete po naprawie strazenika cyklu zycia

Data wejscia statusow w tej sekcji: 2026-07-31.

DLACZEGO TE WIERSZE POWSTALY TAK POZNO. `scripts/api_lifecycle_guard.py`
rozpoznawal routery WYLACZNIE po nazwie zmiennej `router`. `api/enm.py` i
`api/catalog.py` eksportuja do aplikacji `production_router`, a
`api/protection_analysis_runs.py` reeksportuje router z `api/protection_runs.py`
- wszystkie trzy byly dla strazenika niewidoczne, a `include_router` na nich
pomijal cicho. Pomiar (2026-07-31): stary strazink widzial 200 tras `/api`,
aplikacja wystawia 262; 62 trasy nie podlegaly zadnej bramce cyklu zycia, a 19 z
nich nie mialo tu wiersza. Strazink liczy teraz trasy z KAZDEGO routera wpietego
przez `include_router`, niezaleznie od nazwy zmiennej, i jest fail-closed:
router, ktorego nie potrafi rozwiazac statycznie, konczy sie naruszeniem
`[api-lifecycle-unresolved-router]`, a nie cichym pominieciem.

Kolumna Testy oznaczona `BRAK przed KD-9` mowi, ze koncowka nie miala ZADNEGO
wlasnego testu kontraktu - testy dymne dopisala karta KD-9 w
`backend/tests/api/test_kd9_kontrakt_koncowek_bez_testu.py`.

| Endpoint | Wersja | Status | Data wejscia | Data wylaczenia | Zakres kompatybilnosci | Testy | Wlasciciel |
|---|---|---|---|---|---|---|---|
| `GET /api/cases/{case_id}/enm/dziennik-zmian` | v12xx | aktywny | 2026-07-31 | - | Dziennik zmian ENM przypadku od wskazanej rewizji (`od_rewizji`); odczyt, bez mutacji modelu. | tests/api/test_dziennik_zmian_api.py | nadzor programu |
| `GET /api/cases/{case_id}/enm/station-fault-loop` | v12xx | aktywny | 2026-07-31 | - | Petla zwarcia u zrodla stacji nN (IEC 60364-4-41) z modelu; fizyke liczy solver, koncowka jest read-only. Model bez wskazanej stacji daje jawny stan `brak danych` z lista brakow, nigdy wartosc domyslna. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/catalog/complete-bay-templates` | v12xx | aktywny | 2026-07-31 | - | Pelne szablony pol SN powiazane z rodzina rozdzielnicy; filtry `manufacturer_ref` i `bay_kind`. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/catalog/converter-types` | v12xx | aktywny | 2026-07-31 | - | Katalog przeksztaltnikow zrodel z kanonicznego katalogu SN; filtr `kind`. | tests/api/test_catalog_api.py | nadzor programu |
| `GET /api/catalog/inverter-types` | v12xx | aktywny | 2026-07-31 | - | Katalog falownikow i przeksztaltnikow ogolnych z kanonicznego katalogu SN. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/catalog/manufacturers` | v12xx | aktywny | 2026-07-31 | - | Lista producentow rozdzielnic SN ze statusem weryfikacji zrodel katalogowych. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/catalog/ptpiree/generator-certificates` | v12xx | aktywny | 2026-07-31 | - | Lokalna migawka certyfikatow generatorow i przeksztaltnikow PTPiREE. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/catalog/ptpiree/manifest` | v12xx | aktywny | 2026-07-31 | - | Metadane zrodla migawki PTPiREE uzytej przez katalog lokalny. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/catalog/shunt-capacitor-types` | v12xx | aktywny | 2026-07-31 | - | Katalog baterii kondensatorow SN (przestrzen KOMPENSATOR_SN). | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/catalog/surge-arrester-types` | v12xx | aktywny | 2026-07-31 | - | Katalog ogranicznikow przepiec SN. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/catalog/switchgear-families` | v12xx | aktywny | 2026-07-31 | - | Rodziny rozdzielnic SN; filtr `manufacturer_ref` zwezajacy do jednego producenta. ROZSZERZENIE ADDYTYWNE 2026-08-14 (scalenie kanonu rozdzielnic): rekord niesie dodatkowo `tor_konfiguracji` (MODULARNY / BLOK_RMU / null) wyliczany z `construction_type`; pola istniejace bez zmian. | tests/api/test_switchgear_catalog_api.py + tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/catalog/switchgear-families/{switchgear_family_ref}/factory-configurations` | v12xx | aktywny | 2026-08-14 | - | Konfiguracje fabryczne (bloki) rodziny RMU: sekwencja jednostek, aparatura jednostki, szerokosc calkowita (null gdy karta producenta jej nie podaje). Rodzina o torze MODULARNY zwraca pusta liste (uczciwy stan zerowy); nieznana rodzina konczy sie 404 z polskim zdaniem. | tests/api/test_switchgear_catalog_api.py | nadzor programu |
| `GET /api/catalog/wind-inverter-types` | v12xx | aktywny | 2026-07-31 | - | Katalog przeksztaltnikow farm wiatrowych (podzbior `converter-types` o rodzaju WIND). | tests/api/test_catalog_api.py | nadzor programu |
| `GET /api/projects/{project_id}/sld/{diagram_id}/protection-overlay` | v12xx | aktywny | 2026-07-31 | - | Nakladka SLD wynikow zabezpieczen (read-only, bez mutacji modelu i diagramu); wymaga zakonczonego biegu wskazanego przez `run_id`. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/protection-runs/{run_id}` | v12xx | aktywny | 2026-07-31 | - | Metadane biegu analizy zabezpieczen: status, hash wejscia, znaczniki czasu, komunikat bledu. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/protection-runs/{run_id}/results` | v12xx | aktywny | 2026-07-31 | - | Wyniki analizy zabezpieczen; dostepne wylacznie dla biegu w stanie FINISHED. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/protection-runs/{run_id}/trace` | v12xx | aktywny | 2026-07-31 | - | WHITE BOX slad biegu zabezpieczen do audytu numerycznego. | BRAK przed KD-9 -> tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `POST /api/catalog/auto-populate/{element_type}` | v12xx | aktywny | 2026-07-31 | - | Rankingowa podpowiedz pozycji katalogowych dla kontekstu elementu (transformator, kabel, lacznik, punkt rozgalezny, DER); zwraca kandydatow z pewnoscia dopasowania i NIE zapisuje modelu. | tests/api/test_catalog_auto_populate.py | nadzor programu |
| `POST /api/projects/{project_id}/protection-runs` | v12xx | aktywny | 2026-07-31 | - | Utworzenie biegu analizy zabezpieczen; wymaga zakonczonego biegu zwarciowego (`sc_run_id`) i przypadku z ProtectionConfig (`protection_case_id`). | tests/api/test_protection_api_contract.py + tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `POST /api/protection-runs/{run_id}/execute` | v12xx | aktywny | 2026-07-31 | - | Wykonanie biegu analizy zabezpieczen (CREATED -> FINISHED albo FAILED); walidacja wejsc, silnik oceny, zapis wyniku i sladu. | tests/api/test_protection_api_contract.py + tests/api/test_kd9_kontrakt_koncowek_bez_testu.py | nadzor programu |
| `GET /api/projects/{project_id}/power-flow-runs` | v12xx | aktywny | 2026-08-05 | - | Lista biegow rozplywu projektu, sortowana malejaco po dacie utworzenia; pomija wiersze legacy. | tests/test_production_canonical_only_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `POST /api/projects/{project_id}/power-flow-runs` | v12xx | aktywny | 2026-08-05 | - | Utworzenie biegu rozplywu dla projektu i przypadku obliczeniowego. | tests/test_canonical_analysis_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `POST /api/power-flow-runs/{run_id}/execute` | v12xx | aktywny | 2026-08-05 | - | Wykonanie biegu rozplywu (CREATED -> FINISHED albo FAILED). | tests/test_canonical_analysis_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}` | v12xx | aktywny | 2026-08-05 | - | Metadane biegu rozplywu: status, hash wejscia, znaczniki czasu. | tests/test_canonical_analysis_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/results` | v12xx | aktywny | 2026-08-05 | - | Wynik rozplywu w kontrakcie PowerFlowResultV1 (napiecia wezlow, przeplywy galezi, straty). | tests/test_canonical_analysis_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/trace` | v12xx | aktywny | 2026-08-05 | - | WHITE BOX slad rozplywu: iteracje, residua, macierze posrednie. | tests/test_canonical_analysis_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/interpretation` | v12xx | aktywny | 2026-08-05 | - | Interpretacja wyniku rozplywu (ustalenia napieciowe i galeziowe); deterministyczna dla biegu. | tests/test_production_canonical_only_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `POST /api/power-flow-runs/{run_id}/interpretation` | v12xx | aktywny | 2026-08-05 | - | Wyliczenie i zapamietanie interpretacji biegu rozplywu. | tests/api/test_route_prefix_canon.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/export/json` | v12xx | aktywny | 2026-08-05 | - | Eksport wyniku rozplywu do JSON. | tests/test_canonical_analysis_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/export/docx` | v12xx | aktywny | 2026-08-05 | - | Eksport wyniku rozplywu do DOCX. | tests/test_power_flow_export.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/export/pdf` | v12xx | aktywny | 2026-08-05 | - | Eksport wyniku rozplywu do PDF. | tests/test_power_flow_export.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/export/xlsx` | v12xx | aktywny | 2026-08-05 | - | Eksport wyniku rozplywu do XLSX. | tests/test_canonical_analysis_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/export/proof/json` | v12xx | aktywny | 2026-08-05 | - | Eksport uzasadnienia inzynierskiego rozplywu do JSON. | tests/test_p21_power_flow_proof.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/export/proof/latex` | v12xx | aktywny | 2026-08-05 | - | Eksport uzasadnienia inzynierskiego rozplywu do LaTeX. | tests/test_p21_power_flow_proof.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-runs/{run_id}/export/proof/pdf` | v12xx | aktywny | 2026-08-05 | - | Eksport uzasadnienia inzynierskiego rozplywu do PDF. | tests/test_p21_power_flow_proof.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `POST /api/power-flow-comparisons` | v12xx | aktywny | 2026-08-05 | - | Utworzenie porownania A/B dwoch biegow rozplywu. | tests/api/test_route_prefix_canon.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-comparisons/{comparison_id}` | v12xx | aktywny | 2026-08-05 | - | Metadane porownania rozplywu. | tests/api/test_route_prefix_canon.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-comparisons/{comparison_id}/results` | v12xx | aktywny | 2026-08-05 | - | Roznice wynikow miedzy biegami A i B rozplywu. | tests/api/test_route_prefix_canon.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-comparisons/{comparison_id}/trace` | v12xx | aktywny | 2026-08-05 | - | WHITE BOX slad wyznaczenia roznic porownania rozplywu. | tests/api/test_route_prefix_canon.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-comparisons/{comparison_id}/export/json` | v12xx | aktywny | 2026-08-05 | - | Eksport porownania rozplywu do JSON. | tests/api/test_route_prefix_canon.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-comparisons/{comparison_id}/export/docx` | v12xx | aktywny | 2026-08-05 | - | Eksport porownania rozplywu do DOCX. | tests/api/test_route_prefix_canon.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/power-flow-comparisons/{comparison_id}/export/pdf` | v12xx | aktywny | 2026-08-05 | - | Eksport porownania rozplywu do PDF. | tests/api/test_route_prefix_canon.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `POST /api/protection-comparisons` | v12xx | aktywny | 2026-08-05 | - | Utworzenie porownania A/B dwoch biegow analizy zabezpieczen. | tests/test_protection_comparison.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/protection-comparisons/{comparison_id}` | v12xx | aktywny | 2026-08-05 | - | Metadane porownania zabezpieczen. | tests/test_protection_comparison.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/protection-comparisons/{comparison_id}/results` | v12xx | aktywny | 2026-08-05 | - | Roznice nastaw i werdyktow miedzy biegami A i B zabezpieczen. | tests/test_protection_comparison.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/protection-comparisons/{comparison_id}/trace` | v12xx | aktywny | 2026-08-05 | - | WHITE BOX slad wyznaczenia roznic porownania zabezpieczen. | tests/test_protection_comparison.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `POST /api/projects/{project_id}/export` | v12xx | aktywny | 2026-08-05 | - | Eksport projektu do deterministycznego archiwum ZIP; opcjonalny zapis do magazynu dokumentow. | frontend/src/ui/project-archive/__tests__/api.test.ts + tests/api/test_route_prefix_canon.py | nadzor programu |
| `POST /api/projects/import` | v12xx | aktywny | 2026-08-05 | - | Import projektu z archiwum ZIP wraz z weryfikacja spojnosci i brama katalogowa. | frontend/src/ui/project-archive/__tests__/api.test.ts + tests/api/test_route_prefix_canon.py | nadzor programu |
| `POST /api/projects/import/preview` | v12xx | aktywny | 2026-08-05 | - | Podglad zawartosci archiwum ZIP przed importem (bez zapisu modelu). | frontend/src/ui/project-archive/__tests__/api.test.ts + tests/api/test_route_prefix_canon.py | nadzor programu |
| `GET /api/projects/{project_id}/sld/{diagram_id}/overlay` | v12xx | aktywny | 2026-08-05 | - | Nakladka wynikow na schemat jednokreskowy dla wskazanego biegu; odrzuca biegi legacy. | tests/test_production_canonical_only_api.py + tests/api/test_route_prefix_canon.py | nadzor programu |
| `POST /api/protection-coordination/projects/{project_id}/run` | v12xx | aktywny | 2026-08-13 | - | Uruchomienie analizy koordynacji zabezpieczen nadpradowych (czulosc, selektywnosc, przeciazalnosc) z urzadzen, pradow zwarciowych IEC 60909 i pradow roboczych rozplywu przekazanych w zadaniu; bramka gotowosci wymaga co najmniej jednego urzadzenia, jednej lokalizacji pradu zwarciowego i jednej lokalizacji pradu roboczego (400 PL zamiast fabrykowanego PASS przy pustych danych — karta ZAB-100-BACKEND). | tests/application/analyses/protection/coordination/test_overcurrent_coordination.py + tests/api/test_protection_coordination_api.py | nadzor programu |
| `GET /api/protection-coordination/{run_id}` | v12xx | aktywny | 2026-08-13 | - | Pelny wynik analizy koordynacji zabezpieczen (urzadzenia, sprawdzenia czulosci/selektywnosci/przeciazalnosci, krzywe TCC, znaczniki zwarciowe, podsumowanie). | tests/api/test_protection_coordination_api.py | nadzor programu |
| `GET /api/protection-coordination/{run_id}/tcc` | v12xx | aktywny | 2026-08-13 | - | Dane krzywych czasowo-pradowych (TCC) i znacznikow zwarciowych do wizualizacji. | tests/api/test_protection_coordination_api.py | nadzor programu |
| `GET /api/protection-coordination/{run_id}/trace` | v12xx | aktywny | 2026-08-13 | - | WHITE BOX slad wszystkich krokow obliczeniowych analizy koordynacji. | tests/api/test_protection_coordination_api.py | nadzor programu |
| `GET /api/protection-coordination/{run_id}/checks/sensitivity` | v12xx | aktywny | 2026-08-13 | - | Wyniki sprawdzenia czulosci (I_min/I_pickup) dla kazdego urzadzenia. | tests/api/test_protection_coordination_api.py | nadzor programu |
| `GET /api/protection-coordination/{run_id}/checks/selectivity` | v12xx | aktywny | 2026-08-13 | - | Wyniki sprawdzenia selektywnosci czasowej (CTI) dla par urzadzen podrzedne-nadrzedne. | tests/api/test_protection_coordination_api.py | nadzor programu |
| `GET /api/protection-coordination/{run_id}/checks/overload` | v12xx | aktywny | 2026-08-13 | - | Wyniki sprawdzenia przeciazalnosci (I_pickup/I_rob) dla kazdego urzadzenia. | tests/api/test_protection_coordination_api.py | nadzor programu |
| `GET /api/protection-coordination/{run_id}/export/pdf` | v12xx | aktywny | 2026-08-13 | - | Eksport wyniku koordynacji zabezpieczen do PDF (reuzycie `network_model/reporting/protection_report_pdf.py`, deterministyczny bajt-w-bajt — karta ZAB-100-BACKEND). | tests/e2e/test_protection_exports_deterministic.py + tests/api/test_protection_coordination_api.py | nadzor programu |
| `GET /api/protection-coordination/{run_id}/export/docx` | v12xx | aktywny | 2026-08-13 | - | Eksport wyniku koordynacji zabezpieczen do DOCX (reuzycie `network_model/reporting/protection_report_docx.py` + `docx_determinism`, deterministyczny bajt-w-bajt — karta ZAB-100-BACKEND). | tests/e2e/test_protection_exports_deterministic.py + tests/api/test_protection_coordination_api.py | nadzor programu |
