# MV-DESIGN-PRO — RAPORT NAPRAW PO NIEZALEŻNYM AUDYCIE (§1–§8)

Data: 2026-09-12
Gałąź: `claude/max-dynamic-audit-kzbivg`
Baza audytu: `64004a5d0f6f05f96677c95e307444e984b39dcc`
Implementacyjny HEAD wejściowy: `1ff13df9e475c75b50f04d017c8e155e9cd2bce5`
Commity tej rundy: `56018f44`, `6acb008b`, `8835b0bd`, `148cbb4a`, `9999a934`

Dokument jest raportem WYKONAWCY. Nie jest akceptacją i nie nadaje żadnego
statusu dowodowego. Recenzje niezależne (`WORK_SHADOW_REVIEW_LATEST.md` i katalog
`work-reviews/`) należą do recenzenta i NIE zostały tknięte.

---

## 1. ZMIENIONE PLIKI

### Backend — warstwa produkcyjna (`backend/src/`)
| Plik | Czego dotyczy |
|---|---|
| `network_model/core/wiazanie_wyniku_zwarciowego.py` (nowy) | pieczęć wyniku zwarciowego: SHA-256 po `run_id` + `snapshot_id` + punkcie zwarcia + odcisku wejścia + odcisku wyniku + odcisku implementacji |
| `application/autorytet_biegu_zwarciowego.py` (nowy) | autorytet z BIEGU, nie z liczb w żądaniu; echo wielkości; koordynacja z dwóch biegów |
| `network_model/core/autorytet_wyniku_zwarciowego.py` | `K_SC_ZRODLO_PRAD_NIEPOPRAWNY`; **znacznik nieznany = blokada SI-115** (fail-closed) |
| `network_model/core/wklad_zwarciowy_przeksztaltnika.py` | niepoprawny `I_n` nie zostawia znacznika deklaracji |
| `network_model/catalog/niezmienniki_katalogu.py` | klasa `REGULA_ZA_MOCNA`; **`NIESKLASYFIKOWANA`** — moc twarda, ale bez fabrykowania twierdzenia |
| `api/protection_coordination.py` | `sc_run_id_min`; kolejność bramek autorytetu |

### Backend — laboratorium badawcze (`backend/research/`)
| Plik | Czego dotyczy |
|---|---|
| `dynamic_lab/skonczonosc.py` (nowy) | jedno miejsce łapania NaN/Inf; pozycje i etykiety jako DANE wyjątku |
| `dynamic_lab/wzorzec_trajektoria.py` (przepisany) | kontrola osi czasu, zakaz ekstrapolacji, trzy odcinki, drabina kroku, całka pierwsza jako arbiter, `KryteriumOdbioru` |
| `dynamic_lab/calkowanie.py` | **`wspolczynnik_kroku`** — tolerancja równania kroku skalowana krokiem |
| `dynamic_lab/silnik.py` | etykiety stanów przy pochodnej; jeden tor błędu; granica wyjątek/wynik |
| `dynamic_lab/wynik.py` | `wielkosc_niesksonczona`; `norma_pochodnej_w_t0: float \| None` |
| `dynamic_lab/mutacje.py`, `katalog_mutacji.py`, `sonda_mutacyjna.py` (nowy) | kampania na REALNYCH podmianach kodu z KONTROLĄ BAZOWĄ |
| `dynamic_lab/siec.py`, `tozsamosc.py` | tory równoległe wymagają jawnej tożsamości; odcisk topologii niezależny od kolejności |
| `kwalifikacja.py` | werdykt odbioru trajektorii; CCT kontra wzór równych pól; `_luki_kwalifikacji` |

### Frontend
13 specyfikacji e2e (migracja kontraktu `readiness.ready` → `kompletnosc_modelu` +
`zdolnosci`), `sld/v3/scene/verticalLengthBaseline.ts` (nowy, jedno źródło
wartości bazowych dla testu i skryptu odbioru), 7 plików testów TS (bramka typów).

### Skrypty
`tsconfig_gate_guard.py` (budżet 356→344), trzy skrypty sformatowane `black`
(czerwień CI), `research/README.md` (inwentarz modułów — bramka izolacji).

---

## 2. RÓWNANIA I KONWENCJE ZNAKÓW

**Magazyn energii (§1).** Konwencja generatorowa: `P > 0` = rozładowanie.
Bramka okna SOC działa na MOCY ODDANEJ, nie na celu regulatora:

```
p_zaciskow = p_cel · bramka_energii(SOC, p_cel)
d(SOC)/dt  = −p_rzeczywiste · waga_sprawnosci(p_rzeczywiste) · S_baza / (3600 · E_poj)
waga_sprawnosci(p) = 1/η_rozł  dla p > 0;   η_ład  dla p ≤ 0
```

Przedział `[SOC_min, SOC_max]` staje się niezmiennikiem przepływu ścisłego
dopiero wtedy, gdy bramka działa na wielkości, która wchodzi do pochodnej —
inaczej `d(SOC)/dt ≠ 0` na granicy i rzutowanie musi „dorabiać” energię.

**Maszyna klasyczna (§5).** Całka pierwsza przy `D = 0`:

```
V(δ, Δω) = (H/ω_b)·Δω² − P_m·δ − (E'·V_s/X)·cos δ = const,   Δω = ω_b(ω − 1)
E' = P_m·X_przed / (V_s·sin δ₀)      [z warunku równowagi, nie z narzędzia]
```

---

## 3. TESTY REGRESYJNE

| Obszar | Plik | Co przypina |
|---|---|---|
| §1 | `test_bilans_energii_magazynu.py` | 35 przypadków; drabina kroku 10/5/2,5/1,25 ms |
| §2 | `test_skonczonosc_i_zbieznosc.py` | iniekcje NaN/Inf w pochodną, prąd, napięcie; granica wyjątek/wynik |
| §2 | `test_silnik_czas_i_bledy.py` | adres defektu (`U1.stan_a`) przy wykryciu na POCHODNEJ |
| §3 | `test_odpornosc_na_podmiane_wyniku_zwarciowego.py` | 18 przypadków; podmiana liczb, nieznany znacznik, kompletność listy |
| §4 | `test_kampania_mutacyjna.py` | rama z wstrzykiwanym wykonawcą |
| §5 | `test_wzorzec_trajektoria.py` | 29 przypadków; oś czasu, ekstrapolacja, odcinki, arbiter, odbiór |
| §5 | `test_calkowanie_zbieznosc.py` | rząd trapezu i rk4 MIERZONY na drabinie |
| §6 | `test_tory_rownolegle.py` | permutacja, serializacja, odcisk niezależny od kolejności |
| §7 | `test_niezmienniki_obie_strony.py` | moc reguły ≠ twierdzenie o regule |

---

## 4. BILANS ENERGII MAGAZYNU — POMIARY

Reszta bilansu po naprawie, drabina kroku (rozładowanie):

| krok | reszta względna |
|---|---|
| 10 ms | 9,83e-04 |
| 5 ms | 4,42e-04 |
| 2,5 ms | 1,10e-04 |
| 1,25 ms | −2,28e-05 |

Spadek 43× przy ośmiokrotnym zagęszczeniu i ZMIANA ZNAKU dowodzą, że reszta jest
błędem KWADRATURY, a nie systematycznym nadmiarem energii. Tolerancja 2,0e-03
ustalona a priori, powyżej zmierzonego maksimum.

---

## 5. NaN / Inf — POMIARY

Kontrprzykład audytu ODTWORZONY na HEAD przed naprawą: pochodna `NaN` → rk4 daje
stan `NaN` → nakładka niezmienników RZUTUJE `NaN` na granicę → stan wraca
skończony → sprawozdanie `STRICT_CONVERGENCE`, `rho = 0,0` → bieg meldowany jako
zbieżny. Ta sama ścieżka dla `±Inf`.

Nowe testy uruchomione na kodzie SPRZED naprawy: **45 z 55 FAILED** (dowód, że
testy są czerwone bez naprawy). Po naprawie: 59 passed.

Kontrakt po naprawie: `stan_skonczony = True` + `wielkosc_niesksonczona =
"pochodna stanu"` + `stany_niesksonczone = ("U1.stan_a",)` — wektor stanu JEST
skończony, niepoprawna jest jego pochodna. Bez trzeciego pola para wyglądała na
sprzeczną.

---

## 6. KAMPANIA MUTACYJNA — ZABITE / PRZEŻYŁE

Kontrprzykłady recenzenta (na `1ff13df9` dawały 16/16 i komplet zielonych testów):

| mutant | wynik na obecnej ramie | `bez_luk_krytycznych` |
|---|---|---|
| A — usunięta walidacja `WynikDynamiczny` | 6/11, 5× `SONDA_NIEWIARYGODNA` | **False** |
| B — stały odcisk implementacji | 10/11, `M-TOZ-01` niewiarygodna | **False** |
| C — RK4 rzędu 2 z etykietą `rzad=4` | 10/11, `M-FIZ-02` niewiarygodna | **False** |

Rozstrzyga KONTROLA BAZOWA: sonda czerwona także BEZ mutacji nie jest liczona
jako zabicie.

Katalog bieżący (13 mutacji): wszystkie **ZABITE**, w tym nowe `M-NUM-04`
(tolerancja kroku), `M-NUM-05` (degradacja rzędu RK4), `M-KON-04` (`Przebieg`
przyjmuje wadliwą oś czasu).

**Korekta własna.** `M-NUM-05` w pierwszej wersji PRZEŻYŁ. Próg ilorazu dryfu
ustawiłem na 8, rozumując „metoda rzędu 2 daje ≈4”; mutant dał 8,03. Dryf CAŁKI
dla punktu środkowego skaluje się jak `dt³`, czyli o rząd lepiej niż jego błąd
rozwiązania — progu nie wolno wyprowadzać z rzędu błędu rozwiązania, gdy mierzona
wielkość ma własny rząd. Zmierzone po obu stronach: prawdziwe rk4 31,33 i 37,19;
mutant 8,03 i 8,05. Próg 16 + asercja WIELKOŚCI (4,46e-14 wobec 1,42e-08).

---

## 7. DRABINA KROKU dt … dt/8

Przypadek: SMIB, dwa tory 0,30 pu, wyłączenie jednego w `t = 1,0 s`, `H = 4 s`,
`D = 0`, horyzont 4 s.

**Błąd wobec ANDES (0,125 ms), max|Δδ| [rad], per odcinek:**

| integrator | odcinek | 4 ms | 2 ms | 1 ms | 0,5 ms | rzędy obserwowane |
|---|---|---|---|---|---|---|
| rk4 | przed | 3,6759e-09 | 3,6759e-09 | 3,6759e-09 | 3,6759e-09 | 0,00 / 0,00 / 0,00 |
| rk4 | okno | 4,8659e-06 | 4,8659e-06 | 4,8659e-06 | 4,8659e-06 | 0,00 / 0,00 / 0,00 |
| rk4 | po | 3,2478e-05 | 3,2492e-05 | 3,2495e-05 | 3,2495e-05 | −0,00 / −0,00 / −0,00 |
| trapez | po | 1,2238e-04 | 2,8085e-05 | 2,9973e-05 | 3,0454e-05 | 2,12 / −0,09 / −0,02 |

**Dryf całki pierwszej (błąd WŁASNY, bez udziału ANDES):**

| bieg | 4 ms | 2 ms | 1 ms | 0,5 ms | rzędy |
|---|---|---|---|---|---|
| LAB rk4 | 5,20e-11 | 1,66e-12 | 4,46e-14 | 1,29e-14 | 4,97 / 5,22 / 1,79 |
| LAB trapez | 2,54e-08 | 6,36e-09 | 1,59e-09 | 3,98e-10 | 2,00 / 2,00 / 2,00 |
| ANDES | 5,07e-08 | — | 1,03e-06 | (0,125 ms: 1,34e-06) | ROŚNIE |

**Rząd wobec wzorca wychodzi ≈0 i to NIE jest brak zbieżności laboratorium** —
porównanie jest NASYCONE błędem wzorca. Rząd metody czyta się z całki pierwszej.

**Podłoga ≈3e-05 rad — wyjaśniona.** Poprzednia hipoteza (zagęszczanie kroku
ANDES przy zdarzeniu) OBALONA: błąd jest stały co do czwartej cyfry przy
ośmiokrotnej zmianie kroku LABORATORIUM. Poprzedni „spadek z krokiem” brał się ze
zmieniania kroku OBU narzędzi naraz. Okres kołysania zgodny (0,788000 s, różnica
< 1e-06 s); amplituda laboratorium STAŁA (poprawne przy `D = 0`), amplituda ANDES
MALEJE monotonicznie. Recenzent niezależnie potwierdził kierunek: wobec jego
wyroczni DOP853 laboratorium spada do 2,14e-13 rad, a błąd ANDES przestaje maleć
i rośnie (3,352e-5 → 3,486e-5 przy 0,25 ms).

**Defekt znaleziony przy okazji, naprawiony u źródła.** Trapez laboratorium miał
tę samą patologię: 2,54e-08 → 6,36e-09 → 7,57e-06 → 1,55e-05, czyli zagęszczanie
kroku POGARSZAŁO wynik. Przyczyna: tolerancja równania kroku STAŁA i bezwzględna,
a jej błąd kumuluje się liniowo z liczbą kroków. Po powiązaniu z krokiem — rzędy
2,00 / 2,00 / 2,00.

---

## 8. RESIDUA LOKALNE KCL / PQ

Zmierzone przez recenzenta niezależnie na tym samym SMIB: najgorsze lokalne
residuum KCL ≈ **9,94e-13 p.u.** (znormalizowane ≈ 2,64e-12), błąd zgodności mocy
zespolonej ≈ **9,97e-13 p.u.** Residuum inicjalizacji laboratorium: SMIB
**8,3267e-17**, sieć SN z DER **0,0**.

---

## 9. TOŻSAMOŚĆ ZDARZEŃ I GAŁĘZI

Tory równoległe bez jawnego `ident` są ODRZUCANE przy budowie topologii — numer
wystąpienia jest pozycją w liście, nie tożsamością aparatu, więc automatyczne
nadawanie go torom równoległym było źródłem defektu P1-DELTA-14 (permutacja
rekordów zmieniała, który tor pada, i zmieniała `Ybus`). `odcisk_topologii`
kanonizuje kolejność gałęzi i boczników przed liczeniem — drugi, nieraportowany
defekt znaleziony przy tej naprawie.

---

## 10. STAN CI DLA DOKŁADNEGO SHA

**`7fd4a8de` (poprzedni push): 7 zielonych, 3 czerwone.**

| workflow | stan | klasyfikacja |
|---|---|---|
| Frontend E2E smoke | ✅ | **NAPRAWIONE** (było czerwone — migracja readiness) |
| SLD Determinism Guards | ✅ | **NAPRAWIONE** (było czerwone — `vertical_length_probe`) |
| Frontend checks | ✅ | **NAPRAWIONE** (było czerwone — 16 naruszeń bramki typów) |
| Docs Integrity / Physics Label / P0 Extended / (arch po naprawie) | ✅ | zielone |
| Architectural And Repo Hygiene | ❌ | **REGRESJA WŁASNA** — brak dwóch modułów w inwentarzu; naprawione w `9999a934` |
| Python tests | ❌ | 7 failed / 12063 passed — patrz §11 |
| Frontend E2E full | ❌ | 1 failed / 407 passed (było 17 failed / 391) — patrz §11 |

Bieg dla `9999a934` był w toku w chwili pisania; NIE deklaruję jego wyniku.

Pomiar lokalny pełnego backendu (`poetry run pytest -q`, ta sama komenda co CI):
**12228 passed, 6 skipped, 0 failed w 2788 s.**

---

## 11. PROBLEMY NIEROZSTRZYGNIĘTE

### 11.1 Siedem czerwonych testów backendu w CI — NIEODTWARZALNE LOKALNIE
`tests/application/analyses/lv_domain/test_scenariusze_nn.py::TestKazdyScenariusz::test_json_w_repo_rowny_odpowiedzi_backendu[…]`
— siedem parametrów. Lokalnie **przechodzą**; w CI **padają**.

Zmierzona przyczyna (z dziennika CI, różnice `Full diff`):

| fikstura w repo | odpowiedź backendu w CI | różnica względna |
|---|---|---|
| 113.93319427114858 | 113.93319427114918 | 5e-15 |
| 2.346974077487094 | 2.3469740774995858 | 5e-12 |
| −0.0758892784527454 | −0.07588927845414428 | 1,8e-11 |
| 0.9978833528059766 | 0.9978833528061506 | 1,7e-13 |

To NIE jest „dług fikstur”. To **różnica ścieżki zbieżności solvera iteracyjnego
między budowami BLAS/CPU**. Test porównuje `json.loads(fixture) == projekcja`
BIT W BIT na pełnej precyzji, a `projection_hash` jest liczony PO tej samej
pełnej precyzji — więc odcisk dziedziczy szum ostatnich cyfr i **nie jest stabilny
między środowiskami**, co przeczy jego roli tożsamości.

Tolerancje solverów w tej ścieżce: `power_flow_types` 1e-8, `power_flow_unbalanced`
1e-6, `solver_input/contracts` 1e-6 — czyli wartości są wyznaczone najwyżej do
~8 cyfr znaczących. Obserwowany rozrzut (≤2e-11 względnie) leży GŁĘBOKO poniżej
tolerancji, czyli w zakresie nieokreślonym przez solver.

**Dlaczego NIE naprawiłem tego w tej rundzie (świadoma decyzja, nie przeoczenie).**
Naturalna naprawa — zaokrąglenie zmiennoprzecinkowych w `normalizuj_projekcje`
(to już JEST punkt kanonizacji: podmienia `run_id`, znaczniki czasu i sygnaturę,
po czym przelicza `projection_hash`) — ma wadę, którą trzeba nazwać, a nie ukryć:
„zaokrąglij i porównaj dokładnie” NIE jest odporne, bo wartość leżąca przy granicy
zaokrąglenia nadal przeskakuje pod wpływem szumu. Przy kroku zaokrąglenia 1e-9
względnie i szumie 2e-11 prawdopodobieństwo przeskoku to ~2% na wartość — przy
tysiącach wartości to pewność, tyle że rzadka i nieregularna. Uczciwa naprawa to
albo porównanie z TOLERANCJĄ (struktura dokładnie, liczby względnie), albo
kanonizacja z jawnie przyjętym ryzykiem granicy — a `projection_hash` jest
tożsamością widzianą przez frontend, więc zmiana jego kanonizacji jest zmianą
KONTRAKTU. To jest decyzja produktowa właściciela, nie wybór wykonawcy, i wymaga
zgody przed wykonaniem. Zaokrąglenie fikstur „żeby było zielono” jest wprost
zakazane przez §8 planu napraw.

### 11.2 Odpowiedź świeżego biegu zwarciowego: 96,4 MiB wobec bramki 60 MB
`e2e/industrial-template-mass-flow.spec.ts:438`. Bramka jest skalibrowana
pomiarem (22,9 MiB stan poprawny; 339,3 MiB z regresją rozpływu inline), więc
podniesienie progu jest zakazane.

**Ustalone:** to NIE jest skutek tej delty. Na `1ff13df9` ta sama specyfikacja
padała WCZEŚNIEJ, na `readiness.ready`; naprawa kontraktu gotowości pozwoliła jej
dojść do asercji rozmiaru. Defekt był **maskowany** przez wcześniejszą porażkę.
Sprawdzone również, że pieczęć wyniku zwarciowego (§3) nie trafia do wierszy
wyniku — nie jest źródłem przyrostu.

**Nierozstrzygnięte:** który klucz odpowiedzi odpowiada za przyrost 22,9 → 96,4 MiB.
Wymaga odtworzenia sieci 50 stacji i pomiaru rozmiaru per klucz.

### 11.3 Otwarte z recenzji, poza zakresem tej rundy
Re-inicjalizacja po topologii zwarciowej (`max Δx0 = 1,09421789`), pełny audyt baz
BESS urządzenie–sieć, samodzielnie konstruowalne evidence/FRT, walidacja
regulatorów AVR/governor, PSS, nasyceń i ograniczników, model-form risk
ograniczników.

---

## 12. POZIOMY WERYFIKACJI — OSOBNO, BEZ ŁĄCZENIA

| poziom | stan | uzasadnienie |
|---|---|---|
| IMPLEMENTED | **TAK** | kod istnieje i jest wpięty w ścieżki użytkownika |
| SOFTWARE-VERIFIED | **CZĘŚCIOWO** | lokalnie 12228 passed / 0 failed; CI dokładnego SHA ma czerwień (§10, §11) |
| MATHEMATICALLY VERIFIED | **CZĘŚCIOWO** | całka pierwsza, rzędy metod i bilans energii potwierdzone; ogólna poprawność równań urządzeń NIE |
| NUMERICALLY VERIFIED | **CZĘŚCIOWO** | rzędy zmierzone na drabinie, NaN/Inf domknięte; determinizm `projection_hash` międzyśrodowiskowo REFUTOWANY (§11.1) |
| PHYSICALLY SUPPORTED | **CZĘŚCIOWO** | klasyczny SMIB, jedno zdarzenie topologiczne, dwa kanały |
| PHYSICALLY VALIDATED | **NIE** | brak pomiaru na obiekcie; oba narzędzia całkują to samo równanie |
| PRODUCTION-READY | **NIE** | — |
| REGULATORY-EVIDENCE-READY | **NIE** | — |

Dwóch ostatnich poziomów nie wolno podnieść bez niezależnego audytu i niezależnej
wyroczni; ten dokument ich nie podnosi.

Warstwa dynamiczna pozostaje **`UNVALIDATED_MODEL`**. Globalne `ready` NIE zostało
przywrócone. Żadna dynamika nie została promowana do `VALIDATED_SIMULATION` ani do
dowodu NC RfG.
