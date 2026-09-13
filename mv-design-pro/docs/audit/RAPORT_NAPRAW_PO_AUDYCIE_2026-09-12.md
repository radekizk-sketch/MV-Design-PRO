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
