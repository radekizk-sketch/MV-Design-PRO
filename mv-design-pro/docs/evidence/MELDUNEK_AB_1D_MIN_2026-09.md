# Meldunek wykonawcy — AB-1d_min (Program A/B), 2026-09-23

Wykonawca: Claude Opus 5.5, worktree `agent-a771e4601993fbd8f`, commity bez push.
Baza: `origin/claude/relaxed-sagan-ww188q` @ `a2409c0d` (zawiera `a13ad4f2` — naprawa
czerwieni bazy — oraz `1ee2c135` — fikstura `wynikiInzynierskieV126.json`).

## 1. Inwentarz list rodzajów biegu (stan PRZED kartą, `a13ad4f2`)

Karta mówiła o pięciu listach; pomiar znalazł **dziewięć**. Każda jest dziś wyprowadzona
z jednego źródła albo do niego przypięta testem.

Jedno źródło: `backend/src/application/solvers/solver_capability_registry.py::RODZAJE_BIEGOW`
(dataclass `RodzajBiegu`, opcjonalny `SolverNieobecny`).

| # | Lista (plik:linia na `a13ad4f2`) | Co zrobiono |
|---|---|---|
| 1 | `domain/analysis_run.py:10` `AnalysisType = Literal["PF","short_circuit_sn"]` (legacy magazyn PF/SC) | Przypięta testem jako podzbiór tabeli (`test_legacy_analysis_type_jest_podzbiorem_tabeli`). |
| 2 | `domain/execution.py:49-67` `ExecutionAnalysisType` (10 członków, FROZEN) | Trzy nowe człony addytywne (HARMONICZNE, SKAN_CZESTOTLIWOSCIOWY, SUPRAHARMONICZNE). Przypięta (`test_execution_analysis_type_frozen_przypiety_do_tabeli`). |
| 3 | `enm/canonical_analysis.py:990,1028-1044` gałęzie dispatchera + `:478-493` `_execution_analysis_type_for_run` | Mapowanie wyprowadzone z tabeli; nowa gałąź `elif run.analysis_type in RODZAJE_BIEGOW_BEZ_SOLVERA`. Gałęzie czytane przez AST w `test_rejestr_domen_fizycznych.py`. |
| 4 | `api/v125_contracts.py:320,338,346` — trzy słowniki (`solver_family`, `formula_set_version`, `standard_basis_ref`) | Zastąpione odczytem `RODZAJE_BIEGOW.get` z tymi samymi wartościami awaryjnymi. Test bitowy koperty odtwarzalności (`test_koperta_odtwarzalnosci_bitowo_jak_przed_karta`). |
| 5 | `application/calculation_readiness/service.py:44` `CalculationType` + `:69` `CALCULATION_LABEL_PL` | Etykiety z tabeli; `TYPY_GOTOWOSCI_BEZ_SOLVERA` przez `get_args`; przypięta (`test_gotowosc_przypieta_do_tabeli`). |
| 6 | `api/execution_runs.py:42` (opis pola w `CreateRunRequest`) | Opis wyprowadzony z enumu. |
| 7 | `api/execution_runs.py:110` `_canonical_analysis_type` | Wyprowadzone przez `rodzaj_biegu_z_typu_wykonawczego`; PROTECTION nadal 400. |
| 8 | `frontend/src/ui/study-cases/types.ts:232` (typ wykonawczy frontu) | Przypięta jako podzbiór tabeli BEZ rodzajów bez solvera (`test_typ_wykonawczy_frontu_jest_podzbiorem_tabeli_bez_rodzajow_bez_solvera`). |
| 9 | `application/analyses/v126_gotowosc.py::ocen_gotowosc_v126` — zaszyta krotka `(HOSTING_CAPACITY, OPF_LOSS_LCC)` rodzajów WYCOFANYCH | Rozjechała się z rejestrem przy wycofaniu harmonicznych i SSCI (klasa, nie instancja). Wycofanie jest teraz odczytem rejestru (`availability == "withdrawn"`), tym samym co 410 w API. Para rejestr ⇔ 410 ⇔ katalog ⇔ gotowość przypięta w `test_wycofanie_jednym_mechanizmem_rejestr_api_katalog`. |

Dodatkowo słownik `api/v126_academic.py::_ANALIZY_WYCOFANE` niesie już tylko TREŚĆ odmowy.
O tym, CZY rodzaj jest wycofany, rozstrzyga rejestr (`_wycofanie_v126`). Wpis `withdrawn`
bez treści daje `KeyError`, nie cichy bieg.

## 2. Zmienione pliki (względem `a2409c0d`)

Commity: `4d804033`, `481eb4bd`, `0ed77ead` oraz commit domykający regresję i ten meldunek.

**Backend — źródło**
- `application/solvers/solver_capability_registry.py`: tabela `RODZAJE_BIEGOW`, `SolverNieobecny`, `SolverNieobecnyError` (kod `domena.solver_nieobecny`); PQH i SSCI z `availability="withdrawn"`.
- `domain/execution.py`: trzy człony addytywne.
- `api/execution_runs.py`: mapowanie z tabeli; `KontraktCzestotliwosciError` → 422 `{kod, komunikat}`.
- `enm/canonical_analysis.py`:
  - mapowanie z tabeli;
  - walidacja opcji rodzajów bez solvera przy tworzeniu;
  - gałąź odmowy;
  - usunięty martwy stash `pominiete_zrodla`.
- `enm/biegi_czestotliwosciowe.py` (nowy): pierwszy konsument kontraktów — walidacja opcji biegu i odmowa.
- `api/v125_contracts.py`: trzy słowniki wyprowadzone z tabeli.
- `application/calculation_readiness/service.py`: trzy rodzaje; `_check_solver_nieobecny` zawsze `blocked`; rodzaje wyłączone z `evaluate()`.
- `api/v126_academic.py`:
  - PQH i SSCI w `_ANALIZY_WYCOFANE`; wycofanie bramkowane rejestrem;
  - `/ssci_impedance/stability` z 410;
  - usunięte przestrzenie `harmonic-limits` i `converter-modes`;
  - usunięty martwy blok `pominiete_zrodla` (POST) i pola `pominiete_zrodla`/`zrodla_widma` (GET — bez konsumenta po usunięciu typów we froncie).
- `application/analyses/v126_katalog.py`: pole `nastepca_pl`; karty PQH i SSCI jako wycofane (powód i następca); usunięte stałe THD.
- `application/analyses/v126_gotowosc.py`:
  - wycofanie z rejestru;
  - usunięte martwe `_warunki_harmoniczne`, `_warunki_ssci`, gałęzie PQH/SSCI w `_dane_z_modelu`, `_KOD_KARTA`, `_KOD_WIDMO`.
- `solver_input/v126_contracts.py`: usunięta osierocona `pominiete_zrodla_v126`; poprawione docstringi, które na nią wskazywały.
- `network_model/solvers/harmoniczne/{__init__,kontrakty,os_czestotliwosci}.py` (nowy pakiet, tylko te trzy pliki): `OsCzestotliwosci`, `SupraharmonicBand`, `KontraktCzestotliwosciError`; bez wartości domyślnych.
- `network_model/catalog/types.py`:
  - `WIDMO_PRADU_RZEDY_CALKOWITE` i pole addytywne `ConverterType.harmonic_spectrum_kind`;
  - KAT-T-009 (para pole ⇔ rodzaj);
  - KAT-T-015/016 („rząd 2..50") zawężone do `CURRENT_SPECTRUM_INTEGER_ORDER`.
- `network_model/catalog/niezmienniki_katalogu.py`: nazwa i uzasadnienie KAT-T-015.
- `network_model/catalog/odcisk.py`: `POLA_ADDYTYWNE_POMIJANE_GDY_BRAK`. Odcisk katalogu bez zmian: `0115ee1a…2d95` (przypięty).
- `backend/scripts/eksport_fixtur_harnessu.py`: bez scen PQH/SSCI; opcje biegu jak w API (`{"model": …}`).
- `backend/schemas/openapi_snapshot.json`: przegenerowany.

**Backend — testy**
- Nowe:
  - `tests/application/test_rodzaje_biegow_jedna_lista.py`;
  - `tests/network_model/solvers/harmoniczne/test_kontrakty_czestotliwosci.py`;
  - `tests/network_model/catalog/test_rodzaj_widma_harmonicznych.py`.
- Zmienione:
  - `test_rejestr_domen_fizycznych.py`, `test_advanced_solver_capability_registry.py`, `test_v126_katalog_analiz.py`;
  - `ci/test_v126_rodzaje_parytet.py`, `ci/test_fixtury_harnessu.py` (6 nieprezentowanych, 4 WYCOFANE);
  - `api/test_v126_opf_loss_lcc_api.py`, `api/test_v126_ssci_stability_api.py`;
  - `api/test_v126_converter_widmo_gate_api.py` — przepisany na iloczyn „rodzaj wycofany × 6 stanów danych przekształtnika → 410”;
  - `api/test_v126_generator_q_missing_api.py` — zdjęte 2 testy bramki Q przekształtnika SSCI (precedens W3-E, intencja w docstringu);
  - `application/analyses/test_v126_gotowosc.py` — testy bramek PQ/SSCI zastąpione iloczynem „rodzaj × karta z widmem/bez × widmo ręczne → WYCOFANA bez warunków”; parytet z rejestrem;
  - `application/analyses/test_v126_wzory.py` — pin 12 → 10 kluczy z pomiaru;
  - `network_model/dynamika/test_tozsamosc.py`.

**Skrypty i CI**
- Nowe:
  - `scripts/program_ab_freeze_rows_guard.py` + `scripts/test_program_ab_freeze_rows_guard.py`;
  - krok w `.github/workflows/docs-guard.yml`.
- `scripts/explainable_verdict_guard.py`: adnotacja `WYCOFANA[...]` wymagająca `withdrawn` w rejestrze; poprawiony błąd wyrażenia regularnego (cyfry w kluczu, `[A-Z_]` → `[A-Z0-9_]`, w obu adnotacjach); zaktualizowane allowlist i test.
- `scripts/ui_math_guard.py`: pusty `WYJATKI_ZNANE`, PIN 9 → 8; zaktualizowany test.
- `scripts/test_solver_input_substitute_guard.py`: piny przeliczone (sekcja 4).

**Frontend**
- Usunięte:
  - `src/ui2/wyniki/ssci/**`;
  - zakładka SSCI (`ui2/spaces/wyniki/{obszary.ts,WynikiWarsztat.tsx,strings.ts}`);
  - akcja `stabilnosc-ssci`;
  - scena ssci harnessu;
  - E-40 z routera (`visibleInNavigation:false` w rejestrze ekranów);
  - zrzuty `dowod_ssci_*.png`.
- `ui2/wyniki/akademickie/**`: karta wycofana pokazuje powód i następcę (sekcja `mvd-akad-katalog-wycofane`) zamiast przycisku uruchomienia. Usunięte panele źródeł harmonicznych i odesłanie SSCI.
- Kontrolka „THD napięcia” usunięta z macierzy NC RfG (`ui2/oze/macierz/*`, `ui/workspace/surfaces/NcRfgTestsTab.tsx`, typ w `ui/ncrfg-tests/api.ts`). Pole FROZEN `harmonic_thdu_percent` w backendzie zostaje.
- `ui/help/HelpPanel.tsx` (dawna linia 48): usunięte:
  - limity IEC 61000-2-4 / IEEE 519 w „PCC”;
  - twierdzenie ROCOF ±2 Hz/s;
  - „max 2 s” dla anti-islanding.

  Poprawione: OSD, a PSE jako OSP.
- Fikstury przegenerowane repo-generatorem `eksport_fixtur_harnessu.py`: `katalog_analiz_v126.json`, `akademickie_scena_biegi.json`, `gotowosc_v126_scena_akademickie.json`, `gotowosc_v126_scena_akademickie_parametry.json` (usunięta).

**Dokumenty**
- `docs/v12xx/REJESTR_KONFLIKTOW.md` (wiersz AB-1d_min).
- `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` (SSCI wycofana).
- `docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` (przegenerowany `inwentarz_katalogow.py`).

## 3. Weryfikacja (kody wyjścia łapane bezpośrednio)

- **Pełna regresja backendu** (`poetry run pytest tests/ -q -m "not pandapower and not andes" -p no:cacheprovider`): bieg zabity (exit 143, SIGTERM) na 59%. Przyczyną były równoległe pełne regresje na tej samej maszynie; bramka integracyjna orkiestratora miała to samo. Do chwili zabicia nie było ani jednego `F`. Pełną regresję na drzewie scalonym wykona orkiestrator (jego polecenie).
  - Wcześniejszy pełny bieg na tym drzewie (przed domknięciem): 13 failed / 17202 passed. Wszystkie 13 naprawiono w commicie domykającym. Były to: bramki PQH/SSCI w testach API; test parytetu GET/POST gotowości; pin kluczy LaTeX; liczniki fikstur harnessu; test tożsamości dynamiki.
- **Regresja warstwowa** (polecenie orkiestratora, kod wyjścia łapany bezpośrednio): `poetry run pytest -q -p no:cacheprovider tests/application tests/api tests/enm tests/solver_input tests/ci tests/network_model tests/domain tests/analysis`.
  - Wynik: **3 failed, 13356 passed**, EXIT=1.
  - Wszystkie 3 porażki to `tests/network_model/dynamika/test_wyrocznia_andes.py` (`ModuleNotFoundError: No module named 'andes'`), czyli testy wyroczni ANDES oznaczone markerem `andes`. Polecenie warstwowe nie miało filtru `-m "not pandapower and not andes"` z karty.
  - Z tym filtrem ten plik daje `3 deselected` (exit 5 = brak zebranych testów).
  - Uczciwie: **pełna regresja: bieg zabity (143); warstwowa: 13356 passed, 3 failed wyłącznie z braku pakietu `andes` (marker wyłączony w karcie), 0 porażek z tej karty.**
- **Uruchomione celowo po domknięciu**, wszystkie zielone: `test_v126_gotowosc_api.py`, `test_v126_wzory.py`, `test_v126_gotowosc.py`, `test_v126_converter_widmo_gate_api.py`, `test_v126_generator_q_missing_api.py`, `ci/test_fixtury_harnessu.py`, `dynamika/test_tozsamosc.py`, `test_rodzaje_biegow_jedna_lista.py`.
- **`poetry run python ../scripts/guardy_z_ci.py`**: exit 0, „KOMPLET ZIELONY”.
  - Uruchomiono 100 guardów ze 100 wołanych przez CI.
  - black/ruff (src, tests, ../scripts, scripts): zielone.
  - `npm run type-check` i `npm run lint`: zielone.
  - `python -m pytest ../scripts`: **1118 passed**.
  - Zgłoszona przez orkiestratora czerwień bazy już nie występuje (naprawiona w `a13ad4f2`).
- **`python scripts/program_ab_freeze_rows_guard.py`**: exit 0 (zapadka 7 znanych naruszeń). **`test_program_ab_freeze_rows_guard.py`**: 13 passed (w komplecie 1118).
- **Frontend**: `npm test` → **898 plików, 12562 passed, 14 todo**, exit 0. Wynik jest po regeneracji fikstury gotowości. `npm run type-check` exit 0, `npm run lint` exit 0.
- **black** (`--config pyproject.toml`) i **ruff** na zmienionych plikach backendu: czyste.

## 4. Piny i fikstury

- **Piny substytutów** (`scripts/test_solver_input_substitute_guard.py`), liczone od `a13ad4f2` (3886 pól / 541 plików):
  - pola 3886 → 3901 (+15). Nowe pola: `aggregation_bandwidth_hz`, `brak_pl`, `f1_hz`, `formula_set_version`, `frequency_resolution_hz`, `harmonic_spectrum_kind`, `kamien`, `measurement_method`, `nastepca_pl`, `solver_family`, `solver_nieobecny`, `source_document`, `standard_basis_ref`, `typy_wykonawcze`, `wymagane_opcje`;
  - pliki 541 → 545; `network_model` 178 → 181; `enm` 49 → 50.

  Commit domykający usunął `pominiete_zrodla_v126` (funkcję, nie pola dataclass). Test pinów przeszedł w `pytest ../scripts` (1118 passed) bez zmiany pinów.
- **ui_math**: PIN 9 → 8. Martwy wyjątek po usunięciu ekranu SSCI.
- **Odcisk katalogu**: `0115ee1a3faf1c42a814ef7cf160e7277ae2f926b1fdb48aced9919e0d6b2d95` bez zmian. Przypięty w `test_rodzaj_widma_harmonicznych.py`; pole addytywne `None` jest pomijane w odcisku.
- **Klucze LaTeX śladu V12.6**: 12 → 10 (8 rodzajów prezentowanych, pomiar).
- **Fikstury harnessu**: przegenerowane `backend/scripts/eksport_fixtur_harnessu.py`, bez ręcznych edycji JSON.
- **`wynikiInzynierskieV126.json` i `odpowiedziSolvera.json`**: uruchomiony generator `backend/tests/ci/generuj_odpowiedzi_v126.py` na bazie zawierającej `1ee2c135` — **zero różnic** (solver FROZEN nietknięty).
- **OpenAPI**: `backend/schemas/openapi_snapshot.json` przegenerowany.

## 5. Czego nie zrobiono i dlaczego

1. `application/analyses/ssci_stability.py::build_ssci_stability_view` zostaje jako kod badawczy bez produkcyjnego konsumenta. Test warstwy aplikacji przypina werdykt badawczy. Karta każe SSCI zostawić jako badawcze (bez tokenu werdyktu na ekranie), nie kasować rdzenia. Powrót na powierzchnię następuje w AB-5H, po poprawnej Z_grid(f). Jest to świadomie pozostawiony kod bez konsumenta — zgłaszam go jawnie.
2. Definicje słownikowe ZKSN i PB-PR w `HelpPanel.tsx` nie zostały zweryfikowane ze źródłem normatywnym. Karta wskazała linię 48, a ta została poprawiona; pozostałych haseł nie sprawdzałem ze źródłem.
3. Kontrolki formularza `harmonic_spectra` dla rodzaju wycofanego zostały w katalogu kart wycofanych (precedens W3-E: karta wycofana niesie historię parametrów). Ekran ich nie renderuje, bo karta wycofana nie ma formularza.
4. Wycofanie `DYNAMIC_STABILITY` należy do AB-2R, nie do tej karty.
5. Plan programu (`PROGRAM_AB_DYNAMIKA_I_JAKOSC_ENERGII_2026-09.md`) i zamrożenie (`FINAL_DYNAMICS_CAPABILITY_FREEZE.md`) **nie były edytowane**. Wiersze nieprzechodzące są w sekcji 7.
6. Wpisy `harmonic_power_flow` i `ssci_*` w `REJESTR_WZOROW_V126` zostają, jak wpisy hosting/OPF po W3-E. GET śladu HISTORYCZNEGO biegu wycofanego rodzaju nadal wzbogaca kroki formułami.
7. Bramka Q przekształtnika SSCI (`_z_conv_components`, `q_mvar or 0.0` w solverze FROZEN) nie ma już strażnika w API, bo rodzaj nie uruchamia się (410). Solver FROZEN (B-01) jest nietknięty. Przy powrocie SSCI w AB-5H bramka musi wrócić razem z rodzajem.

## 6. Decyzje własne

1. **Jedno źródło w module rejestru zdolności** (`application/solvers/solver_capability_registry.py`), nie w `domain/`. Rejestr już był jedynym miejscem domen fizycznych i dostępności; `domain/execution.py` jest FROZEN.
2. **Domena rodzaju bez solvera** pochodzi z wpisu `SolverNieobecny`, nie z mapy zdolności. Para „odmowa ⇔ brak zdolności” jest przypięta testem.
3. **Odmowa 422 już przy tworzeniu biegu** dla niepoprawnych opcji częstotliwości (pierwszy konsument kontraktów). Poprawne opcje przechodzą, a wykonanie kończy się odmową nazwaną `domena.solver_nieobecny`.
4. **Oś częstotliwości bez cichego sortowania i deduplikacji**. Oś nierosnąca jest błędem nazwanym. Siatki muszą być DOKŁADNIE równe siatce wyliczonej.
5. **Odcisk katalogu**: pole addytywne `None` jest pomijane w słowniku odcisku (`POLA_ADDYTYWNE_POMIJANE_GDY_BRAK`), więc hash się nie zmienił.
6. **Usunięcie zakładki SSCI** (ekran, trasa, harness, zrzuty) zamiast zostawienia jej bez werdyktu. Ekran istniał wyłącznie po to, żeby pokazywać werdykt stabilności.
7. **„`v126_academic.py`” w granicach karty** odczytałem jako plik solvera `network_model/solvers/v126_academic.py`, bo karta wymagała zmian w `api/v126_academic.py` (410, usunięcie przestrzeni).
8. **Guard zamrożenia jako zapadka** (`ZNANE_NARUSZENIA` = 7 zmierzonych wierszy). Nowe naruszenie jest czerwone, a naprawione — wymaga zdjęcia z listy.
9. **Gotowość WYCOFANA z rejestru** (lista 9 w sekcji 1) i usunięcie martwych bramek PQH/SSCI z gotowości, POST i wykonawcy, wg precedensu W3-E.
10. **Pola GET `pominiete_zrodla`/`zrodla_widma` usunięte**. Jedyny konsument (typy frontu) został usunięty w tej karcie, a produkt nie utrzymuje zgodności wstecznej.

## 7. Wiersze zamrożenia, które nie przechodzą (pomiar guardem, plan NIE edytowany)

`python scripts/program_ab_freeze_rows_guard.py` → exit 0, zapadka „7 znanych, zero nowych”.

| Wiersz | Stan | Kamień w kolumnie „Domyka” |
|---|---|---|
| B2 | otwarty (GAP → CURRENT) | brak |
| D11 | otwarty (GAP → CURRENT) | 2: AB-2R, AB-5R |
| E2 | otwarty (GAP → CURRENT) | brak |
| E7 | otwarty (PARTIAL → CURRENT) | 2: AB-3R, AB-4R |
| H1 | otwarty (PARTIAL → CURRENT) | brak |
| H2 | otwarty (GAP → CURRENT) | brak |
| H4 | otwarty (PARTIAL → CURRENT) | 6: AB-2R, AB-3R, AB-4R, AB-5R, AB-7a, AB-7b |

Reguła guardu: każdy wiersz zamrożenia z docelowym CURRENT musi mieć dokładnie jeden kamień
domykający w planie programu. B2, E2, H1 i H2 nie mają żadnego, a D11, E7 i H4 mają kilka.
Rozstrzygnięcie należy do właściciela planu.

## 8. Czerwień bazy

Czerwień bazy (mypy `ZrodloStatus` + black na `scripts/test_solver_input_substitute_guard.py`)
naprawiona w `a13ad4f2`. Na bazie `a2409c0d` `guardy_z_ci.py` jej nie zgłasza.
