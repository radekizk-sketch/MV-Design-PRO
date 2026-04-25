# Rejestr dlugu technicznego V12.xx

Status: aktywny  
Cel: zadna znana luka V12.xx nie moze pozostac nieoznaczona

## Definicja zamkniecia

Zero dlugu oznacza brak aktywnego, swiadomie pozostawionego dlugu w zakresie V12.xx. Kazdy odlozony temat bez wpisu w tym rejestrze blokuje zamkniecie V12.xx.

## Schemat wpisu

| Pole | Wymaganie |
|---|---|
| Kod | `V12T-XXX` |
| Obszar | ENM / API / UI / SLD / solver / katalogi / raport / testy / migracja |
| Problem | Konkretny opis dlugu |
| Skutek | Ryzyko dla produktu |
| Decyzja | Usunac / scalic / przepisac / migrowac / oznaczyc legacy |
| Wlasciciel | Rola odpowiedzialna |
| Faza | M0 / M1 / M2 / M3 / M4 |
| Status | otwarty / w trakcie / zamkniety |

## Znany dlug objety planem

| Kod | Obszar | Problem | Skutek | Decyzja | Faza | Status |
|---|---|---|---|---|---|---|
| V12T-001 | dokumentacja | Brak katalogu `docs/v12xx/` przed wdrozeniem kanonu. | Ryzyko wielu zrodel prawdy. | Utworzyc aktywny kanon i indeks. | M0 | zamkniety przez ten pakiet |
| V12T-002 | ENM | Obecny ENM mial wersje 1.0 i nie zawieral pelnego zakresu V12.xx. | Brak miejsca dla wariantow, migawek, profili i automatyki. | Zamknieto dla aktywnego toru V12: projekcja ENM v2.0 materializuje wariant bazowy, migawke lacznikowa, Z0, profile zrodel, profile operatora, profile FRT/Q(U)/cos phi(P), profile obciazen i byty automatyki z deterministycznym hashem. | M1-M3 | zamkniety |
| V12T-003 | studia | Publiczny tor execution i raportowania mial fallback `OperatingCase` wzgledem `StudyCase`. | Ryzyko drugiego modelu przypadkow w aktywnym API i kliencie. | Zamknieto dla toru produkcyjnego: publiczne endpointy ignoruja legacy `AnalysisRun`, frontend nie akceptuje juz `operating_case_id`, a pozostale porzadki persystencji legacy sa sledzone osobno w `V12T-011`. | M1-M3 | zamkniety |
| V12T-004 | solver | Kanoniczny run ENM wymagal pelnego proof/statusu raportowego dla zwarc 1F i 2F+Z. | Bez tego wynik asymetryczny bylby policzony, ale nie bylby pelnym wynikiem raportowym V12.xx. | Zamknieto: kazdy wiersz 1F/2F+Z ma `proof_ref`, `proof_status=complete`, `reporting_status=reportable`, powiazanie z krokami trace, status w raw result, wynikach, trace export, JSON report i JSON export. | M2 | zamkniety |
| V12T-005 | OZE | Modele PV/BESS/FW nie byly pelnym modelem FRT/operatorowym V12.xx. | Niepelna zgodnosc przylaczeniowa. | Zamknieto: `Generator.gen_type` rozroznia `fw_pmsg`, `fw_dfig`, `fw_scig`, projekcja ENM v2.0 materializuje profile zrodel i operatora, a `source_compliance` wymaga zgodnego `generator_technology` dla FW PMSG/DFIG/SCIG. | M2-M3 | zamkniety |
| V12T-006 | API | Endpointy `/api` wymagaly twardego porownania aktywnego kodu z macierza lifecycle. | Bez guarda mozna bylo dodac aktywna trase bez statusu, testow, wlasciciela albo daty wylaczenia adaptera/deprecated. | Zamknieto: `api_lifecycle_guard.py` wykrywa aktywne trasy FastAPI z `api.main`, porownuje je z `MACIERZ_KOMPATYBILNOSCI_API.md` i jest uruchamiany przez `v12xx_canon_guard.py` oraz `verify:v12.5.1`. | M0-M2 | zamkniety |
| V12T-007 | UI | Drafty formularzy wymagaly jawnego kontraktu draft vs committed. | Ryzyko lokalnej prawdy poza ENM. | Dodano macierz i testy uruchomien obliczen; kolejne formularze musza stosowac ten sam kontrakt. | M1-M2 | zamkniety dla run request |
| V12T-008 | SLD | Pelna macierz interakcji V12.xx nie byla wymuszana guardem. | Ryzyko niespojnych klikniec i menu. | Zamknieto: `MACIERZ_INTERAKCJI.md` pokrywa minimalny zestaw obiektow pierwszej klasy, a `interaction_matrix_guard.py` wraz z testami blokuje brak wpisu dla nowego obiektu SLD. | M2-M3 | zamkniety |
| V12T-009 | raport | Raporty i eksporty wymagaly jasnego technicznego motywu oddzielonego od dark SCADA. | Ryzyko nieczytelnego eksportu. | Wydzielono `light_technical` dla eksportu SLD PNG/PDF oraz jawny tryb `screen`. | M2 | zamkniety dla eksportu SLD |
| V12T-010 | testy | Sieci i scenariusze wzorcowe V12.xx nie byly wymuszane guardem. | Brak stalego dowodu kompletnego zakresu domenowego. | Zamknieto: `MACIERZ_TESTOW_V12_XX.md` utrzymuje `V12-GN-001..007`, a `reference_networks_guard.py` sprawdza komplet kodow oraz istnienie plikow dowodowych dla zwarc, Petersena, stanu fazowego, zgodnosci zrodel, automatyki i stabilnosci. | M1-M3 | zamkniety |
| V12T-011 | API / migracja | Aktywne sciezki legacy i adapterowe laczyly `OperatingCase`, `StudyCase`, endpointy wynikow oraz katalog ochrony w kilku miejscach. | Ryzyko drugiej prawdy przypadkow, niejednoznacznego run envelope i nieprodukcyjnego fallbacku katalogowego. | Zamknieto dla publicznego toru V12: `legacy_public_path_guard.py` blokuje publiczny import lub emisje `OperatingCase`, `AnalysisRun`, `get_operating_case` i `operating_case_id`; aktywne routery runow, wynikow i eksportu pozostaja na `StudyCase` oraz kanonicznym result contract. | M2-M4 | zamkniety |
| V12T-012 | walidacje | Slownik severity byl zcentralizowany dla ENMValidator, ale boundary API moglo nadal uzywac lokalnych literalow statusu i map severity. | Ryzyko niespojnych blokad raportu, publikacji i migracji poza ENM. | Zamknieto: `enm.severity` eksportuje publiczne wartosci, helper `empty_severity_counts()` i `is_failed_status()`, boundary API uzywa kontraktu, a `severity_contract_guard.py` blokuje inline `BLOCKER`/`IMPORTANT`/`INFO`/`OK`/`WARN`/`FAIL` w plikach walidacyjnych. | M2 | zamkniety |
| V12T-013 | testy / E2E | Pelna weryfikacja mogla zawisnac podczas probe `chrome --version` albo teardown realnego backendu uruchamianego przez shellowy `Set-Location`; dodatkowo brak systemowego Chrome nie powinien blokowac cache Playwright Chromium, a setup Windows nie moze wpadac w fallback APT. | Ryzyko braku wyniku `verify:v12.5.1` mimo przejscia testow E2E oraz osieroconych procesow po weryfikacji. | Zamknieto: resolver uzywa cache Playwright Chromium, probe Chromium ma limit `PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS`, setup Windows uzywa `playwright.cmd`, kroki weryfikacji maja timeout, backend Playwright startuje przez `cwd: backendCwd`, a guard kanonu blokuje powrot do shellowego handoffu. | M0-M2 | zamkniety |
| V12T-014 | UI / raport | Przegladarka wynikow utrzymywala martwy probe `violations`, fallback `operating_case_id` oraz niedzialajacy eksport Excel. | Ryzyko 404 w aktywnym UI i utrzymania legacy semantyki poza kanonem. | Zamknieto: klient wynikow liczy naruszenia z aktywnego payloadu PF, wymaga `study_case_id`, a `/power-flow-runs/{run_id}/export/xlsx` jest aktywna trasa generowana z kanonicznego bundle. | M4 | zamkniety |
