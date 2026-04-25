# Macierz draft vs committed V12.xx

Status: aktywna  
Cel: jednoznaczne rozdzielenie lokalnego stanu formularza od prawdy domenowej ENM

## Zasada nadrzedna

Draft UI nie jest prawda domenowa. Moze byc niekompletny, bledny i porzucony. Solver, raport, uzasadnienie inzynierskie, gotowosc i eksport moga czytac wylacznie dane zapisane walidowana operacja domenowa w ENM, snapshot katalogowy, wynik frozen albo zatwierdzony pakiet raportowy.

## Klasy danych

| Klasa danych | Wlasciciel | Moze byc niekompletna | Zasila solver | Zasila raport | Zasila uzasadnienie | Warunek przejscia |
|---|---|---:|---:|---:|---:|---|
| Draft formularza | UI | tak | nie | nie | nie | Walidowany zapis domenowy |
| Dane committed ENM | ENM | nie dla pol wymaganych | tak | tak przez migawke | tak przez migawke | Operacja domenowa zaakceptowana |
| Migawka modelu | ENM snapshot | nie | tak | tak | tak | Hash ENM zapisany w wyniku |
| Snapshot katalogowy | katalogi | nie dla parametrow solverowych | tak | tak | tak | Wersja i hash katalogu zapisane w uruchomieniu |
| Wynik frozen | silnik wynikow | nie | nie | tak | tak | Wynik ma przypadek, wariant, migawke lacznikowa i hash ENM |
| Dane raportowe | raport | nie | nie | tak | tak | Raport referencjonuje wynik frozen i proof-pack |
| Slad audytowy | audyt | nie | nie | tak | tak | Zapis kto, kiedy, co, dlaczego i na jakiej wersji danych |

## Przeplywy dozwolone

| Przeplyw | Status | Warunek | Test akceptacyjny |
|---|---|---|---|
| Draft UI -> walidacja lokalna | dozwolony | Bez zapisu do ENM. | Test formularza pokazuje blad bez zmiany ENM. |
| Draft UI -> operacja domenowa -> ENM | dozwolony | Walidacja globalna i blokady przechodza. | Test zapisuje ENM tylko po akcji zatwierdzenia. |
| ENM -> migawka modelu -> solver | dozwolony | Hash ENM zapisany w run contract. | Test wyniku zawiera hash migawki ENM. |
| ENM + snapshot katalogowy -> solver | dozwolony | Parametry katalogowe materializowane dla uruchomienia. | Test wyniku zawiera hash snapshotu katalogowego. |
| Wynik frozen -> raport | dozwolony | Wynik ma status raportowy i proof id. | Test raportu nie przelicza wlasnych wartosci. |
| Wynik frozen -> nakladka SLD | dozwolony | Nakladka oznacza aktualnosc i jakosc. | Test SLD pokazuje nieaktualnosc po invalidacji. |

## Przeplywy zakazane

| Przeplyw | Blokada | Powod | Test akceptacyjny |
|---|---|---|---|
| Draft UI -> solver | V12-BLOCK-DRAFT-001 | Solver nie moze czytac lokalnego stanu formularza. | Test uruchomienia ignoruje niezapisany draft. |
| Draft UI -> raport | V12-BLOCK-DRAFT-002 | Raport musi byc odtwarzalny z ENM i wynikow frozen. | Test raportu nie widzi niezapisanej zmiany. |
| Draft UI -> uzasadnienie | V12-BLOCK-DRAFT-003 | Proof musi miec sladowalnosc do migawki modelu. | Test proof wskazuje hash ENM, nie stan formularza. |
| Projekcja ENM v2 M1 -> zapis ENM v1 | V12-BLOCK-DRAFT-004 | Projekcja M1 jest tylko odczytowa. | Test endpointu projekcji nie zmienia `/enm`. |
| Wynik -> mutacja ENM | V12-BLOCK-DRAFT-005 | Wyniki nie zmieniaja modelu. | Test obliczenia zachowuje hash ENM. |
| Draft UI -> request uruchomienia | V12-BLOCK-DRAFT-006 | Frontend nie moze przenosic snapshotu, ENM, wezlow ani odcinkow w `createRun`. | `api.draft-isolation.test.ts` potwierdza sanitizacje ciala requestu. |

## Testy wdrozone

| Test | Warstwa | Dowod |
|---|---|---|
| `tests/enm/test_canonical_analysis_draft_isolation.py` | backend solver | `execute_run` uzywa snapshotu zamrozonego przy `create_run`, mimo pozniejszej zmiany ENM store. |
| `tests/enm/test_enm_api.py::TestRunDispatch::test_run_dispatch_ignores_client_snapshot_body` | backend API | `POST /runs/short-circuit` ignoruje snapshot i ENM w ciele zadania. |
| `src/ui/study-cases/__tests__/api.draft-isolation.test.ts` | frontend API | `createRun` nie wysyla `snapshot`, `enm`, `buses` ani `branches`. |

## Byt pierwszej klasy, wynik pochodny i blokada

| Obszar | Byt pierwszej klasy | Wynik pochodny | Blokada wdrozeniowa | Migracja |
|---|---|---|---|---|
| Formularze | Draft UI | Walidacje lokalne i podpowiedzi naprawcze | Brak rozdzialu draft/ENM blokuje M2. | Dodac kontrakty formularzy bez zmiany ENM v1. |
| ENM | Dane committed | Migawka modelu i hash | Zapis z pomijaniem operacji domenowej blokuje M2. | M1 adapter, M2 single-write ENM v2.0. |
| Wyniki | Wynik frozen | Nakladka SLD i raport | Wynik bez migawki ENM blokuje raport. | Rozszerzyc result contract w M2. |
| Raport | Pakiet raportowy | PDF/DOCX/XLSX | Raport czytajacy draft blokuje publikacje. | Przepiac raporty na wynik frozen i proof-pack. |
