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

Reszta bilansu po naprawie, drabina kroku (rozładowanie, ubytek zasobu
4,0000e-03 MWh), **wszystkie szczeble WEWNĄTRZ dziedziny ważności**:

| krok | reszta [MWh] | reszta względna |
|---|---|---|
| 5 ms | +2,0434e-07 | +5,11e-05 |
| 2,5 ms | +3,7929e-07 | +9,48e-05 |
| 1,25 ms | −6,5409e-08 | −1,64e-05 |
| 0,625 ms | −1,2633e-09 | −3,16e-07 |

Zmiana znaku i spadek do 1,3e-09 MWh dowodzą, że reszta jest błędem KWADRATURY,
a nie systematycznym nadmiarem energii. Tolerancja 2,0e-03 ustalona a priori,
powyżej zmierzonego maksimum.

**KOREKTA WŁASNA WOBEC POPRZEDNIEJ WERSJI TEGO RAPORTU.** Pierwsza drabina
zaczynała się od 10 ms i podawała reszty 9,83e-04 … −2,28e-05. Te liczby były
zmierzone POZA dziedziną ważności modelu: dla konfiguracji tych biegów
(`E = 0,010 MWh`, `S = 100 MVA`, `pasmo_soc = 0,02`) granica wynosi
`pasmo·3600·E/(S_fal·S_baza) = 7,2 ms`, więc szczebel 10 ms przeskakiwał całe
pasmo rampy i schodził poniżej `soc_min`. Reszta bilansu opisywała wtedy
przebieg, który nie dotrzymywał okna pracy. Po przesunięciu drabiny do wnętrza
dziedziny reszty są o trzy rzędy mniejsze. Defekt wskazała recenzja niezależna
(P1-DELTA-27); moje pierwotne pomiary §1 były w tej części nieważne.

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

### `a6ee782c` — DZIEWIĘĆ ZIELONYCH, ZERO CZERWONYCH (pobrane z CI 2026-09-13)

| workflow | run id | wynik |
|---|---|---|
| Python tests | 34737852730 | ✅ success |
| Frontend checks | 34737852749 | ✅ success |
| Frontend E2E smoke | 34737852757 | ✅ success |
| Frontend E2E full | 34737852709 | ✅ success |
| SLD Determinism Guards | 34737852706 | ✅ success |
| P0 Extended Guards (V12K) | 34737852767 | ✅ success |
| Architectural And Repo Hygiene | 34737852727 | ✅ success |
| Docs Integrity Guard | 34737852738 | ✅ success |
| Physics Label Guard | 34737852719 | ✅ success |

**Co to znaczy, a czego NIE znaczy.** Znaczy, że dla tego dokładnego SHA
wszystkie dziewięć workflowów zakończyło się `success` — łącznie z krokiem
`Run pytest`, `Mypy Ratchet Guard` i `Format i lint backendu`, które w
poprzednich biegach albo padały, albo NIGDY SIĘ NIE WYKONAŁY (patrz §10e).
NIE znaczy poprawności fizycznej, matematycznej ani gotowości produkcyjnej —
poziomy weryfikacji zostają takie, jakie są w §12, i żaden nie został
podniesiony.

### Droga do tego stanu — cztery SHA, mierzone po kolei

| SHA | Python tests | E2E full | pozostałe 7 |
|---|---|---|---|
| `367a81a1` | ❌ 7 failed / 12077 passed | ❌ 1 failed / 407 passed (100 908 315 B) | ✅ |
| `3cfc75a1` | ❌ pytest ✅, padła zapadka typów | ✅ 408 passed / 0 failed | ✅ |
| `f70df04e` | (bieg zastąpiony przez `a6ee782c`) | — | — |
| `a6ee782c` | ✅ | ✅ | ✅ |

Każdy krok tej tabeli to osobna, nazwana przyczyna: §10c (odcisk projekcji nN),
§11.2 (klasa ładunku per gałąź), §10e (regresja typów odsłonięta przez naprawę
pytest).

### Pomiary lokalne (NIE zastępują CI)

| pomiar | wynik |
|---|---|
| pełna regresja backendu na drzewie `a6ee782c` | **12302 passed, 6 skipped, 0 failed**, 2822 s |
| pełna regresja przy `OPENBLAS_NUM_THREADS=1` (inna konfiguracja niż generująca fixtury) | 12245 passed, 0 failed |
| `tests/research/test_kwalifikacja.py` | 62 passed, 848 s |
| `tests/infrastructure` + `tests/enm` | 1750 passed |
| `tests/api` + `tests/proof_engine` | 1596 passed |
| front — konsumenci fixtur nN | 252/252 |
| realna uprząż kwalifikacji end-to-end | `luki=[]`, `braki=[]`, ZAKWALIFIKOWANE, 16 pozycji, 13/13 mutacji |

---

## 10a. NAPRAWY PO RECENZJI HEAD `7fd4a8de` (czwarta runda)

Recenzja `7fd4a8de` wskazała cztery defekty W MOJEJ PRACY, każdy z wykonywalnym
kontrprzykładem. Wszystkie ODTWORZONE i naprawione; kontrprzykłady przypięte
testami.

**P0-DELTA-24 — proweniencja tylko z biegu MAX.** `wejscie_koordynacji_z_biegow`
budowało dwa wiązania i dwie mapy prądów, ale proweniencję brało wyłącznie z
migawki biegu maksymalnego. Bieg MIN z `DEFAULT_FORBIDDEN` przechodził, a jego
prąd ustanawiał ocenę CZUŁOŚCI zabezpieczenia — wbrew jawnej decyzji właściciela.
Naprawa: znaczniki OBU migawek są sumowane; zastrzeżenie któregokolwiek biegu
jest zastrzeżeniem koordynacji, bo koordynacja konsumuje oba prądy.

**P0-DELTA-25 — NaN poza pierwszym wierszem autoryzował dowolny prąd.** Wiązanie
liczyło się z wiersza PIERWSZEGO, a mapa prądów z WSZYSTKICH przez
`float(wartosc)` bez kontroli skończoności. `NaN` wchodził do mapy, a
`abs(podany − NaN) > tolerancja` jest FAŁSZEM dla każdego `podany` — więc
999999 A dla MAX i 1 A dla MIN przechodziły bez jednej różnicy. To jest reguła
KLASA, NIE INSTANCJA złamana przeze mnie: kontrola pierwszego wiersza nie jest
kontrolą wierszy. Naprawa: jeden predykat `_prad_koordynacji` używany PRZY
BUDOWIE mapy i PRZY PORÓWNANIU, po obu stronach; wiersze odrzucone są NAZWANE, a
nie milcząco pomijane (brak w mapie wyglądałby jak brak lokalizacji w biegu).

**P1-DELTA-26 — skalowanie tolerancji dawało fałszywe `STRICT_CONVERGENCE`.**
Mój `wspolczynnik_kroku = (dt/0,005)^(rzad+1)` skalował tolerancję TAKŻE W GÓRĘ,
bez ograniczenia. ZMIERZONE (`x' = −x`, `dt = 1 s`, trapez): współczynnik
8,000e+06, waga 0,808, zwrócone `x = 0` (czysty predyktor) wobec dokładnego 1/3,
residuum 0,5 — i status ZBIEŻNOŚCI ŚCISŁEJ. Krok, który nie rozwiązał równania w
ogóle, meldował sukces; defekt tej samej klasy, którą §2 miał zamknąć, tyle że
wprowadzony przez naprawę rzędu metody. Naprawa: `min(1,0; …)` — skalowanie
wolno tylko ZAOSTRZAĆ. `atol`/`rtol` są tolerancją najluźniejszą dopuszczalną;
krok dłuższy od kalibracyjnego nie jest powodem, żeby przyjąć większe residuum.

**P1-DELTA-27 — okno SOC nie było niezmiennikiem DYSKRETNYM.** Bramka energii
czyni okno niezmiennikiem przepływu ŚCISŁEGO, i tak było napisane. Przepływ
dyskretny o kroku stałym może jednak przeskoczyć całe pasmo rampy: ZMIERZONE
`soc0 = 0,50`, `dt = 10 ms` → `soc = 0,08397634` przy `soc_min = 0,10`. Naprawa:
urządzenie deklaruje GRANICĘ WAŻNOŚCI
`krok_maksymalny_s = pasmo·3600·E/(S_fal·S_baza·max(1/η_roz, η_ład))`, a silnik
odrzuca bieg poza nią — głośno, przed obliczeniem. Po naprawie `dt = 10 ms` jest
ODRZUCANY, a `dt = 0,5 ms` kończy dokładnie na `soc = 0,10000000`.

Skutek uboczny, zaraportowany w §4: moja pierwotna drabina bilansu energii
zaczynała się od 10 ms, czyli POZA tą granicą — tamte liczby były nieważne.

---

## 10b. NAPRAWY PO RECENZJI HEAD `24c8883d` (piąta runda)

**P1-DELTA-33 — pominięty pomiar zrównywał się z kwalifikacją.** `_luki_kwalifikacji`
dodawało lukę dla trajektorii wyłącznie przy `stan="WYKONANE"` i
`status="niezgodne"`; `POMINIETE` przechodziło. Bieg bez ANDES, bez CCT i bez
porównania integratorów kończył się kodem 0. Mój własny komentarz mówił „nie
wolno mylić pominięcia ani z porażką, ani z sukcesem" — przy DWÓCH stanach to
zdanie jest niewykonalne, bo każdy brak musi wpaść do jednego z nich.

Naprawa: `StatusKwalifikacji` o trzech stanach — `ZAKWALIFIKOWANE` (kod 0),
`NIEKOMPLETNE` (kod 2, wymagany pomiar pominięty albo nierozstrzygnięty),
`ODRZUCONE` (kod 1, pomiar wykonany i poza kryterium). Braki zbierane osobno od
luk przez `_braki_kwalifikacji`.

**P1-DELTA-34 — błąd integratora i residuum inicjalizacji mierzone, ale nie
bramkowane.** `zbiegl` mówi o ITERACJI, nie o dokładności: pozycja z
`zbiegl=True` i błędem `1e99` przechodziła, a `residua_inicjalizacji` nie było
czytane w ogóle. Naprawa: dwa progi z uzasadnieniem NIE dobranym pod pomiar —
`MAKS_NORMA_POCHODNEJ_W_T0 = 1e-6` (to tolerancja równowagi, której używa sam
silnik, więc próg, po którym laboratorium samo orzeka „start w równowadze";
zmierzone 8,3267e-17 i 0,0) oraz `MAKS_BLAD_INTEGRATORA_RAD = 1e-2` (kąt kołysze
się o rząd 1 rad, więc 1 % sygnału; zmierzone 1,438e-09 … 1,002e-03 — trzy rzędy
zapasu). Wartości niepoprawne (`NaN`, `Inf`) są jawnie odrzucane, bo
`NaN > próg` jest fałszem.

Oba kontrprzykłady recenzenta odtworzone i przypięte testami (`tests/research/
test_kwalifikacja.py`, 12 passed).

---

## 10c. DETERMINIZM ODCISKU PROJEKCJI nN — POMIAR OBALIŁ MOJĄ WŁASNĄ DIAGNOZĘ (szósta runda)

**KOREKTA POPRZEDNIEJ SEKCJI §11.1 TEGO RAPORTU.** Napisałem tam, że siedem
czerwonych testów w CI jest „NIEODTWARZALNE LOKALNIE" i że przyczyną jest
„różnica ścieżki zbieżności solvera iteracyjnego między budowami BLAS/CPU",
po czym świadomie odłożyłem naprawę jako decyzję produktową. **Oba zdania były
niepełne, a pierwsze wprost fałszywe.** Defekt jest odtwarzalny lokalnie jedną
zmienną środowiskową. Nie znalazłem tego wcześniej, bo powtarzałem ten sam bieg
zamiast zmienić warunki biegu — powtórzenie nie jest pomiarem.

### Pomiar, który to rozstrzygnął

Ta sama maszyna, ten sam kod, jedyna różnica to liczba wątków BLAS:

```
OPENBLAS_NUM_THREADS=1  →  fixt_t1.json
OPENBLAS_NUM_THREADS=4  →  fixt_t4.json
```

| wielkość | wynik |
|---|---|
| wartości zmiennoprzecinkowych w 18 scenariuszach | **9081** |
| różnic t1 vs t4 | **26** |
| maksimum różnicy | **2 ULP (3,242e-16 względnie)** |
| powtarzalność w obrębie jednej konfiguracji | **bit w bit** (t1≡t1b, t4≡t4b) |

Czyli: wynik jest deterministyczny dla ustalonego środowiska i **niedeterministyczny
między środowiskami**. To nie jest wada modelu ani „dług fikstur".

### Przyczyna źródłowa

`network_model/solvers/short_circuit_core.build_zbus` liczy `np.linalg.inv(y_bus)`.
LAPACK/BLAS dobiera blokowanie i kolejność redukcji do liczby wątków oraz do
mikroarchitektury procesora, a dodawanie zmiennoprzecinkowe nie jest łączne.
`projection_hash` był liczony jako SHA-256 nad `json.dumps` z **surowych**
`repr(float)`, więc jeden ostatni bit zamieniał odcisk w całkowicie inny ciąg.
Odcisk obiecywał tożsamość, której nie potrafił dotrzymać — to naruszenie
Determinism Rule (CLAUDE.md §7), a nie usterka testu.

Druga ścieżka numeryczna jest GORSZA: `16_stale_result` niesie wynik rozpływu,
czyli solvera iteracyjnego, gdzie wartość jest określona najwyżej do ścieżki
zbieżności. Dziennik CI dla `4c0ab856` pokazał tam różnice do **5,3e-12
względnie** (2,346974077487094 wobec 2,3469740774995858) — cztery rzędy powyżej
szumu BLAS ścieżki zwarciowej.

### Naprawa

`normalizuj_projekcje` (jedyny punkt kanonizacji fixtury, wspólny dla skryptu
eksportu i dla testu) kwantyzuje **każdą** liczbę do `CYFRY_ZNACZACE_FIXTURY`
cyfr znaczących PRZED policzeniem odcisku — więc hash liczy się dokładnie z tych
liczb, które trafiają do pliku. Kwantyzacja przez formatowanie dziesiętne
(`f"{x:.4e}"`), nie przez `math.log10`, bo log10 sam może chybić o 1 ULP przy
potędze dziesiątki i wybrać inny wykładnik.

Zakres zmiany jest zamknięty w migawce fixtury: `normalizuj_projekcje` i tak
podmieniała już `run_id`, znaczniki czasu i sygnaturę oraz przeliczała odcisk,
więc hash w pliku nigdy nie był hashem odpowiedzi produkcyjnej. **Kontrakt
`LvDomainProjectionV1` ani ładunek zwracany przez `/projection/v1` nie zmieniają
się.** Front czyta `projection_hash` wyłącznie jako nieprzezroczysty ciąg
(`LvDomainView.tsx:527`, atrybut `data-projection-hash`) i nigdy go nie przelicza.

### Dlaczego 5 cyfr znaczących — z pomiaru marginesu, nie z rachunku ryzyka

Kwantyzacja chroni tylko wtedy, gdy wartość nie leży przy granicy zaokrąglenia.
Zmierzony najmniejszy **względny** margines do granicy w całym korpusie:

| cyfry znaczące | min. margines | zapas wobec szumu 5,3e-12 |
|---|---|---|
| 4 | 1,298e-07 | 24 500× |
| **5** | **2,816e-08** | **5 300×** |
| 6 | 1,558e-09 | 294× |
| 7 | 8,393e-11 | 16× |

Przy 7 cyfrach pojedynczy inny procesor znów przerzuca odcisk. Przy 5 cyfrach
rozdzielczość prądu 23,748 A wynosi 0,001 A — o rzędy wielkości poniżej
dokładności jakiegokolwiek pomiaru i poniżej tego, co pokazuje UI.

Grubiej NIE znaczy bezpieczniej, i to również jest pomiar: przy 3 cyfrach
wartość katalogowa 0,022150000000000003 Ω leży **dokładnie** na granicy między
0,0221 a 0,0222 (margines 9,2e-17 — zero). Okrągła liczba z katalogu trafia w
węzeł zgrubnej siatki częściej niż wynik obliczenia.

### Dowód wykonywalny (kontrola bazowa dla każdej sondy)

`TestKwantyzacjaFixtur`, cztery testy, każdy z potwierdzoną zabójczością:

| mutacja | co pada | dlaczego to właściwa sonda |
|---|---|---|
| `kwantyzuj_liczby` → tożsamość | `test_szum_miedzymaszynowy_nie_zmienia_ani_liczb_ani_odcisku` | odtworzenie defektu: szum 5,3e-12 na KAŻDEJ liczbie zmienia odcisk |
| `CYFRY = 3` (zbyt zgrubnie) | `test_zmiana_inzynierska_nadal_przebija_przez_kwantyzacje` + `test_fixtury_w_repo_sa_juz_skwantowane` + margines | bramka przestaje rozróżniać zmianę 1e-3 względnie |
| `CYFRY = 7` (zbyt ciasno) | `test_kazda_liczba_ma_margines_do_granicy_zaokraglenia` | margines spada do 16× szumu |
| stan docelowy | — | 55/55 zielonych |

**Defekt w mojej własnej sondie, wykryty przez kontrolę bazową.** Pierwsza wersja
testu marginesu mierzyła wartości **już skwantowane** (fikstura `projekcje`), więc
każda z nich siedziała dokładnie na węźle siatki i „margines" wychodził maksymalny
niezależnie od tego, jak ciasna jest siatka — mutacja `CYFRY = 7` przeszła.
Rozdzieliłem fiksturę na `projekcje_surowe` (pełna precyzja, prosto z solverów)
i `projekcje`; margines mierzy się wyłącznie na surowych. Drugi defekt tej samej
klasy: test „zmiana inżynierska przebija" asertował „cokolwiek w ładunku się
zmieniło", co przy kilku tysiącach liczb jest zawsze prawdą — przepisany na
asercję **wartość po wartości**.

### Inwentarz KLASY (nie instancji)

Klasa defektu: **artefakt zatwierdzony w repo porównywany bajt w bajt ze świeżo
policzonym ładunkiem niosącym liczby zmiennoprzecinkowe z algebry liniowej.**
Wszystkie takie porównania w backendzie:

| miejsce | wystawione na szum? | dowód |
|---|---|---|
| `test_scenariusze_nn.py::test_json_w_repo_rowny_odpowiedzi_backendu` | **TAK** | 7/18 czerwonych w CI; odtworzone lokalnie liczbą wątków |
| `test_sc_asymmetrical_golden.py::test_matches_golden_artifacts` | nie | zielony w CI (inna maszyna) i przy `THREADS=1` |
| `test_pack_parity.py` | nie | porównuje pliki z plikami, nic nie liczy |
| `test_companions_generated.py` | nie | zielony w CI i przy `THREADS=1` |
| `test_ptpiree_wykaz_snapshot.py` | nie | dane katalogowe, bez solvera |
| `test_report_export.py` | nie | zielony w CI i przy `THREADS=1` |
| `solver_diff_guard.py` | nie | hashuje **pliki źródłowe**, nie wyniki |

Sonda (zmiana liczby wątków BLAS) ma **potwierdzoną czułość**: wykryła prawdziwy
defekt w pierwszej pozycji tabeli, więc jej czysty wynik dla pozostałych pozycji
jest informacją, a nie ciszą.

---

## 10d. NAPRAWY PO RECENZJI HEAD `367a81a1` (siódma runda)

Recenzja `367a81a1` zamknęła dokładne kontrprzykłady P1-DELTA-35/36 i otworzyła
**P1-DELTA-39**: naprawa dotknęła INSTANCJI, nie KLASY. To ten sam błąd
metodyczny, przed którym ostrzega reguła „KLASA, NIE INSTANCJA" w CLAUDE.md —
u mnie powtórzony po raz kolejny.

### P1-DELTA-39 — niekompletna albo niedozwolona populacja dawała `ZAKWALIFIKOWANE`

Trzy kontrprzykłady recenzenta ODTWORZONE co do wyniku, plus czwarty znaleziony
przy odtwarzaniu:

| populacja benchmarku | przed | po |
|---|---|---|
| dwie pozycje RK4, brak obu Eulerów i trapezu | ZAKWALIFIKOWANE | **NIEKOMPLETNE** |
| błąd `0.0` na wszystkich pozycjach RK4 | ZAKWALIFIKOWANE | **ODRZUCONE** |
| błąd ujemny + metoda `ghost` spoza rejestru | ZAKWALIFIKOWANE | **ODRZUCONE** |
| **duplikat szczebla** (znaleziony przeze mnie) | **`ZeroDivisionError`** | **ODRZUCONE** |

Duplikat wywracał ocenę wyjątkiem: `log(dt2/dt1)` dla równych kroków to zero.
Wyjątek w bramce nie jest ani blokadą, ani przepustką — jest awarią oceny.

**Przyczyna źródłowa.** `_braki_kwalifikacji` wymagało tylko, by lista pozycji
była NIEPUSTA. `_luki_rzedu_integratorow` iterowało po nazwach OBECNYCH w
raporcie i nigdy nie porównywało ich ze zbiorem oczekiwanym. Warunek `blad > 0`
był FILTREM, nie kryterium: zero i wartości ujemne znikały z oceny i nie
tworzyły naruszenia, a zbiór pusty nie daje luk. „Niepusty" nie znaczy
„kompletny i dziedzinowo poprawny".

**Naprawa.** Jawny MANIFEST BENCHMARKU (`KROKI_DRABINY_KWALIFIKACJI_S`,
`RZAD_OCZEKIWANY_METODY`) i jedno przejście `_pozycje_benchmarku`, które dzieli
populację na rekordy dozwolone, luki i braki:
- iloczyn metod i szczebli musi wystąpić DOKŁADNIE RAZ — brak → BRAK
  (NIEKOMPLETNE), duplikat → LUKA (ODRZUCONE);
- metoda spoza manifestu i szczebel spoza drabiny → LUKA;
- błąd musi być skończony i DODATNI — zero w tym benchmarku nie oznacza metody
  dokładnej (żaden z czterech schematów nie odtwarza odniesienia co do bitu),
  tylko utratę danych porównania → LUKA;
- rejestr integratorów i manifest to DWIE niezależne deklaracje tego samego —
  rozjazd w którąkolwiek stronę jest LUKĄ, a metoda dołożona do rejestru i
  nieobjęta manifestem też (nowa metoda ma wejść do benchmarku, nie ominąć go).

### P2-DELTA-40 — rząd z dwóch punktów i z ocenianej metadanej

**Drabina czteroszczeblowa.** `(0,008 / 0,004 / 0,002 / 0,001 s)` zamiast pary
`(0,002 / 0,010)`. Cztery szczeble dają TRZY ilorazy na metodę. Koszt: 16 pozycji
w 33 s, czyli praktycznie tyle co poprzednio.

Zmierzone odchylenie rzędu obserwowanego od oczekiwanego, od pary najrzadszej do
najgęstszej:

| metoda | rząd | pary sąsiednie | odchylenia |
|---|---|---|---|
| `euler_jawny` | 1 | 1,2831 / 1,1369 / 1,0669 | 0,283 → 0,067 |
| `euler_niejawny` | 1 | 0,7631 / 0,8753 / 0,9361 | 0,237 → 0,064 |
| `trapez_niejawny` | 2 | 1,9989 / 1,9998 / 1,9999 | ≤ 0,0011 |
| `rk4` | 4 | 4,0024 / 4,0013 / 4,0024 | ≤ 0,0024 |

Obie metody Eulera mają odchylenie MALEJĄCE wraz z zagęszczaniem kroku — to jest
dowód wejścia w obszar asymptotyczny, którego dwie próbki dać nie mogły. Stąd
drugie, ciaśniejsze pasmo `MAKS_ODCHYLENIE_RZEDU_NAJGESTSZA_PARA = 0,25` na parze
najgęstszej (zapas 3,7× wobec 0,0669) obok `MAKS_ODCHYLENIE_RZEDU = 0,5` na
każdej parze (zapas 1,77× wobec 0,283).

**Rząd oczekiwany przypięty poza metadaną implementacji.** `RZAD_OCZEKIWANY_METODY`
żyje w uprzęży kwalifikacji, nie jest czytany z `INTEGRATORY[nazwa].rzad` —
jednoczesna zmiana algorytmu i jego etykiety zachowałaby zgodność i bramka nie
zauważyłaby niczego. Obie deklaracje są porównywane; rozjazd jest luką.

### P2-DELTA-38 — „16/16" w dokumentacji

To NIE jest deklaracja o bieżącym katalogu, tylko akapit historyczny opisujący
katalog POPRZEDNI, usunięty właśnie za to, że meldował 16/16 nie dotykając kodu.
Bieżąca liczba (13) jest meldowana wyłącznie przez uprząż polem `liczba_mutacji`
i nigdzie nie jest zaszyta. Skoro jednak czytelnik wziął ten akapit za stan
bieżący, akapit był źle napisany — docstring `katalog_mutacji.py` zaczyna się
teraz od jawnej liczebności bieżącej i od zastrzeżenia, że każde „16" poniżej
dotyczy katalogu usuniętego.

### Dowód wykonywalny

| sprawdzenie | wynik |
|---|---|
| `tests/research/test_kwalifikacja.py` (50 testów, w tym 13 nowych) | **50 passed, 853 s** |
| realna uprząż `research/kwalifikacja.py` end-to-end | `luki=[]`, `braki=[]`, **ZAKWALIFIKOWANE**, 822 s |
| mutacje zabite | 13/13 |
| najgorsza norma pochodnej w `t0` | 8,3267e-17 |

Nowe testy pokrywają ILOCZYN CECH, nie przykład z karty: brakujący szczebel
sprawdzany jest dla **każdej z 16 komórek** (metoda × krok), degradacja rzędu dla
**każdej z czterech metod**, a błąd poza dziedziną dla sześciu wartości
(`0.0`, `-1.0`, `-5.0`, `nan`, `inf`, `-inf`).

**Defekt w mojej własnej fiksturze, który to umożliwił.** `_raport_minimalny()`
miała DWIE pozycje RK4 — czyli test „logiki kwalifikacji" nigdy nie widział
populacji niekompletnej, bo sam był niekompletny. Fikstura niesie teraz pełny
iloczyn manifestu z wartościami zmierzonymi na drabinie.

---

## 10e. REGRESJA WŁASNA ODSŁONIĘTA PRZEZ NAPRAWĘ PYTEST (zapadka typów)

Bieg CI dla `3cfc75a1` pokazał, że **pytest przeszedł** (7 czerwonych z §10c
zniknęło), a padł krok **Mypy Ratchet Guard**:

```
src/api/equipment_proof_pack.py:64: error: Argument 1 to "float" has
incompatible type "object"; expected "str | Buffer | SupportsFloat | SupportsIndex"
FAILED: dlug typow UROSL o 1 (0 -> 1).
```

**To jest MOJA regresja**, wprowadzona w `6acb008b` (§2/§3) i przeżywająca
kilka biegów CI **wyłącznie dlatego, że krok zapadki nigdy się nie wykonał**:
pytest padał wcześniej, a wszystkie kroki 8–28 szły jako `skipped`. Dokładnie
ten sam wzorzec maskowania co przy bramce rozmiaru odpowiedzi (§11.2) —
naprawa jednej rzeczy odsłania następną, która cały czas tam była.

**Naprawa u źródła, nie wyciszeniem.** `na_kilo` robiło `float(wartosc)` na
słowniku `dict[str, object]`. Zawężenie jest teraz jawne, a wartość nieliczbowa
ODMAWIA z komunikatem nazywającym klucz i typ — nie staje się cicho `None` ani
zerem, bo wielkość zwarciowa wzięta z niczego jest fabrykacją. `bool` jest
odrzucany osobno (`isinstance(True, int)` to prawda, a `True` → 0,001 kA byłoby
liczbą wziętą znikąd).

**Kontrola bazowa przypięta:** `test_mapowanie_jednostek_odmawia_wartosci_nieliczbowej`
pada na zachowaniu sprzed naprawy (stary kod przyjmował `"23748"` i `True`
bez słowa) i przechodzi po niej; `mypy_ratchet_guard` 0 błędów.

---

## 10f. NAPRAWY PO RECENZJI HEAD `3cfc75a1` (ósma runda)

Recenzja `3cfc75a1` potwierdziła, że P1-DELTA-39 i P2-DELTA-40 są zamknięte dla
swoich reprodukcji, i wskazała, że **klasa false-positive nadal jest otwarta** —
tym razem po stronie TYPU, nie kompletności.

### P1-DELTA-41 — tekstowe `zbiegl="false"` ustanawiało pozytywną kwalifikację

Liczyła się PRAWDZIWOŚĆ obiektu (`if not pozycja.get("zbiegl")`), nie jego typ.
Tekst `"false"` jest niepusty, czyli prawdziwy w Pythonie. Zmierzone przed
naprawą i po:

| `zbiegl` | przed | po |
|---|---|---|
| `True` | ZAKWALIFIKOWANE | ZAKWALIFIKOWANE |
| `"false"` | **ZAKWALIFIKOWANE** | **ODRZUCONE** |
| `"true"` | **ZAKWALIFIKOWANE** | **ODRZUCONE** |
| `1` | **ZAKWALIFIKOWANE** | **ODRZUCONE** |
| `0` / `None` | ODRZUCONE | ODRZUCONE |
| brak pola `zbiegl` | **`KeyError`** | **ODRZUCONE** |
| brak pola błędu | **`KeyError`** | **ODRZUCONE** |

Dwa ostatnie wiersze to osobny defekt tej samej klasy: bramka kończyła
NIEOBSŁUŻONYM wyjątkiem zamiast werdyktem. Wyjątek nie jest werdyktem — nie
odróżnisz po nim awarii oceny od braku dowodu.

**Naprawa.** Dziedzina `zbiegl` to WYŁĄCZNIE logiczne `True`; każda inna wartość
i każdy inny typ dają lukę nazywającą wartość i jej typ. Brak pola odróżniony od
pola o wartości `None` wartownikiem `_BRAK` (bo `dict.get` z domyślnym `None`
zlewa dwa różne defekty danych w jeden).

**Usunięte dwa zastane przebiegi po tej samej populacji.** `_luki_kwalifikacji`
miało własne pętle po niezbieżnych i po błędach NaN/Inf, czytające
`p["zbiegl"]` i `p["blad_max_vs_odniesienie"]` BEZ OSŁONY — i to one rzucały
`KeyError`. Oba sprawdzenia robi teraz `_pozycje_benchmarku`, czyli JEDNO
miejsce oceny populacji. Dwa niezależne przebiegi po tym samym zbiorze to
dokładnie klasa długu, którą zamyka reguła „predykaty parami".

### P2-DELTA-42 — wyścig DDL między procesami przy dokładaniu kolumny

Odziedziczone z portu `1e9f21c5`: `_dolacz_kolumny_addytywne` czyta schemat i
wykonuje `ALTER TABLE ADD COLUMN` jako DWIE osobne operacje, a blokada
repozytorium jest PROCESOWA. Przy równoległym starcie oba procesy widzą brak
kolumny, drugi dostaje `duplicate column`.

**Odtworzone dwoma realnymi procesami z barierą** (bariera ustawia wyścig — bez
niej procesy idą po kolei i defekt się nie pokazuje):

```
['OperationalError: (sqlite3.OperationalError) duplicate column name:
  branch_flow_trace_json …', 'OK']
```

**Naprawa bez dopasowywania treści komunikatu** (różni się między SQLite a
PostgreSQL i między wersjami): po nieudanym `ALTER` schemat jest odczytywany
ŚWIEŻO i jeśli kolumna JEST — cel osiągnięty; jeśli jej nie ma — wyjątek leci
dalej nietknięty, bo to już nie wyścig, tylko realna awaria DDL.

Test sprawdza też, że schemat kończy z DOKŁADNIE JEDNĄ kolumną i że wiersz
zapisany przed jej dołożeniem przeżywa z uczciwym `None` — sam brak wyjątku nie
dowodzi poprawnego schematu.

---

## 11. PROBLEMY NIEROZSTRZYGNIĘTE

### 11.1 Siedem czerwonych testów backendu w CI — ROZSTRZYGNIĘTE, patrz §10c
Wcześniejsza treść tej sekcji („NIEODTWARZALNE LOKALNIE", przyczyna w zbieżności
solvera iteracyjnego, naprawa odłożona jako decyzja produktowa) została
**obalona własnym pomiarem** i zastąpiona sekcją §10c. Zostawiam ślad korekty
zamiast cichej podmiany: defekt jest odtwarzalny zmienną `OPENBLAS_NUM_THREADS`,
przyczyną jest `np.linalg.inv` w budowie Z-bus, a naprawa nie wymagała zmiany
kontraktu — mieści się w kanonizacji migawki fixtury.

Stan po naprawie potwierdzam wyłącznie biegiem CI dla dokładnego SHA (§10);
zielone testy lokalne nie są tu dowodem, bo to właśnie lokalna zieleń przy
czerwonym CI była objawem defektu.

### 11.2 Odpowiedź świeżego biegu zwarciowego 96,2 MiB wobec bramki 60 MB — ROZSTRZYGNIĘTE POMIAREM
`e2e/industrial-template-mass-flow.spec.ts:438`. Bieg CI dla `367a81a1`:
**1 failed / 407 passed / 2 skipped**, jedyna porażka to ta asercja —
**100 908 315 B** wobec limitu 62 914 560 B.

**Poprzedni stan tej sekcji: „nierozstrzygnięte — który klucz odpowiada za
przyrost".** Zmierzyłem to. Rozkład rozmiaru wiersza świeżego biegu
(sieć referencyjna `demo_oze_sc`, 90 wierszy, `poetry run python` na ładunku
`wiersze_swiezego_biegu_bez_rozplywu`):

| klucz | udział |
|---|---|
| **`branch_flow_trace`** | **68,3 %** |
| `white_box_trace` | 23,5 % |
| `contributions` | 5,6 % |
| `proof_binding` | 0,8 % |
| reszta (≈20 kluczy) | < 2 % |

**Przyczyna źródłowa — KLASA, NIE INSTANCJA w cudzej karcie.** Odchudzenie
V12K-284 wycinało z wiersza WYŁĄCZNIE `branch_contributions`. `branch_flow_trace`
(ślad WHITE BOX podziału prądu, TH-1) to **ten sam ładunek per gałąź jednego
punktu zwarcia** — rośnie tak samo z liczbą punktów i gałęzi, a jest ok. 5×
większy od wkładów, które objaśnia. Karta naprawiła nazwaną instancję, nie klasę.

**Naprawa istnieje i została przeniesiona.** Commit `1e9f21c5` (gałęzie
`claude/mv-design-pro-donor-audit-vnuqd1` i `…twin-audit-u4lhy0`) rozpoznał
dokładnie tę klasę i wyciął ją w całości (`KLUCZE_ROZPLYWU` = wkłady + ślad;
ślad przenoszony bajtowo do osobnej tabeli; oddawany tą samą końcówką rozpływu
co wkłady; kolumna addytywna nullable + dokładanie kolumn w `init_db`).
**Nie jest przodkiem tej gałęzi** — moja gałąź nigdy go nie dostała. Przeniesiony
`git cherry-pick` bez konfliktów.

**Pomiar po przeniesieniu, ta sama sieć i ta sama funkcja:**
5807,7 KiB → **1837,7 KiB** (64,5 KiB/wiersz → 20,4 KiB/wiersz), czyli **3,16×**
mniej; `branch_flow_trace` znika z wiersza. Przeniesione na pomiar CI:
100 908 315 B / 3,16 ≈ **31,9 MB** wobec bramki 62 914 560 B. To
EKSTRAPOLACJA, nie pomiar — potwierdzeniem jest wyłącznie bieg E2E full dla
nowego SHA, i tylko jego wynik wolno cytować jako dowód.

**Limit 60 MB NIETKNIĘTY.** Żaden próg nie został podniesiony.

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
| SOFTWARE-VERIFIED | **TAK dla zakresu tej gałęzi** | CI dla dokładnego `a6ee782c`: dziewięć workflowów, dziewięć `success` (§10); lokalnie 12302 passed / 0 failed, a przy zmienionej konfiguracji BLAS 12245 passed / 0 failed. NIE obejmuje to pozycji wymienionych w §11.3 jako otwarte — tam nie ma ani kodu, ani testu, więc zieleń o nich nie mówi nic |
| MATHEMATICALLY VERIFIED | **CZĘŚCIOWO** | całka pierwsza, rzędy metod i bilans energii potwierdzone; ogólna poprawność równań urządzeń NIE |
| NUMERICALLY VERIFIED | **CZĘŚCIOWO** | rzędy zmierzone na drabinie, NaN/Inf domknięte; determinizm `projection_hash` międzyśrodowiskowo był REFUTOWANY i został naprawiony u źródła z pomiarem marginesu (§10c) — potwierdzenie należy do CI, nie do tego dokumentu. Bitowa powtarzalność solvera zwarciowego MIĘDZY mikroarchitekturami pozostaje NIEOSIĄGALNA (`np.linalg.inv`); kontrakt mówi teraz o zadeklarowanej precyzji, a nie o ostatnim bicie |
| PHYSICALLY SUPPORTED | **CZĘŚCIOWO** | klasyczny SMIB, jedno zdarzenie topologiczne, dwa kanały |
| PHYSICALLY VALIDATED | **NIE** | brak pomiaru na obiekcie; oba narzędzia całkują to samo równanie |
| PRODUCTION-READY | **NIE** | — |
| REGULATORY-EVIDENCE-READY | **NIE** | — |

Dwóch ostatnich poziomów nie wolno podnieść bez niezależnego audytu i niezależnej
wyroczni; ten dokument ich nie podnosi.

Warstwa dynamiczna pozostaje **`UNVALIDATED_MODEL`**. Globalne `ready` NIE zostało
przywrócone. Żadna dynamika nie została promowana do `VALIDATED_SIMULATION` ani do
dowodu NC RfG.
