# Meldunek — karta WSPOLCZYNNIK-C-JEDEN-NOSNIK (współczynnik napięciowy c, jeden nośnik)

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-wspolczynnik-c`. Data: 2026-10-16.
Status: **CLAIMED DONE — do weryfikacji B-01 przez architekta** (zmiany w `network_model/solvers`
i w rdzeniu FROZEN `short_circuit_iec60909.py` ograniczone do zakresu karty). Werdykt wizualny
(B-02) należy do właściciela — zrzuty „przed” i „po” w `mv-design-pro/docs/audit/visual/wspolczynnik_c/`.

## 1. Wynik i dowód

Współczynnik napięciowy c (c_max i c_min, IEC 60909-0:2016 tab. 1) ma teraz **jedno źródło
stałych** — `backend/src/network_model/core/voltage_factor.py` — i **jeden nośnik wyboru** w torze
użytkownika:

| Wielkość wejściowa | Nośnik | Skutek |
|---|---|---|
| kolumna tabeli (c_max / c_min) | scenariusz zwarciowy MAX/MIN (`options.scenario`, scenariusz zwarć) | jedyny przełącznik kolumny |
| pasmo napięcia (nN ≤ 1 kV / SN, WN) | `voltage_kv` węzła zwarcia | wiersz tabeli per węzeł, nie per bieg |
| tolerancja sieci nN (+6 % / +10 %) | `Transformer.lv_voltage_tolerance` oraz `Source.lv_voltage_tolerance` (źródło przyłączone do szyny nN), rozstrzygana per wyspa galwaniczna nN jednym predykatem `enm/tolerancja_nn.py` | nN +6 %: c_max 1,05 / c_min 0,95; nN +10 %: 1,10 / 0,90; SN/WN: 1,10 / 1,00 |
| odstępstwo od tabeli | `nadpisanie_c {wartosc, uzasadnienie}` — uzasadnienie obowiązkowe, odmowa bez niego | widoczne w wynikach i raporcie jako „nadpisanie ręczne: …” |

Brak deklaracji tolerancji, deklaracje sprzeczne w jednej wyspie albo wyspa nN bez
transformatora zasilającego dają **odmowę nazwaną** `fault.c_tolerancja_nn_brak` (bramka gotowości
`ELIG_SC_NN_VOLTAGE_TOLERANCE_MISSING` z akcją naprawczą otwierającą formularz parametrów na polu
tolerancji), nigdy cichy wiersz +6 % ani +10 %.

Tę samą tablicę i ten sam predykat czytają wszystkie konsumenci c (inwentarz w §4): mapper
ENM → graf (c węzła, K_T transformatora wg eq. 12a z c_max strony nN, K_G maszyny wg eq. 18 z c_max
sieci przyłączenia), `solver_input` (`BusPayload.c_factor_iec60909` per szyna; kontrakt
solver-input 1.1 → 2.0, bo płaskie `c_factor` i `thermal_time_seconds` usunięto — zmiana łamiąca
wejścia, nie wyników), solwery zwarciowe IEC 60909 (tor kanoniczny i wiązanie aplikacyjne),
pętla zwarcia IEC 60364 (`I_k = c·U_0/|Z_s|`, wynik niesie addytywnie `c_min`, `c_max`,
`c_zrodlo_min`, `c_zrodlo_max`), podgląd źródła sieci, pakiety dowodowe (SC asymetryczny,
weryfikacja obwodu nN), UI (scenariusze MAX/MIN + nadpisanie, „Podstawa współczynnika c” w
bilansie IEC, kolumny c i podstawy c w składowych, podstawa c nastaw koordynacji, pole tolerancji
w kreatorze stacji) i raport. Każdy wiersz wyniku zwarcia niesie addytywne `c_zrodlo`, np.
„IEC 60909-0 tab. 1, pasmo nN, tolerancja +10 %, MAX”.

Kontrakty FROZEN wyników (`ShortCircuitResult`, `PowerFlowResult`) bez zmian — nowe pola
wyłącznie addytywne. Determinizm: hasz ENM zmienia się tylko przy zadeklarowanej tolerancji
(pole addytywne wyłączone z hasza, gdy `None`, wzorzec `lv_earthing_system`).

**Dowody (komendy z kodami wyjścia w §3):** pełna regresja backendu, pełny vitest, type-check,
lint, `guardy_z_ci.py` na drzewie po scaleniu; sonda liczbowa zgodna z ręcznym przeliczeniem
wg normy do 1e-12 (§2); iniekcje: drugie miejsce z zaszytym c i odwrócony wybór tolerancji nN
dają czerwony wynik (§3.3).

## 2. Sonda liczbowa I''k i I_k,min — przed i po

Sieć referencyjna testu `tests/enm/test_canonical_sc_c_per_pasmo._build_mv_lv_enm`: GPZ 15 kV,
S''kQ = 250 MVA, R/X = 0,1; kabel SN 2 km 0,253 + j0,100 Ω/km (θ_e = 250 °C); szyna SN stacji;
transformator 15/0,4 kV 630 kVA, u_k = 6 %, P_k = 8 kW, Dyn11; szyna nN; kabel nN 60 m
0,253 + j0,069 Ω/km (θ_e = 160 °C). Tor użytkownika: `create_run` / `execute_run`
(`short_circuit_sn`), zwarcie trójfazowe, scenariusz MAX i MIN. Skrypt sondy:
`/tmp/claude-0/-home-user-MV-Design-PRO/37287358-63d4-50d2-ae7c-9f78858b6823/scratchpad/sonda_c.py`.

Drzewa: **A** = `main` sprzed karty i sprzed scalenia integracji (`f3c435b6`); **B** = gałąź
integracji PR #477–#481 scalona do karty (`f0f9061f`, punkt startu karty); **po** = drzewo końcowe.

### 2.1 I''k [A] (scenariusz MAX)

| Węzeł | A: c / I''k | B: c / I''k | po, brak tolerancji | po, +6 %: c / I''k | po, +10 %: c / I''k |
|---|---|---|---|---|---|
| GPZ 15 kV | 1,10 / 9 622,504 | 1,10 / 9 622,504 | 1,10 / 9 622,504 | 1,10 / 9 622,504 | 1,10 / 9 622,504 |
| szyna SN stacji | 1,10 / 7 160,670 | 1,10 / 7 160,670 | 1,10 / 7 160,670 | 1,10 / 7 160,670 | 1,10 / 7 160,670 |
| szyna nN | 1,10 / 16 284,381 | 1,05 / 15 544,182 (cicho +6 %) | **odmowa** `fault.c_tolerancja_nn_brak` | 1,05 / 15 544,182 | 1,10 / 15 585,880 |
| koniec obwodu nN | 1,10 / 9 440,274 | 1,05 / 9 011,171 (cicho +6 %) | **odmowa** | 1,05 / 9 011,171 | 1,10 / 9 235,592 |

### 2.2 I_k,min [A] (scenariusz MIN)

| Węzeł | A: c / I_k,min | B: c / I_k,min | po, brak tolerancji | po, +6 %: c / I_k,min | po, +10 %: c / I_k,min |
|---|---|---|---|---|---|
| GPZ 15 kV | 1,10 / 9 622,504 | 1,00 / 8 747,731 | 1,00 / 8 747,731 | 1,00 / 8 747,731 | 1,00 / 8 747,731 |
| szyna SN stacji | 1,10 / 5 966,299 | 1,00 / 5 423,908 | 1,00 / 5 423,908 | 1,00 / 5 423,908 | 1,00 / 5 423,908 |
| szyna nN | 1,10 / 16 202,968 | 0,95 / 13 993,473 (cicho +6 %) | **odmowa** | 0,95 / 13 993,473 | 0,90 / 12 691,327 |
| koniec obwodu nN | 1,10 / 7 547,888 | 0,95 / 6 518,630 (cicho +6 %) | **odmowa** | 0,95 / 6 518,630 | 0,90 / 6 082,121 |

### 2.3 Pętla zwarcia nN (IEC 60364-4-41), U_0 = 230 V, |Z_s| = 0,35 Ω

| Drzewo / tolerancja | I_k,min [A] | I_k,max [A] |
|---|---|---|
| A i B (stałe 0,95 / 1,05 zaszyte w module pętli) | 624,286 | 690,000 |
| po, brak tolerancji | **odmowa** `fault.c_tolerancja_nn_brak` | **odmowa** |
| po, +6 % | 624,286 | 690,000 |
| po, +10 % | 591,429 | 722,857 |

### 2.4 Przyczyny zmian

- **A → B → po, SN:** w drzewie A tor kanoniczny przyjmował płaskie c = 1,10 także w scenariuszu
  MIN — I_k,min SN było zawyżone o 10 % (5 966 zamiast 5 424 A na szynie SN). Tab. 1 daje c_min
  = 1,00 dla SN. W drzewie B poprawione (gałąź integracji), po karcie bez zmian.
- **A → po, nN:** w drzewie A węzeł nN dostawał c SN (1,10 w MAX i w MIN) — I_k,min nN zawyżone o
  16–22 %. W drzewie B wiersz nN był brany z cichego założenia +6 %; po karcie wiersz wynika z
  deklaracji tolerancji sieci, a jej brak jest odmową.
- **+6 % → +10 % w MAX na szynie nN** zmienia I''k tylko o 0,27 % (15 544 → 15 586 A), mimo że c
  rośnie o 4,8 %: K_T (eq. 12a) czyta c_max tej samej deklaracji (0,9636 → 1,0095), więc
  impedancja transformatora rośnie razem z c. To wymagana norma spójność wejścia i wyjścia z
  jednego źródła (predykat parami — reguła KLASA, NIE INSTANCJA §3).
- Inne zmiany liczbowe sieci referencyjnych (z pomiarem w commicie `6f16f5de`): PV 1 MW G1
  13,61 → 13,03 (K_G czyta c_max nN 1,05 zamiast domyślnego 1,10 maszyny); parytet assemblera
  B-BENCH/07 CIGRE LV I_k +0,044…0,048 %, G04/11 i G05/11 do 1 % (MAX) i 1,65 % (MIN) — wyłącznie
  K_G (k_G 1,0092 → 0,9633); scenariusz niestandardowy c_min 0,9 → 1,00 (pasmo SN); N-1 gn01/gn03
  zmienione tylko `snapshot_hash` i `input_hash` (deklaracja tolerancji), enumeracja i ranking
  identyczne; wyrocznia pandapower K7: c i I_k bez zmian, hasze ENM sieci nN zmienione deklaracją.

### 2.5 Ręczne przeliczenie wg normy (niezależne od kodu repo)

Wzory IEC 60909-0:2016: Z_Q = c_Q·U_nQ²/S''kQ (eq. 6), X_Q = Z_Q/√(1 + (R/X)²);
K_T = 0,95·c_max/(1 + 0,6·x_T) (eq. 12a); R_L(θ_e) = [1 + 0,004·(θ_e − 20 °C)]·R_L20 (eq. 34,
tylko w MIN); I''k = c·U_n/(√3·|Z_k|) (eq. 29).

**Przypadek SN — szyna SN stacji, MAX (c = 1,10):**
Z_Q = 1,1·15²/250 = 0,99 Ω; X_Q = 0,99/√1,01 = 0,985087 Ω; R_Q = 0,0985087 Ω.
Z_k = (0,098509 + 0,506) + j(0,985087 + 0,200) = 0,604509 + j1,185087 Ω; |Z_k| = 1,330361 Ω.
I''k = 1,1·15 000/(√3·1,330361) = **7 160,670 A** — kod: 7 160,670238615316 A (różnica < 1e-11).

**Przypadek SN — szyna SN stacji, MIN (c = 1,00):** R kabla SN w 250 °C: 0,506·(1 + 0,004·230)
= 0,97152 Ω. Z_k = 1,070029 + j1,185087 Ω; |Z_k| = 1,596682 Ω.
I_k,min = 1,0·15 000/(√3·1,596682) = **5 423,908 A** — kod: 5 423,907942707962 A.

**Przypadek nN — szyna nN, MAX, tolerancja +10 % (c_max = 1,10):**
Z_T = 0,06·400²/630 000 = 0,0152381 Ω; R_T = 8 000·400²/630 000² = 0,0032250 Ω;
X_T = 0,0148929 Ω; x_T = 0,0586409 p.u.; K_T = 0,95·1,10/(1 + 0,6·0,0586409) = **1,009482**.
Strona SN sprowadzona przekładnią (15/0,4)² = 1 406,25: (0,604509 + j1,185087)/1 406,25 =
0,00042987 + j0,00084273 Ω. Z_k = 0,00042987 + 1,009482·0,0032250 + j(0,00084273 +
1,009482·0,0148929) = 0,0036855 + j0,0158768 Ω; |Z_k| = 0,0162990 Ω.
I''k = 1,10·400/(√3·0,0162990) = **15 585,880 A** — kod: 15 585,87978820883 A.

**Przypadek nN — szyna nN, MAX, tolerancja +6 % (c_max = 1,05):** K_T = 0,963596;
I''k = **15 544,182 A** — kod: 15 544,181799635839 A.

**Przypadek nN — szyna nN, MIN, +10 % (c_min = 0,90; K_T z c_max 1,10; Z_Q z c_Q max; kabel SN
w 250 °C):** I_k,min = **12 691,327 A** — kod: 12 691,326994464793 A. Dla +6 % (c_min 0,95):
**13 993,473 A** — kod: 13 993,472777579 A. Koniec obwodu nN, MIN, +10 % (kabel nN w 160 °C):
**6 082,121 A** — kod: 6 082,120661100034 A.

**Pętla zwarcia nN, +10 %:** I_k,min = 0,90·230/0,35 = **591,429 A**; +6 %: 0,95·230/0,35 =
**624,286 A** — kod identycznie.

## 3. Komendy i kody wyjścia (drzewo po scaleniu, HEAD karty)

Kody łapane bezpośrednio (plik-sentinel z `$?`, bez potoku).

### 3.1 Backend

Pełna regresja `pytest -q -m "not pandapower and not andes"` w `mv-design-pro/backend`
(`PYTHONPATH=src:.`, venv projektu, Python 3.11), na drzewie `b8df5d27` (scalone części backend +
front karty). Dla czasu bieg podzielony na trzy rozłączne części po plikach testów
(`find tests -name 'test_*.py' | sort`, co trzeci plik, 820 plików łącznie). Każda część
z własnym `--basetemp` i kodem w pliku `*.rc`:

| Część | Kod wyjścia | Wynik |
|---|---|---|
| S0 | 0 | 6 949 passed, 21 deselected (51 min 36 s) |
| S1 | 0 | 12 516 passed, 6 deselected (58 min 0 s) |
| S2 | 1 | 9 904 passed, 13 deselected, **6 errors** (60 min 11 s) |
| S2, ponownie `tests/test_protection_settings_w3c2_identity.py` po `git fetch --unshallow` | 0 | 7 passed |

Łącznie: 29 369 passed + 7 passed po ponownym biegu, zero failed. Jedyne 6 errors miało
przyczynę środowiskową. Test W3-C2 wczytuje bazowy `engine.py` przez `git show a16f8d2b:…`,
a w płytkim klonie kontenera tego commitu nie było. Po dociągnięciu pełnej historii przechodzi.
Kod produkcyjny jest bez zmian.

Po regresji doszły trzy commity:
- `b29f382d` — CSS/TSX frontu i zrzuty;
- `77288546` — generator fikstur harnessu (nowa funkcja `przypadek_scena_karta`) i harness;
- `66304906` — spec zrzutów.
Backendu dotyczy tylko nowa funkcja generatora. Pokrywa ją `tests/ci/test_fixtury_harnessu.py`:
kod 0, 298 passed.

Inne komendy backendu (wykonawca części backendowej, drzewo `wsp-c-be`, kody bezpośrednio):
- `ruff check` (124 zmienione pliki .py): 0;
- `black --check` w backendzie: 0;
- `mypy_ratchet_guard`: 0 przy 199 błędach w 26 plikach (pin obniżony z 223/34; różnica
  zbiorów: 25 błędów zdjętych, 0 nowych);
- parytety: assembler / P11 / scenariusze: 0, 41 passed; P11 z `solver_input`: 0, 156 passed;
  `-m pandapower`: 0, 33 passed.

### 3.2 Frontend i strażnicy

| Komenda (z `mv-design-pro/frontend` albo `mv-design-pro`) | Kod wyjścia | Wynik |
|---|---|---|
| `npx vitest run --no-file-parallelism` (pełny) | 0 | 886 plików, 13 209 passed, 14 todo |
| `npx vitest run --no-file-parallelism src/ui2/wyniki/wzorzec src/ui2/wyniki/zwarcia` (po poprawce układu `b29f382d`) | 0 | 437 passed |
| `npm run type-check` (drzewo końcowe) | 0 | — |
| `npm run lint` (drzewo końcowe) | 0 | — |
| `npx playwright test e2e/wspolczynnik-c-screenshot.spec.ts` (zrzuty „po”) | 0 | 10 passed |
| `python ../scripts/guardy_z_ci.py` (z `backend`, venv projektu w PATH, drzewo końcowe) | 0 | „KOMPLET ZIELONY.” — 114 kroków zielonych (strażnicy, lint jak CI, type-check i lint npm), samotesty strażników 3442 passed |

Historia czerwonych strażników w tej sesji, każdy naprawiony u źródła:
- `tsconfig_gate_guard` — czerwony już na bazie, bo `.at(-1)` w
  `StationTemplateWizard.test.tsx:600` pochodził ze scalenia PR-478 (dług 63 przy budżecie 62).
  Naprawiony w `b8df5d27`.
- `enm_contract_parity_guard` — czerwony tylko na drzewie samego backendu, przed scaleniem
  lustra typów frontu. Zielony od `d897c583`.
- `harness_no_physics_literals_guard` i `ui_terminology_guard` — czerwone przez ręcznie wpisany
  przypadek w nowej scenie zrzutów. Naprawione w `77288546`: przypadek pochodzi teraz z fikstury
  backendu.

Pierwszy bieg `guardy_z_ci.py` systemowym pythonem dał 12 czerwonych strażników i czerwony lint.
To skutek środowiska: systemowy interpreter nie ma pakietów projektu. Wiarygodny jest bieg z venv
w PATH, tak samo jak w CI.

### 3.3 Iniekcje (drzewo `/tmp/claude-0/wt_inj` = HEAD karty; każda cofnięta `git checkout`, drzewo czyste po biegu)

Zestaw celowany: `test_wspolczynnik_c_inwentarz.py`, `test_fault_loop_iec60364.py`,
`test_wspolczynnik_c_jeden_nosnik.py`, `test_canonical_sc_c_per_pasmo.py`,
`test_sc_lv_min_max.py`, `test_tolerancja_nn_iloczyn_cech.py`.

| Iniekcja | Kod wyjścia | Wynik |
|---|---|---|
| bez iniekcji (kontrola) | 0 | 243 passed |
| drugie miejsce z zaszytym c w ścieżce użytkownika: `c_min = 0.95` zamiast `c_for_node(...)` w `fault_loop_iec60364.py:317` | 1 | 10 failed (iloczyn cech +10 %, liczby ręczne, inwentarz) |
| nowe miejsce z zaszytym c poza ścieżką testów zachowania: `c_max = 1.1` dopisane w `api/grid_source_preview.py` | 1 | 2 failed — test inwentarza wskazuje `api/grid_source_preview.py:989: c_max = 1.1` |
| odwrócony wybór tolerancji nN: zamiana wierszy `PLUS_6` ↔ `PLUS_10` w `_TABELA_1_NN` | 1 | 55 failed |

Front (wykonawca części frontowej, wszystkie przywrócone): okno scenariusza bez `config` — 4
czerwone; panel ui2 wysyłający dawny `c_factor` — 5 czerwonych; stała tolerancja w kreatorze
stacji — 3 czerwone.

## 4. Inwentarz klasy „wartość c poza jedynym źródłem” (grep przed naprawą, HEAD `f0f9061f`)

| # | Miejsce przed kartą | Defekt | Stan po karcie |
|---|---|---|---|
| 1 | `short_circuit_iec60909.py:25-26` `C_MIN = 0.95`, `C_MAX = 1.10` + `compute_ikss_3ph_min/_max`, eksport w `solvers/__init__.py` | martwe drugie źródło c w rdzeniu FROZEN | skasowane (zgoda B-01 w zakresie karty), `solver_hashes.json` przeliczony narzędziem |
| 2 | `fault_loop_iec60364.py` — `LV_C_MIN`/`LV_C_MAX` (0,95/1,05) wprost | pętla zawsze +6 %, niezależnie od sieci | `c_for_node(..., tolerancja_nn)`; wynik niesie c i podstawę |
| 3 | `lv_circuit_verification.py` — `LV_C_MIN` | jak wyżej | czyta `c_min` wyniku pętli, podstawa w źródłach dowodu |
| 4 | `machine.py:80` `c_max = 1.1` domyślnie (K_G), `mapping.py` nie przekazywał | K_G z c SN także w sieci nN | c_max z tablicy dla sieci przyłączenia maszyny |
| 5 | `Source.c_max` / `Source.c_min` (models, domain_operations, topology_ops, archive_diff, front `types/enm.ts`) | pola fantomowe — zapisywane, nieczytane przez solwer | skasowane po obu stronach (`enm_contract_parity_guard`) |
| 6 | `branch.py` `get_ikss_lv_cmax_ka` / `get_ikss_lv_cmin_ka` | martwe metody z c wprost | skasowane |
| 7 | `api/proof_pack.py` `c_factor: 1.10` | c SN w węźle nN | `dobierz_c` z pasmem i tolerancją |
| 8 | `grid_source_preview.py`, `solver_input/builder.py`, `canonical_analysis._dobor_c_punktu`, `short_circuit_binding._dobor_c_wezla`, `branch.get_voltage_factor_c_*` | czytały tablicę bez tolerancji (cichy +6 %) | tolerancja wyspy nN przekazywana jawnie; brak = odmowa |
| 9 | front: `PanelScenariuszy.tsx` wysyłał `c_factor` (422), `FaultScenarioModal` bez `config` (422), `CreateScenarioModal` i `faultTypeClassifier` (druga kopia stałych c), pola c i t_k przypadku (`study-cases/types.ts`, `CreateCaseDialog`, `KartaPrzypadku`), `c_min` nastaw, stała „1,10 / 1,00” w kreatorze źródła | fantomy i drugie kopie | wspólna `SekcjaWspolczynnikaC` (MAX/MIN + nadpisanie z uzasadnieniem), kasacja martwych modułów i fantomów, podstawa c z backendu |
| 10 | docstringi: `solver_input/contracts.py`, `short_circuit_iec60909.py`, `api/fault_loop.py`, `equation_registry.py`, `batch_run.py` | opis „c = 1,10 stałe” niezgodny z kodem | poprawione |

Kanały zapisu tolerancji sieci nN (każdy z testem „deklaracja trafia do ENM” i odmową wartości
spoza słownika albo nośnika spoza pasma nN; jeden predykat odmowy `_powod_odmowy_tolerancji_nn`):
`insert_station_on_segment_sn` i `append_station_on_endpoint` (`nn_earthing.lv_voltage_tolerance`),
`update_element_parameters` (transformator, źródło), `add_transformer_sn_nn`, `add_grid_source_sn`,
`der_topology.block_transformer`, POST generatora, import XLSX (arkusze Trafo i Źródła, kolumna
`tolerancja_nN`), kompilator grafu benchmarków (`TransformatorSpec`/`ZrodloSpec`), `/api/fault-loop/compute`.

Zabezpieczenie klasy na przyszłość: `backend/tests/network_model/test_wspolczynnik_c_inwentarz.py`
— trzy zamknięte warstwy: (1) literał 1,05 / 1,10 / 0,95 / 0,90 w instrukcji nazywającej c w
całym `backend/src` (jedyny wyjątek: 0,95 wzoru K_T, eq. 12a); (2) zamknięty spis wszystkich
takich literałów poza katalogami z powodem merytorycznym (k_bth, cos φ, pasma napięcia itd.);
(3) prywatna tabela `_TABELA_1*` nieczytana poza swoim modułem. Front: etykiety tolerancji z
liczbami c przypięte testem do `voltage_factor.py` (`types/__tests__/tolerancjaNn.kontrakt.test.ts`).

Liczby świadomie zostawione (nie są c): K_T 0,95 (eq. 12a), k_bth 1,1 (nastawy), k_sc 1,1
przekształtnika (IEC 60909-0 §6.6.2), krotność TCC 1,05, pasma napięcia ±10 % U_n, cos φ.

## 5. Decyzje do recenzji architekta

1. **Nośnik tolerancji = transformator zasilający wyspę nN** (`Transformer.lv_voltage_tolerance`,
   wzorzec `lv_earthing_system`), a dla źródła przyłączonego wprost do szyny nN —
   `Source.lv_voltage_tolerance` w tym samym predykacie. Odrzucono nośnik w nagłówku projektu:
   `compute_enm_hash` pomija nagłówek, więc zmiana tolerancji nie unieważniałaby wyników.
2. **Domyślna wartość w kreatorze stacji = +10 %**, widoczna i edytowalna (jak domyślne TN-C-S).
   Uzasadnienie: sieci nN 230/400 V w Polsce mają tolerancję ±10 % (PN-EN 60038), co odpowiada
   wierszowi +10 % tab. 1. Inne kanały zapisu (API, XLSX, edycja parametrów) nie mają domyślnej —
   brak jest odmową.
3. **Kontrakt solver-input 1.1 → 2.0** (usunięcie płaskich `c_factor` i `thermal_time_seconds` z
   `ShortCircuitPayload`) — zmiana łamiąca wejścia solwera, więc podniesiona wersja główna;
   `docs/spec/SOLVER_INPUT_CONTRACT.md` i test blokady schematu zaktualizowane. Kontrakty wyników
   FROZEN nietknięte.

## 6. Czego nie zrobiono i dlaczego

- **`short_circuit_iec60909.py:644`** (`builder: object`, błąd mypy attr-defined) zostaje: rdzeń
  FROZEN, zgoda B-01 karty obejmowała kasację martwego kodu c, nie zmianę typów rdzenia. Pin
  zapadki mypy 199/26 go obejmuje.
- **Zespół prądotwórczy** nie jest nośnikiem tolerancji: wyspa nN zasilana wyłącznie z agregatu
  daje odmowę `BRAK_TRANSFORMATORA` (tolerancję deklaruje operator sieci, a nie agregat). Model
  zachowuje się poprawnie (odmowa nazwana), ale nie ma kanału, by taką wyspę policzyć — wymaga
  decyzji produktowej, czy agregat może nieść deklarację tolerancji sieci wydzielonej.
- **CGMES i `migracja_legacy`** nie mają źródła tolerancji (format CGMES nie przenosi tej danej);
  sieć nN zaimportowana tą drogą dostaje odmowę z akcją naprawczą, a nie domysł.
- **`add_transformer_sn_nn` nie przyjmuje `lv_earthing_system`** — luka sąsiedniej danej (układ
  sieci nN), nie klasy c; zgłoszona w meldunku wykonawcy, poza zakresem tej karty.
- **Fallback cos φ_r = 0,8 maszyny synchronicznej** w `mapping.py` (katalog GENERATOR_SN nie ma
  cos φ_rG ani x''d) — klasa danych katalogu, nie c.
- **Pełne e2e Playwright** nie zostało uruchomione, bo nie wchodzi w kryterium karty. Specy e2e
  zmienione kartą przechodzą type-check, a nowy spec zrzutów przechodzi (10 passed).
- **Scena „zwarcia” harnessu** (zrzut `po_ekran_zwarc_*`) pokazuje „Rozpływ gałęziowy niedostępny”
  i „Nie udało się pobrać śladu podziału prądu zwarciowego”. Przyczyna: przy
  `PLAYWRIGHT_REAL_BACKEND=1` te dwie końcówki idą do realnego backendu, który nie zna biegu
  sceny i odpowiada 422. Stan sprzed karty, bez związku ze współczynnikiem c; reszta ekranu
  pokazuje dane biegu z fikstury.
- **Układ panelu scenariuszy** (radia i pole wyboru jedno pod drugim, ciasno) to rzeczywisty CSS
  komponentu. Ocena należy do właściciela (B-02).
- **Werdykt wizualny (B-02)** — nie wystawiam; zrzuty „po” w obu motywach są w katalogu zrzutów.
