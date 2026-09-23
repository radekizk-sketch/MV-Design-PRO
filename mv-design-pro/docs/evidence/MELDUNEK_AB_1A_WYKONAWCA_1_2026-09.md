# Meldunek wykonawcy 1 — karta AB-1a (D1, D4, D5, D6, D8a)

**Wykonawca:** Claude Opus 5.5 · **Data:** 2026-09-23 · **Baza:** `529837d2` (gałąź
`claude/relaxed-sagan-ww188q`; worktree startował z `main` 513 commitów wstecz — przestawiony na
bazę karty przed jakąkolwiek zmianą) · **Commity (bez push):** `c4efe7e9` (D5/D6/R-6), `402c2366`
(D1 backend), `815c4ef2` (D4), `d2aeac25` (D1 front), `e0d05c07` (D8a + konsumenci R-6), oraz
commit z tym meldunkiem.

## 1. Inwentarz klasy zmierzony na HEAD `529837d2` (przed zmianą)

| Pomiar | Wynik | Miejsce |
|---|---|---|
| Wpisy rejestru zdolności z literałem `reportable=True` | **24 / 24** (pole zapisywane) | `application/solvers/solver_capability_registry.py:50` (`reportable: bool`), 24 wpisy; agregat `:452` |
| Mapowanie wpis rejestru → identyfikator proweniencji | **0** (brak) | — |
| Wpisy rejestru dowodowego proweniencji | 11, wszystkie dynamiczne/NC RfG, **0** `VALIDATED_SIMULATION` | `solver_input/provenance.py:237-366` |
| Dwie prawdy o tej samej zdolności | `DYNAMIC_STABILITY`: rejestr `reportable=True`, proweniencja `dynamic_stability.fault_clear = UNVALIDATED_MODEL` | jw. |
| Rodzaje biegów dyspozytora | 7 zwykłych (`PF`, `rozplyw_niesymetryczny`, `short_circuit_sn`, `phase_state_sn`, `dynamic_stability`, `dynamika_rms`, `protection_sn`) + 14 `v126:*` | `enm/canonical_analysis.py:1020-1037` (`_wykonaj_analize_biegu`), `:476-500` |
| Rodzaje dyspozytora BEZ wpisu w rejestrze | **2**: `dynamika_rms`, `protection_sn` | — |
| Wpisy rejestru z `analysis_type` niebędącym rodzajem biegu | **14** (V12.6: rejestr trzyma `power_quality_harmonics`, dyspozytor `v126:power_quality_harmonics`) | jw. |
| Konsumenci `reportable` rejestru | `GET /api/solver-capabilities` (3 trasy, odpowiedź nietypowana) + 1 test; front **0**, gotowość **0** | `api/solver_capabilities.py` |
| Testy NC RfG `eligible` przed R-6 | 11 z 20 (T05–T13, T19, T20) | `solver_input/dowod_ncrfg.py:46-67` |
| Pusta koniunkcja „zgodny/reportable" | **2** miejsca: moduł bez testu wymaganego (`_ocena_modulu`, `:202`), bieg bez modułów (`all([])`, `:250`) | `solver_input/dowod_ncrfg.py` |
| Rejestr kodów odmów rdzenia | `KODY_ODMOW` w `network_model/solvers/dynamika/kontrakty.py:103` (16 kodów) — **nie** w `zdarzenia.py`, jak mówi karta | — |
| Rejestr kodów odmów adaptera | `KODY_ODMOW_ADAPTERA` w `enm/adapter_dynamiki.py:172` (16 kodów), zamknięty, z przypiętym testem | — |
| Kontrakty wejściowe guarda podstawień | 3841 pól, 537 plików | `scripts/test_solver_input_substitute_guard.py` |
| Nieprawdziwe zdanie w rejestrze długu | „każdy wpis ma … status raportowy" | `docs/v12xx/REJESTR_DLUGU.md:53` |

## 2. Zmienione pliki

Backend (src): `application/solvers/solver_capability_registry.py`, `api/solver_capabilities.py`,
`api/canonical_run_views.py`, `api/execution_runs.py`, `enm/badanie_zgodnosci.py` (NOWY),
`enm/adapter_dynamiki.py`, `enm/canonical_analysis.py`, `solver_input/provenance.py`,
`solver_input/dowod_ncrfg.py`; `schemas/openapi_snapshot.json`.
Backend (testy): NOWE `tests/application/test_rejestr_domen_fizycznych.py`,
`tests/enm/test_badanie_zgodnosci.py`, `tests/solver_input/test_proweniencja_ab1a.py`; zmienione
`tests/test_advanced_solver_capability_registry.py`, `tests/test_solver_input_dowod_ncrfg.py`,
`tests/api/test_certyfikat_zgodnosci.py`, `tests/api/test_wniosek_osd.py`,
`tests/api/test_dowod_certyfikatu_dokumentow.py`, `tests/enm/test_adapter_dynamiki.py`,
`tests/test_dynamika_rms_run.py`.
Skrypty: `scripts/test_solver_input_substitute_guard.py` (piny), `scripts/dynamika_zero_default_guard.py`
(+1 plik skanu).
Frontend: NOWE `src/types/domenaFizyczna.ts`, `src/types/__tests__/domenaFizyczna.openapi.test.ts`,
`src/ui2/wyniki/wzorzec/__tests__/domenaFizycznaNaglowka.test.tsx`; zmienione
`src/ui/workspace/analysisRunContract.ts`, `src/ui2/freshness/useSwiezoscNaglowka.ts`,
`src/ui2/wyniki/wzorzec/{EkranAnalizy.tsx,wzorzecModel.ts,strings.ts,wzorzec.css}`,
`e2e/critical-oze-evidence.spec.ts`, 2 fikstury harnessu (`harness-fixtures/generated/`).
Dokumenty: `docs/v12xx/REJESTR_DLUGU.md` (korekta), ten meldunek.
**`network_model/solvers/**`: zero zmian** (patrz §6, decyzja 3).

## 3. Weryfikacja (kody wyjścia łapane bezpośrednio)

| Polecenie (katalog) | Kod | Wynik |
|---|---|---|
| `poetry run pytest tests/ -q -m "not pandapower and not andes" -p no:cacheprovider` (backend) | 0 | **16 932 passed, 0 failed, 0 skipped**, 37 deselected (markery pandapower/andes), 2197,84 s |
| `poetry run python -m tests.walidacja_fizyczna.uruchom` (backend) | 0 | `WERDYKT: WALIDACJA WYKONANA`, `kroki_nieudane: []` (42 + 12 + 210 passed) |
| `poetry run python ../scripts/guardy_z_ci.py` (backend) | 0 | `KOMPLET ZIELONY.`, testy własne guardów 1058 passed |
| `poetry run python ../scripts/mypy_ratchet_guard.py` | 0 | 0 błędów (próg 0) |
| `poetry run black --check src tests` / `poetry run ruff check src tests` | 0 / 0 | — |
| `npm run type-check` / `npm run lint` (frontend) | 0 / 0 | — |
| `npm test` (frontend, pełny) | 0 | 896 plików, 12 555 passed, 14 todo (zastane `it.todo`, nie skipy tej karty) |
| `npm run test:e2e:real` (critical-run-flow + critical-oze-evidence, realny backend; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` — zainstalowana przeglądarka to rewizja 1194, Playwright szuka 1208) | 0 | 2 passed |

Pierwsze przebiegi przed poprawkami (uczciwie): warstwowa regresja (`tests/api tests/application
tests/enm tests/solver_input tests/ci`) dała 42 failed / 6192 passed — wszystkie z klasy R-6
(fikstury certyfikatu/wniosku OSD z `harmonic_thdu_percent` → T20 wymagany i już niedowodowy;
2 fikstury harnessu). Naprawione u źródła (§4), nie wykluczone. `guardy_z_ci` przed przeliczeniem
pinów: 1 czerwony (pin pól/plików) — przeliczony z pomiaru.

### 3.1 Pełna regresja backendu

Pełny `tests/` na drzewie z commitem `e0d05c07`: `16932 passed, 37 deselected in 2197.84s`, kod 0.
Wyrocznie zewnętrzne (markery `pandapower`, `andes`) nie były uruchamiane w tym środowisku — to
osobne joby CI.

## 4. Piny przeliczone (z pomiaru, wzorzec R10 §W.3)

| Pin | Przed | Po | Skąd liczba |
|---|---|---|---|
| Pól kontraktów wejściowych (guard podstawień) | 3841 | **3866** | `contract_fields()` na drzewie vs `529837d2` (`git archive` + ten sam skaner z podmienionym `BACKEND_SRC`): +25 nazw, 0 skasowanych; lista nazw i nośników w komentarzu testu |
| Przeskanowanych plików | 537 | **538** | `git diff --name-status 529837d2 HEAD -- backend/src/`: jeden wpis `A` (`enm/badanie_zgodnosci.py`) |
| `enm` plików | 48 | **49** | jw. |
| Zapadka długu / wykluczenia | 56/255, 13/31 | bez zmian | PASS guarda bez zmian |
| `dynamika_zero_default_guard` pliki | 3 | **4** | `enm/badanie_zgodnosci.py` dopisany do skanu (klasa: czwarte miejsce kontraktu dynamiki) |
| OpenAPI snapshot | — | przeliczony `scripts/generuj_snapshot_openapi.py` | zmienione wyłącznie 3 ścieżki `/api/solver-capabilities*` + 5 schematów (`PhysicsDomain`, `ZdolnoscSolveraV1`, `OcenaDowodowaZdolnosciV1`, `RejestrZdolnosciSolverowV1`, `ZdolnosciRodzajuAnalizyV1`) |
| Liczba wpisów rejestru zdolności | 24 | **26** | + `DYNAMIKA_RMS`, `PROTECTION_SN` |
| Hashe 3 scenariuszy z fikstur (SO-1A, `SCENARIUSZ_CZASOWY`, adapter) | — | przypięte bit w bit | `scenariusze.py` nietknięty (git diff) — wartości = HEAD |
| `input_hash` opcji biegu dynamiki sprzed karty | — | przypięte (3 fikstury) | reader rodzaju badania nie zapisuje do opcji |
| Fikstury harnessu | — | **2 pliki** przez generator `scripts/eksport_fixtur_harnessu.py` (bieg generatora zmienił dokładnie te 2) | `ncrfg_zgodnosc_przekrojowa_scena_macierz.json` (ocena dowodowa T05/T10/T12/T13/T20), `zbieznosc_scena_naglowek.json` (`physics_domain`) |

## 5. Czego NIE zrobiono i dlaczego

1. **`availability="withdrawn"`** dla `POWER_QUALITY_HARMONICS`/`SSCI_IMPEDANCE`/`DYNAMIC_STABILITY` — zakaz karty (AB-1d_min / AB-2R). Domeny przypisane, `availability` bez zmian (test przypina).
2. **Pozostałe listy rodzajów biegów** (`domain/analysis_run.py:10`, `ExecutionAnalysisType`, słowniki `v125_contracts.py`) nie zostały wyprowadzone z rejestru — karta §1.2 przypisuje to AB-1d_min; test parytetu pilnuje dyspozytora w obie strony.
3. **Konsument `WartoscZProweniencja`** (pole `podstawa` w D2/D7) należy do wykonawcy 2 tej samej karty; w tej gałęzi kontrakt ma wyłącznie testy. Po integracji D2/D7 łańcuch jest domknięty — jeśli integracja tego nie zrobi, kontrakt jest bez konsumenta (dług).
4. **Certyfikat dla modułu klasy A z certyfikatem PTPiREE i zerem testów wymaganych** — ocena dowodowa mówi teraz `not_reportable / REQUIREMENT_UNVERIFIED`, a certyfikat nadal powstaje (reguła FAB-K w `certyfikat_zgodnosci.py`: certyfikat producenta jako samodzielna podstawa). Nie zmieniłem tego: metoda dowodu `CERTIFICATE` to AB-1b (§6.6 p. 5 programu). Obie odpowiedzi nazywają swoją podstawę (nota dowodowa w macierzy; certyfikat cytuje wykaz), ale zgłaszam jako napięcie do rozstrzygnięcia w AB-1b.
5. **`claim_kind` wpisów rejestru solverów** zostaje domyślne (`DYNAMIC_PERFORMANCE`), więc API pokazuje np. dla zwarć `claim_kind_pl: zachowanie_dynamiczne` — bez wpływu na dopuszczalność (VALIDATED_SIMULATION/UNVALIDATED_MODEL), ale etykieta semantycznie myląca. Trzeci rodzaj twierdzenia (obliczenie stanu ustalonego) wymaga zmiany zamkniętego `ClaimKind` — nie robiłem tego bez architekta.
6. Zrzuty ekranu nagłówka (oba motywy) — bramka B-02/§4 p. 7 należy do Fable; nie samocertyfikuję wyglądu.

## 6. Rozstrzygnięcia własne

1. **D1 — rozpływ niesymetryczny:** `POWER_FLOW` z `reprezentacja="abc"`, nie `SEQUENCE_DOMAIN` (uzasadnienie w docstringu `PhysicsDomain`: rozwiązywany jest stan ustalony 50 Hz per faza; składowe i VUF są wielkością pochodną). `SEQUENCE_DOMAIN`: `phase_state_sn`, V12.6 `neutral_earthing_design`, `insulation_coordination`, `earth_fault_detection`.
2. **Siódmy człon `ELECTROMAGNETIC_TRANSIENTS`** dla `transient_trv`: W-07 jest listą MINIMUM i zakazuje mieszania EMT z innymi domenami; żadna z sześciu domen nie opisuje TRV bez zafałszowania. Frontend i OpenAPI mają 7 członów. Jeśli architekt woli 6, zmiana jest jednym wpisem.
3. **Kod `bodziec.rdzen_nieobslugiwany` w `KODY_ODMOW_ADAPTERA`, nie w rdzeniowym `KODY_ODMOW`.** Pomiar: rejestr rdzenia jest w `kontrakty.py`, nie w `zdarzenia.py` (karta i brief wskazują zły plik); adapter ma własny zamknięty rejestr z udokumentowaną zasadą „rdzeń nie zna pojęć ENM", a odmowę wykrywa adapter. Skutek: **zero zmian w `network_model/solvers/**`**. Odchylenie od litery §0 R-4 (zachowana intencja: nazwany kod w zamkniętym rejestrze z testem); pin testu adaptera zaktualizowany z uzasadnieniem (prefiks `bodziec.` z karty).
4. **Komponent nagłówka:** `ui2/wyniki/wzorzec/EkranAnalizy.tsx` (nagłówek `mvd-wyn-naglowek`, jedyny wspólny szkielet ekranów wyników); domena płynie przez istniejący `ui2/freshness/useSwiezoscNaglowka.ts` z kontraktu `GET /api/analysis-runs/{id}` — każdy ekran używający hooka (zwarcia, rozpływ, jakość, odbiór, estymacja, wrażliwość, kontyngencje, ranking OZE) dostaje znacznik bez zmian per ekran. Wartość = `physics_domain_pl` z backendu (front nie ma drugiej mapy nazw), podpis ze `strings.ts`.
5. **Typowany kontrakt OpenAPI** dla `/api/solver-capabilities` — żeby `PhysicsDomain` był w snapshotcie i front mógł się do niego przypiąć.
6. **Pasmo ważności modelu** w bodźcach częstotliwościowych jako DANA WEJŚCIOWA z proweniencją (rdzeń nie ma żadnej liczby tego pasma; wymyślenie np. 47,5–51,5 Hz byłoby domyślką normatywną).
7. **R-6 wykonane w tej gałęzi** (T05/T10/T12/T13/T20 → nie `reportable`, nowe zdolności `ncrfg_ptpiree.zachowanie_zadeklarowane`, `ncrfg_ptpiree.test_bez_tresci`), bo leży w moich plikach (`provenance.py`, `dowod_ncrfg.py`) i warunkuje D6; **możliwe nakładanie z wykonawcą 2** (D2 zakłada stan „bez treści" T10) — do sprawdzenia przy integracji. Konsekwencja widoczna dla użytkownika: e2e `critical-oze-evidence` przepisany — przy urządzeniu spoza wykazu certyfikat nie powstaje, lista braków nazywa T12.
8. **Kryterium `VALIDATED_SIMULATION`** dla wpisów rejestru solverów: wyłącznie test porównujący tor kanoniczny z niezależną wyrocznią (narzędzie zewnętrzne, wyrocznia ręczna normy, rozwiązanie analityczne); `audit_ref` wskazuje test, a test `test_zwalidowana_zdolnosc_wskazuje_istniejaca_wyrocznie` sprawdza, że plik i funkcja istnieją.

## 7. Wpisy rejestru, które przestały być raportowalne, i gdzie konsument to nazywa

16 z 26 (lista przypięta w `tests/test_advanced_solver_capability_registry.py::NIERAPORTOWALNE_ZMIERZONE`):
`BENCHMARK_VALIDATION`, `DYNAMIC_STABILITY`, `DYNAMIKA_RMS` (nowy wpis, nigdy nie raportowalny),
`EARTHING_SAFETY`, `EARTH_FAULT_DETECTION`, `HOSTING_CAPACITY`, `INSULATION_COORDINATION`,
`MOTOR_STARTING`, `NEUTRAL_EARTHING_DESIGN`, `OPF_LOSS_LCC`, `POWER_QUALITY_HARMONICS`,
`RELIABILITY_CONTINGENCY`, `SSCI_IMPEDANCE`, `TRANSIENT_TRV`, `UNCERTAINTY_SENSITIVITY`,
`VOLTAGE_STABILITY`. Raportowalne (wyrocznia w repo): `SC_3F`, `SC_2F`, `SC_1F`, `SC_2F_G`,
`LOAD_FLOW_NR/GS/FD`, `LOAD_FLOW_UNBALANCED_BFS`, `PHASE_STATE_SN`, `PROTECTION_SN`.

Gdzie nazwane:
- **API** `GET /api/solver-capabilities` (+ `/{capability}`, `/analysis-type/{…}`): każdy wpis niesie
  `ocena_dowodowa` (stopień, `tier_pl`, `rationale_pl` z nazwanym brakiem wyroczni, `audit_ref`),
  a kontrakt — listę `not_reportable`.
- **Bieg** `dynamic_stability` / `dynamika_rms`: już wcześniej wyprowadzały `reporting_status` z
  proweniencji (ta sama klasyfikacja — rejestr i bieg nie mówią dwóch rzeczy; test przypina
  `DYNAMIKA_RMS.evidence_capability_id == ZDOLNOSC_DYNAMIKI_RMS`).
- **Gotowość, UI:** zmierzone — nie konsumują `reportable` rejestru, więc nie było czego
  przemianować. Uwaga: solver V12.6 (FROZEN) nadal wpisuje `reporting_status: reportable` w każdy
  krok śladu; UI akademickie tego pola nie wyświetla (sprawdzone), ale to druga prawda w solverze
  FROZEN — do domknięcia razem z wycofaniem V12.6 (AB-1d_min / OD-15).
- **NC RfG (R-6/D6):** macierz (`POST /api/ncrfg-tests/run`) — `evidence_limitations`,
  `evidence_note_pl` i nowe `kod_fail_closed` per moduł; certyfikat i wniosek OSD — nazwany brak
  „test T12 … BRAK WYSTARCZAJĄCEGO DOWODU … (zdolność: T12:DECLARATION)".
