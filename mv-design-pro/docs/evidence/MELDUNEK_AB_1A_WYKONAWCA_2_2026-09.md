# Meldunek wykonawcy 2 — karta AB-1a (D2, D3, D7, D8b, R-6)

Data: 2026-09-23. Gałąź robocza: worktree `agent-ab60a10057b802d5b`, baza
`claude/relaxed-sagan-ww188q` @ `529837d2`. Commity lokalne bez push i bez PR
(integrację robi orkiestrator). Commity (od najstarszego): `be110409` (D3),
`0ceb3e0e` (R-6), `8173fa00` (D2 backend), `d1e80bb5` (D7 LoM), `3df72962`
(towarzysze w nośnikach spoza FROZEN), `02791892` (adapter V12.6), `2d25681a`
(NC RfG: predykat „wymagany”), `113e7f05` (trasa status-modelu), `4d283965` (D8b
regeneracja), `a6f7fc27`, `976a98ed`, `b92d615a` (frontend), `3467de29` (guard + CI),
`dd572134` (format black 100), `e258d40e` (bramki CI), `8470a212` (pin kluczy), commit tego meldunku.

**Uwaga do integracji z wykonawcą 1 (komunikat orkiestratora):** R-6 zrobiłem sam,
zanim dotarła informacja, że wykonawca 1 zrobił go na gałęzi programu (`52224d2f`).
Moje zmiany z tego zbioru leżą w OSOBNYM commicie `0ceb3e0e` (plus kosmetyka formatu
w `dd572134`). Dotknięte pliki z tego zbioru:
`backend/src/solver_input/provenance.py` (wyłącznie wpisy rejestru: nowe
`ncrfg_ptpiree.zachowanie_zadeklarowane`, `ncrfg_ptpiree.test_bez_tresci`; poprawione
uzasadnienie `declared_configuration` i `power_quality_declared` → DYNAMIC_PERFORMANCE),
`backend/src/solver_input/dowod_ncrfg.py` (`TEST_ZDOLNOSC` T05/T10/T12/T13/T20),
testy: `tests/test_solver_input_dowod_ncrfg.py`, `tests/api/test_certyfikat_zgodnosci.py`,
`tests/api/test_wniosek_osd.py`, `tests/api/test_dowod_certyfikatu_dokumentow.py`.
Do rozstrzygnięcia przy integracji: moje testy negatywnego certyfikatu używają
`monkeypatch` przemapowania T12 na `declared_configuration` (symulacja akceptacji
po AB-1c), bo bez tego certyfikat negatywny nie powstaje; u wykonawcy 1
`brak_wymaganych_testow` + `KodFailClosed.REQUIREMENT_UNVERIFIED` może zmienić tę
ścieżkę — różnice trzeba porównać.

## 1. Inwentarz klasy zmierzony na HEAD

**Nośniki werdyktu (guard `explainable_verdict_guard.py`, pomiar na bazie 529837d2):**

| Nośnik | Plik | Rozstrzygnięcie |
|---|---|---|
| `NcRfgPtpireeTestResult.verdict`, `NcRfgPtpireeModuleResult.overall_status` | FROZEN `ncrfg_ptpiree/contracts.py` | lista wyjątków + adapter `z_testu_ncrfg` (trasa biegu NC RfG) |
| `_ner_design[status]` | FROZEN `v126_academic.py` | lista wyjątków + adapter `z_proby_cieplnej_ner` (poza audytem) |
| `_benchmark_validation[status]`, `[status]#2` | FROZEN `v126_academic.py` | lista wyjątków + adapter `z_walidacji_benchmarkow` (poza audytem) |
| `_power_quality[compatibility_status]` | FROZEN `v126_academic.py` | `WYCOFYWANA_AB-1d_min[POWER_QUALITY_HARMONICS]` |
| `_walidacja_iec[status]` | `api/proof_pack.py` | przebudowany (5 towarzyszy) |
| `build_certyfikat_view[status]` | `certyfikat_zgodnosci.py` | przebudowany |
| `_pass[status]`, `_fail[status]` + kaskada, D2, bieg | `raport_zgodnosci.py` | przebudowany; jeden kształt pozycji dla WSZYSTKICH kategorii raportu |
| `_sprawdz_ryzyko_blokady_szyn[wynik]` (obie gałęzie) | `wzorzec_c_generacja_lokalna.py` | przebudowany |
| `ochrona_lom.Verdict` | `ochrona_lom.py` | zastąpiony `OcenaNastawyLom` (R-5). Uwaga: tokeny `OK/INFO/WARN/ERROR` nie należą do TOKENY_WERDYKTU, więc guard sam by go nie zgłosił — przebudowa z karty, nie z guardu. |

Audyt wymienił 3 nośniki FROZEN; pomiar dał 6 FROZEN + 5 miejsc spoza FROZEN.

**Front (`--frontend`, `ui2/**/api.ts`):** 9 trafień. `oze/api.ts
WerdyktZbiorczyCertyfikatu.status` naprawiony (towarzysze z backendu). 8 na liście
wyjątków frontu z powodem: `ocena/api.ts PozycjaOceny.stan`, `OdpowiedzOceny.werdykt`
(kontrakt wyniku wyjaśnialnego — towarzysze w elementach) oraz 6 luster dostawców jakości w
`jakosc/api.ts` (`WalidacjaItem`, `PozycjaWarunku`, `OcenaWarunkow`, `PozycjaCieplna`,
`KryteriumCieplne`, `DowodCieplnyResponse`), patrz p. 5.

**Luka reguły (KLASA, NIE INSTANCJA) — zmierzona, niezamknięta, patrz p. 5:** reguła audytu §3.3
p. 2(a) obejmuje tylko `Literal`/alias. Pole typowane `StrEnum`/`Enum` z członkiem-tokenem
przechodzi bez zgłoszenia. Pomiar: 7 klas backendu —
`EnergyValidationItem.status`, `NormativeItem.severity/status`,
`ProtectionCurvesITView.normative_status`, `RecommendationEntry.expected_effect`,
`SensitivityPerturbation.decision`, `SensitivityEntry.base_decision` i
`VoltageProfileRow.status` (`analysis/**`).

**Adapter NC RfG — test wymagany vs werdykt:** solver zwraca `pass`/`fail` także dla testów
niewymaganych: T01–T08 w module typu B, a T19 bez SCADA daje `fail`. Agregat liczy naruszenia
tylko dla wymaganych. Adapter zamieniał taki `fail` w NARUSZONE. Naprawione: wejście
i agregat mają jedno źródło (`2d25681a`). Test iloczynu `required × verdict` pilnuje, że liczba
naruszeń = `fail_count`.

**D3 — rodziny:** `maszyna_klasyczna` ma status VALIDATED. Każda rodzina ENM
(synchroniczna, gfl, gfm, magazyn, wiatr_typ_1..4) ma UNVALIDATED, a nieznana UNKNOWN (fail-closed).

## 2. Zmienione pliki

Backend src:
- `api/{generators,proof_pack,v126_academic}.py`
- `application/analyses/{certyfikat_zgodnosci,ochrona_lom,raport_zgodnosci,werdykt_projektowy}.py`
- nowe: `application/analyses/wynik_inzynierski_v126.py`, `application/ncrfg_compliance/wynik_inzynierski.py`, `solver_input/status_modelu.py`
- `application/ncrfg_compliance/bieg.py`
- `application/reference_patterns/wzorzec_c_generacja_lokalna.py`
- `domain/{der_protection_functions,der_readiness}.py`
- `enm/dynamika_modele.py`
- `solver_input/{dowod_ncrfg,provenance}.py`
- `schemas/openapi_snapshot.json`

Backend testy:
- `tests/api/test_{certyfikat_zgodnosci,dowod_certyfikatu_dokumentow,generators_api,lom_protection_api,proof_pack_api,wniosek_osd,quality_analysis_runs_api}.py`
- nowy: `tests/api/test_status_modelu_api.py`
- `tests/application/analyses/test_{der_sn_documents,ochrona_lom}.py`
- nowe: `tests/application/analyses/test_wynik_inzynierski{,_v126}.py`
- `tests/application/reference_patterns/test_wzorzec_c_generacja_lokalna.py`
- `tests/ci/{generuj_odpowiedzi_v126,test_v126_odpowiedzi_fixtury}.py`
- `tests/domain/test_der_{protection_functions,readiness}.py`
- nowe: `tests/enm/test_status_walidacji_parametrow.py`, `tests/solver_input/test_status_modelu.py`
- `tests/test_solver_input_dowod_ncrfg.py`

Frontend:
- nowe: `ui2/wyniki/ocena/{WynikWyjasniony.tsx,wynik.css,__tests__/wynikWyjasniony.test.tsx}`
- `ui2/wyniki/ocena/{api,model,strings}.ts`, `EkranOceny.tsx`, `ocena.css`
- `ui2/oze/macierz/{SzczegolWerdyktu.tsx,macierzModel.ts,strings.ts}` + nowy test `wynikInzynierskiMacierzy.test.tsx`
- `ui2/oze/{api.ts,lom/*}`
- `ui2/wyniki/akademickie/{EkranAnalizAkademickich.tsx,api.ts,strings.ts}` + nowe `__tests__/{wynikInzynierski.test.tsx,wynikiInzynierskieV126.json}`
- nowy: `ui2/inspector/SekcjaModeluDynamicznego.tsx` + test
- `ui2/inspector/{InspectorPanel.tsx,inspectorModel.ts,strings.ts}`, `ui2/adapters/inspectorAdapter.ts`
- `types/enm.ts`, `ui/ncrfg-tests/api.ts`, `ui/network-build/station-der/readiness.ts`
- fikstury testów macierz/wniosek/co-wymaga-uwagi
- 7 fixtur `harness-fixtures/generated/*`

Skrypty, CI i dokumentacja:
- nowe: `scripts/explainable_verdict_{guard.py,allowlist.txt,frontend_allowlist.txt}`, `scripts/test_explainable_verdict_guard.py`
- `scripts/tsconfig_gate_guard.py` (budżet 105 → 104), `scripts/test_solver_input_substitute_guard.py` (piny)
- `.github/workflows/python-tests.yml` (2 kroki)
- `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`

## 3. Weryfikacja (kody wyjścia łapane bezpośrednio)

| Polecenie | Wynik |
|---|---|
| `poetry run pytest tests/ -q -m "not pandapower and not andes" -x -p no:cacheprovider` | EXIT=0 — 16816 passed, 37 deselected, 0 failed (35 min, po `8470a212`) |
| `poetry run python ../scripts/guardy_z_ci.py` | EXIT=0 — 99/99 guardów zielonych, testy własne guardów 1105 passed, lint jak CI zielony |
| `poetry run pytest -q ../scripts` (w ramach guardy_z_ci) | 1105 passed |
| `black --check src tests`; `black --check --config pyproject.toml ../scripts` i `scripts`; `ruff check` (te same zakresy) | 0 |
| `npm run type-check` / `npm run lint` | 0 / 0 |
| vitest `src/ui2/oze src/ui2/inspector src/ui2/wyniki src/ui/ncrfg-tests src/ui/network-build/station-der` | 0 — 157 plików, 2135 testów |
| pełny `npm test` | EXIT=0 — 898 plików, 12579 passed, 14 todo |
| `python scripts/explainable_verdict_guard.py` / `--frontend` | 0 / 0 |
| dialog_completeness, dead_click, ui_terminology, forbidden_ui_terms, no_codenames, ui_production_codes | 0 (każdy) |
| `eksport_fixtur_harnessu.py --sprawdz` | 0 |

Pierwszy przebieg `guardy_z_ci` był czerwony. Wszystkie przyczyny naprawione u źródła w `e258d40e`:
- `api_lifecycle` i `v12xx_canon`: nowa trasa nie była w macierzy API.
- `route_prefix`: adres był sklejony z dwóch literałów.
- `ui_math`: w komentarzu stał indeks ASCII.
- `tsconfig_gate`: fikstury testów nie miały nowych pól; dług spadł do 104, budżet obniżony.
- pin pól kontraktu: 3841 → 3861, z pomiarem różnicy zbiorów.

Pełny pytest był czerwony na dwóch testach, oba naprawione:
- `test_no_any_in_domain_types`: mój serializer zwracał `Any` → teraz `object`; migawka OpenAPI bez zmian.
- pin kluczy `OcenaElementu` w teście trasy design-verdict (`8470a212`).

## 4. Fixtury i piny regenerowane (z powodem)

- `harness-fixtures/generated/*` (7 plików): generatorem `eksport_fixtur_harnessu.py`,
  sprawdzenie `--sprawdz` = 0. Powody: `wynik_inzynierski` w biegu NC RfG i V12.6,
  `OcenaNastawyLom` w scenie LoM, pola wyjaśnialności w werdykcie i zwarciach, T19
  poza wymaganiem → NIE_DOTYCZY.
- `schemas/openapi_snapshot.json`: `generuj_snapshot_openapi.py`. Powody:
  `wynik_inzynierski`, trasa status-modelu, `status_walidacji`.
- `akademickie/__tests__/odpowiedziSolvera.json`: generator `generuj_odpowiedzi_v126.py`.
  **Rozjazd zastany:** `hosting_capacity_mw` 7,8 → 7,5 MW (ziarno Monte Carlo ze skrótu
  ładunku). Parytet pliku porównywał tylko klucze, więc rozjazd nie był widoczny. Wpis PRZED/PO
  jest w rejestrze przeliczeń generatora. Rodzaj jest zdjęty z powierzchni (410).
- `wynikiInzynierskieV126.json` (nowy): ten sam generator; parytet WARTOŚCI z adapterem.
- Odciski ENM (`test_status_walidacji_parametrow.py`): literały liczone kodem SPRZED
  karty. Bez zmiany odcisków: brak statusu nie trafia do zrzutu.
- `input_hash` LoM przypięty (`b62e0f1c…`) bez zmiany; liczby okien 2,0 / 47,5 / 51,5 bez zmian.
- Budżet `tsconfig_gate` 105 → 104. Piny `test_solver_input_substitute_guard`:
  3861 pól, 540 plików, solver_input 13, application 239.

## 5. Czego nie zrobiono i dlaczego

1. **Luka reguły guardu dla `Enum`/`StrEnum` (7 klas `analysis/**`) i 6 luster
   `jakosc/api.ts` na liście wyjątków frontu.**
   - Stan: towarzysze istnieją tam pod nazwami dostawcy (`observed_value`, `limit_*`,
     `margin_pct`, `wymagana`, `granica`, `margines_procent`), ale brakuje podstawy, a
     czasem marginesu i dowodu.
   - Dlaczego nie zrobiłem: rozszerzenie reguły to zmiana tekstu audytu §3.3, przeniesionego
     1:1. Do tego przebudowa 7 dostawców analiz i ich konsumentów (ekrany jakości, raporty) —
     to decyzja zakresu dla orkiestratora.
   - Dług jest zmierzony i nazwany z plikami (p. 1), nie ukryty. Lista wyjątków frontu
     zawiera powód przy każdej pozycji.
2. **Mapowanie W-68 katalogu na status parametrów:** nie zrobione. Katalog nie niesie
   statusów sekcji, więc nie ma z czego mapować. Czytnik `status_parametrow` zwraca UNKNOWN,
   gdy pole jest puste.
3. **Szwy integracyjne z wykonawcą 1:**
   - `werdykt_projektowy.py`: lokalna tabela `_DOMENA_FIZYCZNA_BIEGU_LOKALNIE` (komentarz
     „SZEW INTEGRACYJNY AB-1a: zastąpić importem domena_fizyczna_biegu (wykonawca 1)”)
     oraz lokalny `ZrodloStatus` (szew do `StatusZrodla`, D5).
   - Front: mapa etykiet `DOMENA_FIZYCZNA_PL` w `ocena/strings.ts` jest duplikatem, który
     trzeba połączyć z enumem wykonawcy 1.
4. **Pozytywna ścieżka certyfikatu** zależy dziś od koniunkcji testów wymaganych. Moduł z
   zerem wymaganych daje pustą koniunkcję. To należy do D6 wykonawcy 1 i **pęknie przy
   integracji**, jeśli `brak_wymaganych_testow` zablokuje tę ścieżkę — do sprawdzenia
   przez orkiestratora.
5. **Walidacja porównawcza V12.6:** adapter jest osiągalny z trasy API, ale rodzaj jest
   wycofany z toru projektanta (`nieprezentowane.ts`, decyzja właściciela). Test frontu
   sprawdza renderer elementu na tej pozycji wstrzykniętej do odpowiedzi NER, co jest
   jawnie opisane w teście.
6. **Zrzuty ekranów żywej aplikacji** (dyrektywa 8, gate B-02): nie wykonane. Dowód jest
   z testów komponentów (natywna ścieżka `userEvent`), nie z renderu przeglądarki.

## 6. Moje decyzje

- Rodzina ENM `synchroniczna` ma status UNVALIDATED. Nie dziedziczy wyroczni
  `maszyna_klasyczna`, bo ta dotyczy innego modelu równań.
- Domeny w szwie:
  - `protection_sn` → SHORT_CIRCUIT;
  - NER V12.6 → SEQUENCE_DOMAIN;
  - walidacja porównawcza, NC RfG i model → brak domeny (`None`).
- Podstawa NC RfG:
  - dokument = wersja procedury z biegu, `UNVERIFIED_SOURCE` dla WSZYSTKICH testów;
  - w uwadze rewizja profilu operatora;
  - dla T20 dopisek o stałej silnika.
- „Spełnia” bez dopuszczalnego dowodu → BRAK_PODSTAW z nazwanym stanem, osobno dla każdej
  zdolności: test bez treści, brak symulacji, limit niezweryfikowany, deklaracja, brak
  klasyfikacji (fail-closed). Dla T14/T15 wartość i zapas są `None` (napięcie
  „symulowane” jest przypisane, nie policzone), a punkt krytyczny pochodzi z czasu obwiedni.
- Test niewymagany z werdyktem solvera → NIE_DOTYCZY z dopiskiem „Wynik solvera poza
  wymaganiem: …”.
- LoM:
  - podstawy okien mają `dokument=None` i `UNVERIFIED`, w uwadze opis art. 13 rozporządzenia
    2016/631;
  - usunięte błędne „IEEE 1547 / NC RfG Art. 14” (w domenie: dobór funkcji, gotowość DER,
    lustro TS);
  - BESS nazwany `poza_zakresem_rfg_do_OD-40` w polu LoM i w kwestii otwartej doboru funkcji;
    w gotowości DER tylko przez tę kwestię (bez nowego kodu gotowości).
- Semantyka „PASS dla braku progu” we wzorcu C bez zmian (gałąź INFO ma teraz wymaganie
  i zapas `None`).
- Raport zgodności: towarzysze dopisani na końcu pozycji, a dotychczasowe klucze w starej
  kolejności. Werdykt całego raportu (agregat liczników) nie dostał towarzyszy, bo jego
  dowodem są pozycje.
- Werdykt zbiorczy certyfikatu:
  - wartość = moduły zgodne, wymaganie = wszystkie moduły;
  - zapas `None`, bo werdykt zliczeniowy nie ma skalarnego zapasu;
  - dowód = odcisk deterministyczny biegu.
- Lista wyjątków backendu przyjmuje tylko pliki FROZEN. Adapter musi być osiągalny z trasy
  (domknięcie wywołań po nazwie). Adnotacja WYCOFYWANA jest ważna tylko przy wpisie
  rejestru zdolności, który nie jest wycofany.

## 7. Konsumenci nazywający stan „niezgłaszalny”

- **Certyfikat zgodności NC RfG:** braki nazywają test i stopień, np. „zdolność:
  T12:DECLARATION” (pin „PPM typu A z samą deklaracją T12 nie jest reportable”) oraz T20
  przy podanym THD.
- **Wniosek OSD:** deleguje do braków certyfikatu; `EkranWniosku` pokazuje listę braków.
- **Macierz NC RfG:**
  - baner `evidence_note_pl`;
  - `SzczegolWerdyktu`: stopień dowodowy z uzasadnieniem oraz blok „Wynik inżynierski” z
    NAZWANYM stanem (test `wynikInzynierskiMacierzy.test.tsx`: T10 „Test bez treści”, T14
    „Brak symulacji”);
  - `SekcjaZgodnosciPrzekrojowej`.
- **Ekran „Ocena techniczna wyników”:** każda podstawa ma odznakę „źródło niezweryfikowane”.
- **Ekran LoM:** odznaka przy każdej ocenie i sekcja „Magazyn energii poza zakresem wymagań”.
