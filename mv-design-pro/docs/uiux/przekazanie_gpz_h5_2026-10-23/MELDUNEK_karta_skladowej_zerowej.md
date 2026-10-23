# Meldunek — karta GPZ-H5-SKLADOWA-ZEROWA

## Wynik i dowód

Commit: `cc0f8d8c3`, jeden, lokalny, na gałęzi `uiux-gpz-h5-zerowa`, rodzic `88557ceb7`. Zmienia 101 plików. Nie wypchnąłem go.

Dowód:

- **Pełna regresja backendu** (`-n 4 --dist loadfile -m "not pandapower and not andes"`, prywatny `--basetemp`): **38 421 passed, kod 0**, 3696 s.
- **Komplet strażników** (`guardy_z_ci.py`): **kod 0, „KOMPLET ZIELONY”**. Wynik obejmuje:
  - 107/107 strażników z CI;
  - black i ruff dla `src`, `tests` i skryptów;
  - `npm run type-check` i `npm run lint`;
  - testy własne strażników: 3978 passed;
  - `mypy_ratchet_guard`: zielony.
- **Testy celowane**:
  - nowy plik `tests/enm/test_gpz_h5_skladowa_zerowa.py`: 221 testów;
  - razem z plikami pokrewnymi (`test_zero_sequence_transformer`, `test_gpz_h5_akceptacja`, `lv_domain`, strażnik parytetu): 585 passed, kod 0.
- **Iniekcje**: 13 z 13 czerwonych (I1–I9 oraz J1–J4).

## Zmiana kierunku w trakcie karty (zgodność z decyzją właściciela)

Decyzja właściciela mówi: „NIE_DOTYCZY … dla sieci kompensowanej lub izolowanej”. W pierwszej wersji kodu sieć izolowana z pojemnościami doziemnymi dostawała status `BRAK_DROGI_FIZYCZNEJ`. Taki kod zmieniał też zachowanie zwarcia 2F+Z: w sieci G13 (CGMES) trzy węzły SN z B0 tracił wynik 2F+Z, który baza liczyła.

Poprawiłem to u źródła. Klasyfikacja ma teraz jedno źródło i dwa wymagania konsumenta (`enm/przyczyny_zwarcia_doziemnego.py`, `Wymaganie`):

- **`zwarcie_1f`** (prąd I″k1):
  - sieć kompensowana (dławik) → `NIE_DOTYCZY`;
  - sieć izolowana, w której droga prowadzi wyłącznie przez pojemności doziemne → `NIE_DOTYCZY`.
  - Podstawa w obu przypadkach: IEC 60909-0:2016 rozdz. 1 i 3. Zwarcie jednofazowe z ziemią norma definiuje tylko w sieci uziemionej bezpośrednio albo przez impedancję.
- **`impedancja_z0`** (zwarcie 2F+Z oraz kotwica SN domeny nN): w sieci kompensowanej i izolowanej impedancja zerowa jest obliczalna (dławik albo pojemności), więc wynik jest liczony.
- **Dla obu wymagań**:
  - `BRAK_DANYCH` — z listą elementów i brakujących pól;
  - `BRAK_DROGI_FIZYCZNEJ` — blok Y0 osobliwy: brak jakiegokolwiek bocznika do ziemi, Z0 nieskończone. Opis podaje, że 2F+Z przechodzi wtedy w 2F.

## Inwentarz klasy: konsumenci sieci składowej zerowej

| Miejsce | Co zrobiono |
|---|---|
| `backend/src/enm/mapping.py:470` `_assemble_zero_sequence_y0` | Zespół uziemiający ZU dokłada bocznik Z_0,ZU + 3·Z_N. Transformator: K_T także dla Z_T0 (§6.3.3), skala (U_r/U_baz)², n_parallel, Z_N na bazie węzła (`_z_tk0_pu`, `mapping.py:984`). Liczba torów w Z0 i B0. Źródło z innej wyspy pomijane jak gałęzie. Opis uziemienia źródła wyłącznie dla źródła SN (predykat `enm/uziemienie.py:71`). |
| `backend/src/enm/mapping.py:1092` `SiecSkladowejZerowej` i `:1120` `zbuduj_siec_zerowa` | Przyczyny per wymaganie (`przyczyny_dla`); oba słowniki z jednej funkcji `przyczyny_skladowych` (`przyczyny_zwarcia_doziemnego.py:307`). |
| `backend/src/enm/przyczyny_zwarcia_doziemnego.py:257` `rozstrzygnij_skladowa` | Nowy moduł, jedno źródło prawdy. Reguły 0–5 opisane w nagłówku, każda ma test dla obu wymagań. |
| `backend/src/enm/assembler.py:153` `_wymaganie_sieci_zerowej` i `:1161` | 1F → `zwarcie_1f`; 2F+Z → `impedancja_z0`. |
| `backend/src/enm/canonical_analysis.py:2735` (wiersz surowy) i `:4132` (wiersz wyniku) | Kod w `non_physical_reason` i addytywne `przyczyna_braku_wyniku`. |
| `backend/src/application/solvers/short_circuit_binding.py:295` (pakiet dowodowy 1F) | Odmowa nazwana tą samą przyczyną co wiersz biegu. |
| `backend/src/application/analyses/lv_domain/upstream_equivalent.py:119` (kotwica SN dla nN) | Wymaganie `impedancja_z0`. |
| `backend/src/enm/validator.py:2821` E-W5-01 | Zespoły uziemiające liczą się jako fizyka punktu neutralnego SN. |
| `backend/src/enm/mapping.py:1174` `build_zero_sequence_trace` (White Box) | Decyzja punktu neutralnego każdego uzwojenia, krok K_T, krok ZU. |
| `backend/src/enm/models.py:1260` `ZespolUziemiajacy`, `:1402` `Bay.zespol_uziemiajacy` | Rekord addytywny, odmowy kontraktu. Lustro w `frontend/src/types/enm.ts`. |

Świadomie zostawione, z uzasadnieniem:

1. **`application/analyses/earthing/ground_fault_bridge.py`**: czyta gotowy `ShortCircuitResult.ikss_a` i nie ma produkcyjnego wywołującego (`build_earthing_ground_fault_input` wywołują tylko testy). Gdy 1F nie jest liczone, most nie dostaje wyniku. Funkcja żyjąca tylko w testach to dług według zasady nr 1. Leży poza miejscami dozwolonymi przez kartę, więc zgłaszam ją sesji głównej.
2. **`build_zero_sequence_trace`**: nie ma konsumenta produkcyjnego. Ślad White Box biegu nie zawiera kroków budowy sieci zerowej. Wpięcie zmienia kontrakt `white_box_trace_v1`, a to wymaga decyzji architekta.
3. **Frontend**: nie renderuje `przyczyna_braku_wyniku` ani `non_physical_reason` wiersza zwarcia. Karta nie dopuszcza warstwy UI, dlatego zgłaszam to sesji głównej.
4. **Kod gotowości dla pola uziemiającego bez danych ZU**: nie dodałem go. Przyczyna niesie się per węzeł w wyniku. Zasada 4 nie dotyczy tego przypadku, bo sposób uziemienia jest decyzją modelu, a nie brakiem danych katalogowych.

## I″k1 i I″k2E: rachunek ręczny i solver (GPZ H5, tor L1)

| Przypadek | MAX [A] ręcznie / solver | MIN [A] ręcznie / solver |
|---|---|---|
| 110 kV, YNd11 uziemiony bezpośrednio | 12 825,40 / 12 825,40 | 9 324,67 / 9 324,67 |
| 110 kV, uziemiony przez rezystor 10 Ω | 12 715,88 / 12 715,88 | 9 229,68 / 9 229,68 |
| 110 kV, izolowany | 12 301,50 / 12 301,50 | 8 857,08 / 8 857,08 |
| SN-A 1F, ZU uziemiony bezpośrednio | 3 400,62 / 3 400,62 | 3 072,68 / 3 072,68 |
| SN-A 1F, rezystor 20 Ω | 456,28 / 456,28 | 414,72 / 414,72 |
| SN-A 1F, rezystor z X 2 Ω | 448,70 / 448,70 | 407,80 / 407,80 |
| SN-A 1F, dławik / dławik z rezystorem równoległym | NIE_DOTYCZY | NIE_DOTYCZY |
| SN-A 1F i 2F+Z, punkt odłączony | BRAK_DROGI_FIZYCZNEJ | BRAK_DROGI_FIZYCZNEJ |
| SN-A 1F i 2F+Z, brak zespołu / dane niepełne | BRAK_DANYCH | BRAK_DANYCH |
| SN-A 2F+Z, rezystor 20 Ω | 7 724,92 / 7 724,92 | 6 856,49 / 6 856,49 |
| SN-A 2F+Z, bezpośrednio | 8 299,83 / 8 299,83 | 7 378,28 / 7 378,28 |
| SN-A 2F+Z, dławik | 7 719,06 / 7 719,06 | 6 851,07 / 6 851,07 |
| SN-A 2F+Z, dławik z rezystorem równoległym | 7 719,19 / 7 719,19 | 6 851,19 / 6 851,19 |

Różnica względna między rachunkiem ręcznym a solverem nie przekracza 3·10⁻¹⁶.

## Testy jako iloczyn cech

Główny iloczyn SN: {9 wariantów ZU} × {MAX, MIN} × {sekcja A, sekcja B} × {punkt neutralny 110 kV: Yd11 z katalogu, YNd11 uziemiony} × {1F, 2F+Z} = 144 przypadki.

Pozostałe testy:

- sekcje połączone sprzęgłem ŁS-SN przy wyłączonym TR2 — sześć kombinacji zespołów;
- 110 kV: {uziemiony, przez rezystor, izolowany} × {MAX, MIN};
- reguły rozstrzygnięcia: 21 przypadków × 2 wymagania, test determinizmu;
- konsumenci tej samej przyczyny: pakiet dowodowy 1F (odmowa i wynik), kotwica nN (pięć wariantów);
- predykat źródła 110 kV;
- walidator E-W5-01 (sześć przypadków);
- White Box;
- odcisk modelu (addytywność);
- odmowy kontraktu ZU: pole innej roli, R0 lub X0 ujemne, rezystor równoległy bez dławika, rezystor równoległy o R = 0, rezystor równoległy bez punktu neutralnego;
- `test_zero_sequence_transformer`: para predykatu bez B0 i z B0 dla obu wymagań.

Iniekcje, wszystkie czerwone:

- **I1–I9** (z poprzedniej części pracy).
- **J1** — sieć izolowana zwraca BRAK_DROGI zamiast NIE_DOTYCZY: 4 testy czerwone.
- **J4** — reguła dławika stosowana także dla Z0: 22 testy czerwone.
- **J2** — 2F+Z czyta przyczyny 1F: 18 testów czerwonych.
- **J3** — kotwica nN czyta przyczyny 1F: 2 testy czerwone.

## Złoty parytet assemblera (366 wpisów) — zmiana świadoma, per sieć

- **PF bez zmian.** Regeneracja dała w 14 wpisach wyłącznie szum zaokrąglenia przy identycznym szkielecie. Te wpisy przywróciłem z bazy.
- **Szkielet** SC_1F_max (61 sieci) i SC_2FG_max (60 sieci, bez G13): nowe pole `przyczyna_braku_wyniku` oraz rozdział kodu przyczyny.
- **Liczby — K_T w Z_T0**: Z0 transformatora sieciowego zmienia się o −1,4 % do −3,7 % w sieciach G00, G02, G04, G05, G06, G08 i B-BENCH/09.
- **Liczby — G16 i G17**: Z0 transformatora rośnie o +18,6 %, czyli o czynnik (16,5/15)²·K_T = 1,21·K_T. Napięcie znamionowe tr-gpz to U_rLV = 16,5 kV przy U_n = 15 kV; Z1 już miał tę skalę.
- **G13**: 1F w trzech węzłach SN sieci izolowanej z B0 dawało wcześniej „2,81 A” (prąd pojemnościowy, już wtedy nieraportowalny). Teraz te węzły mają NIE_DOTYCZY z wyjaśnieniem. 2F+Z jest liczone jak dotąd, a jego szkielet się nie zmienił.

## Piny z pomiarem

| Pin | Było | Jest |
|---|---|---|
| `contract_fields` | 4355 | 4361 |
| pliki skanu | 590 | 591 |
| pliki skanu enm | 73 | 74 |
| pola Literal w parytecie ENM (encje 75 → 76, `ZespolUziemiajacy.uklad`) | 126 | 127 |
| `Any` w kodzie | 30 (zmierzone 31) | 28 |

## Czego nie zrobiono i dlaczego

1. **Vitest związany ze zmianą** (`vitest related` na 73 zmienionych plikach frontendu): 182 pliki zielone, 20 plików czerwonych, 132 testy czerwone.
   - Czerwone są wyłącznie testy sceny SLD v3: pola TR, wieże transformatorów, etykiety aparatów, obrys arkusza.
   - **Ten sam zbiór 20 plików i 132 testów jest czerwony na bazie `88557ceb7`** (kopia bazy z tym samym `node_modules`, porównanie identyczne). Defekt jest więc sprzed tej karty i nie dotyczy składowej zerowej.
   - Przykład rozbieżności: `ownerRef` aparatu pola TR ma wartość `…/transformer/001/bay_sn` zamiast oczekiwanej `…/transformer/001/wn_sn`.
   - Warstwa SLD leży poza miejscami dozwolonymi kartą. Prawdopodobnie dotyczy jej równoległa karta aparatów pól GPZ H5. Zgłaszam sesji głównej do rozstrzygnięcia.
2. **Pozycje z inwentarza świadomie zostawione** (sekcja wyżej, punkty 1–4): ground_fault_bridge bez produkcyjnego wywołującego, ślad budowy sieci zerowej bez konsumenta, brak renderu przyczyny w UI, brak kodu gotowości.
3. **Werdyktu wizualnego nie wystawiam** (bramka B-02). Zmiana nie dotyka renderu.
4. **Środowisko**: drzewo nie miało `node_modules`. Do biegu strażników i vitest dowiązałem `node_modules` z głównego checkoutu (tylko do odczytu). Po biegu dowiązanie usunąłem.
5. **Sprzątanie**: katalogi tymczasowe (`bt_*`, kopie bazy) usunięte. Dysk: 85 %, wolne 6,2 GB.
