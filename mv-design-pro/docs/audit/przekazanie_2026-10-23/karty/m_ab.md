# Meldunek — karta AB-1b.3b-NA-PARTII-6

Przeniesienie AB-1b.3b (odbiory w rdzeniu dynamiki RMS, `50a3aa02`) na czubek partii
integracji 6 (`615f3b24`). Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-ab1b3b-p6`.
Commity: `1072b542` (scalenie AB-1b.3b), `ea1f228c6` (poprawki napotkanych defektów
i przeliczenia narzędziami repo), osobny commit z tym meldunkiem (do pominięcia przez
integratora).

## 1. Wynik i dowody (kody wyjścia łapane bezpośrednio, `OPENBLAS_NUM_THREADS=1`)

| Bramka | Wynik | Kod wyjścia |
|---|---|---|
| Testy rdzenia dynamiki — 79 plików (`grep -rlE` po `solvers\.dynamika`, `DYNAMIKA_RMS`, `dynamika_rms`, `adapter_dynamiki`, `application\.dynamika`, `load_dynamic`, `der_dynamic` + cały `tests/network_model/dynamika`, `tests/walidacja_fizyczna`, pliki wołające eksport fikstur, `dynamika_z_katalogu`, `dynamika_modele`, `punkt_pracy`, `resultset_dynamic`) | 3 277 passed, 3 failed + 4 errors — wszystkie siedem to testy z markerem `andes` (`test_wyrocznia_andes.py`, `walidacja_fizyczna/andes/test_eps_tau.py`: `ModuleNotFoundError: andes`; wyrocznia zewnętrzna W6-2 wymaga izolowanego środowiska z ANDES). Z markerem `-m "not pandapower and not andes"` te pliki dają „7 deselected” | 1 (7 × `andes`), po wykluczeniu markerem 0 |
| Harness mutacji `python -m tests.walidacja_fizyczna.mutacje` | 55 zabitych (M10–M51, M67–M80), 0 przeżyło, 1 nieważna (M21 — kontrolna), 0 bez zmiany tekstu; 8 min 14 s user + 1 min 16 s sys | 0 |
| Pełna regresja `poetry run pytest -q -m "not pandapower and not andes"` — bieg 1 (drzewo po scaleniu, przed poprawkami) | 27 389 passed, 14 failed, 6 errors, 37 deselected (58 min) — rozbiór w §5 | 1 |
| Pełna regresja — bieg 2 (drzewo końcowe) | 27 410 passed, 37 deselected, rc 0 (56 min, drzewo końcowe) | 0 |
| `poetry run python ../scripts/guardy_z_ci.py` (drzewo końcowe) | komplet zielony: 114 strażników, black/ruff (src, tests, scripts), `npm run type-check`, `npm run lint`, 3 352 samotesty strażników, `mypy_ratchet_guard` bez zmiany | 0 |
| vitest `src/ui2/wyniki/dynamika`, `src/ui/shared`, `src/ui2/spaces/gotowosc`, `src/ui2/wyniki/wzorzec` | 44 pliki, 775 passed | 0 |
| e2e na realnym backendzie: `dowody-flow-ekspert-screenshot`, `dynamika-rms-flow`, `wszystkie-sceny-screenshot`, `wyniki-jezyk-inzyniera` (drzewo końcowe) | 150 passed (8,6 min) | 0 |
| Przenośność: `eksport_fixtur_harnessu.py --sprawdz --tylko` dla sześciu fikstur scen dynamiki (`dynamika_scena_{migawka,wyniki,przebiegi,gotowosc,gotowosc_brak,gotowosc_odbior_brak}`) w wariantach {Cooperlake (jądro domyślne tej maszyny), Haswell, Prescott, Zen} × {1, 2 wątki} (`OPENBLAS_CORETYPE`, `OPENBLAS_NUM_THREADS`; jądro potwierdzone `openblas_get_corename64_`) | 8 × 6 ok, 0 rozjazdów komparatora | 0 × 8 |
| `eksport_fixtur_harnessu.py --sprawdz` (wszystkie fikstury, drzewo końcowe) | 121 ok, 0 rozjazdów | 0 |
| vitest SLD (`src/ui/sld`, `src/ui/sld-editor`, `src/engine` — kontrola fikstur ENM przeliczonych w tej karcie) | 5 308 passed, 3 failed — wyłącznie znane z karty (`menuBudowyNaKanwie` ×2, `pathInvariants`); dwa budżety czasu z listy znanych przeszły w tym biegu | 1 (znane, nie moje) |

**Zrzuty zatwierdzone — zmiana bajtów (do werdyktu właściciela, B-02).** Spec
`dowody-flow-ekspert-screenshot` zapisuje `docs/audit/visual/flow-ekspert/e32-dynamika-{light,dark}.png`
inaczej niż wersja w `50a3aa02`. Różnica pikselowa ograniczona do jednego prostokąta
(141,5546)–(1341,6277) — kolumna „Skutki topologiczne” tabeli zdarzeń: moc odciętego odbioru
„P = 0,00171 pu” (wersja AB) → „P = 0,001709 pu” (drzewo scalone). Źródło: fikstura
`dynamika_scena_wyniki.json`, `odbiory_odciete[0].p_pu` = 0,0017097253 na bazie AB wobec
0,00170936489 na partii 6 (ta sama wartość jest w fiksturze partii 6 — zmiana topologii stacji
z partii 6, zaciski pól w torze). Czyli treść, nie szum. Oba biegi e2e na drzewie końcowym dały
bitowo te same pliki (render deterministyczny). Zrzuty są w commicie poprawek jako render
produktu; werdykt wizualny — właściciel.

## 2. Konflikty cherry-picka i sposób scalenia

`git cherry-pick -x 50a3aa02` na `615f3b24`: 8 konfliktów treści.

1. `backend/src/enm/dynamika_z_katalogu.py` — partia 6 wniosła import `OdmowaDanychError`
   (klasy `BladMaterializacjiDynamiki`, `OdmowaKopiiDynamiki` dziedziczą po nim); AB wniosła
   import katalogu `network_model.catalog.load_dynamic` i `ModelDynamicznyOdbioru`. Scalone:
   oba importy (kolejność zgodna z isort), bazy klas z partii 6 zostały (`OdmowaDanychError`),
   treść AB (materializacja odbioru, `sprawdz_profil_odbioru`) bez zmian — jej odmowy rzucają
   `BladMaterializacjiDynamiki`, więc idą jako odmowa danych.
2. `scripts/test_solver_input_substitute_guard.py` — piny obu stron. Rozstrzygnięte POMIAREM
   strażnika na drzewie scalonym (niżej §6), komentarze atrybucji obu stron zachowane plus
   wpis tej karty.
3. `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md` — liczniki 145 (partia 6) / 144 (AB);
   przegenerowany generatorem `scripts/generuj_slownik_kodow_gotowosci.py` z rejestru
   `READINESS_CODES` — 146 kodów (kody partii 6 i `load.dynamika_missing` z AB).
4. `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` — dwa różne wiersze rejestru z tą samą datą
   (SKONCZONOSC-CHWILI-ZERO po stronie partii 6, AB-1b.3b-NA-CZUBKU po stronie AB): oba
   zachowane; dopisany wiersz tej karty.
5. `STAN_REPO.md` — cztery bloki: lista drzew odbiorczych (wersja partii 6 — nadzbiór),
   wiersze VERIFIED / IN PROGRESS (wersja partii 6, status AB-1b.3b uzupełniony o oba
   przeniesienia, AB-1b.3b-NA-CZUBKU zdjęty z „w toku”), wiersz karty AB-1b.3b (jeden wiersz
   z oboma przeniesieniami), wiersze dowodów (suma obu stron). Dopisane wiersze dowodów tej
   karty.
6–8. `frontend/src/harness-fixtures/generated/dynamika_scena_{migawka,przebiegi,wyniki}.json`
   — przeliczone WYŁĄCZNIE narzędziem (`eksport_fixtur_harnessu.py --tylko …`), klasyfikacja
   w §7.

Uwaga formalna: commit `1072b542` ma komunikat złożony ręcznie (`-F`), więc nie niesie linii
„(cherry picked from commit 50a3aa02…)”; pochodzenie jest nazwane w jego treści i tutaj
(amend jest zakazany kartą).

## 3. Miejsca, w których obie strony zmieniały ten sam moduł (przeczytane po scaleniu)

Część wspólna `git diff --name-only 0f38d197 615f3b24` ∩ `git show --name-only 50a3aa02`
(29 plików; 8 z konfliktem opisane wyżej). Pozostałe, scalone bez konfliktu, sprawdzone:

- `backend/src/enm/adapter_dynamiki.py`, `network_model/solvers/dynamika/kontrakty.py` —
  partia 6: import `OdmowaDanychError` i baza klas `OdmowaWejsciaDynamiki`/`OdmowaDynamiki`;
  AB: 183/362 wiersze treści rdzenia i adaptera. Po scaleniu obie klasy dziedziczą po
  `OdmowaDanychError` (sprawdzone grepem baz klas), nowe `raise` AB używają tych klas.
- `backend/src/enm/canonical_analysis.py` — partia 6: `ValueError` → `OdmowaDanychError`
  w `create_run`/walidacji zwarć, `kroki_zwarcia_w_kontrakcie` (DOWOD-CIEPLNY); AB: blok
  `try/except` w `_execute_dynamika_rms`, który przepakowuje `OdmowaDynamiki`
  i `OdmowaWejsciaDynamiki` z komunikatem z nazwami (`application.dynamika.odmowy`) oraz
  założenia z rekordów rdzenia i tabela `dynamika_zalozenia`. Rozłączne; przepakowanie
  zachowuje klasę (odmowa danych).
- `backend/src/enm/domain_operations_v2.py` — partia 6: `szyny_stacji` z `enm/tor_pola.py`,
  jeden predykat ścieżki zasilania `transformatory_sciezki_zasilania`; AB: operacja
  `set_load_dynamic_binding` (odbiór po `ref_id`/`id`, bez przynależności szyn do stacji).
  Rozłączne; AB nie liczy przynależności szyn do stacji nigdzie (grep dodanych wierszy AB po
  `bus_refs`, `sn_bus`, `station`, `stacj` — zero trafień w logice).
- `backend/src/domain/canonical_operations.py` — partia 6: `przepnij_element_na_pole`,
  `station.line_field_multiple_segments`, `station.element_bypasses_field`; AB:
  `set_load_dynamic_binding`, `load.dynamika_missing`. Rozłączne wpisy słowników.
- `backend/src/api/analysis_run_exports.py` — AB: tabela `dynamika_zalozenia`; partia 6:
  zmiany odmów. Rozłączne.
- `backend/scripts/eksport_fixtur_harnessu.py` — AB: parametr `z_modelem_odbioru` (wymagany,
  keyword-only) w `_enm_sceny_dynamika` i nowa fikstura `dynamika_scena_gotowosc_odbior_brak`;
  partia 6: 189 wierszy (substrat, zaciski pól). Sprawdzone grepem: każde wywołanie
  `build_dynamika_projektanta_enm(`/`_enm_sceny_dynamika(` w `backend/` podaje
  `z_modelem_odbioru` (jedyne trafienie bez argumentu w linii to wywołanie wielowierszowe,
  które go podaje w następnej linii).
- `backend/tests/ci/test_fixtury_harnessu.py` — AB: `z_modelem_odbioru=False` w dwóch
  testach sceny dynamiki; partia 6: 292 wiersze. Rozłączne.
- `frontend/e2e/{dowody-flow-ekspert,wszystkie-sceny}-screenshot.spec.ts`,
  `wyniki-jezyk-inzyniera.spec.ts` — partia 6: `bramkaTresciMatematycznej(page)` przed KAŻDYM
  `screenshot(`; AB: nowe sceny dynamiki (odbiór bez modelu). Sprawdzone grepem: każde
  wywołanie `screenshot(` w trzech spekach jest poprzedzone bramką (AB nie dodała osobnego
  wywołania poza pętlą scen).
- `frontend/src/types/{enm,domainOps}.ts`, `ui/topology/operationSuccessMessages.ts`,
  `ui/workspace/operationFormRegistry.tsx` — rozłączne wpisy (AB: `Load.dynamika`,
  `ModelDynamicznyOdbioru`, `set_load_dynamic_binding`; partia 6: `przepnij_element_na_pole`).
  `type-check` zielony.
- `scripts/legacy_public_path_guard.py` — obie strony dodały pozycje; samotesty strażnika
  w `guardy_z_ci.py` zielone.
- Pięć migawek scen spoza dynamiki (`koordynacja`, `lom`, `oze_analiz`, `stacja_demo`,
  `zwarcia_wklady`) — scalone bez konfliktu; `--sprawdz` na drzewie scalonym: ok.

Znalezisko w tej klasie („scaliło się bez konfliktu, ale błędnie”): pin
`network_model: pliki_skanowane=183` — obie strony niezależnie podniosły 182 → 183 (partia 6:
`odmowa_danych.py`, AB: `catalog/load_dynamic/__init__.py`), więc identyczny literał scalił się
cicho; pomiar strażnikiem daje 184.

## 4. Inwentarz klasy ODMOWA-DANYCH-422 w kodzie AB-1b.3b

Każde `raise` dodane przez `50a3aa02` w `backend/src/**` i `backend/scripts/**`
(z `git show 50a3aa02`), klasyfikacja:

| Miejsce | Wyjątek | Klasa |
|---|---|---|
| `enm/adapter_dynamiki.py` (nowe odmowy odbioru bez bloku dynamiki itp.) | `OdmowaWejsciaDynamiki` | odmowa danych — podklasa `OdmowaDanychError` |
| `enm/canonical_analysis.py::_execute_dynamika_rms` (przepakowanie komunikatu z nazwami) | `OdmowaDynamiki`, `OdmowaWejsciaDynamiki` | odmowa danych — ta sama klasa, ten sam kod |
| `enm/dynamika_z_katalogu.py` (3× profil odbioru spoza katalogu, charakterystyka odbioru bez kopii) | `BladMaterializacjiDynamiki` | odmowa danych — podklasa `OdmowaDanychError`; w operacji `set_load_dynamic_binding` zamieniana na odpowiedź błędu z kodem |
| `network_model/solvers/dynamika/kontrakty.py` (`_odmowa_charakterystyki` ×3 — pole charakterystyki odbioru brakujące albo fantomowe) | `OdmowaDynamiki(KOD_PARAMETRY_ODBIORU_SPRZECZNE)` | odmowa danych |
| `network_model/solvers/dynamika/odbiory.py` (2× chwila zero odbioru) | `OdmowaDynamiki` | odmowa danych |
| `application/dynamika/gotowosc.py::_akcja_naprawcza` | `RuntimeError` | błąd programu — kod kanonu bez akcji naprawczej w rejestrze |
| `application/dynamika/zalozenia.py` (2×), `network_model/catalog/load_dynamic/__init__.py`, `kontrakty.py` (długość krotki stanów), `obserwable.py`, `odbiory.py` (f_hz `None` przy odbiorze czułym, nieznany tryb), `wynik.py` (kod założenia spoza rejestru), `zdarzenia.py` (2×, tylko polskie znaki w istniejących asercjach) | `AssertionError` | błąd programu (niezmiennik rejestru albo konstrukcji) |

Zero nowych `raise ValueError`. Strażnik klasy partii 6 (`scripts/polykanie_wyjatkow_guard.py`,
druga połowa — pin `raise ValueError` w `application/**`, handlery `ValueError` w `api/**`)
zielony bez nowych wyjątków ani zmiany pinu. Nowa operacja domenowa `set_load_dynamic_binding`
odmawia przez odpowiedź błędu operacji (`_error_response` z kodem `load_bindings.*` albo kodem
`BladMaterializacjiDynamiki`), nie wyjątkiem.

## 5. Napotkane defekty i naprawy (Zero-Debt)

Rozbiór czerwonych z biegu 1 pełnej regresji — porównanie z bazą przez worktree `615f3b24`
na tym samym środowisku Pythona:

| Test | Na `615f3b24` | Przyczyna | Naprawa |
|---|---|---|---|
| `test_fikstury_enm_generowane.py` ×3, `test_fikstury_substratu_sld.py` ×1 | zielone | AB dodała pole `Load.dynamika`; fikstury ENM frontu (19 sieci kontraktów SLD, `siec_pokazowa`, `demoOzeSc`, `sldSubstrate52s`) nie były przeliczone na drzewie partii 6 | przeliczone generatorami repo: `python -m tests.reference_networks.fikstury_enm_sld --write`, `python -m tests.reference_networks.sld_substrate_fixtures --write`, `frontend/scripts/demo-siec-pokazowa/generate-fixture.py`, `frontend/scripts/generate-demo-oze-sc.py`; różnica = wyłącznie dopisane `"dynamika": null` (381 wierszy, treść) |
| `test_nn_field_specs_promocja_aparat.py` ×8 | czerwone | SLD-SUBSTRAT przeniósł wiązanie aparatu nN na `assign_catalog_to_element`, testy karty #151 wołały skasowane `_materializuj_aparat`/`materialize_catalog_binding` | test przepisany na obecny mechanizm z tą samą intencją (iloczyn {pozycja spoza katalogu → nazwany brak bez wyjątku, brak wiązania we wpisie → brak payloadu i brak odmowy, wyjątek operacji → wybucha z `migruj`}) |
| `test_rejestr_kodow_bram_katalogowych.py::test_zaden_kod_catalog_…` | czerwony | `nn_field_specs_promocja._przypisz_wiazania` miał zapas `wynik.get("error_code") or "catalog.assign_failed"` — kod spoza `READINESS_CODES`; `_error_response` niesie `error_code` zawsze, więc zapas był martwy | zapas usunięty (`wynik["error_code"]`; brak klucza = zerwany kontrakt operacji, błąd programu) |
| `test_nazwy_jedno_zrodlo.py::test_jeden_predykat_nazwy_w_calym_src` | czerwony | `enm/validator.py::_pole_nn_i_stacja` — lokalny predykat nazwy (`str(nazwa) if nazwa else None`) | `nazwa_nadana_elementu(spec)` z jednego modułu nazw |
| `test_protection_settings_w3c2_identity.py` ×6 (errors) | czerwone | środowisko: płytki klon bez obiektu `a16f8d2b` (`git show` → 128) | `git fetch --deepen=2000` — 7 passed; kod bez zmian |

Poza regresją backendu:

- **e2e `wszystkie-sceny › koordynacja z wynikiem — {light,dark}` i `wyniki-jezyk-inzyniera ›
  scena „koordynacja”`** — czerwone także na `615f3b24` (sprawdzone w worktree bazy): atrapa
  koordynacji harnessu (`creator-harness-main.tsx::szynaZwarciaZadania`) brała surową szynę
  zacisku `zaciski[zacisk].szyna_ref` — po POLA-W-TORZE szynę techniczną pola, której biegi
  zwarciowe nie raportują — i odmawiała żądania ekranu („bieg nie ma prądu zwarciowego dla
  lokalizacji …/segment_R_L”). Ekran (`pradyZBiegow.ts`) i końcówka
  (`szyny_zwarcia_lokalizacji` → `enm.tor_pola.szyna_raportowa`) czytają `szyna_zwarcia_ref`.
  Atrapa przełączona na tę samą regułę (para predykatów z jednego źródła); nowy test
  `test_koordynacja_szyna_zwarcia_zabezpieczen_sceny_ma_wiersz_w_obu_biegach` przypina daną
  (dla starej reguły jedna z dwóch szyn nie ma wiersza — sprawdzone), e2e przypina atrapę:
  3 passed, potem 150 passed w komplecie.
- **`tsconfig_gate_guard`** — dług typów poza bramką 81 przy budżecie 80, także na
  `615f3b24` (lista 81 błędów identyczna na obu drzewach). Nowy błąd partii 6:
  `src/ui/sld/shared/__tests__/szynyStacjiKonsumenci.test.ts` (TS2532, indeks `gpzs[0]`) —
  naprawiony u źródła (jawny brak GPZ = wyjątek z opisem, sekcje `?? []` z asercją liczności
  niżej); pomiar 80 = budżet, strażnik zielony bez zmiany budżetu.

## 6. Piny strażnika podstawień (`scripts/test_solver_input_substitute_guard.py`)

POMIAR `python scripts/solver_input_substitute_guard.py` na drzewie scalonym:
`Pol kontraktow wejsciowych: 4124` (4116 partii 6 + 8 AB), `Przeskanowano 564 plikow`
(561 + 3), `network_model: pliki_skanowane=184` (183 + 1; literał 183 scalił się bez
konfliktu, ale błędnie), `application: pliki_skanowane=247` (245 + 2), `enm` 58 i `api` 64 bez
zmiany, PASS (zero podstawień). Komentarze atrybucji w pliku wg wzorca. Samotesty: 67 passed.

## 7. Fikstury — klasyfikacja treść/szum

Scen dynamiki (narzędzie `eksport_fixtur_harnessu.py --tylko`, porównanie komparatorem
`tests/ci/tolerancja_fikstur.py::roznice_z_tolerancja` z wersjami obu stron):

- `dynamika_scena_migawka.json` — wobec partii 6: 2 różnice (`loads[0].dynamika` — kopia
  profilu odbioru z AB; `header.hash_sha256`); wobec AB: 7 (zaciski pól
  `sn_field_terminal/00x` w `branches`/`transformers`, meta pochodzenia gałęzi,
  `nn_field_specs[0].meta.transformer_ref`, hash) — treść partii 6. Szum: 0.
- `dynamika_scena_wyniki.json` — wobec partii 6: 1 różnica (klucz `zalozenia_rdzenia` — AB);
  wobec AB: 21 (odciski migawki i implementacji, szyny zacisków na zaciskach pól,
  `odbiory_odciete[].p_pu/q_pu` 1,7097e-3 → 1,7094e-3 — skutek topologii partii 6). Treść.
- `dynamika_scena_przebiegi.json` — wobec partii 6: 899 różnic (kanały `f_hz` szyn nN
  i wartości gałęzi/szyn po wprowadzeniu estymatora częstotliwości i modelu odbioru z AB,
  `tryb_odbioru`, `catalog_materialization_status` partial → materialized z katalogu
  `load_dynamic`); wobec AB: 935 (kanały prądu/mocy zacisków pól `…/000`, `…/001`, `…/003`,
  wcześniej `None` na bazie AB, i przebiegi po zmianie topologii). Zbiory kluczy kanałów
  identyczne z oboma stronami. Treść obu kart; szum komparatora: 0 (przenośność §1).

Fikstury ENM frontu (§5) — treść (nowe pole kontraktu). Fikstury pozostałych scen:
`--sprawdz` 121 ok bez regeneracji.

## 8. Czego nie zrobiono i dlaczego

- Testy wyroczni ANDES (7 pozycji z markerem `andes`) nie biegły — pakietu ANDES nie ma
  w środowisku (izolowane środowisko W6-2); w regresji wykluczone markerem jak w CI.
- Pełny vitest nie był uruchamiany (karta); w SLD trzy znane czerwone z karty.
- Werdykt wizualny nowych bajtów `e32-dynamika-{light,dark}.png` — należy do właściciela
  (B-02); różnica opisana w §1.
- Rdzenie B-01 (`scripts/rdzenie_b01.py`) i kontrakty FROZEN nietknięte (poprawki tej karty:
  migracja `nn_field_specs_promocja.py`, `validator.py`, harness frontu, testy, fikstury).
