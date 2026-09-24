# Aparat dowodowy dynamiki RMS — jak go wykonać z czystego klonu

Ten katalog jest **wykonywalnym dowodem** twierdzeń, które rdzeń dynamiki
(`src/network_model/solvers/dynamika/**`) stawia o swojej fizyce. Jeżeli czegoś
nie da się tu uruchomić i zobaczyć na własne oczy, to nie jest to dowód.

## Jedno polecenie

```bash
cd mv-design-pro/backend
poetry install --with dev
poetry run python -m tests.walidacja_fizyczna.uruchom
```

Kod wyjścia `0` = walidacja wykonana i zielona. Kod `2` = **walidacji nie
wykonano**, bo brakuje zależności obowiązkowej (to nie jest to samo co „zielona").
Kod `1` = walidacja wykonana i **czerwona**.

## Co jest czym

| Plik | Rola |
|---|---|
| `wyrocznia.py` | **Niezależna** wyrocznia SMIB. Zero importów z `network_model.solvers.dynamika`. Własna algebra 2×2, własny integrator (`solve_ivp`), własna kwadratura czasu krytycznego. |
| `wyrocznia_zdarzen.py` | **Niezależna** wyrocznia zdarzeń topologicznych: postać zamknięta napięcia odbioru stałej mocy po ponownym zasileniu (pierwiastek wyższy i niższy) oraz spójność grafu stanu t⁺ w `networkx` (predykat izolacji). Zero importów z rdzenia (przypięte w `test_manifest.py`). |
| `wyrocznia_pradow.py` | **Niezależna** gęsta algebra sieci liniowej: gałęzie pi, boczniki, źródła Nortona, węzły uziemione wprost; zwarcie w linii x·L z JAWNYM węzłem wewnętrznym (bez redukcji Krona). Zero importów z rdzenia. |
| `wyrocznia_fazorow.py` | **Niezależna** superpozycja Thevenina: stan po zwarciu z KOLUMNY macierzy impedancyjnej sieci zdrowej (bez składania sieci zwartej), gałęzie pi z przekładnią zespoloną po stronie `od` (konwencja W6-A §7.2). Zero importów z rdzenia. |
| `stanowisko.py` | Ten sam układ liczony **produktem**. `szereg`/`czas` wymagają JAWNEJ strony próbek (`C`/`L`/`P`; `SIATKA_PRAWOSTRONNA = "CP"` odtwarza dawną siatkę) i odmawiają zamiany `None` na NaN. Parametry podane jawnie po obu stronach — nic nie jest importowane z wyroczni do stanowiska ani odwrotnie. |
| `bramki.py` | Bramki fizyczne G1–G13 oraz bramka G16 (zwarcie w linii x·L, fazory prądów gałęzi, parytet IEC 60909), bramka G17, bramka G19 i bramka G20 z progami **wyprowadzonymi**, nie dobranymi. Uzasadnienie każdego progu stoi przy nim. |
| `manifest.py` | Rejestr twierdzeń: równanie · wyrocznia · wzorzec · mutacja · test · bramka · zakres ważności · poziom dowodu. |
| `mutacje.py` | Harness mutacji: wstrzyknięcie defektu fizycznego w **lustrze** źródeł i sprawdzenie, czy bramki je widzą. |
| `srodowisko.py` | Blokada środowiska. Brak zależności = **porażka walidacji**, nigdy odznaczenie testów. |
| `andes/` | Eksperyment wobec wyroczni **zewnętrznej** (ANDES 1.9.3) — patrz niżej. |

## Bramki fizyczne

| Bramka | Co łapie |
|---|---|
| G1 | dryf w stanie ustalonym (punkt pracy nie jest równowagą) |
| G2 / G4 | częstotliwość i tłumienie modu elektromechanicznego wobec postaci zamkniętej |
| G3 | ROCOF w chwili zwarcia wobec algebry wyroczni |
| G5 | zdarzenie wykonane w chwili **zadanej**, nie w najbliższym węźle siatki |
| G6 | kierunek zmiany bazy urządzenia (ta sama maszyna w bazie 50 MVA) |
| G7 | częstotliwość węzłowa wobec **dokładnej** pochodnej analitycznej (próbki siatki `C`); w chwilach zdarzeń `f = None` z kodem 3 w próbkach `L` i `P` |
| G8 | granica fail-closed odbioru o stałej mocy (zamiatanie głębokości zapadu, monotoniczność) |
| G9 | reinicjalizacja po zdarzeniu (`g(x⁺,y⁺) = 0`) |
| G10 | czas krytyczny wobec **dwóch** niezależnych dróg wyroczni |
| G11 / G12 | całka pierwsza przy `D = 0` i monotoniczny spadek energii przy `D > 0` |
| G13 | wyspa z odbiorem i bez źródła kończy się odmową nazwaną (poziom algebry) |
| bramka G16 (część) | zwarcie w linii x·L: napięcia zacisków, napięcie w miejscu zwarcia i prąd zwarcia z czwórnika Krona rdzenia wobec jawnego węzła wewnętrznego wyroczni (x ∈ {0,1; 0,3; 0,5; 0,85} × {R_f > 0, metaliczne}) |
| bramka G17 | obszar beznapięciowy: V = 0,0 dokładnie w węźle odciętym od t = 0; po ponownym zasileniu napięcie odbioru stałej mocy = pierwiastek WYŻSZY postaci zamkniętej |
| bramka G19 | predykat izolacji usunięcia zwarcia `izolacja` wobec spójności grafu t⁺ — wszystkie 16 podzbiorów otwieranych gałęzi pierścienia |
| bramka G16 (fazory, D-15) | moduł i kąt prądów OBU zacisków każdej gałęzi i prądu zwarcia w próbkach `L`/`P` wobec superpozycji Thevenina (`wyrocznia_fazorow`); sieć z przekładnią zespoloną, susceptancją, odbiorami jako admitancjami i maszyną; cztery miejsca zwarcia |
| bramka G16 (IEC 60909, D-15) | `I_k″` i prądy gałęzi zwarcia metalicznego wobec FROZEN `ShortCircuitIEC60909Solver` (moduł i kierunek) na sieci, w której metoda źródła zastępczego i bieg od `U = c_max` są tą samą algebrą |
| bramka G20 (D-18) | próbki obustronne: `L` wobec algebry SMIB sprzed zdarzenia, `P` — po nim, stan różniczkowy bitowo ciągły, uporządkowanie osi i `f = None` z kodem 3; zdarzenie na siatce i poza nią |

Numery bramek G14–G21 (karta AB-1b.1) piszemy zawsze z przedrostkiem „bramka", żeby nie
mylić ich z sieciami wzorcowymi G16/G17 rejestru `tests/golden/registry.py`.

## Pełny zestaw mutacji

```bash
poetry run python -m tests.walidacja_fizyczna.mutacje          # wszystkie
poetry run python -m tests.walidacja_fizyczna.mutacje M16 M17  # wybrane
```

Każda mutacja jest **kwalifikowana przed biegiem** porównaniem drzew składniowych:
zmiana bez skutku (np. w komentarzu) jest meldowana jako `MUTACJA NIEWAŻNA`,
nigdy jako zabicie. Mutacja `M21` jest kontrolna właśnie po to, żeby ta
samokontrola sama miała dowód.

## Wyrocznia zewnętrzna (ANDES)

ANDES **nie jest** zależnością produkcyjną (własny pin `scipy`), więc biegnie w
osobnym środowisku:

```bash
python -m venv /tmp/andes-venv
/tmp/andes-venv/bin/pip install "andes==1.9.3"
PYTHONPATH=src:. /tmp/andes-venv/bin/python -m tests.walidacja_fizyczna.andes.eksperyment_eps_tau
```

Eksperyment rozstrzyga, skąd bierze się przesunięcie osi czasu między rdzeniem a
ANDES: `tau* = min(eps, dt)/2`, czyli **połowa pierwszego kroku po zdarzeniu**.
Hipoteza postawiona w rundzie 9 (`tau = eps/2`) okazała się **niepełna** — prawdziwa
tylko dla `eps < dt`; zamiatanie `dt` przy stałym `eps` ją łamie i tak jest
raportowana.

## Czego ten aparat NIE dowodzi

* Nie jest walidacją **urządzenia** ani dowodem zgodności regulacyjnej. Dowodzi
  wyłącznie, że zaimplementowane **równania** zachowują się tak, jak deklarują.
* Zakres ważności każdego twierdzenia jest wypisany w `manifest.py` i jest częścią
  dowodu, nie przypisem do niego.
