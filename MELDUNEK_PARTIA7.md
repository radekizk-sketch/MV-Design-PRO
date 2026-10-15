# Meldunek — karta PARTIA-INTEGRACJI-7

Gałąź wynikowa: `claude/mv-design-pro-twin-audit-u4lhy0-karta-partia7`, baza `861e4656`
(partia 6 + TORY-TYLKO-W-TESTACH + PARTIA-6-FRONT). Push zwykły, bez force, bez PR.
Praca przerwana limitem tygodniowym (2026-10-01) i wznowiona 2026-10-15 na zachowanym drzewie
(przerwany cherry-pick `97b9e054` przetrwał restart).

## 1. Wynik i dowód

Siedem kart przeniesionych w kolejności zależności (`cherry-pick -x`, autor radekizk-sketch,
`--cleanup=verbatim`), pliki generowane przeliczone wyłącznie narzędziami repo, styki kart
naprawione u źródła, poprawki przeglądu PARTIA-6-BACKEND (a)–(d) osobnym commitem.

| Bramka (kody wyjścia łapane bezpośrednio; Python z `OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1`, prywatny `--basetemp`) | Wynik |
|---|---|
| Pełna regresja backendu `poetry run pytest -q -m "not pandapower and not andes"` (jeden bieg, drzewo `f076ee46` — przed `df3bcc99`, `24b6c36a`, `0aad802b`) | **27 620 passed, 3 failed, 40 deselected, rc=1** (1 h 45 min). Trzy czerwone — wszystkie naprawione po biegu (§5): świeżość dwóch plików parytetu (przegenerowane w trakcie biegu) i komunikat E021. Celowane ponowienie tych plików + sąsiednich: **795 passed, rc=0**. Pełnej regresji nie powtarzano (polecenie wznowienia: jeden bieg na końcu). |
| `guardy_z_ci.py` z `backend/` | 106 z 106 guardów wołanych przez CI zielonych; samotesty strażników `pytest ../scripts` **3442 passed**; jedyna czerwień: lint jak CI `ruff src tests` (I001 w `enm/validator.py` po scaleniu) — naprawiona (`0aad802b`), ponowne `ruff check src tests` rc=0, `black --check src tests` rc=0, `ruff ../scripts scripts` rc=0 |
| Pełny vitest `npm test` (drzewo końcowe frontu) | **883 pliki, 13 167 passed, 14 todo, rc=0**. Pierwszy bieg: 2 pliki / 53 testy czerwone (parytety generowane przed fiksturami — §5); trzy „znane czerwienie” kart (`menuBudowyNaKanwie` ×2, `pathInvariants`) NIE występują na tej bazie |
| `npm run type-check`, `npm run lint` | rc=0, rc=0 |
| `npm run accept:sld-v3` | **ALL PASS, rc=0** (w tym `menu_chain_probe` — dawny znany FAIL karty etykiety) |
| e2e na realnym backendzie (`playwright-run-real.mjs`, 29 speków: zabezpieczenia/koordynacja — 25 z grep `protection|koordynacj|zabezpiecz|gotowo…`, `dynamika-rms-flow`, `dowody-flow-ekspert-screenshot`, `gotowosc-jedna-prawda`, `gotowosc-po-biegu`; w tym `etykieta-stacji-{rodzaj,zrzuty}`, `wszystkie-sceny-screenshot`, `tr2w-bez-pola`, `kd6`, `nastawy-koordynacji-hoppel`, `wyniki-jezyk-inzyniera`) | **288 passed, rc=0** (22,2 min); `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium` |
| `eksport_fixtur_harnessu.py --sprawdz` | **122 ok, 0 rozjazdów, rc=0** |
| Strażniki dokumentów po wpisach rejestrów (`docs_guard`, `plan_ab_zaleznosci_guard`, `utf8_mojibake_guard`, `no_codenames_guard`, `docs_count_consistency_guard`) | rc=0 każdy |

## 2. Commity źródło → cel

| Karta | Źródło | Cel |
|---|---|---|
| PARTIA-6-BACKEND | `65b00094` | `e26f8a04` |
| B01-RUNDA-1 | `47028f7e`, `f74b7ce7`, `7ff1a430`, `659d8e22`, `1fba5b29`, `577d0f3e`, `6ab12265`, `aa89f63a` | `bc6c3116`, `3ec4fcb5`, `aa58bbb3`, `e2be4463`, `c983be4a`, `396cfc38`, `7384fd72`, `8a307e96` |
| PF-OD19 | `00beaca1` | `15ba540b` |
| ZAPIS-DECYZJI | `3113bc0f` (CLAUDE.md — OSOBNY commit do przeglądu/wycofania), `83b9159a` | `7da97b4f`, `b73786fe` |
| AB-1b.3b-NA-PARTII-6 | `1072b542`, `ea1f228c` | `95f40b3c`, `81a7505d` |
| BIEG-ZABEZPIECZEN-NA-PARTII-6 | `9d7e4968`, `c04bafce`, `df8ac6dd` | `62c5ac28`, `553c279d`, `f58c326a` |
| ETYKIETA-STACJI-PRZELOTOWEJ | `4d9560a8`, `97b9e054`, `741608e1`, `8836a48c` | `68fabd39`, `ad19413d`, `2c571310`, `9fb706b5` |
| Integracja (własne) | — | `7885f277` fikstury, `7a0c71a8` test sceny koordynacji, `f076ee46` przegląd 65b00094 (a)–(d), `df3bcc99` parytety, `24b6c36a` E021, `0aad802b` ruff, `ceb5caa1` rejestry PF-OD19, `a3ae6061` zrzuty, wiersz §7 + STAN_REPO, ten meldunek |

Pominięte zgodnie z kartą: commity meldunków (`2df02f85`, `5eac3654`, `d0670d4a`, `29807e2c`,
`474feab9`, `2acd156d`, `bf5f081a`) i `d0613c53`.

## 3. Konflikty plik po pliku

| Commit | Plik | Rozstrzygnięcie | Powód |
|---|---|---|---|
| `65b00094` | `ui/sld/shared/__tests__/szynyStacjiKonsumenci.test.ts` | wersja `65b00094` | polecenie karty (ta sama naprawa TS2532 co baza) |
| `1072b542` | `docs/plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md` | OD-36 z HEAD (rozstrzygnięcie O-70 ZAPIS-DECYZJI), OD-37 z AB (adnotacja O-22) | oba wiersze niosą treść tylko jednej strony |
| `1072b542` | `PLAN_AB…` tabela §12.1 | 13 wierszy z HEAD (ZAPIS-DECYZJI, nowsza treść) + nowy wiersz AB (parametry dynamiczne odbiorów `load_dynamic`) | rejestr — wiersze obu stron |
| `1072b542` | `scripts/test_legacy_public_path_guard.py` | oba bloki testów (TORY + AB-1b.3b) | rozłączne strażniki nawrotu |
| `1072b542`, `9d7e4968`, `df8ac6dd`, `97b9e054`, `741608e1` | `scripts/test_solver_input_substitute_guard.py` | komentarze atrybucji obu stron + wiersz partii 7; literał z pomiaru strażnikiem na drzewie scalonym po każdym kroku | piny = pomiar |
| `ea1f228c`, `df8ac6dd`, `97b9e054` | `enm/validator.py`, `enm/migrations/nn_field_specs_promocja.py`, `tests/enm/migrations/test_nn_field_specs_promocja_aparat.py`, `szynyStacjiKonsumenci.test.ts` | wersja `65b00094` (bez zmian wobec HEAD) | czerwień zastana partii 6 — kanoniczna naprawa; sens innych napraw zachowany (test aparatu nN, `test_nazwy_jedno_zrodlo`, rejestr kodów bram — w pełnej regresji zielone) |
| `9d7e4968` | `frontend/src/creator-harness-main.tsx` | wersja karty zabezpieczeń (atrapa miejsca i `szynaZwarciaZadania` skasowane), dopiski AB (wariant `wyniki-dynamika-odbior-brak`) zachowane | karta kasuje atrapę; naprawa AB atrapy traci przedmiot — intencja przeniesiona do testu (§5) |
| `9d7e4968`, `4d9560a8` | `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md` | generator `generuj_slownik_kodow_gotowosci.py` (145, potem 147, końcowo 146) | plik generowany |
| `9d7e4968`, `97b9e054` | `szynyStacjiParytet.json` i fikstury harnessu/ENM (17 plików w `97b9e054`), `koordynacja_scena_galezie.json` (DU) | tymczasowo HEAD, potem regeneracja narzędziami; `koordynacja_scena_galezie` skasowany (kasacja karty zabezpieczeń) | pliki generowane — nigdy scalanie ręczne |
| `4d9560a8` | `ui/network-build/InspectorEngineeringView.tsx` | układ rozdzielnicy z lustra rodzaju stacji (`ukladRozdzielnicyStacjiPl`) + transformatory z jednej reguły SZYNY-STACJI-LUSTRO (`selectStationDistributionTransformers`) | obie reguły jednego źródła |
| `4d9560a8` | `ui/sld/v2/canvas/enmToSldAdapter.ts` | importy obu stron; rodzaj stacji z lustra + transformatory z kontekstu migawki (indeksy PARTII-6-FRONT) | jw. |
| `97b9e054` | `scripts/tsconfig_gate_guard.py` | komentarze obu kart + pomiar | budżet = pomiar |
| `8836a48c` | `readiness_registry_snapshot.json` | przepis z nagłówka testu parytetu rejestru | plik generowany |

Konfliktów w rdzeniach FROZEN nie było (zmiany rdzeni B01-RUNDA-1 przeniesione bez zmiany
treści, zgoda B-01 O-59).

## 4. Piny strażników (pomiar na drzewie końcowym)

| Pin | Wartość | Rachunek |
|---|---|---|
| `solver_input_substitute_guard` — pola kontraktów | **4125** | 4116 (partia 6) + 8 (AB-1b.3b) + 2 (zabezpieczenia na drzewie scalonym) + 6 (`enm/rodzaj_stacji.py`) − 7 (skasowany `catalog/station_templates.py`) |
| — pliki | **563** | 561 − 3 (`stability_rms`) + 3 (AB) + 2 (`enm/nastawy_zabezpieczen.py`, `enm/wylaczniki_liniowe.py`) + 1 (`enm/rodzaj_stacji.py`) − 1 (katalog szablonów) |
| — `network_model` | **180**, wykluczenia 1/2 | 183 − 3 + 1 − 1 |
| — `enm` | **61**, dług 7/67 | 58 + 2 + 1 |
| — `application` | **247**, dług 29/89 | 245 + 2 (AB); dług z karty zabezpieczeń |
| — `api` | 64, wykluczenia 5/13 | karta zabezpieczeń |
| `tsconfig_gate_guard` — `BUDZET_BLEDOW_POZA_BRAMKA` | **62** | pomiar `zmierz_dlug()`; zbiory zdjętych TS6133 kart zabezpieczeń (12) i etykiety (17) częściowo wspólne |
| Słownik kodów gotowości / snapshot rejestru | **146** | 146 (AB) − 1 (zabezpieczenia) + 2 (etykieta W043/W044) − 1 (kod-widmo) |
| mypy, allowlista werdyktu, `legacy_public_path_guard`, pozostałe | zielone w `guardy_z_ci` bez zmiany pinów przez integrację | — |

## 5. Czerwienie napotkane i naprawione

1. **Test sceny koordynacji na skasowanej atrapie** (styk AB × zabezpieczenia): test AB czytał
   `koordynacja_scena_miejsca.json`, który karta zabezpieczeń skasowała → FileNotFoundError.
   Przepisany na obecny mechanizm z tą samą intencją: punkt zwarcia każdej oceny ma wiersz
   w biegu MAX (na którym ocena stoi) i MIN (`7a0c71a8`).
2. **Kolejność generatorów**: parytety szyn i rodzaju stacji czytają fikstury, a w pierwszym
   przebiegu poszły przed eksportem fikstur → 53 czerwone w vitest i 2 testy świeżości
   w backendzie. Przegenerowane po fiksturach (`df3bcc99`).
3. **E021 poza kanonem etykiet ról pól SN** (styk etykieta × strażnik etykiet): „między polem
   wejściowym a wyjściowym” → „między polem liniowym wejściowym a polem liniowym wyjściowym”
   (`24b6c36a`).
4. **ruff I001** w imporcie walidatora po scaleniu (`0aad802b`).
5. Znane czerwienie z meldunków kart (vitest SLD v3 ×3, `menu_chain_probe`, `tsconfig_gate`
   81 > 80) — na tej bazie nie występują; `test_protection_settings_w3c2_identity` — klon
   pogłębiony (`git fetch --deepen=2000`), bez błędów.

## 6. Poprawki przeglądu PARTIA-6-BACKEND (polecenie wznowienia, commit `f076ee46`)

- (a) Kod-widmo `catalog.materialization_failed` skasowany (materializacja, dwie bramy
  `api/domain_ops_policy.py`, rejestr `READINESS_CODES`, `grupowanieCelow.ts`, snapshot
  i słownik przegenerowane, dwa żywe dokumenty UX). `MaterializationResult.__post_init__`
  gwarantuje kontrakt; wołający czytają `kod_odmowy` / `komunikat_odmowy_pl`.
- (b) Klasa `kod or "dziedzina.kod"` w całym `backend/src` (pomiar AST): `_materialize_nn_source_params`
  zwraca tabliczkę ALBO kod (jeden predykat u trzech wołających), zapas `domain_operations.py`
  usunięty, cztery `catalog_error or "…catalog_required"` rozdzielone na jawne gałęzie
  (zachowanie bez zmian). Pomiar po naprawie: 0.
- (c) `_error_response` odmawia pustego kodu; test skanuje `enm/**` w funkcjach zwykłych,
  asynchronicznych, na poziomie modułu i przypisania pod klucz "error"; wywołania z kodem
  pustym/zapasem zakazane; test klasy na całym `backend/src` z samotestami detektorów.
- (d) Test błędu programu: tożsamość rekordu wyjątku zamiast dopasowania komunikatu.
- Nowy `tests/network_model/catalog/test_kontrakt_wyniku_materializacji.py` (iloczyn cech).

## 7. Zmienione zrzuty (`docs/audit/visual/**`, commit `a3ae6061`) — werdykt B-02 u właściciela

Render żywej aplikacji na drzewie scalonym (e2e). Każdy plik obejrzany w zestawieniu „przed / po”
z prostokątem różnic zmierzonym pikselowo (oględziny 2026-10-15; korekta wcześniejszej wersji tej
tabeli, która opisywała przyczyny z kart bez oglądania). Opis faktów — wyglądu nie oceniam.

| Plik | Co się zmieniło na ekranie (z oględzin) | Źródło |
|---|---|---|
| `flow-ekspert/audF-gotowosc-{dark,light}` | „przed” był NIEAKTUALNY (przebieg 2026-09-04: dawna płaska nawigacja zakładek, c = 1,10); „po” — obecna nawigacja grupowa, „c dobierany automatycznie per węzeł”, inne prądy zwarciowe (Ik″ szyny nN 22,854 → 22,719 kA), „Stacja S01” bez „(typ B)” | głównie zmiany sprzed partii 7, których ten zrzut nie odświeżał; z partii 7 — nazwa stacji |
| `flow-ekspert/cv33b2-porownanie-zabezpieczen-*`, `edytor-nastaw-zabezpieczenia-*`, `ocena-zabezpieczen-z-modelu-*`, `kd3-porownanie-zwarc-*` | treść identyczna; zmienione: znaczniki czasu przebiegów i wersja modelu w stopce, „Gotowość: 3 → 4 ostrzeżenia”, „Stacja S01 (typ B)” → „Stacja S01” | etykieta (nazwa bez kodu rodzaju, nowe ostrzeżenie W043 niezgodności deklaracji z topologią) |
| `flow-ekspert/e32-dynamika-{dark,light}` | legenda wykresu przebiegów: „Stacja S01 (typ B)” → „Stacja S01” (przesunięcie pozycji legendy), krzywe bez widocznej zmiany | etykieta |
| `flow-ekspert/kd3-bilans-*` | karta „Kontrola stacji” w kreatorze stacji: „Rodzaj: Odgałęźna (wejście + wyjście + odgałęzienie)” → „Rodzaj: Stacja odgałęźna (ze składu pól)” | etykieta — rodzaj z jednej reguły |
| `flow-ekspert/kd3-zaczepy-*` | ten sam kreator na kroku 3: „Rodzaj: Odgałęźna…” (zielony) → „Stacja końcowa ze składu pól — zadeklarowano: odgałęźna” (pomarańczowe ostrzeżenie) | etykieta — podgląd rodzaju wynikowego ze składu pól przed uzupełnieniem pól (krok 4); **do oceny właściciela**, czy ostrzeżenie na kroku 3 jest pożądane |
| `dowody/fk1_czas_ocena-*` | 1 linia pikseli przy nagłówku tabeli; treść tabeli identyczna | szum renderu |
| `flow-ekspert/kd6-ogniwo-model-*` | „Stacja S01 (typ B)” → „Stacja S01” | etykieta |
| `flow-ekspert/kd3-katalog-nn-*`, `most-wygaszony-dark`, `flow_kompensacja-*`, `gotowosc-drzewo-*`, `dowody/dowody_ncrfg_formularz_zrodla_dark` | treść identyczna; różnice pojedynczych pikseli (kursor tekstowy w polu, wygładzanie ikon w pasku) | szum renderu |
| `kreatory/kreator_pole_light` | zrzut „po” złapał stopkę „Ładowanie katalogu aparatów pola SN” z wyszarzonym zapisem — **defekt speca, nie produktu** | naprawione (commit „E2E: bramka przed zrzutem czeka na koniec ładowania…”): warunek „żaden kreator w stanie ładowania” w bramce wołanej przed każdym zrzutem; po ponownym biegu zrzut identyczny z wersją sprzed partii 7 |

## 8. Rejestry dokumentów

Plan A/B §7 — wiersz PARTIA-INTEGRACJI-7; `STAN_REPO.md` §4; MAPA OD-19 — wynik karty PF-OD19;
`REJESTR_KONFLIKTOW` V12K-350 (A-1 syntezy vs OD-19 opcja 1 — A-1 oznaczone jako odrzucone);
komentarz wpisu budżetu `solver_input_substitute_guard` (start płaski) skorygowany wg OD-19.
Wiersze obu stron w rejestrach zachowane.

## 9. Pozycje otwarte (z przyczyną)

- Werdykt wizualny 29 zrzutów (§7) — bramka B-02, właściciel.
- Pełna regresja backendu nie została powtórzona po trzech poprawkach z §5 (polecenie: jeden
  bieg na końcu); poprawki dotykają jednego komunikatu i dwóch plików JSON — pokryte biegiem
  celowanym 795 passed. CI na gałęzi wykona pełny bieg.
- Znaleziska kart do decyzji właściciela, nie ruszane w integracji (bez nowych funkcji):
  PF-OD19 §6 (fikstura speca pasm, rozjazd tabliczki z U_n szyn, gałąź magnesująca w rdzeniu NR
  — B-01, prawdziwa dolna gałąź P–U); B01-RUNDA-1 (cztery ciche przełączenia metody w rdzeniach,
  `estimate_id` WLS niezależny od α — B-01; R2 parytetu Y); ETYKIETA (symbol pola o roli spoza
  słownika — B-02; martwe `StationCard.tsx`/`NnSwitchgearCard.tsx`, `freeBranchPorts`).
- Dwa commity poprawek partii 6 zapowiedziane w karcie (front: warstwy klawisza Escape;
  backend: poprawki przeglądu) — backendowe wykonane tutaj wg polecenia wznowienia (§6);
  frontowego polecenia jeszcze nie otrzymałem.
