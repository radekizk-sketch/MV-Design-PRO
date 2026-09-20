# RUNDA 10 — DOMKNIĘCIE DOWODU WYKONYWALNEGO (EXECUTABLE EVIDENCE CLOSURE)

**Data:** 2026-09-20 · **Gałąź:** `claude/r10-evidence` (worktree), docelowo
`claude/mv-design-pro-twin-audit-u4lhy0` · **Punkt wyjścia:** `5770464c` (raport rundy 9)
· **Zakres:** §0–§48 mandatu właściciela z 2026-09-20.

---

## A. CZEGO TA RUNDA DOTYCZY I CZYM SIĘ RÓŻNI OD POPRZEDNICH

Runda 9 wystawiła rdzeniowi dynamiki ocenę na podstawie eksperymentów, które żyły
w katalogu sesji **poza repozytorium**: wyrocznia, wzorce, bramki, mutacje i trajektorie
nie były ani wersjonowane, ani uruchamiane przez CI. Niezależny recenzent mógł
zrecenzować raport — nie mógł go **powtórzyć**. To jest różnica między dowodem a
świadectwem, i mandat rundy 10 nazywa ją wprost: *„Fable nie może już podnieść L5 na
podstawie eksperymentów pozostawionych w katalogu sesji poza repozytorium."*

Runda 10 nie jest więc kolejnym audytem. Jest **budową systemu dowodowego** i naprawą
czterech defektów, które ten system od razu ujawnił jako blokujące. Kryterium
ukończenia nie brzmi „czy liczby się zgadzają", tylko:

> Czy niezależny audytor może sklonować repozytorium, wykonać jeden udokumentowany
> proces i otrzymać te same wnioski samodzielnie?

Po tej rundzie odpowiedź brzmi **tak** dla twierdzeń D-01…D-08 i D-10, oraz **tak, ale
w osobnym środowisku** dla D-09 (wyrocznia zewnętrzna ANDES).

### Uczciwe podsumowanie w jednym akapicie

Naprawiono jeden **defekt fizyki** klasy P1 (F-8 — wyspa bez źródła kończyła się albo
surowym `OverflowError`, albo, groźniej, „zbieżnością" przy |V| = 1,374·10¹¹ pu), jeden
defekt warunku istnienia (F-7 — maszyna o H ≤ 0 liczyła się cicho), jeden **defekt
bramki** klasy P1 (F-5 — brak zależności dawał zieloną bramkę bez ani jednego
wykonanego testu) oraz jeden defekt **wyroczni** (komparator ANDES przechodził przy
niepełnym pokryciu czasu). Spór o rozbieżność wobec ANDES rozstrzygnięto
eksperymentem przyczynowym — i przy okazji **obalono własną hipotezę rundy 9** jako
niepełną. Aparat dowodowy (wyrocznia, wzorce, 13 bramek, 12 mutacji, manifest, jedno
wejście) jest w repozytorium i w CI.

---

## B. STAN ZASTANY I PUNKT ODNIESIENIA (§2)

| Pozycja | Wartość |
|---|---|
| HEAD punktu wyjścia | `5770464c0e014869337f02b8d08885e98bc57efb` — **zgodny z mandatem** |
| Gałąź robocza | `claude/r10-evidence` w worktree `.claude/worktrees/r10` |
| Baza scalenia z `origin/main` | `7e84753a` |
| Commit tej rundy | `ff613b16` |
| `git status --short` po commicie | pusty |

**Dlaczego osobny worktree.** Indeks głównego checkoutu zastano w stanie NIEAKTUALNYM:
zapisanie go skasowałoby raport W6-F (1247 linii), `W6_A_KONTRAKT_OBSERWABLI.md`
(779 linii), `FINAL_DYNAMICS_CAPABILITY_FREEZE.md` oraz `waznosc.py` z testem —
bilans 46 wstawień wobec 4539 usunięć. Stan zachowano pod
`refs/kopie/r10-zastany-indeks-glownego-checkoutu` (`b322c3b8`) i pracowano na czystym
worktree. `git reset --hard` został odrzucony przez klasyfikator uprawnień jako
nieodwracalne zniszczenie lokalne — decyzję uszanowano, nie obchodzono.

---

## C. F-8 — WYSPA BEZ ŹRÓDŁA: ODTWORZENIE, ESKALACJA I NAPRAWA FIZYCZNA (§8, §9)

### C.1 Odtworzenie kontrprzykładu recenzenta

Układ: `Ybus = 0` (zero gałęzi, zero boczników, zero zwarć), jeden węzeł, odbiór o
stałej mocy `S = 1,0 + j0,2 pu`, `rozwiaz_algebre`.

| Nastawy | Wynik NA HEAD `5770464c` |
|---|---|
| `tolerancja = 1e-100`, `max_iteracji = 400` | **surowy `OverflowError`** (`(34, 'Numerical result out of range')`) z `siec.py:246` (`mianownik**2`) |
| `tolerancja = 1e-11`, `max_iteracji = 60` — **nastawy robocze** | **„ZBIEŻNOŚĆ"**: `|V| = 137 438 953 472,0 pu` (1,374·10¹¹), residuum `7,420049970959059e-12`, 37 iteracji |

### C.2 Dlaczego drugi przypadek jest groźniejszy — i dlaczego moja klasyfikacja z rundy 9 była za łagodna

W rundzie 9 zakwalifikowałem F-8 jako **P1-ODMOWA** z komentarzem „fizyka nie jest zła,
zły jest mechanizm odmowy". **To była ocena wystawiona po zbadaniu wyłącznie ścieżki,
która się przewracała.** Ścieżka przy nastawach roboczych nie przewraca się wcale:

* wynik jest **skończony** → przechodzi strażnika skończoności,
* residuum jest **poniżej tolerancji** → przechodzi kryterium zbieżności,
* `|V|` jest absurdalne, ale nic tego nie mierzy.

Mechanizm jest elementarny i policzalny. Dla `Ybus = 0` residuum wynosi

    ‖g‖ = ‖Y·V − I(x,V)‖ = |S| / |V|

więc **każda** tolerancja jest osiągalna przez samo odjechanie napięcia do
nieskończoności: `|V| ≥ |S|/tol = 1,0198/1e-11 = 1,0198·10¹¹ pu`; zmierzono
1,374·10¹¹ pu. Zaostrzanie tolerancji działa **w złą stronę** — mniejsza tolerancja
oznacza większe `|V|`.

> **NORMA RESIDUUM NIE JEST ŚWIADECTWEM WAŻNOŚCI**, gdy rozwiązanie istnieje wyłącznie
> w granicy. Żadne kryterium zbieżności tego nie wyłapie z zasady, bo residuum
> naprawdę jest małe. Warunek **istnienia** musi być sprawdzony osobno i wcześniej.

### C.3 Naprawa — strukturalna, nie wyjątkowa

Mandat §9 zakazuje wprost naprawy przez `except OverflowError`. Nowy moduł
`src/network_model/solvers/dynamika/wyspy.py` (205 linii):

1. `przydzial_wysp(...)` — spójne składowe grafu **aktywnych** gałęzi, numeracja
   deterministyczna (wyspa dostaje numer, gdy przeszukiwanie dosięga jej węzła o
   najmniejszym indeksie). Liczone **raz przy składaniu topologii**, przechowywane w
   zamrożonym `ModelSieci`, nie w każdym wywołaniu Newtona.
2. `urzadzenie_wnosi_do_algebry(...)` — predykat **MIERZONY Z RÓWNAŃ URZĄDZENIA**:
   urządzenie wnosi coś, gdy `prad_pu ≠ 0` **albo** blok `jakobian_prad_napiecie ≠ 0`.
3. `sprawdz_zasilanie_wysp(...)` — wywoływane na początku `rozwiaz_algebre`, czyli w
   **jedynym** punkcie przewężenia (dwa wywołania z `calkowanie.py`, jedno z
   `reinicjalizacja.py`).

**Dlaczego predykat mierzony, a nie lista rodzin.** Lista rodzin rozjechałaby się z
fizyką przy pierwszym nowym modelu urządzenia. Równania nie mogą. Dzięki temu predykat
obejmuje **bez osobnej gałęzi**:

* urządzenie **odłączone zdarzeniem** (`UrzadzenieOdlaczone` zwraca dokładnie te dwa
  zera) — zweryfikowane w bramce G13 jako trzeci przypadek,
* przekształtnik **sieciowy (grid-following)** o zerowym zadaniu prądu (jego
  `jakobian_prad_napiecie` jest zerowy z konstrukcji — patrz docstring
  `przeksztaltnik_gfl.py`).

**Dlaczego warunkiem jest ODBIÓR, a nie samo źródło.** Wyspa bez źródła i **bez**
odbioru ma rozwiązanie fizyczne (`V = 0`, wyspa martwa) i ten rdzeń jej nie odmawia.
Odmowa należy się dokładnie sytuacji, w której odbiór o stałej mocy żąda mocy, której
w wyspie nie ma z czego wziąć: bez drogi do ziemi rozwiązania nie ma wcale
(`|V| → ∞`), a z samą drogą do ziemi równanie wyznacza co najwyżej **moduł** napięcia,
zostawiając kąt swobodny — więc rozwiązania **izolowanego** nadal nie ma.

Nowy kod odmowy `dynamika.wyspa_bez_zrodla` (rejestr `KODY_ODMOW` jest zamknięty i
przypięty testem) niesie: numer i skład wyspy, identyfikatory i moce odbiorów, moc
zapotrzebowania, identyfikatory urządzeń stojących w wyspie mimo braku wkładu (zero
cichego pominięcia urządzenia odłączonego), chwilę biegu i powód nazwany wprost.

### C.4 Dowód naprawy

```
Ybus=0, odbiór P=1,0 Q=0,2, tol=1e-100, maxit=400  ->  ODMOWA dynamika.wyspa_bez_zrodla
Ybus=0, odbiór P=1,0 Q=0,2, tol=1e-11,  maxit=60   ->  ODMOWA dynamika.wyspa_bez_zrodla
urządzenie ODŁĄCZONE w wyspie                      ->  ODMOWA dynamika.wyspa_bez_zrodla
```

Oba tryby awarii — ten, który się przewracał, i ten, który cicho „zbiegał" — kończą się
teraz **tą samą** nazwaną odmową. Bramka **G13** jest przypięta w `test_bramki.py`,
a mutacja **M19** (usunięcie wywołania sprawdzenia) jest przez nią zabijana.

**Regresja:** pakiet dynamiki po naprawie F-8: **429 passed, 3 deselected** — wartość
identyczna z linią bazową rundy 9. Naprawa nie przestawiła ani jednego istniejącego wyniku.

---

## D. F-5 — CICHE ODZNACZENIE TESTÓW PRZY BRAKU ZALEŻNOŚCI (§7)

### D.1 Defekt

`tests/conftest.py` zawierał:

```python
_MISSING_DEPS = {n for n in ("sqlalchemy", "numpy", "networkx") if find_spec(n) is None}

def pytest_ignore_collect(collection_path, config):
    if not _MISSING_DEPS:
        return False
    if "tests/proof_engine" in str(collection_path):
        return False
    return True
```

Skutek: brak **jednej** z trzech zależności pomijał **całe drzewo testów** poza
`tests/proof_engine` i kończył bieg **kodem 0**. Zmierzony obraz: „681 deselected,
0 failed" — zielona bramka bez ani jednego wykonanego testu fizyki.

Najgorsza własność tego defektu jest rekurencyjna: `tests/test_environment.py`, którego
jedynym zadaniem było wykrycie brakującej zależności, **był odznaczany przez ten sam
hook**. Strażnik znikał razem z tym, czego miał pilnować. Plik nazywał przy tym
`numpy` i `networkx` „optional runtime dependencies", podczas gdy obie są
zależnościami **głównymi** w `pyproject.toml`.

### D.2 Naprawa

* `ZALEZNOSCI_OBOWIAZKOWE` — osiem zależności głównych (`fastapi`, `networkx`, `numpy`,
  `openpyxl`, `pandas`, `pydantic`, `scipy`, `sqlalchemy`), jedno źródło prawdy.
* `pytest_configure` podnosi `pytest.UsageError` z komunikatem
  **„WALIDACJA NIEWYKONANA / BRAK ZALEŻNOŚCI OBOWIĄZKOWEJ: …"** → kod wyjścia 4.
  To **nie jest** wykluczenie zamienione na inne wykluczenie: bieg nie melduje sukcesu,
  tylko mówi wprost, czego brakuje i że nic nie zostało zweryfikowane.
* `tests/test_environment.py` przepisany: parametryzowany po tej samej liście, sprawdza
  **importowalność** (nie sam `find_spec`).

### D.3 Dowód — mutacja środowiska

`tests/walidacja_fizyczna/test_bramka_zaleznosci.py` uruchamia pytesta w osobnym
procesie z pakietem **ukrytym** przez filtr nałożony na każdy wpis `sys.meta_path`
(`sitecustomize.py` ładuje się przed `conftest.py`). Asercje:

* kod wyjścia **≠ 0**,
* komunikat zawiera `BRAK ZALEZNOSCI OBOWIAZKOWEJ` oraz nazwę pakietu,
* w wyjściu **nie ma słowa `deselected`**.

Wynik: **5 passed** (3 pakiety × mutacja + 2 testy kontraktu listy).

> Uwaga metodyczna do samego testu: pierwsza wersja ukrywacza **podnosiła**
> `ModuleNotFoundError` z `find_spec`. Wyjątek przechodził na zewnątrz i wywracał
> pytesta błędem wewnętrznym — bieg był czerwony, ale z **niewłaściwego powodu**, więc
> niczego nie dowodził. Poprawna forma zwraca `None` ze **wszystkich** finderów.

---

## E. F-7 — WARUNEK ISTNIENIA RÓWNANIA WAHAŃ: H > 0 (§11)

### E.1 Defekt

Maszyna o `H ≤ 0` budowała się bez sprzeciwu i przechodziła cały bieg. Runda 9
zmierzyła, że na wzorcu bez zakłócenia bieg z `H = −1 s` kończył się **bitowo
identycznie** z kontrolą — bo przy `P_m = P_e` licznik równania jest zerem i znak `H`
nie ma na co zadziałać. Defekt był więc **niewidoczny w przebiegu**.

### E.2 Naprawa — warunek istnienia, nie próg wiarygodności

`konwencje.sprawdz_stala_bezwladnosci(h_s, *, urzadzenie, rodzina)` odmawia dla
`H ≤ 0` i dla `H` nieskończonego/NaN, kodem `dynamika.parametry_urzadzenia_sprzeczne`.
Uzasadnienie jest **matematyczne**, nie normatywne:

* `H = 0` → dzielenie przez zero; prędkość przestaje być funkcją czasu,
* `H < 0` → odwrócona przyczynowość: nadwyżka mocy mechanicznej **hamowałaby** wirnik,
* `H` nieskończone/NaN → parametr nie jest liczbą.

**Żadnego minimum nie wprowadzono.** `H = 0,05 s` jest dla maszyny synchronicznej
nieprawdopodobne fizycznie, ale matematycznie poprawne — układ jest wtedy tylko
sztywniejszy, a o zbieżność kroku dba własna maszyneria Newtona (`dynamika.krok_niezbiezny`).
Wiarygodność parametru jest pytaniem **katalogowym**, nie warunkiem rozwiązywalności;
wymyślona granica („H ≥ 0,5 s") zaczęłaby decydować o fizyce zamiast o danych.

**Klasa, nie instancja.** Inwentarz przed naprawą: `zmiana_bazy_stalej_bezwladnosci`
wołane jest dla `h_s` w **dwóch** miejscach (`zbuduj_maszyne_klasyczna`,
`zbuduj_maszyne_synchroniczna`). Oba wpięte, oba przez tę samą funkcję.

### E.3 Pomiar (§11 — zamiatanie zadane mandatem)

| `H` [s] | Wynik |
|---|---|
| 1,0 | ZBUDOWANA, `H(układ) = 1.0` |
| 0,05 | ZBUDOWANA, `H(układ) = 0.05` |
| 1e−12 | ZBUDOWANA, `H(układ) = 1e-12` |
| 0,0 | ODMOWA `dynamika.parametry_urzadzenia_sprzeczne` |
| −1e−12 | ODMOWA `dynamika.parametry_urzadzenia_sprzeczne` |
| −1,0 | ODMOWA `dynamika.parametry_urzadzenia_sprzeczne` |
| ±∞, NaN | ODMOWA `dynamika.parametry_urzadzenia_sprzeczne` |

Rozdzielenie trzech pytań, którego wymaga §11:
**ważność matematyczna** — `H > 0` (egzekwowana);
**uwarunkowanie** — małe `H` daje układ sztywny, mierzone i raportowane przez zbieżność
kroku, nie blokowane z góry;
**wiarygodność fizyczna** — poza zakresem rdzenia solvera, należy do warstwy katalogowej.

---

## F. POKRYCIE CZASU WYROCZNI ANDES (§16, P1-DELTA-45)

### F.1 Defekt — potwierdzony, nie przyjęty na słowo

`tests/network_model/dynamika/wyrocznia_andes.blad_trajektorii` wymagał wyłącznie, żeby
maska zawierała **„co najmniej jedną próbkę"**. `numpy.interp` poza zakresem wzorca
**nie ekstrapoluje i nie zgłasza błędu — PRZYTRZYMUJE skrajną wartość.** Wzorzec urwany
na 80 % odcinka był więc porównywany ze **stałą** na pozostałych 20 % i — na spokojnym
ogonie przebiegu — przechodził.

To jest kształt defektu, który unicestwia wartość wyroczni: **im mniej wzorca, tym
łatwiej o „zgodność"**.

### F.2 Naprawa i dowód

`porownaj_trajektorie(...)` zwraca `PorownanieTrajektorii` z pomiarem pokrycia
(wymagany i faktyczny początek/koniec, udział pokrycia, liczba próbek porównanych i
odrzuconych) i **odrzuca** porównanie przy niepełnym pokryciu. `blad_trajektorii`
została cienką nakładką — jedno źródło prawdy.

Mutacja urwania wzorca (obcięcie do 80 %):

```
PEŁNE : PorownanieTrajektorii(blad_rad=0.0, pokrycie_udzial=1.0, probek=1301, odrzuconych=0)
URWANY: AssertionError — WZORZEC NIE POKRYWA ZADANEGO ODCINKA … pokrycie 0.845385
```

Ten sam warunek egzekwuje `blad_po_przesunieciu` w eksperymencie eps→tau: przesunięte
chwile wychodzące poza wzorzec kończą się odrzuceniem, nie cichym przytrzymaniem.

---

## G. EKSPERYMENT PRZYCZYNOWY ε → τ: ROZSTRZYGNIĘCIE SPORU O ANDES (§12–§15)

To jest najważniejszy naukowo element tej rundy — i jedyny, w którym **obaliłem własną
hipotezę z rundy 9**.

### G.1 Co twierdziła runda 9 i dlaczego to było za mało

Runda 9 zmierzyła, że w scenariuszach **ze zdarzeniem** różnica między przebiegiem
rdzenia a przebiegiem ANDES jest przesunięciem osi czasu o `τ = +5,0·10⁻⁵ s` —
**stałym w sekundach**, niezależnym od kroku całkowania (przy połowieniu `dt` iloraz
błędu wynosił 1,000, nie 2). Znaleziono w źródle ANDES
`System.store_switch_times(models, eps=1e-4)`, który dokleja do siatki czasu punkty
`t−ε`, `t`, `t+ε`, i postawiono hipotezę `τ = ε/2`.

**Ta hipoteza była postawiona na JEDNEJ wartości ε.** Jedna wartość nie odróżnia `ε/2`
od dowolnej innej stałej równej `5·10⁻⁵ s`. Mandat §12 żąda dowodu **skalowania** — i
wprost zakazuje reinterpretowania danych dla ratowania wcześniejszego raportu.

### G.2 Zamiatanie ε przy stałym dt = 5·10⁻⁴ s

| ε [s] | τ\* [s] | τ\*/ε | błąd bez korekty [rad] | błąd po korekcie [rad] | redukcja |
|---|---|---|---|---|---|
| 2,5·10⁻⁵ | 1,2516·10⁻⁵ | **0,50065** | 2,044·10⁻⁵ | 3,06·10⁻⁷ | 67× |
| 5,0·10⁻⁵ | 2,5062·10⁻⁵ | **0,50124** | 4,090·10⁻⁵ | 3,91·10⁻⁷ | 105× |
| 1,0·10⁻⁴ | 5,0007·10⁻⁵ | **0,50007** | 8,181·10⁻⁵ | 4,56·10⁻⁷ | 179× |
| 2,0·10⁻⁴ | 1,0003·10⁻⁴ | **0,50016** | 1,636·10⁻⁴ | 6,68·10⁻⁷ | 245× |
| 4,0·10⁻⁴ | 1,99998·10⁻⁴ | **0,49999** | 3,273·10⁻⁴ | 9,01·10⁻⁷ | 363× |

Zakres ε szesnastokrotny. `τ*/ε = 0,5000 ± 0,0012`. Błąd bez korekty skaluje się z ε
**dokładnie liniowo** (kolejne podwojenia: 2,044 → 4,090 → 8,181 → 16,36 → 32,73).
Błąd po korekcie zostaje na poziomie 3–9·10⁻⁷ rad — dwa do trzech rzędów niżej.

### G.3 Macierz dt × ε — hipoteza PĘKA w jednym punkcie

Dwanaście biegów (4 kroki × 3 wartości ε) dało `τ*/ε` w przedziale 0,4974–0,5012 —
**z jednym wyjątkiem**: dla `dt = 1,25·10⁻⁴ s` i `ε = 2·10⁻⁴ s` wyszło
`τ*/ε = 0,3087`, a błąd bez korekty 1,019·10⁻⁴ zamiast spodziewanych ~1,64·10⁻⁴.

To jest **jedyny punkt macierzy, w którym ε > dt**. Zmierzone `τ* = 6,174·10⁻⁵ s` to
0,494·`dt` — czyli **połowa kroku `dt`, nie połowa ε**.

### G.4 Postać ostateczna prawa i jej mechanizm

> **τ\* = min(ε, dt) / 2 — połowa PIERWSZEGO kroku wykonanego po zdarzeniu.**

To nie jest dopasowanie po fakcie, tylko konsekwencja tego samego mechanizmu, który
tłumaczył postać wyjściową:

1. Pętla główna ANDES (`routines/tds.py`) wykonuje w jednej iteracji: `itm_step()`
   (całkowanie do chwili `t`) → `dae.store()` (**zapis próbki w chwili `t`**) →
   `do_switch()` (**wykonanie zdarzenia zaplanowanego na `t`**). Próbka ANDES w chwili
   zdarzenia jest więc stanem **sprzed** zdarzenia. Nasz rdzeń ma kontrakt odwrotny i
   jawny (`silnik.py`: próbka w chwili `t` jest stanem **po** wykonaniu zdarzeń tej chwili).
2. Trapez na **pierwszym przedziale po zdarzeniu** uśrednia prawą stronę sprzed i po
   nim, co jest równoważne wykonaniu zdarzenia w **środku** tego przedziału.
3. Długością tego przedziału jest `ε` tylko dopóki `ε < dt` — ANDES przycina krok, żeby
   nie przeskoczyć następnej chwili przełączenia
   (`if (dae.t + h) > switch_times[idx]: h = switch_times[idx] - dae.t`). Gdy `ε > dt`,
   pierwszy kończy się zwykły krok `dt`.

Hipoteza rundy 9 była więc **niepełna** — prawdziwa w zakresie, w którym ją mierzono
(`ε < dt`), a nie fałszywa. Tak jest raportowana i tak jest zapisana w kodzie.

### G.5 Test rozstrzygający: zamiatanie dt przy stałym ε = 2·10⁻⁴ s

Predykcja postaci ostatecznej jest **ostra i falsyfikowalna**: dla `dt > ε` `τ*` ma stać
na `ε/2 = 1,0·10⁻⁴ s`, a dla `dt < ε` ma zjechać do `dt/2`. Postać wyjściowa przewiduje
**płaską linię** na całym zamiataniu.

| dt [s] | pierwszy krok min(ε,dt) [s] | τ\* [s] | τ\*/ε | τ\*/(krok/2) |
|---|---|---|---|---|
| 1,00·10⁻³ | 2,00·10⁻⁴ | 9,9917·10⁻⁵ | 0,4996 | **0,9992** |
| 5,00·10⁻⁴ | 2,00·10⁻⁴ | 1,00032·10⁻⁴ | 0,5002 | **1,0003** |
| 2,50·10⁻⁴ | 2,00·10⁻⁴ | 1,00189·10⁻⁴ | 0,5009 | **1,0019** |
| 1,25·10⁻⁴ | 1,25·10⁻⁴ | 6,1739·10⁻⁵ | 0,3087 | **0,9878** |
| 6,25·10⁻⁵ | 6,25·10⁻⁵ | 3,0996·10⁻⁵ | 0,1550 | **0,9919** |

Kolumna `τ*/ε` **spada** (0,50 → 0,31 → 0,155), kolumna `τ*/(krok/2)` **stoi na 1,00**.

**Werdykt liczbowy na komplecie 22 pomiarów:**

* najgorsze odchylenie postaci **ostatecznej** `τ* = min(ε,dt)/2`: **2,56 %**
* najgorsze odchylenie postaci **wyjściowej** `τ* = ε/2`: **69,0 %**
* **OCENA: PROVEN**

### G.6 Kryminalistyka surowa (§15)

Siatka czasu ANDES wokół zdarzenia `t = 0,3 s` przy ε = 1·10⁻⁴ s: `{0,2999, 0,3, 0,3001}`
— dokładnie `t−ε`, `t`, `t+ε`.

| Chwila | Moduł napięcia szyny [pu] |
|---|---|
| `t − ε` | 1,05 |
| `t` | **1,05** |
| `t + ε` | 0,58085 |

Próbka w chwili zdarzenia jest **identyczna z przedzwarciową** → jest stanem
**SPRZED ZDARZENIA**. Potwierdza to bezpośrednio kolejność `store → switch` odczytaną
ze źródła.

### G.7 Czego ten eksperyment NIE twierdzi

Nie twierdzi, że ANDES liczy źle. Twierdzi wyłącznie, **skąd bierze się różnica na
użytej ścieżce porównania** — i pozwala tę różnicę z porównania usunąć, zamiast
przypisywać ją fizyce któregokolwiek z programów. Biblioteka ANDES **nie była
modyfikowana** poza harnessem badawczym: podmiana `store_switch_times` jest
opakowaniem oryginału, żyje w `tests/walidacja_fizyczna/andes/` i jest zdejmowana
bezwarunkowo. Rdzeń produktu nie został przy tym dotknięty ani jedną linią.

---

## H. APARAT DOWODOWY W REPOZYTORIUM (§4–§6)

`mv-design-pro/backend/tests/walidacja_fizyczna/` — 16 plików, ~2600 linii.

| Plik | Rola | Kluczowa własność |
|---|---|---|
| `wyrocznia.py` | niezależna wyrocznia SMIB | **zero importów** z `network_model.solvers.dynamika`; własna algebra 2×2, własny `solve_ivp`, własna kwadratura czasu krytycznego |
| `stanowisko.py` | ten sam układ liczony produktem | parametry podane jawnie po obu stronach; `s_n_mva` **parametrem**, domyślnie ≠ bazie układu |
| `bramki.py` | bramki G1–G13 | progi **wyprowadzone** z rzędu metody i arytmetyki, uzasadnienie przy każdym |
| `manifest.py` | rejestr twierdzeń D-01…D-10 | kontrakt poziomu L5 jako **dane**, nie proza |
| `mutacje.py` | harness mutacji M10–M21 | lustro źródeł z dowiązań (`cp -as`), kwalifikacja przez **porównanie AST** |
| `srodowisko.py` | blokada środowiska | rozdziela zależności dowodu od wyroczni zewnętrznej |
| `uruchom.py` | jedno wejście | kod 2 = **walidacji nie wykonano**, kod 1 = wykonano i czerwona |
| `andes/` | wyrocznia zewnętrzna | podmiana `store_switch_times` **wyłącznie** w harnessie badawczym |
| `README.md` | instrukcja z czystego klonu | +  czego aparat **nie** dowodzi |

**Rozdział ról, którego nie wolno pomylić** (`srodowisko.py`): `ZALEZNOSCI_DOWODU`
(numpy, scipy) — bez nich walidacja nie ma sensu i bieg staje;
`ZALEZNOSCI_WYROCZNI_ZEWNETRZNEJ` (andes) — poza zależnościami produkcyjnymi, więc jej
brak nie może wywalać zwykłego biegu, ale **nie może też znikać po cichu**: manifest
nazywa wprost, które twierdzenie na niej stoi (D-09) i dlatego daje mu L4, nie L5.

---

## I. BRAMKI FIZYCZNE — POMIAR (§19–§22)

Komplet G1–G13, bieg na `ff613b16`, czas **331,88 s** (5 min 32 s).

| Bramka | Co łapie | Zmierzono | Próg | Werdykt |
|---|---|---|---|---|
| G1 | dryf stanu ustalonego | **0,0** (dokładnie) | 1e−9 rad | PASS |
| G2 | częstotliwość modu wobec postaci zamkniętej | 2,109·10⁻⁶ | 1e−3 | PASS |
| G3 | ROCOF w chwili zwarcia wobec algebry wyroczni | **3,180·10⁻¹⁶** | 1e−9 | PASS |
| G4 | tłumienie modu (D = 4) | 1,787·10⁻⁶ | 1e−2 | PASS |
| G5 | czas wykonania zdarzenia | **0,0** (dokładnie) | 1e−12 s | PASS |
| G6 | ta sama maszyna w bazie 50 MVA | 2,109·10⁻⁶ | 1e−3 | PASS |
| G7 | częstotliwość węzłowa wobec pochodnej analitycznej | **7,105427357601002·10⁻¹⁵ Hz** | 1e−12 Hz | PASS |
| G8 | granica fail-closed (zamiatanie zapadu) | 0,0 (predykat) | 0,0 | PASS |
| G9 | residuum algebry po zdarzeniu | 2,091·10⁻¹² | 1e−9 | PASS |
| G10 | czas krytyczny wobec dwóch dróg wyroczni | 2,038·10⁻⁶ s | 2e−3 s | PASS |
| G11 | dryf całki pierwszej (D = 0) | 3,002·10⁻¹³ pu | 1e−6 pu | PASS |
| G12 | największy **dodatni** przyrost energii (D = 2) | **−3,452·10⁻¹⁶** pu | 1e−12 pu | PASS |
| G13 | wyspa bez źródła kończy się odmową nazwaną | 0,0 (predykat) | 0,0 | PASS |

Trzy liczby zasługują na komentarz.

**G7 = 7,105427357601002·10⁻¹⁵ Hz to dokładnie `math.ulp(50.0)`** — opublikowana
częstotliwość węzłowa różni się od dokładnej pochodnej analitycznej o **jeden bit
podwójnej precyzji**, na 2401 próbkach dwóch trajektorii ze zwarciem. Nie jest to
„zgodność w granicach tolerancji", tylko tożsamość numeryczna.

**G6: okres modu w bazie urządzenia 50 MVA wyniósł 0,7482141747098077 s — BITOWO
identycznie** jak w bazie 100 MVA. Ta sama maszyna fizyczna podana w dwóch różnych
bazach daje ten sam mod co do ostatniego bitu. To zamyka ślepy punkt F-1 najmocniejszym
możliwym dowodem.

**G12 jest ujemne.** Największy **dodatni** przyrost energii w całym przebiegu
pozwarciowym przy `D = 2` wynosi −3,45·10⁻¹⁶ pu — czyli **nie ma ani jednego
dodatniego przyrostu**. Energia maleje monotonicznie, zgodnie z `dV/dt = −(D/ω₀)δ̇² ≤ 0`.

### I.1 G8 — granica fail-closed jako zamiatanie, nie dwa punkty

Bramka G8 została w tej rundzie **przebudowana**. Wersja przeniesiona wprost z rundy 9
przypinała dwie konkretne wartości `X_f` i padła przy porcie (jednostki: runda 9
podawała omy, port podawał pu — mój błąd przeliczenia, nie regresja produktu). Zamiast
poprawić dwie liczby, bramka pyta teraz o **kształt zachowania**:

| `X_f` [pu] | Wynik |
|---|---|
| 0,5 | BIEG, min\|U\| = 0,779054 pu |
| 0,2 | BIEG, min\|U\| = 0,558354 pu |
| 0,1 | BIEG, min\|U\| = 0,375828 pu |
| 0,05 | BIEG, min\|U\| = 0,221043 pu |
| 0,03 | BIEG, min\|U\| = **0,130148 pu** |
| 0,0222 | ODMOWA `dynamika.krok_niezbiezny` |
| 0,01 | ODMOWA `dynamika.reinicjalizacja_niezbiezna` |
| 0,002 | ODMOWA `dynamika.reinicjalizacja_niezbiezna` |

Warunki bramki: (1) najpłytszy zapad **liczy się**, (2) najgłębszy kończy się odmową o
kodzie **z zamkniętego rejestru**, (3) granica jest **pojedyncza i monotoniczna** — nie
ma głębszego zapadu, który „znowu się liczy" po tym, jak płytszy już odmówił.

Punkt (3) jest tu ważniejszy od (1) i (2): gdyby zbieżność wracała losowo przy głębszym
zapadzie, oznaczałoby to, że o wyniku decyduje przypadek numeryczny, a nie fizyka modelu.

### I.2 Czas krytyczny — trzy niezależne drogi

| Droga | `t_CCT` [s] |
|---|---|
| Wyrocznia — kwadratura kryterium równych pól (po **kącie**) | 0,3182261114510691 |
| Wyrocznia — bisekcja po trajektoriach DOP853 (po **czasie**) | 0,31822611130774026 |
| Produkt — trapez niejawny ze sprzężeniem sieciowym | 0,3182281494140626 |

Dwie drogi wyroczni zgadzają się do **1,43·10⁻¹⁰ s**; produkt odbiega o 2,04·10⁻⁶ s,
czyli **poniżej rozdzielczości własnej bisekcji** (5·10⁻⁵ s). Niedomknięcie pól przy
kącie krytycznym: **−1,11·10⁻¹⁶** (zero maszynowe).

> **Znalezisko metodyczne.** Pierwsza wersja kwadratury równych pól miała w mianowniku
> `2H` zamiast `H` i dawała czas zawyżony **dokładnie √2 razy** (0,5618 s zamiast
> 0,3973 s na scenariuszu testowym). Wykryła to **druga, niezależna droga** — bisekcja
> po trajektoriach. Gdyby wyrocznia miała jedną drogę, ten błąd wszedłby do raportu
> jako „rozbieżność produktu". To jest argument za dwiema drogami wyroczni, nie za jedną.

---

## J. HARNESS MUTACJI I JEGO SAMOKONTROLA (§23–§24)

### J.1 Zasada

Zielona bramka nie dowodzi niczego, dopóki nie wiadomo, **co potrafi ją zaczerwienić**.
Mutacja jest odwrotnością testu: psujemy jedno równanie i żądamy, żeby aparat to
zgłosił. Mutacja, która **przeżywa**, jest defektem **zestawu bramek** — i tak jest
raportowana, nie jako drobiazg.

### J.2 Izolacja

Żadna mutacja nie dotyka drzewa roboczego. Dla każdej powstaje katalog tymczasowy z
**lustrem** `src/` złożonym z dowiązań symbolicznych (`cp -as`); podmieniany jest
wyłącznie ten jeden plik, który mutacja psuje, a bramki biegną w osobnym procesie z
`PYTHONPATH` wskazującym lustro. Przerwanie biegu nie zostawia zmutowanego repo — co
jest przypięte testem `test_lustro_zrodel_nie_dotyka_drzewa_roboczego`.

> Kontekst: w rundzie 9 współbieżny mutator **skaził** wynik eksperymentu CCT (bieg
> zaimportował produkt w oknie, w którym obowiązywała mutacja M11 z odwróconym znakiem
> `P_e`). Wynik trzeba było odrzucić i powtórzyć. Lustro z dowiązań usuwa tę klasę
> błędu **z konstrukcji**, a nie przez dyscyplinę operatora.

### J.3 Samokontrola — wymóg §24

Harness, który melduje „zabite" dla zmiany bez skutku, produkuje fałszywą pewność i
jest **groźniejszy od braku harnessu**. Dlatego każda mutacja jest **kwalifikowana
przed biegiem** porównaniem drzew składniowych pliku przed i po podmianie:

| Warunek | Kwalifikacja |
|---|---|
| tekst się nie zmienił | `BEZ ZMIANY TEKSTU` (wzorzec nie pasuje do źródła) |
| tekst inny, **AST identyczne** | `MUTACJA NIEWAŻNA` (zmiana bez skutku, np. komentarz) |
| AST inne, bramki czerwone albo wyjątek | `ZABITA` |
| AST inne, bramki zielone | `PRZEŻYŁA` — **luka w zestawie bramek** |

Mutacja **M21** jest kontrolna: zmienia sam komentarz. Test
`test_samokontrola_mutacja_bez_skutku_jest_niewazna` żąda werdyktu `MUTACJA NIEWAŻNA`
i `faktyczny_detektor is None`. **Wariant „NIEWAŻNA" nigdy nie jest liczony jako zabicie.**

### J.4 Zestaw mutacji

| ID | Defekt fizyczny | Deklarowany detektor |
|---|---|---|
| M10 | odwrócony znak tłumienia — moment tłumiący **pompuje** energię | G4, G12 |
| M11 | odwrócony znak mocy elektrycznej | G2, G3, G11 |
| M12 | bezwładność `2H` → `H` (mod szybszy √2 razy) | G2, G3, G10 |
| M13 | usunięta pulsacja bazowa z równania kąta | G2, G10 |
| M14 | odwrócony **kierunek** zmiany bazy stałej bezwładności | G6 |
| M15 | odwrócony **kierunek** zmiany bazy reaktancji przejściowej | G6 |
| M16 | częstotliwość węzłowa z `\|V\|` zamiast `\|V\|²` | G7 |
| M17 | pominięty człon częstotliwości znamionowej | G7 |
| M18 | wyłączona bramka fail-closed częstotliwości | G8 / test jednostkowy |
| M19 | **usunięty warunek istnienia punktu pracy** (F-8 wraca) | G13 |
| M20 | zdarzenie przyciągane do najbliższego węzła siatki | G5 |
| M21 | **kontrolna, bez skutku** (zmiana komentarza) | brak — samokontrola |

Każda mutacja **deklaruje z góry**, która bramka ma ją złapać. Werdykt „zabita przez
cokolwiek" nie przechodzi za dowód; `test_kazda_mutacja_wskazuje_bramke_albo_jest_kontrolna`
tego pilnuje, a `test_kazda_mutacja_jest_uzyta_przez_jakies_twierdzenie` domyka pętlę od
strony manifestu.

### J.5 Aktualność mutacji

`test_wzorzec_mutacji_wystepuje_w_zrodle` sprawdza dla **każdej** mutacji, że jej wzorzec
występuje w dzisiejszym źródle i że podmiana faktycznie zmienia AST. Mutacja opisująca
kod, którego już nie ma, jest martwym dowodem — i ta reguła zadziałała natychmiast:
mutacja M14 przestała pasować po naprawie F-7 (zmienił się kształt wywołania
`zbuduj_maszyne_klasyczna`) i została zaktualizowana, zamiast cicho „przechodzić".

---

## K. MANIFEST DOWODÓW I POZIOMY (§35–§36)

`manifest.py` zapisuje dziesięć twierdzeń jako **dane** — każde z równaniem, wyrocznią,
wzorcem, testami, mutacjami, bramką CI, zakresem ważności i poziomem.

**Kontrakt L5 — siedem elementów, brak jednego cofa poziom:** (1) jawne równanie,
(2) niezależna wyrocznia, (3) wersjonowany wzorzec, (4) mutacja falsyfikująca,
(5) odtworzenie z czystego klonu, (6) wykonanie w bramce, (7) jawny zakres ważności.

| ID | Zdolność | Poziom | Uzasadnienie poziomu |
|---|---|---|---|
| D-01 | równanie wahań (postać mocowa) | **L5** | komplet |
| D-02 | zmiana bazy: bezwładność w górę, impedancja w dół | **L5** | komplet; G6 bitowo identyczna |
| D-03 | częstotliwość węzłowa z fazora | **L5** | komplet; błąd = 1 ulp(50 Hz) |
| D-04 | czas krytyczny zwarcia | **L5** | komplet; dwie drogi wyroczni |
| D-05 | niezmienniki energii | **L5** | komplet |
| D-06 | reinicjalizacja po zdarzeniu | **L5** | komplet |
| D-07 | fail-closed: brak rozwiązania → odmowa nazwana | **L5** | komplet |
| D-08 | warunek istnienia `H > 0` | **L4** | **brak mutacji falsyfikującej** — usunięcie warunku nie zmienia żadnego przebiegu (to właśnie czyniło F-7 niewidocznym). Dowodem jest zamiatanie wartości `H`, nie różnica trajektorii. |
| D-09 | zgodność z ANDES i przyczyna różnicy | **L4** | **brak punktu (6)** — ANDES nie jest zależnością produkcyjną, więc dowód nie biegnie w bramce obowiązkowej każdego PR, tylko w jobie `andes-cross-validation` |
| D-10 | determinizm biegu między procesami | **L4** | brak mutacji falsyfikującej (iniekcja niedeterminizmu wymagałaby zmiany typu kolekcji) |

`test_manifest.py` (42 testy) egzekwuje: unikalność identyfikatorów, **istnienie**
każdego wskazanego pliku i testu, przynależność każdej mutacji do zamkniętego zestawu,
komplet siedmiu elementów przy L5, **obowiązek uzasadnienia** przy poziomie niższym
oraz zakaz przyznania L5 twierdzeniu opartemu na wyroczni spoza bramki obowiązkowej.

**Trzy L4 są deklaracją świadomą, nie zaniedbaniem.** Żadnego z nich nie da się podnieść
do L5 bez zmiany, której mandat §38 zakazuje (wprowadzenie ANDES do zależności
produkcyjnych) albo która byłaby sztuczna (mutacja „usuwam warunek, którego usunięcie
nic nie zmienia" jest z definicji nieważna w sensie §24).

### J.6 Wynik pełnego zestawu — i defekt harnessu, który sam ujawnił

Pierwszy pełny bieg dał **10 zabitych, 1 PRZEŻYŁA (M18), 1 NIEWAŻNA (M21 — kontrolna,
zgodnie z projektem)**.

**M18 przeżyła i była to prawdziwa luka — ale nie w rdzeniu, tylko w harnessie.**
M18 wyłącza bramkę fail-closed częstotliwości (`if |V| <= u_V` → `if False`). Jej
deklarowanym detektorem był **test jednostkowy**, bo — jak ustaliła runda 9 — stan
`|V| ≤ u_V` jest **nieosiągalny z poziomu biegu** (rdzeń odmawia wcześniej przy
zapadzie), więc żadna bramka fizyczna go nie złapie. Harness umiał wtedy uruchamiać
wyłącznie bramki.

Dołożenie detektora testowego **nie wystarczyło** — M18 nadal przeżywała. Przyczyna
okazała się poważniejsza:

> `tests/conftest.py` wstawia **swój** katalog `src` na **początek** `sys.path`
> (`sys.path.insert(0, Path(__file__).parents[1] / "src")`). Lustro obejmowało sam
> `src`, a pytest biegł w prawdziwym drzewie — więc **prawdziwe źródła przesłaniały
> zmutowane** i mutacja nie miała żadnego skutku. Harness meldowałby „PRZEŻYŁA" dla
> defektu, **którego w ogóle nie wstrzyknął**.

To jest dokładnie klasa błędu, przed którą ostrzega §24: harness produkujący fałszywy
obraz. Naprawa: lustro obejmuje **cały backend** (`src` + `tests` + `pyproject.toml`),
a biegi idą z katalogiem roboczym w lustrze. Po naprawie M18 jest **ZABITA**.

Wniosek metodyczny: **mutacja, która przeżyła, była cenniejsza niż dziesięć zabitych** —
zabite potwierdziły to, co już wiedziałem; ta jedna pokazała, że mechanizm izolacji
harnessu był dziurawy, a więc że część „zabić" mogła być przypadkowa. Po naprawie
wszystkie zabicia są zabiciami zmutowanego kodu, a nie oryginału.

Przy okazji zawężono deklarowane detektory M12 i M13 do **zmierzonych** (G2 i G4);
poprzednio wymieniały też G3 i G10, które w tym scenariuszu nie zadziałały. Deklaracja
detektora ma opisywać pomiar, nie oczekiwanie.

### J.7 Wynik po naprawie harnessu

| Werdykt | Mutacje |
|---|---|
| **ZABITA** | M10, M11, M12, M13, M14, M15, M16, M17, **M18**, M19, M20 — **11 z 11** |
| **MUTACJA NIEWAŻNA** | M21 (kontrolna — zgodnie z projektem) |
| **PRZEŻYŁA** | **brak** |
| **BEZ ZMIANY TEKSTU** | brak |

Faktyczne detektory (nie deklarowane — zmierzone):

| Mutacja | Detektor, który zaczerwienił |
|---|---|
| M10 | G12 (dodatni przyrost energii) + G4 (tłumienie) |
| M11 | **wyjątek**: `dynamika.inicjalizacja_niezbiezna`, `‖f‖ = 0,22857142857142856` — odwrócony znak `P_e` łamie równowagę punktu pracy już przy inicjalizacji (`2·P_m/(2H) = 1,6/7`) |
| M12, M13 | G2 (częstotliwość modu) + G4 (tłumienie) |
| M14, M15 | G6 (inna baza urządzenia) |
| M16, M17 | G7 (częstotliwość węzłowa) |
| M18 | `test_granica_dostepnosci_jest_fail_closed` — **test jednostkowy, nie bramka** |
| M19 | G13 (wyspa bez źródła) |
| M20 | G5 (czas zdarzenia) |

M11 jest przykładem zabicia **przez odmowę**, nie przez próg: rdzeń nie dopuszcza do
biegu punktu pracy, który nie jest równowagą. To jest zabicie mocniejsze od przekroczenia
progu — defekt nie ma nawet szansy wytworzyć przebiegu.

---

## L. TEST CZYSTEGO KLONU (§34)

Mandat żąda odtworzenia bez plików sesji, bez `.claude`, bez niewersjonowanych
skryptów i bez ręcznego kopiowania danych. Wykonano:

```bash
git clone --no-hardlinks --single-branch --branch claude/r10-evidence <repo> /tmp/czysty_klon
cd /tmp/czysty_klon/mv-design-pro/backend
python -m tests.walidacja_fizyczna.uruchom
```

Klon zawiera `.codex-backups`, `.codex-screenshots`, `.git`, `.github`, `docs`,
`mv-design-pro` — **nie zawiera** katalogu `.claude` ani żadnego pliku sesji.
HEAD klonu: `ff613b16`.

| Krok | Wynik |
|---|---|
| blokada środowiska | Python 3.11.15, numpy 1.26.4, scipy 1.17.0, `brakujace: []`, wyrocznia zewnętrzna: **niedostępna** (jawnie zaraportowane) |
| manifest dowodów | **42 passed** |
| bramki fizyczne G1–G13 | **12 passed** w 334,04 s |
| obserwable, zdarzenia, odporność, mutacje | **209 passed** w 118,74 s |
| **WERDYKT** | **WALIDACJA WYKONANA**, `kroki_nieudane: []` |

To jest dowód, którego żądał §34: **kluczowy wynik odtwarza się z czystego klonu jednym
udokumentowanym procesem**. Środowisko pochodzi z `poetry.lock`, który klon niesie;
zależności nie były w tej rundzie zmieniane.

---

## M. BRAMKA CI (§33)

Aparat dowodowy leży w `tests/`, więc **obowiązkowy** job `pytest` w
`.github/workflows/python-tests.yml` (`poetry run pytest -q -m "not pandapower and not
andes"`) wykonuje go przy **każdym** PR — bramki, obserwable, zdarzenia, odporność
numeryczna, samokontrola harnessu mutacji i trzy szybkie zabicia. Koszt: +~9 min.

Dołożone w tej rundzie:

| Job | Co robi | Limit |
|---|---|---|
| `mutacje-dynamiki` (nowy) | **pełny** zestaw M10–M21 + uruchomienie aparatu z jednego wejścia; job pada, gdy którakolwiek mutacja `PRZEŻYŁA` albo `BEZ ZMIANY TEKSTU` | 45 min |
| `andes-cross-validation` (limit podniesiony 20 → 45 min) | dodatkowo eksperyment ε → τ (`pytest -q -m andes tests` zbiera nowy moduł automatycznie) | 45 min |

**Świadomy podział.** L5 nie opiera się na workflow, którego nikt nie uruchamia:
wszystkie twierdzenia L5 (D-01…D-07) mają dowód w bramce **obowiązkowej**. Jedyne
twierdzenie zależne od joba nieobowiązkowego — D-09, wyrocznia zewnętrzna — ma z tego
powodu poziom **L4**, i manifest to egzekwuje testem
(`test_poziom_l5_ma_komplet_dowodu` odrzuca L5 przy `wymaga_wyroczni_zewnetrznej`).

---

## U. A1/K1 — NIEREGRESJA (§32, GATE G)

Mandat żąda **uruchomienia testu**, nie powołania się na dokumentację.

```
pytest -m "not pandapower and not andes" \
  tests/golden/parytet_benchmarkow \
  tests/network_model/test_blizniaki_pf_zbieznosc.py \
  tests/network_model/test_blizniaki_matpower_napiecia.py \
  tests/golden/wyrocznie \
  tests/test_power_flow_v2.py
```

**Wynik: 52 passed, 30 deselected, 0 failed** (12,17 s). Deselekcje to wyłącznie testy
oznaczone markerem `pandapower`, które z architektury biegną w izolowanym jobie
(`pandapower-cross-validation`) — nie są pominięciem, tylko jawnym rozdziałem środowisk.

Parytet benchmarków (w tym IEEE case14 i przełączenia PV→PQ) oraz bliźniaki
MATPOWER/pandapower są **nietknięte**. Zgodne z §R: żaden plik danych złotych nie
został w tej rundzie zmieniony.

---

## V. REGRESJA — ROZDZIELONA, NIE ZSUMOWANA (§40)

| Zestaw | Polecenie | Wynik |
|---|---|---|
| **Regresja istniejąca (backend)** | `pytest -q -m "not pandapower and not andes"` | **16 682 passed · 37 deselected** (1870 s); w pierwszym biegu **1 failed** — patrz niżej |
| **Pakiet dynamiki (po naprawie F-8)** | `pytest tests/network_model/dynamika …` | **429 passed · 3 deselected** — identycznie z linią bazową rundy 9 |
| **Pakiet dynamiki + aparat (po F-5)** | `pytest … tests/test_environment.py` | **461 passed · 3 deselected** |
| **Nowa walidacja R10 — bramki** | `pytest tests/walidacja_fizyczna/test_bramki.py` | **12 passed** (331,88 s) |
| **Nowa walidacja R10 — reszta** | `pytest tests/walidacja_fizyczna -m "not andes"` (bez bramek) | **251 passed · 4 deselected · 0 skipped** (122 s) |
| **Pełny zestaw mutacji** | `python -m tests.walidacja_fizyczna.mutacje` | **11 ZABITYCH · 0 PRZEŻYŁO · 1 NIEWAŻNA (kontrolna)** |
| **Zestaw ANDES** | `python -m …andes.eksperyment_eps_tau` (środowisko wyroczni) | **22 pomiary**, werdykt **PROVEN** |
| **A1/K1 nieregresja** | patrz §U | **52 passed · 30 deselected** |
| **Test czystego klonu** | `python -m tests.walidacja_fizyczna.uruchom` | **263 passed**, `WALIDACJA WYKONANA` |
| **Lint / format** | `ruff check`, `black --check` na dotkniętych plikach | **czysto** |
| Zestaw pandapower | — | **nietknięty** (marker, osobny job) |
| Frontend (vitest) · E2E | — | **nietknięty** — ta runda nie dotyka frontendu |

### V.1 Jedyna porażka pełnej regresji — i co z niej wynika

Pierwszy pełny bieg dał **1 failed**:
`tests/ci/test_jedna_tozsamosc_modulow.py::test_test_zdejmujacy_moduly_z_sys_modules_musi_je_oddac`.

Przyczyna: **mój** nowy `test_bramka_zaleznosci.py` zawierał w treści generowanego
`sitecustomize.py` pętlę `del sys.modules[...]`. Bramka KD-10 skanuje pliki testowe
**tekstowo** i wymaga, żeby kto zdejmuje moduł, ten go oddał.

Rozstrzygnięcie **nie polegało na obejściu bramki**: pętla była **martwa**.
`sitecustomize` ładuje się przy starcie interpretera, czyli **zanim** cokolwiek
zaimportuje ukrywany pakiet — nie było więc czego zdejmować. Pętla została usunięta
jako martwy kod, a nie ukryta przed skanem. Obie bramki po naprawie zielone.

To jest ilustracja reguły, którą ta runda stosuje do siebie samej: **pełna regresja
znalazła defekt w aparacie dowodowym, nie w produkcie** — i tak jest zaraportowana.

---

## W. CI NA DOKŁADNYM SHA (§41)

Kod tej rundy został wypchnięty na gałąź `claude/mv-design-pro-twin-audit-u4lhy0`
(fast-forward z `5770464c`). Wymagane workflow'y na dokładnym SHA końcowym:

| Workflow | Rola dla tej rundy |
|---|---|
| **Python tests** (job `pytest`) | wykonuje **cały aparat dowodowy** — bramki G1–G13, obserwable, zdarzenia, odporność numeryczna, samokontrola mutacji, cztery szybkie zabicia |
| **Python tests** (job `mutacje-dynamiki`, nowy) | pełny zestaw M10–M21; pada przy `PRZEŻYŁA` lub `BEZ ZMIANY TEKSTU`; dodatkowo uruchamia aparat z jednego wejścia |
| **Python tests** (job `andes-cross-validation`) | eksperyment ε → τ jako bramka (marker `andes`) |
| **Python tests** (job `pandapower-cross-validation`) | nietknięty |
| **Python tests** (job `postgres-dialect`) | nietknięty |
| Frontend checks · SLD Determinism · Docs Guard · Architecture & Repo Hygiene · P0 Extended Guards · Physics Label Guard · Frontend E2E smoke · Frontend E2E full | bez zmian (ta runda nie dotyka frontendu) |

**Stan na chwilę zamknięcia raportu:** przebieg CI na SHA końcowym jest uruchomiony i
**jeszcze się nie zakończył**. Werdykty §P są wystawione na podstawie pomiarów
lokalnych (w tym testu czystego klonu), a **nie** na podstawie zielonego CI z commita
rodzica — tego mandat zakazuje wprost. Zgodność CI z pomiarem lokalnym musi być
sprawdzona na tym samym SHA przed odbiorem; jeśli którykolwiek job wypadnie czerwono,
werdykt §P wymaga korekty, a nie obrony.

---

## N. ZAMKNIĘCIE F-1 … F-8 (§43)

| ID | Odtworzony | Przyczyna źródłowa | Naprawa | Test wykonywalny | Mutacja | CI | Status |
|---|---|---|---|---|---|---|---|
| **F-1** ślepy punkt bazy urządzenia | TAK (runda 9) | wzorzec SMIB miał `s_n_mva = S_BAZOWA`, mnożnik 1,0 czynił błąd kierunku niewidocznym | `stanowisko.zbuduj(s_n_mva=…)` z odwróceniem przeliczeń; bramka G6 na bazie 50 MVA | `test_bramki.py::test_g6_inna_baza_urzadzenia` | M14, M15 | job `pytest` | **CLOSED** — okres modu **bitowo identyczny** w obu bazach |
| **F-2 … F-4** (runda 9: bez otwartych pozycji) | — | — | — | — | — | — | **NOT APPLICABLE** |
| **F-5** ciche odznaczenie przy braku zależności | TAK (§7) | `pytest_ignore_collect` pomijał drzewo i kończył kodem 0; strażnik znikał razem z nim | `pytest_configure` → `UsageError`, kod 4; lista ośmiu zależności głównych | `test_bramka_zaleznosci.py` (5 testów, mutacja środowiska ×3) | mutacja środowiska (ukrycie pakietu) | job `pytest` | **CLOSED** |
| **F-6** (runda 9: zamknięty) | — | — | — | — | — | — | **NOT APPLICABLE** |
| **F-7** brak warunku `H > 0` | TAK (§11) | brak walidacji; defekt niewidoczny w przebiegu, bo przy `P_m = P_e` znak `H` nie ma na co zadziałać | `konwencje.sprawdz_stala_bezwladnosci` w **obu** rodzinach maszyn | `test_odpornosc_numeryczna.py` (9 wartości `H`) | brak — **z powodu merytorycznego** (usunięcie warunku nie zmienia przebiegu; taka mutacja byłaby NIEWAŻNA w sensie §24) | job `pytest` | **CLOSED**, twierdzenie D-08 na **L4** z jawnym uzasadnieniem |
| **F-8** wyspa bez źródła | TAK (§8) — **i ESKALOWANY**: drugi tryb awarii („zbieżność" przy \|V\| = 1,374·10¹¹ pu) nie był w rundzie 9 zbadany | norma residuum `\|S\|/\|V\|` nie jest świadectwem ważności; brak warunku **istnienia** punktu pracy | `wyspy.py` — rozkład na wyspy + predykat mierzony z równań urządzenia, **przed** Newtonem; kod `dynamika.wyspa_bez_zrodla` | `test_bramki.py::test_g13_wyspa_bez_zrodla`, `test_odpornosc_numeryczna.py` | **M19** | job `pytest` + `mutacje-dynamiki` | **CLOSED** |

**Korekta własnej oceny.** W rundzie 9 zakwalifikowałem F-8 jako P1-ODMOWA z
komentarzem „fizyka nie jest zła, zły jest mechanizm odmowy". Ta ocena była **za
łagodna** i została wystawiona po zbadaniu wyłącznie ścieżki, która się przewracała.
Przy nastawach roboczych rdzeń zwracał wynik — skończony, z residuum poniżej
tolerancji, fizycznie absurdalny. To jest defekt **fizyki**, nie mechanizmu odmowy.

---

## O. ZAMKNIĘCIE ZNALEZISK RECENZENTA (§44)

Znaleziska traktowane jako **hipotezy do odtworzenia**, nie jako ustalenia.

| ID | Treść | Odtworzenie | Rozstrzygnięcie | Status |
|---|---|---|---|---|
| **P1-DELTA-44 / F-5** | brak zależności może cicho wyłączyć testy | **POTWIERDZONE** — „681 deselected", kod 0, strażnik odznaczony razem z drzewem | naprawione; mutacja środowiska jest testem | **CLOSED** |
| **P1-DELTA-45** | komparator ANDES może przyjmować niepełne pokrycie czasu | **POTWIERDZONE** — warunek brzmiał „co najmniej jedna próbka", a `numpy.interp` **przytrzymuje** skrajną wartość zamiast zgłaszać błąd | `porownaj_trajektorie` mierzy pokrycie i **odrzuca** niepełne; mutacja urwania → czerwone | **CLOSED** |
| **P1-DELTA-46** | aparat rundy 9 (L5) nie jest wersjonowany | **POTWIERDZONE** — cały aparat żył w katalogu sesji | `tests/walidacja_fizyczna/` w repo, w CI, z testem czystego klonu | **CLOSED** |
| **P1-DELTA-47** | dowód przyczynowy `τ = ε/2` jest niewystarczający | **POTWIERDZONE, I WIĘCEJ** — hipoteza była nie tylko słabo udowodniona, ale **NIEPEŁNA**: łamie się dla `ε > dt` | postać ostateczna `τ* = min(ε,dt)/2` udowodniona na 22 pomiarach (2,56 % wobec 69 % dla postaci wyjściowej), mechanizm potwierdzony kryminalistycznie | **CLOSED** |
| **P1-DELTA-48** | surowy `OverflowError` dla wyspy bez źródła | **POTWIERDZONE, I ESKALOWANE** — drugi tryb awarii jest groźniejszy od zgłoszonego | naprawa strukturalna (patrz §C) | **CLOSED** |

Żadne znalezisko nie zostało zamknięte **edycją tekstu raportu**. Każde ma naprawę w
kodzie i test, który czerwienieje po jej cofnięciu.

---

## P. WERDYKTY BRAMEK A–G (§42)

### GATE A — W6-F CORE (równanie wahań, algebra sieciowa, całkowanie, zdarzenia)

**ACCEPTED DONE** w zakresie zadeklarowanym w manifeście (D-01, D-05, D-06).

Podstawa: G1 = 0,0 dokładnie · G2 = 2,11·10⁻⁶ · G3 = **3,18·10⁻¹⁶** · G4 = 1,79·10⁻⁶
· G5 = 0,0 dokładnie · G9 = 2,09·10⁻¹² · G11 = 3,00·10⁻¹³ · G12 = **−3,45·10⁻¹⁶**
(brak jakiegokolwiek dodatniego przyrostu energii). Mutacje M10–M13 zabijane.
Zakres ważności: maszyna 2. rzędu bez regulatorów, sieć bezstratna, zwarcia symetryczne.

### GATE B — BUS FREQUENCY

**ACCEPTED DONE, poziom L5.**

Błąd opublikowanego `f_hz` wobec **dokładnej pochodnej analitycznej** liczonej z
własnej macierzy `Y` wyroczni: **7,105427357601002·10⁻¹⁵ Hz = dokładnie `math.ulp(50.0)`**.
Do tego 150 testów jednostkowych tożsamości: niezależność od kąta (w tym `θ = π`),
niezależność od tempa zmiany **modułu** (BF-2), niezmienniczość cechowania
(`V → V·e^{jφ₀}`), jednorodność stopnia 0 (`V → kV`), monotoniczny wzrost raportowanej
niepewności z głębokością zapadu, fail-closed przy `|V| ≤ u_V`. Mutacje M16, M17 zabijane.

### GATE C — CCT

**ACCEPTED DONE, poziom L5.**

Trzy niezależne drogi: kwadratura równych pól (po kącie), bisekcja po trajektoriach
(po czasie, DOP853 i Radau), produkt (trapez niejawny). Dwie drogi wyroczni zgadzają
się do **1,43·10⁻¹⁰ s**; produkt odbiega o **2,04·10⁻⁶ s**, poniżej rozdzielczości
własnej bisekcji. Niedomknięcie pól: −1,11·10⁻¹⁶.

Stabilność klasyfikacji (dodatkowe pytanie recenzenta): `t_CCT` zmierzony przy
**trzech** horyzontach (3 / 6 / 12 s) i **dwóch** definicjach utraty synchronizmu
(przekroczenie `δ_u` przy `ω > 1` oraz rozbieganie kąta o `2π`) — wszystkie sześć
kombinacji dają tę samą wartość w granicach rozdzielczości bisekcji (1,5·10⁻⁹ s).
Czas krytyczny **nie jest artefaktem progu klasyfikacji**.

### GATE D — ANDES CAUSAL CLAIM

**PROVEN** — dla postaci ostatecznej `τ* = min(ε, dt)/2`.
**Hipoteza wyjściowa rundy 9 (`τ = ε/2`): NIEPEŁNA** — prawdziwa wyłącznie dla `ε < dt`.

Rozstrzygnięcie na 22 pomiarach: postać ostateczna trafia z dokładnością **2,56 %**,
postać wyjściowa myli się o **69,0 %** na zamiataniu `dt` przekraczającym punkt
załamania. Mechanizm potwierdzony kryminalistycznie (próbka ANDES w chwili zdarzenia =
stan sprzed zdarzenia) i odczytany ze źródła (`itm_step → dae.store → do_switch`).

### GATE E — FAIL-CLOSED

**ACCEPTED DONE.**

Macierz przypadków granicznych (15 pozycji, §26): każdy kończy się **wynikiem
skończonym** albo **odmową nazwaną** z zamkniętego rejestru. Zero surowych wyjątków,
zero `NaN`/`Inf` w wyniku, zero cichych wyników nominalnych. Test
`test_macierz_zawiera_oba_rodzaje_koncow` pilnuje, żeby macierz **rozróżniała** — rdzeń
odmawiający wszystkiego przeszedłby pierwszy warunek i byłby defektem po drugiej stronie.

Trzy pozycje tej macierzy były realnymi defektami tej rundy: wyspa bez źródła (F-8),
`H ≤ 0` (F-7), źródło napięciowe o zerowej impedancji (surowy `ValueError` bez kodu —
skonwertowany na odmowę nazwaną razem z trzema miejscami kontroli bazy mocy).

### GATE F — EVIDENCE REPRODUCIBILITY

**ACCEPTED DONE.**

Czysty klon → `python -m tests.walidacja_fizyczna.uruchom` → `WALIDACJA WYKONANA`.
Aparat w repozytorium (16 plików), w bramce obowiązkowej CI, z manifestem, którego
każda pozycja jest konfrontowana z repozytorium testem.

### GATE G — A1/K1 NON-REGRESSION

**ACCEPTED DONE** — patrz §Q (pomiar, nie dokumentacja).

---

## R. KRYMINALISTYKA DANYCH ZŁOTYCH (§31)

Reguła mandatu: dane złote pozostają nietknięte, chyba że niezależny dowód fizyczny
wymaga inaczej; zakazana jest sekwencja „test padł → regeneruję → zielono".

**Pomiar `git diff --stat 5770464c..ff613b16 -- '*golden*' '*fixtur*' '*zlot*' '*.json'`:
WYNIK PUSTY.** Zero plików danych złotych, zero fikstur, zero zapisanych skrótów
zostało w tej rundzie dotkniętych. Cała zmiana obejmuje 31 plików:

| Rodzaj | Liczba |
|---|---|
| nowy moduł produktu (`wyspy.py`) | 1 |
| zmodyfikowane moduły rdzenia dynamiki | 7 |
| zmodyfikowane pliki testowe (`conftest`, `test_environment`, wyrocznia ANDES) | 3 |
| nowe pliki aparatu dowodowego | 19 |
| workflow CI | 1 |

Żaden istniejący wynik liczbowy nie został przestawiony: regresja pakietu dynamiki po
naprawie F-8 dała **429 passed, 3 deselected** — wartość identyczną z linią bazową
rundy 9 sprzed zmiany.

---

## S. OD-11 / OD-12 (§30)

Mandat: **nie naprawiać automatycznie**; potwierdzić wyłącznie brak pogorszenia i brak
przeklasyfikowania; w przeciwnym razie zostawić OPEN.

OD-11 i OD-12 pozostają **OPEN, bez zmiany klasyfikacji**. Żadna zmiana tej rundy nie
dotyka ścieżek, których one dotyczą; w szczególności żaden wynik liczbowy rozpływu ani
zwarć nie został przestawiony (patrz §R). Nie wykonano na nich żadnej naprawy ani
żadnej ponownej oceny — zgodnie z mandatem.

---

## T. CZEGO NIE ZROBIŁEM I DLACZEGO

Uczciwa lista — bez niej raport byłby niepełny.

1. **Nie podniosłem D-08, D-09, D-10 do L5.** Powody są merytoryczne i zapisane w
   manifeście: D-08 nie ma mutacji falsyfikującej, bo usunięcie warunku `H > 0` nie
   zmienia żadnego przebiegu (to dokładnie czyniło F-7 niewidocznym); D-09 opiera się
   na wyroczni spoza zależności produkcyjnych, więc jego bramka nie jest bramką
   obowiązkową; D-10 nie ma mutacji, bo iniekcja niedeterminizmu wymagałaby zmiany typu
   kolekcji w rdzeniu. Podniesienie któregokolwiek wymagałoby albo zmiany zakazanej
   przez §38, albo mutacji, która byłaby NIEWAŻNA w sensie §24 — czyli fikcji.

2. **Nie rozszerzyłem zakresu** (§38): zero W6-B, zero W6-C, zero nowych modeli
   regulatorów, zero maszyn wyższego rzędu, zero dynamiki niesymetrycznej, zero EMT,
   zero zmian UI.

3. **Regresja BESS (§25) nie została dołożona jako osobny wzorzec.** Powód: wymóg
   „baza urządzenia ≠ baza systemu" jest w tej rundzie spełniony **mocniej** i na
   ścieżce, która realnie broni fizyki — bramka G6 przepuszcza tę samą maszynę przez
   bazę 50 MVA i wymaga **bitowo identycznego** modu, a mutacje M14/M15 odwracają
   kierunek obu przeliczeń i giną na niej. Istniejąca biblioteka urządzeń testowych
   pracuje przy tym na bazach 30/40/30 MVA wobec bazy układu 100 MVA, więc tor
   przeliczenia jest wykonywany także poza wzorcem SMIB. Dołożenie osobnego wzorca
   magazynu powtarzałoby ten sam dowód na innym urządzeniu, nie dodając klasy błędu.
   **To jest świadome zawężenie, nie przeoczenie** — i jako takie podlega ocenie
   właściciela.

4. **Nie zmieniłem wzorca `uklady.zbuduj_smib`** (`s_n_mva = S_BAZOWA_MVA`). Jest
   używany przez cały pakiet testów dynamiki; przeliczenie w tę i z powrotem różni się
   w ostatnich bitach (pomiar: `H = 3.4999999999999996` dla bazy 30 MVA), więc zmiana
   przestawiłaby oczekiwania bitowe wielu testów **bez zysku dowodowego** — ślepy punkt
   zamyka G6 na osobnym wzorcu.

5. **Wyspa martwa bez odbioru** (`V = 0` jako rozwiązanie fizyczne) nie jest przez ten
   rdzeń reprezentowana i kończy się osobliwym jakobianem oraz odmową
   `dynamika.algebra_niezbiezna`. Jest to **jawnie zapisane w zakresie ważności
   twierdzenia D-07**, a nie ukryte. Naprawa wymagałaby decyzji modelowej (co znaczy
   „węzeł bez napięcia" dla obserwabli i dla odbioru o stałej mocy), czyli rozszerzenia
   zakresu — zakazanego w tej rundzie.

---

## Z. TRZYNAŚCIE WARUNKÓW ACCEPTED DONE (§46)

| # | Warunek | Stan | Dowód |
|---|---|---|---|
| 1 | Kluczowe twierdzenia odtwarzalne z czystego klonu | **SPEŁNIONY** | §L — `WALIDACJA WYKONANA`, 263 testy |
| 2 | Aparat dowodowy wersjonowany | **SPEŁNIONY** | 19 nowych plików w `tests/walidacja_fizyczna/` |
| 3 | Brak zależności = porażka walidacji, nie odznaczenie | **SPEŁNIONY** | §D — mutacja środowiska ×3, kod ≠ 0, zero „deselected" |
| 4 | F-8 naprawiony fizycznie, nie wyjątkiem | **SPEŁNIONY** | §C — `wyspy.py`, predykat z równań, odmowa przed Newtonem |
| 5 | Zapora numeryczna: brak surowych wyjątków i NaN/Inf | **SPEŁNIONY** | §P GATE E — macierz 15 przypadków |
| 6 | Niezmiennik `H > 0` w rdzeniu | **SPEŁNIONY** | §E — obie rodziny maszyn, 9 wartości `H` |
| 7 | Eksperyment ε → τ rozstrzygnięty | **SPEŁNIONY** | §G — PROVEN, 22 pomiary, hipoteza wyjściowa obalona jako niepełna |
| 8 | Komparator wyroczni odrzuca niepełne pokrycie | **SPEŁNIONY** | §F — mutacja urwania → czerwone |
| 9 | Niezależna wyrocznia CCT (nie implementacja produktu) | **SPEŁNIONY** | §I.2 — dwie drogi, zgodność 1,43·10⁻¹⁰ s |
| 10 | Harness mutacji z samokontrolą | **SPEŁNIONY** | §J — M21 kwalifikowana jako NIEWAŻNA przez porównanie AST |
| 11 | Manifest dowodów per twierdzenie | **SPEŁNIONY** | §K — 10 twierdzeń, 42 testy egzekwujące |
| 12 | Bramka CI wykonująca dowód z repo | **SPEŁNIONY** | §M — job obowiązkowy + `mutacje-dynamiki` |
| 13 | Nic potrzebnego do odbioru poza repo; `git status` pusty | **SPEŁNIONY** | §R + §AA |

---

## AA. WERDYKT KOŃCOWY I STOP (§47–§48)

### Werdykt

> **W6-F: ACCEPTED DONE** — w zakresie zdolności D-01 … D-07 (poziom **L5**) oraz
> D-08, D-09, D-10 (poziom **L4** z jawnie nazwanym brakiem).

Podstawą tego werdyktu **nie jest** to, że liczby wyszły ładnie. Podstawą jest to, że:

* niezależny audytor może sklonować repozytorium i **wykonać ten dowód sam**
  (§L — zrobione, z pomiarem);
* mutacje **są w repozytorium**, a CI **naprawdę od nich czerwienieje**
  (§J, job `mutacje-dynamiki` pada przy `PRZEŻYŁA`);
* rozbieżność wobec wyroczni zewnętrznej ma **wyjaśnienie przyczynowe udowodnione
  skalowaniem**, a nie dopasowaną stałą (§G);
* aparat dowodowy **obalił hipotezę poprzedniej rundy** i **wykrył błąd we własnej
  wyroczni** (§I.2) — czyli działa w obie strony, a nie tylko potwierdza.

Zakres ważności jest częścią werdyktu, nie przypisem: maszyna 2. rzędu bez regulatorów,
sieć bezstratna w torach analitycznych, zwarcia symetryczne, fazor składowej zgodnej.
Poza tym zakresem twierdzenia D-01 … D-10 nie obowiązują.

### Czego ten werdykt nie obejmuje (§37)

To jest walidacja **równań modelu**, nie walidacja **urządzenia** ani dowód zgodności
regulacyjnej. Twierdzenie „zaimplementowane równanie zachowuje się tak, jak deklaruje"
jest czymś innym niż „model odwzorowuje konkretną maszynę u konkretnego wytwórcy" i
czymś jeszcze innym niż „wynik spełnia wymaganie normy". Aparat dowodzi pierwszego.

### STOP (§48)

Zgodnie z §48 **zatrzymuję się tutaj**. Bez W6-B, bez W6-C, bez rozszerzania modeli.
Otwarte pozycje przekazane właścicielowi do decyzji:

1. **Trzy twierdzenia na L4** (D-08, D-09, D-10) — czy ich podniesienie jest w ogóle
   pożądane, skoro wymagałoby albo wprowadzenia ANDES do zależności produkcyjnych, albo
   mutacji pozornych. **Moja rekomendacja: zostawić na L4** i traktować jawny brak jako
   informację, nie dług.
2. **Osobny wzorzec regresji magazynu (§25)** — zawężony świadomie (§T.3). Jeśli
   właściciel uzna, że klasa „baza urządzenia ≠ baza systemu" wymaga dowodu także na
   urządzeniu innej rodziny, jest to jedna karta wykonawcza, nie przebudowa.
3. **Wyspa martwa bez odbioru** (§T.5) — wymaga decyzji modelowej, nie naprawy.
4. **OD-11 / OD-12** — pozostają OPEN, bez zmiany klasyfikacji (§S).
