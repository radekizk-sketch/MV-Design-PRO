# Backlog wdrozeniowy V12.xx

Status: aktywny backlog kierunkowy  
Cel: przelozenie kanonu V12.xx na fazy wykonawcze

## M0 - governance i inwentaryzacja

| Kod | Zadanie | Kryterium akceptacji | Status |
|---|---|---|---|
| V12-BL-001 | Utworzyc `docs/v12xx/` i plik `KANON_V12_XX.md`. | Katalog i plik istnieja, guard przechodzi. | zamkniete |
| V12-BL-002 | Utworzyc rejestr decyzji, konfliktow i dlugu. | Trzy rejestry istnieja i sa linkowane z indeksu. | zamkniete |
| V12-BL-003 | Utworzyc macierze invalidacji, interakcji, testow, uprawnien, API, raportowalnosci i ID. | Pliki istnieja i maja minimalne tabele. | zamkniete |
| V12-BL-004 | Dodac guard kanonu V12.xx. | `npm run guard:v12xx-canon` przechodzi. | zamkniete |
| V12-BL-005 | Zaktualizowac indeksy dokumentacji. | `INDEX.md` i `INDEX_KANONICZNY.md` wskazuja kanon V12.xx. | zamkniete |
| V12-BL-006 | Uruchomic pelny baseline testow i wydajnosci. | `verification_v12_5_1.md` pokazuje 17/17 PASS, w tym repo guards, backend lint/format/test, frontend tests, perf, golden i E2E. | zamkniete |
| V12-BL-007 | Uzupelnic pelna macierz endpointow API. | `MACIERZ_KOMPATYBILNOSCI_API.md` zawiera aktywne trasy `/api` z FastAPI, statusem lifecycle, data wejscia, data wylaczenia, testami i wlascicielem. | zamkniete |
| V12-BL-008 | Dodac guard lifecycle API. | `api_lifecycle_guard.py` porownuje aktywne trasy `/api` z `MACIERZ_KOMPATYBILNOSCI_API.md` i blokuje endpoint bez statusu, testow, wlasciciela albo daty wylaczenia adaptera/deprecated. | zamkniete |
| V12-BL-009 | Ustabilizowac pelna bramke E2E V12.5.1. | Detekcja Chromium obsluguje cache Playwright, ma timeout, setup Windows uzywa `playwright.cmd`, Playwright uruchamia backend przez `cwd` bez shellowego `Set-Location`, `verify_v12_5.py` ma timeout kroku, a guard kanonu blokuje regresje. | zamkniete |

## M1 - projekcja ENM v2.0 i kompatybilnosc

| Kod | Zadanie | Kryterium akceptacji | Status |
|---|---|---|---|
| V12-BL-101 | Zaimplementowac read-only projekcje ENM v1 -> ENM v2.0. | Projekcja deterministyczna, zachowuje `ref_id`. | zamkniete |
| V12-BL-102 | Dodac kontrakt `id/ref_id/name`. | Test zmiany `name` bez zmiany `ref_id`. | zamkniete dla projekcji M1 |
| V12-BL-103 | Dodac snapshot katalogowy dla nowych runow. | Result contract ma `catalog_materialization_ref`, hash, status i wersje kontraktu; aktywny tor V12.5.1 ma reprodukowalny snapshot katalogowy w kontrakcie wyniku i raporcie. | zamkniete |
| V12-BL-104 | Dodac wariant bazowy i migawke lacznikowa bazowa. | Projekcja ENM v2 i result contract wskazuja `variant.uklad_normalny` oraz `switching.uklad_normalny.base`. | zamkniete |
| V12-BL-105 | Dodac test draft vs committed. | Backend zamraza snapshot przy `create_run`, HTTP ignoruje wstrzykniety snapshot, frontend `createRun` nie wysyla danych ENM. | zamkniete |
| V12-BL-106 | Udostepnic projekcje ENM v2.0 przez read-only API M1. | `/api/cases/{id}/enm/v2-projection` zwraca deterministyczna projekcje i nie mutuje ENM v1. | zamkniete |
| V12-BL-107 | Utworzyc macierz draft vs committed. | `MACIERZ_DRAFT_VS_COMMITTED.md` definiuje klasy danych, przeplywy dozwolone i przeplywy zakazane. | zamkniete |

## M2 - single-write ENM v2.0

| Kod | Zadanie | Kryterium akceptacji | Status |
|---|---|---|---|
| V12-BL-201 | Przelaczyc zapis domenowy na ENM v2.0. | Nowe operacje pisza tylko do ENM v2.0. | zamkniete: produkcyjny router ENM wycina `PUT /enm`, `POST /enm/ops`, `POST /enm/ops/batch` i `POST /wizard/apply-step`, a publiczny zapis modelu idzie przez `POST /api/cases/{case_id}/enm/domain-ops`, co chroni `test_production_enm_has_single_public_write_path` |
| V12-BL-202 | Rozszerzyc result contract o reprodukowalnosc. | Aktywny kontrakt zawiera ENM hash, snapshot, case, wariant, migawke lacznikowa, katalog materialization, wersje proof/report/rules oraz jest objety testami V12.5.1. | zamkniete |
| V12-BL-203 | Rozbudowac solver zwarc o pelna siec zerowa. | 1F i 2F+Z maja proof i status raportowalnosci. | zamkniete: builder Z0, ochrona 3F, kanoniczny run 1F/2F+Z, `proof_ref`, `proof_status`, `reporting_status`, trace export i JSON report/export sa podlaczone end-to-end |
| V12-BL-204 | Rozdzielic dark SCADA i jasny motyw eksportowy. | Test eksportu potwierdza osobne style. | zamkniete dla eksportu SLD PNG/PDF |
| V12-BL-205 | Dodac wspolny slownik severity i blokad. | Walidacje mapuja sie do jednego slownika. | zamkniete: `enm.severity` jest kontraktem publicznych wartosci i helperow, a `severity_contract_guard.py` blokuje inline severity/status w boundary walidacji |

## M3 - pelna domena V12.xx

| Kod | Zadanie | Kryterium akceptacji | Status |
|---|---|---|---|
| V12-BL-301 | Wylaczyc `OperatingCase` z toru wykonawczego. | `StudyCase` jest jedynym kanonem przypadkow. | zamkniete: produkcyjne endpointy runow i eksportu ignoruja legacy `AnalysisRun`, frontend nie akceptuje juz fallbacku `operating_case_id`, a `test_production_canonical_only_api.py` i frontendowe testy kontraktu potwierdzaja tylko `StudyCase` |
| V12-BL-302 | Dodac stan fazowy SN jako osobny modul. | Solver, wynik, nakladka SLD i proof dzialaja na sieci wzorcowej. | zamkniete: `phase_state_sn.py`, proof-pack, endpoint `/analysis-runs/{run_id}/results/phase-state`, report/export payload i testy kanoniczne przechodza |
| V12-BL-303 | Dodac stabilnosc dynamiczna w zakresie V12.xx. | Siec stabilna i niestabilna przechodza testy. | zamkniete: wynik `dynamic_stability`, endpoint `/analysis-runs/{run_id}/results/dynamic-stability`, slad automatyki, proof/report status i testy kanoniczne oraz eksportowe przechodza |
| V12-BL-304 | Dodac pelne OZE/BESS/FW/FRT. | PV, BESS, PMSG, DFIG i SCIG maja profile i zgodnosc. | zamkniete: ENM rozroznia `fw_pmsg`, `fw_dfig`, `fw_scig`, projekcja v2 materializuje profile zrodel i operatora, a `source_compliance` wymaga FRT/Q(U)/cos phi(P) oraz zgodnego `generator_technology` z proof/report status |
| V12-BL-305 | Dodac automatyke jako byt pierwszej klasy. | SPZ/FDIR ma slad co, kiedy, dlaczego i skutek. | zamkniete: `automation_trace` jest publicznym wynikiem kanonicznego runa stabilnosci dynamicznej, eksport i result set niosa wydarzenia oraz skutek topologiczny |

## M4 - czyszczenie i zamkniecie

| Kod | Zadanie | Kryterium akceptacji | Status |
|---|---|---|---|
| V12-BL-401 | Usunac adaptery legacy. | Nie ma aktywnej sciezki zapisu legacy. | zamkniete: produkcyjny zapis legacy jest fizycznie wylaczony z `production_router`, a legacy GET proof-pack zostal zdegradowany do jawnego `410` zamiast ukrytej sciezki produkcyjnej |
| V12-BL-402 | Usunac martwe endpointy i komponenty. | Guard API i import graph przechodza. | zamkniete: klient wynikow nie probuje juz brakujacego `/violations`, nie utrzymuje fallbacku `operating_case_id`, a eksport `xlsx` ma aktywna implementacje dla rozplywu |
| V12-BL-403 | Zamknac rejestr dlugu V12.xx. | Brak otwartego nieoznaczonego dlugu w zakresie V12.xx. | zamkniete: wszystkie znane luki aktywnego zakresu sa jawnie wpisane i zamkniete w `REJESTR_DLUGU.md`; brak nieoznaczonego dlugu blokujacego V12.xx |
| V12-BL-404 | Wykonac red-team finalny. | Brak otwartych blokad krytycznych. | zamkniete: `RED_TEAM_FINAL_V12_XX.md` potwierdza brak krytycznych blokad produkcyjnych dla aktywnego toru V12 oraz brak otwartych pozycji dlugu blokujacych V12.xx |
