# UX-04/POLE-BKR-MODEL — bateria kondensatorów równoległych SN: model, katalog, fizyka, reguły

Status: dostarczone przez wykonawcę karty (commit lokalny na gałęzi
`claude/mv-design-pro-twin-audit-u4lhy0-karta-bkr`, baza `1465336df`). Akceptacja zmiany rdzenia
`v126_academic.py` należy do architekta (bramka B-01), werdykt wizualny glifu baterii — do
właściciela (bramka B-02). Wpisu w `PLANS.md` karta nie robi.

Podstawy: ENEA Operator, „Stacje elektroenergetyczne 110 kV", Zeszyt 1 §17 s. 32 (bateria
w rozdzielni SN GPZ: podwójna gwiazda, jednostki jednofazowe, zabezpieczenie niezrównoważenia,
przekładniki rozładowcze) i Zał. 16 (rysunek pola BKR, odczyt tekstowy:
`docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`); IRiESD ENEA II.4.5.4.4.2 s. 53–54
(wyłączenie transformatora wyłącza baterię); IEC 60909-0:2016 (pominięcie admitancji
poprzecznych w składowej zgodnej i przeciwnej; §5.3.2 — składowa zerowa).

## 1. Rozstrzygnięcia (§0 karty) i miejsce realizacji

| § | Rozstrzygnięcie | Realizacja |
|---|---|---|
| 1 | Jeden element `ShuntCapacitor` z układem połączeń {podwójna gwiazda izolowana, gwiazda izolowana, gwiazda uziemiona, trójkąt}, liczbą stopni i stanem każdego stopnia, Q i U, tolerancją pojemności, dławikiem (jest/brak, L), rezystorami rozładowczymi, listą transformatorów wyłączających baterię; powiązanie z polem przez zacisk końca toru pola | `backend/src/enm/models.py:658` (pola addytywne, walidator spójności `:718` przez wspólny predykat `network_model/core/bateria_kondensatorow.py:105`); powiązanie `bus_ref == Bay.terminal_bus_ref` — `enm/bateria_kondensatorow.py:501` `pole_baterii` i lustro frontu `frontend/src/ui/sld/v2/model/bateriaPola.ts:50` |
| 1 | Typ katalogowy z tymi samymi parametrami i tymi samymi granicami | `network_model/catalog/types.py:3080` `ShuntCapacitorType` (granice w `__post_init__`, reguły twarde KAT-T-051…055 w `niezmienniki_katalogu.py`; element ENM z typami ścisłymi `StrictInt`/`StrictBool`); pozycje referencyjne `mv_shunt_capacitor_catalog.py` — podwójna gwiazda, jeden stopień (Zeszyt 1 §17 s. 32, Zał. 16) |
| 1 | Wartości robocze wg ZASADY NR 4 | rejestr `network_model/catalog/wartosci_robocze.py:2038` (propozycje z podstawą), rozstrzygnięcie element (PROJEKTANT) > typ (KATALOG) > rejestr (PROPOZYCJA, ESTIMATED) `:2241`, wpisy `dane_przyjete` `:2272` |
| 2 | Rozpływ Q(U) = Q_n·(U/U_n)²·u, u = n_zał/n; straty czynne P = P_str·u·(U/U_n)² z `loss_kw` typu (dawniej `g_pu = 0` — dana katalogu bez konsumenta, świadoma korekta fizyki, sekcja 4) | admitancja stała `enm/bateria_kondensatorow.py:268` (algebra w `network_model/pochodne/bateria_kondensatorow.py:40`, dławik y_d = 1/(jX_L + 1/y), X_L = 2πfL `:35`); boczniki solvera `enm/assembler.py:334`, użycie `:1007`; White Box wyniku `canonical_analysis.py:3220`; założenia `assembler.py:1071` |
| 3 | SC składowa zgodna/przeciwna: pominięcie jako jawne założenie z podstawą | `enm/bateria_kondensatorow.py:421` `zalozenia_baterii_zwarcia`, wpięte `assembler.py:1256`; podstawa `core/bateria_kondensatorow.py:55` |
| 3 | Składowa zerowa: drogę ma wyłącznie gwiazda uziemiona (Y0 = Y1) | jeden predykat `core/bateria_kondensatorow.py:45` `UKLADY_Z_DROGA_ZEROWA` → `enm/bateria_kondensatorow.py:416` `ma_droge_zerowa`; macierz Y0 `enm/mapping.py:678` (ślad `z0_shunt_capacitor[...]`) |
| 3 | Wkład do I_C tylko gwiazdy uziemionej, w solverze | `solver_input/v126_contracts.py:191` (`b0_siemens` z `admitancja_zerowa_baterii_s`), predykat `:205` `wnosi_pojemnosc_doziemna`; solver `network_model/solvers/v126_academic.py:1368` (B-01); gotowość `application/analyses/v126_gotowosc.py:909` — ten sam predykat |
| 3 | Prąd udarowy załączenia baterii | NIE wpięty — brak konsumenta (sekcja 6) |
| 4 | Reguły walidatora z wyjaśnieniem | `enm/validator.py`: E043 `:2214` (stan stopni niezgodny z liczbą stopni — bloker, wraz z odmową operacji `KOD_BATERIA_STOPNIE_NIEZGODNE`), W045 `:2241` (bateria w GPZ bez pola BKR), W046 `:2279` (podwójna gwiazda bez przekładnika niezrównoważenia), W047 `:2308` (brak przekładników rozładowczych przy jednostkach bez rezystorów wewnętrznych), W048 `:2360` (wyłączenie TR zasilającego nie wyłącza baterii — IRiESD II.4.5.4.4.2); akcje naprawcze `frontend/src/ui2/spaces/gotowosc/akcjeNaprawcze.ts:165` |
| 5 | Nowe rodzaje aparatów pola `UNBALANCE_CT` (port `obwod`) i `PHASE_TO_PHASE_VT` (porty A, B) | `network_model/catalog/rodzaje_aparatury.py:125`, `:128`; wyposażenie pola `enm/wyposazenie_pola.py:88`; lustro frontu `frontend/src/ui/field/wyposazeniePola.ts:33`, porty `frontend/src/ui/sld/v3/compose/rodzajeAparatowPolaBkr.ts`; parytet `backend/tests/ci/test_parytet_rodzajow_aparatow_pola_bkr.py` |
| 6 | Rola `BKR` na jednej liście ról | `enm/rola_pola_sn.py:30` `RolaPolaModelu`; czytają ją `enm/models.py:1365`, `network_model/catalog/bay_templates.py:79`, `network_model/catalog/switchgear/complete_mv_bay_template.py:122`, `enm/domain_ops_models.py:1089`; lustro frontu `frontend/src/types/enm.ts:1200` `BAY_MODEL_ROLES`; kreator pola `frontend/src/ui2/kreatory/pole/polaSnModel.ts:111`; profil referencyjny `reference_engine/registry.py:217` (`capacitor_bank`) |
| 6 | Symbol baterii SLD v3 w obu motywach, geometria QElectroTech (CC BY 3.0) | `frontend/src/ui/sld/v3/symbols/glyphs.tsx:1241` `CapacitorBankGlyph` (atrybucja `:1220`), znak układu i przekładnik niezrównoważenia z modelu; tokeny `theme/palette.ts`; zrzuty `docs/uiux/zrzuty/ux04-bkr/` |

Szablon pola BKR i jego rysunek QET pozostają karcie sesji głównej (§0 pkt 6 karty).

## 2. Sonda liczbowa przed i po (B-01)

Sieć sondy: `_build_mv_lv_enm` z `tests/enm/test_canonical_sc_c_per_pasmo.py` z kablem
b0 = 1e-4 S/km (I_C, SC); rozpływ na sieci S/L z u_set = 1,05. Bateria 1,2 Mvar, 15 kV.

| Wariant | Wielkość | Przed | Po | Podstawa różnicy |
|---|---|---|---|---|
| Bez baterii | `input_hash` | 7f528f1f… | 7f528f1f… | brak (determinizm) |
| Bez baterii | `v126_input_hash` | b0dab015… | b0dab015… | brak |
| Bez baterii | I_C | 5,352 A | 5,352 A | brak |
| Bez baterii | SC_3F / SC_1F | 7160,670 A / 5286,029 A | identyczne | brak |
| Bez baterii | PF slack_q | 0,50051 | 0,50051 | brak |
| Bateria bez pól karty | `input_hash` | 49a15599… | 49a15599… | brak (pola `None` nie wchodzą do skrótu) |
| Bateria bez pól karty | `v126_input_hash` | b0dab015… | 6c0a7654… | bateria wchodzi do wejścia v126 jako układ bez drogi zerowej (wartość robocza: podwójna gwiazda) |
| Bateria bez pól karty | I_C | 5,352 A | 5,352 A | podwójna gwiazda nie ma drogi zerowej |
| Bateria bez pól karty | PF slack_q | −0,82249 | −0,82249 | Q(U) liczony był już jako stała admitancja |
| Bateria bez pól karty | White Box q baterii | — | 1,323 Mvar | = 1,2·1,05² (nowa pozycja śladu) |
| Bateria bez pól karty | SC | — | bez zmian | pominięcie w składowej zgodnej, brak drogi zerowej |
| Gwiazda uziemiona | I_C | (stan „przed" nie miał układu) | 143,9161 A | +138,564 A = √3·(1,2/15²)·15·1000 — wkład pojemności doziemnej baterii |
| Gwiazda uziemiona | SC_1F | — | 5256,537 A (−0,56 %) | Y0 baterii równoległe do Y0 sieci (IEC 60909-0 §5.3.2) |
| Gwiazda uziemiona | SC_3F | — | bez zmian | pominięcie w składowej zgodnej |
| Podwójna gwiazda, 2 stopnie, 1 wyłączony, dławik 5 mH | q / slack_q / I_C | — | 0,66428 Mvar / −0,16378 / 5,352 A | u = 1/2, dławik podnosi napięcie na kondensatorze |

Rdzeń IEC 60909 nietknięty. Zmiany w `network_model/solvers/**`: `v126_academic.py`
(suma C0 baterii z drogą zerową — B-01, skrót w `scripts/guard_references/solver_hashes.json`,
uzasadnienie w `scripts/solver_boundary_guard.py`) oraz docstring `shunt_compensator_preview.py`.

## 3. Inwentarz klasy

Mechanizmy dzielone przez baterię i miejsca, które z nich korzystają:

- **Rozstrzygnięcie parametru** (`enm/bateria_kondensatorow.py:109` `parametry_baterii`): rozpływ
  (`assembler.py:261`), zwarcia (`assembler.py:1256`, `mapping.py:688`), v126
  (`v126_contracts.py:1076`), walidator (`validator.py:2214…2360`), dane przyjęte
  (`wartosci_robocze.py:2272`), front (`bateriaPola.ts:42` — tylko element > typ, bez
  duplikowania rejestru: brak danej = znak „układ nieokreślony").
- **Predykat drogi zerowej** (`core/bateria_kondensatorow.py:45`): Y0 zwarcia (`mapping.py:691`),
  założenia SC (`bateria_kondensatorow.py:445`), admitancja zerowa v126 (`:221`), suma C0 solvera
  i gotowość v126 (jeden predykat `wnosi_pojemnosc_doziemna`).
- **Predykat spójności stopni i dławika** (`core/bateria_kondensatorow.py:105`): walidator modelu
  (`models.py:718`), odmowa operacji (`bateria_kondensatorow.py:625`), reguła E043
  (`bateria_kondensatorow.py:126`).
- **Powiązanie bateria–pole** (`bus_ref == terminal_bus_ref`): backend `pole_baterii` (`:501`),
  front `bateriaNaKoncuToruPola` (`bateriaPola.ts:50`) wpięte w `enmToSldAdapter.ts:1881`
  i `enmToCanonicalGpzAdapter.ts:539`.
- **Lista ról pola**: pięć dawnych kopii literału czyta teraz `RolaPolaModelu`; dwie martwe kopie
  ról we froncie (`ui/network-build/forms/bayApparatusBuilder.ts`, `gpzSectionsValidator.ts`,
  zero konsumentów produkcyjnych) skasowane razem z testami.
- **Boczniki solvera**: martwy duplikat `_build_shunt_specs_from_snapshot` (tylko testy)
  zastąpiony jedną funkcją `_boczniki_solvera_z_baterii` (`assembler.py:334`) wołaną przez produkcję
  i testy.
- **Granice parametrów: typ katalogowy × element ENM** (predykaty parami). Typ sprawdzał tylko
  układ i liczbę stopni, i to wyłącznie w `from_dict` (konstruktor przepuszczał wszystko), a
  surowe `raise ValueError` omijały rejestr reguł (`niezmienniki_katalogu_guard`). Element ENM
  przyjmował `liczba_stopni=True` i `1` jako wartość logiczną (pydantic w trybie luźnym). Teraz
  obie strony mają ten sam zbiór granic: układ ze słownika (KAT-T-051), liczba stopni całkowita
  ≥ 1 (KAT-T-052), tolerancja dolna ≤ 0 ≤ górna (KAT-T-053), indukcyjność dodatnia i tylko przy
  dławiku — wspólny predykat `sprzecznosc_parametrow_baterii` (KAT-T-054), pola logiczne tylko
  prawda/fałsz (KAT-T-055); test iloczynu wartość × {`from_dict`, konstruktor, element ENM}.
- **Kompletność rysunku na L0** (`frontend/src/ui/sld/v3/scene/kompletnoscRysunku.ts`). Pierwsza
  fikstura publiczna z GPZ o dwóch sekcjach ujawniła lukę reguły: sprzęgło sekcji (gałąź między
  szynami jednej stacji) na L0 było „niewyjaśnione”, choć GPZ jest wtedy symbolem zbiorczym.
  Reguła zalicza je do `blok-stacji` WYŁĄCZNIE na L0 i wyłącznie przy obu końcach na szynach tej
  samej narysowanej stacji; gałąź między dwiema stacjami i gałąź bez prymitywu na L1/L2 zostają
  `niewyjasniony` (test iloczynu końce{ta sama stacja, dwie stacje, poza stacją} × LOD{0,1,2}
  × prymityw{jest, usunięty}; iniekcja „dowolna narysowana stacja” — czerwony).
- **Rodzaje aparatów pola**: `rodzaje_aparatury.py:125/128`, `wyposazenie_pola.py:88`,
  `apparatusSequence.ts:139` (`PHASE_TO_PHASE_VT` → symbol przekładnika napięciowego),
  `wyposazeniePola.ts:33`, `referenceProfiles.ts`, paczki referencyjne IEC 60617/62271.

Świadomie poza naprawą (z uzasadnieniem w sekcji 6): prąd udarowy załączenia, skutek łączeniowy
W048, ślad Y0 `build_zero_sequence_trace` (konsumenci testowi), CGMES bez atrybutu dławika.

## 4. Testy (iloczyn cech) i iniekcje

| Plik | Iloczyn cech | Wynik |
|---|---|---|
| `backend/tests/enm/test_bateria_kondensatorow_iloczyn.py` | układ{4} × stopnie{1, 2, 2 z jednym wyłączonym} × U{U_n, 0,95, 1,05} × dławik{jest, brak} × konsument{LF (wyrocznia zespolona niezależna od kodu), SC_3F (pominięcie w śladzie, Ikss bez zmian), SC_1F (1/z0 − 1/z0_ref = Y tylko dla gwiazdy uziemionej), I_C v126 (zgodność gotowości i solvera), walidator (układ{4 + brak} × przekładnik × liczba VT{0,1,2} × rezystory{brak, tak, nie}, W045/W048, sprzęgło otwarte/zamknięte, E043 z odmową operacji)} | 241 passed |
| `backend/tests/enm/test_bateria_kondensatorow_model.py` | parytet słownika układów i pól TS; typ katalogowy; materializacja; pierwszeństwo per parametr; skrót bez baterii i z polami `None`; komunikaty odmów po polsku | 27 passed |
| `backend/tests/enm/test_rola_pola_bkr.py` | kopia literału {Bay, BayTemplate, CompleteMvBayTemplate, AddSnBayPayload, lustro frontu} × rola × zapis roli w żądaniu | 15 passed |
| `backend/tests/ci/test_parytet_rodzajow_aparatow_pola_bkr.py` | rodzaj aparatu × {backend, front, porty} | zielony |
| `frontend/src/ui/sld/v2/model/__tests__/bateriaPola.test.ts` | źródło układu{element, typ, oba, brak, spoza słownika} × przekładnik × zacisk{zgodny, inny, brak}; glif układ{4 + brak} × przekładnik; scena z obu fikstur generatora | 45 passed |
| `frontend/src/ui2/kreatory/pole/__tests__/polaSnModel.test.ts` | wybór ról kreatora = `BAY_MODEL_ROLES`, nazwa i rodzaj pola BKR | 17 passed |

Iniekcje (plik przywracany po biegu, każda czerwieni test):

- Q stałe zamiast Q(U) — 12 czerwonych (dokładnie stopnie{3} × U{0,95; 1,05} × dławik{2});
- gwiazda izolowana z drogą zerową — 13 czerwonych;
- brak wpisu założenia w śladzie — 96 czerwonych;
- front: układ baterii czytany tylko z elementu (pominięty typ katalogowy) — 3 czerwone (relacja pola × źródło „typ” i scena z fikstury podwójnej gwiazdy);
- kreator bez roli `BKR` — 1 czerwony;
- element ENM bez typów ścisłych — czerwony (`liczba_stopni=True` przechodził walidację);
- reguła L0 sprzęgła z predykatem „koniec na dowolnej narysowanej stacji” — 1 czerwony.

Złote pliki odświeżone generatorami, z dowodem semantycznym:

- `backend/tests/golden/parytet_assemblera/zlote_hashe.json` (`regeneruj.py`): zmieniło się 12
  wpisów z 366 — sieci z baterią (B-BENCH/03 IEEE case14, G16) × {PF, SC_3F max/min, SC_2F,
  SC_2FG, SC_1F}. Zmiana wyłącznie szkieletu: nowy blok White Box `baterie_kondensatorow` (PF),
  nowe założenia (pominięcie baterii w składowej zgodnej, układ z wartości roboczej) i wpis
  danych przyjętych wierszy w składowej spójnej sieci zerowej baterii. Liczby: stare liczby PF
  są bit w bit sufiksem nowych (dopisane 17 i 16 liczb bloku baterii, np. q = 21,18484 Mvar =
  19·1,055932²), liczby SC bez zmian.
- `backend/tests/golden/parytet_scenariuszy/zlote_hashe.json` (`regeneruj.py`): 4 z 28 hashy —
  dobór kompensacji (sieć złota i sieć kompensacji × dzień/noc). Jedyna przyczyna: straty
  czynne kandydata z katalogu (`loss_kw`) w rozpływie; zbiór kluczy widoku identyczny, różnią
  się wyłącznie liście liczbowe — moc czynna punktu o P_str·(U/U_n)² kandydata (0,6 Mvar /
  0,3 kW: −0,8 → −0,799694 MW przy (U/U_n)² = 1,0212), cos φ i Q w ślad za nią; werdykty
  i wybór kandydata bez zmian.
- `frontend/src/ui/shared/__tests__/fixtures/szynyStacjiParytet.json`
  (`tests.reference_networks.szyny_stacji_parytet --write`): dopisane dwie nowe fikstury
  publiczne pola BKR.
- `frontend/src/harness-fixtures/generated/*.json` (`backend/scripts/eksport_fixtur_harnessu.py`):
  16 plików, zmienione wyłącznie `catalog_fingerprint` (58 wystąpień) i pochodny od niego
  `semantic_fingerprint` (8) — skutek nowych pól typu baterii w katalogu.
- `docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` (`backend/scripts/inwentarz_katalogow.py`):
  wiersz `shunt-capacitor` — 9 pól opcjonalnych, wypełnienie 33,3 % (pozycje referencyjne nie
  podają danych karty producenta; obliczenie biegnie z wartością roboczą).

Piny podniesione z pomiarem (baza `1465336df` z `git archive` wobec drzewa karty):

- `scripts/test_solver_input_substitute_guard.py`: pola kontraktów wejściowych 4374 → 4394
  (różnica zbiorów +20, −0 — pola baterii elementu i typu, wielkości admitancji baterii, wejście
  v126 `baterie`/`b0_siemens`), pliki skanowane 596 → 599 (enm 75 → 76, network_model 191 → 193:
  trzy nowe moduły `bateria_kondensatorow.py`); dług i wykluczenia bez zmian, PASS bez zmian;
- `backend/tests/ci/test_enm_contract_parity_guard.py`: pola literałowe 125 → 126
  (`ShuntCapacitor.uklad_polaczen`);
- `backend/tests/enm/test_hash_pola_addytywne.py`: rejestr pól addytywnych hasha z wpisem
  `shunt_capacitors` (8 pól karty z `exclude_none` — hash sieci bez tych pól bez zmian);
- `backend/tests/network_model/catalog/test_odcisk_katalogu_karty_widmowe.py`: nowe ogniwo
  łańcucha odcisku katalogu `e0fbf7f1…`; wycięcie pięciu pól typu baterii odtwarza poprzednie
  ogniwo dokładnie.

Fikstury `frontend/public/test-fixtures/gpz110kvBkr.enm.json`
i `gpz110kvBkrGwiazdaUziemiona.enm.json` powstają wyłącznie z generatora
`backend/tests/reference_networks/fikstury_enm_sld.py` (scena `scena_pola_bkr.py`).

## 5. Zrzuty

`docs/uiux/zrzuty/ux04-bkr/` — harness SLD v3 (`e2e/pole-bkr-screenshot.spec.ts`), poziom detalu
L2, oba motywy, kadr pełny i zbliżenie wyśrodkowane na zmierzonej ramce glifu:
`pole-bkr-podwojna-gwiazda[-zblizenie]-{ciemny,jasny}.png`,
`pole-bkr-gwiazda-uziemiona[-zblizenie]-{ciemny,jasny}.png`. Werdykt wizualny — właściciel (B-02).
Obserwacja do oceny: blok pola BKR jest szerszy od sąsiednich pól.

## 6. Ograniczenia i braki konsumenta (zgłoszone, nie zamaskowane)

- **Prąd udarowy załączenia baterii.** W repo nie ma konsumenta doboru wyłącznika baterii:
  katalog aparatów nie niesie znamionowej zdolności łączenia prądów pojemnościowych, jedyny prąd
  załączenia w v126 to prąd magnesowania transformatora. Zgodnie z kartą pole nie powstało.
- **W048 a skutek łączeniowy.** `wylaczenie_od_transformatorow` ma dziś jednego konsumenta —
  regułę W048; w repo nie ma macierzy wyłączeń. Skutek łączeniowy realizuje karta
  LOGIKA-LACZENIOWA.
- **Ślad Y0 `build_zero_sequence_trace`** (`enm/mapping.py:844`) ma wyłącznie konsumentów
  testowych; wpis baterii jest w nim kompletny.
- **CGMES** nie ma atrybutu dławika ograniczającego; eksport/import niesie układ i stopnie.
- **v126** sumuje b0 wszystkich linii, nie sieci galwanicznej — obserwacja dla architekta (B-01).
- **Odłącznik pola** nie jest w scenie generatora (wymaga drugiej gałęzi łącznika — buduje ją
  szablon pola BKR sesji głównej). Porty `PORTY_APARATOW_POLA_BKR` czekają na scalenie wzorca pola
  liniowego (wt-pole).
