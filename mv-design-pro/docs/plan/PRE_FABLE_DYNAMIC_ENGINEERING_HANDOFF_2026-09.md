# PRE-FABLE DYNAMIC ENGINEERING HANDOFF — 2026-09

**Autor:** Claude Opus 5 (Principal Dynamic Simulation Engineer / Numerical Methods Engineer)
**Zakres:** transza kodowa §11.3 — fizyka i modele, przed powrotem Fable
**Gałąź:** `claude/max-dynamic-audit-kzbivg`
**Punkt wyjścia:** `a6ee782c` (9/9 zielonych workflowów) · `575ce826` (commit dokumentujący ten stan)

---

## 0. Zdanie, od którego trzeba zacząć

Ta transza **nie podniosła statusu dowodowego warstwy dynamicznej i nie mogła
tego zrobić**. Podniosła ODPORNOŚĆ NA FAŁSZYWY POZYTYW: zamknęła drogi, którymi
dawało się dojść do wyniku wyglądającego na dowód bez wykonania pomiaru, i
zamieniła kilka milczących braków w braki policzone i nazwane.

Stan formalny pozostaje:

| Oś | Stan | Czy zmieniony w tej transzy |
|---|---|---|
| MATHEMATICALLY VERIFIED | CZĘŚCIOWO | rozszerzony (AVR/governor/PSS wobec postaci zamkniętej i transmitancji) |
| PHYSICALLY SUPPORTED | CZĘŚCIOWO | rozszerzony (re-inicjalizacja, bazy magazynu, FRT ze śladu) |
| PHYSICALLY VALIDATED | **NIE** | **BEZ ZMIAN — i nie ma drogi, żeby to zmienić bez danych z obiektu** |
| PRODUCTION-READY | **NIE** | **BEZ ZMIAN** |
| REGULATORY-EVIDENCE-READY | **NIE** | **BEZ ZMIAN** |

Najważniejsza liczba całego dokumentu, wyliczana z rejestru (`macierz_pokrycia`):
**2 zdolności z 15 mają odniesienie o niezależności wyższej niż „ten sam autor,
te same równania"** — maszyna synchroniczna i jej regulatory, obie wobec ANDES.
Cały tor przekształtnikowy, czyli sedno produktu MV-DESIGN-PRO, opiera się
wyłącznie na odniesieniach poziomu N0.

---

## 1. Macierz zamknięcia §11.3

| Pozycja §11.3 | Stan | Dowód wykonywalny |
|---|---|---|
| 1. Re-inicjalizacja po zmianie topologii zwarciowej | **IMPLEMENTED_AND_TESTED** | `research/dynamic_lab/reinicjalizacja.py`, `tests/research/test_reinicjalizacja.py` (24 testy) |
| 2. Pełny audyt baz magazynu urządzenie↔sieć | **IMPLEMENTED_AND_TESTED** | `research/dynamic_lab/bazy_bess.py`, `tests/research/test_bazy_bess.py` (49 testów) |
| 3. Samodzielne konstruowanie evidence | **IMPLEMENTED_AND_TESTED** | `research/dynamic_lab/pomiar_zgodnosci.py`, `tests/research/test_pomiar_zgodnosci.py` (20 testów) |
| 4. FRT konsumujący realne trajektorie | **IMPLEMENTED_AND_TESTED** | `research/dynamic_lab/frt_z_biegu.py`, `tests/research/test_frt_z_biegu.py` (24 testy) |
| 5. Walidacja AVR | **IMPLEMENTED_AND_TESTED** | `tests/research/test_walidacja_regulatorow.py` |
| 6. Walidacja governora | **IMPLEMENTED_AND_TESTED** | tamże |
| 7. Walidacja PSS | **IMPLEMENTED_AND_TESTED** | tamże + `StabilizatorSystemowy` w `regulatory.py` |
| 8. Model-form risk ograniczników i nasyceń | **IMPLEMENTED_AND_TESTED** | `research/dynamic_lab/ryzyko_postaci_modelu.py` (26 pozycji), bramka kompletnosci skanem AST |
| 9. Uprząż porównania postaci modelu | **PROTOTYPED_WITH_MEASUREMENTS** | dwie strategie ogranicznika GFM z pomiarami; uogólniona uprząż dla pozostałych 10 pozycji — NIE zbudowana |
| 10. Audyt równań urządzeń przez wykonanie | **PROTOTYPED_WITH_MEASUREMENTS** | pokryty dla AVR/governor/PSS i baz magazynu; dla maszyny, falowników i DFIG — poziom W1/W2 bez systematycznego przebiegu równanie-po-równaniu |
| 11. Przypadek wielourządzeniowy | **PROTOTYPED_WITH_MEASUREMENTS** | `siec_sn_z_der` (2 falowniki + odbiór) użyta jako baza testów §4; brak dedykowanego benchmarku z pomiarem interakcji |
| 12. Przypadek wieloźródłowy / wielozdarzeniowy | **RESERVED_FOR_FABLE_DECISION** | wymaga rozstrzygnięcia, czym jest tożsamość zdarzenia przy permutacji — patrz §4 tego dokumentu |
| 13. Taksonomia klas odniesienia | **IMPLEMENTED_AND_TESTED** | oś N w `research/dynamic_lab/drabina.py` + testy |
| 14. Macierz pokrycia walidacyjnego | **IMPLEMENTED_AND_TESTED** | `research/dynamic_lab/macierz_pokrycia.py` (19 testów) |
| 15. Uprząż kwalifikacyjna — jedno polecenie | **IMPLEMENTED_AND_TESTED** | `research/kwalifikacja.py`, rozszerzona o macierz pokrycia i inwentarz ryzyka |

Kategoria **BLOCKED_BY_MISSING_EXTERNAL_REFERENCE** nie została użyta ani razu:
żadna z pozycji §11.3 nie okazała się zablokowana brakiem zewnętrznego
odniesienia. Blokadą zewnętrzną jest natomiast sam awans osi „PHYSICALLY
VALIDATED" — patrz §5.

---

## 2. Nowy kod

| Moduł | Co wnosi |
|---|---|
| `dynamic_lab/reinicjalizacja.py` (433 w.) | Re-inicjalizacja jako operacja pierwszej klasy: stany różniczkowe TRZYMANE (ciągłość strumienia, kąta, prędkości, SOC — skok wymagałby nieskończonego napięcia/momentu/mocy), algebra rozwiązana OD NOWA. Residuum KCL liczone NIEZALEŻNIE od solvera. Wycofanie topologii przy nieudanej re-inicjalizacji. |
| `dynamic_lab/bazy_bess.py` (≈250 w.) | Łańcuch baz urządzenie↔sieć w jednym miejscu; JEDEN przelicznik `s_bazowa/(3600·E)`. Niezmienniczość SOC(t) i P(t)[MW] wobec zmiany bazy mocy. |
| `dynamic_lab/pomiar_zgodnosci.py` (266 w.) | Pomiar jako obiekt niewypisywalny ręcznie: żeton tożsamościowy, przeliczalność z własnych próbek, wiązanie odciskiem scenariusza. |
| `dynamic_lab/frt_z_biegu.py` (568 w.) | Ocena FRT konsumująca `WynikDynamiczny`: kanały deklarowane per kryterium, zamknięty słownik powodów nieorzekalności, własności biegu jako warunek orzekania. |
| `dynamic_lab/ryzyko_postaci_modelu.py` (629 w.) | 26 pozycji inwentarza ograniczników z klasyfikacją ryzyka postaci; bramka kompletności skanem drzewa składni. |
| `dynamic_lab/macierz_pokrycia.py` (293 w.) | 15 zdolności × najmocniejszy dowód; „brak danych" nigdy nie daje potwierdzenia. |
| `dynamic_lab/regulatory.py` (+119 w.) | `StabilizatorSystemowy` (PSS1A: washout + 2× lead-lag) z WYPROWADZONĄ postacią stanową; wejście PSS do uchybu AVR PRZED ogranicznikiem. |
| `dynamic_lab/drabina.py` | Trzecia oś: niezależność odniesienia N0–N4. |
| `dynamic_lab/frt.py` (+43 w.) | `PrzebiegPraduWsparcia.z_mocy_biernej` — ta sama tożsamość `I_q = Q/|V|`, inne wejście, zgodność przypięta testem. |

Testy: **6 nowych plików**, ≈2 500 wierszy testów, ≈150 nowych funkcji testowych.

---

## 3. Kluczowe pomiary

**Re-inicjalizacja (§1).** `max Δx0 = 1.09421789` (stan sprzed transzy) sprowadzone
do zera z konstrukcji: stany różniczkowe są przenoszone bez zmiany. Norma `‖f‖`
po zwarciu na zaciskach wynosi **6,2496e-02** i zgadza się z postacią zamkniętą
`Pm/(2H) = 0,0625` — dlatego bramkowanie `‖f‖` jako warunku równowagi PO ZWARCIU
byłoby żądaniem, żeby zwarcie nic nie robiło. Kryterium równowagi jest opcjonalne
(`wymagaj_rownowagi=False` domyślnie).

**Kampania mutacyjna §5–§7.** 11 mutacji źródłowych, kotwice weryfikowane,
**11/11 zabitych**. Jedna (`M-AVR-05`, usunięcie rzutowania w `stan_ustalony`)
w pierwszym przebiegu **PRZEŻYŁA komplet 35 testów** — bo wszystkie startowały
z punktu pracy wewnątrz zakresu wzbudnicy. Dołożony test pokrywa obie granice
dla AVR i governora.

**Uprząż kwalifikacyjna (tryb szybki, SHA tej transzy):**

```
status_kwalifikacji:                  NIEKOMPLETNE   (tryb szybki pomija CCT i porównanie metod)
mutacje_zabite:                       13/13
najgorsza_norma_pochodnej:            8,33e-17
dowod_zewnetrzny_wykonany:            true   (ANDES TDS)
rozplyw_pandapower_wykonany:          false
zdolnosci_bez_dowodu_o_wartosci:      8/15
zdolnosci_z_wyrocznia_zewnetrzna:     2/15
walidacja_fizyczna:                   false
ograniczniki_z_niezmierzona_alternatywa: 10
```

**Inwentarz ryzyka postaci (26 pozycji):** postać wymuszona — 11; alternatywa
zmierzona — 5; **alternatywa NIEZMIERZONA — 10**; luka modelu — 1.

**Granica ważności odkryta przy okazji:** zwarcie o `x_f = 0,05` p.u. na szynie
z odbiorem stałej mocy (`P = −0,5` p.u.) **nie ma rozwiązania algebraicznego** —
model stałej mocy żąda `I = S*/V*`, więc przy zapadzie do zera prąd rośnie bez
granicy. Solver melduje brak zbieżności z residuum 1,181 przy progu 1,0e-12 i
informacją, że każdy krok zmniejszał normę (nawrót Armijo), czyli nie ma ani
rozjazdu, ani cyklu. To NIE jest defekt Newtona.

---

## 4. Co naprawdę wymaga Fable

### 4.1 Wybór postaci ogranicznika (decyzja architektoniczna, nie pomiar)

Dziesięć pozycji inwentarza ma obronną alternatywę, której różnicy NIE ZMIERZONO.
Najważniejsza: **`bess-dostepnosc-energii`** — obcięcie mocy przy krańcu SOC
wobec wygaszania liniowego w pasie i wobec histerezy. Dotyczy obszaru, w którym
magazyn pracuje w scenariuszach bilansowych. Parametrów alternatyw nie ma w
żadnej dostępnej karcie katalogowej — wpisanie ich byłoby fabrykacją, więc
pozostają jako zmierzony brak. **Decyzja, czy postać ma być produktowo
rozstrzygnięta, czy pozostać konfigurowalna, należy do Fable.**

Druga w kolejności: **priorytet składowej w ograniczniku prądu** (biernej vs
czynnej, ewentualnie zmienny w czasie). Dotyczy pięciu pozycji naraz, bo reguła
jest wspólna dla wszystkich przekształtników.

### 4.2 Tożsamość zdarzenia przy permutacji (§12)

Przypadek wieloźródłowy/wielozdarzeniowy wymaga rozstrzygnięcia, **czym jest
tożsamość zdarzenia, gdy dwa zdarzenia wypadają w tej samej chwili**. Dziś
harmonogram jest listą; permutacja listy o równych czasach daje inny porządek
zastosowania, a więc potencjalnie inny wynik przy tej samej specyfikacji
fizycznej. Możliwe rozstrzygnięcia (żadne nie jest oczywiste):
porządek kanoniczny po typie zdarzenia; odrzucenie równoczesności jako
niedookreślonej; wprowadzenie jawnego priorytetu w zdarzeniu. Wybór zmienia
kontrakt tożsamości biegu, więc nie jest decyzją wykonawczą.

### 4.3 Awans osi „PHYSICALLY VALIDATED" — zależność zewnętrzna

Jedyny poziom uprawniający do słowa „zwalidowane fizycznie" to
`NiezaleznoscOdniesienia.POMIAR_NA_OBIEKCIE`. W laboratorium **nie ma ani
jednego** takiego odniesienia i jest to stan faktyczny, nie zaniedbanie opisu
(przypięte `test_zaden_dowod_nie_udaje_pomiaru_na_obiekcie`). Awans wymaga
zarejestrowanych przebiegów z rzeczywistej jednostki wytwórczej — czyli danych,
których żadna praca kodowa nie wytworzy.

**Pośredni krok, którego Fable może chcieć:** podniesienie toru
przekształtnikowego z N0 do N1 przez porównanie z niezależnym narzędziem
(pandapower dla rozpływu, ANDES dla modeli przekształtnikowych, jeżeli jego
biblioteka je obejmuje). To jest praca kodowa i mieści się w kolejnej transzy —
ale wymaga decyzji, które narzędzie jest odniesieniem dla falowników.

---

## 5. Czego ta transza świadomie NIE zrobiła

1. **Nie wybrała postaci kanonicznej żadnego ogranicznika** — §9 tego zakazuje
   wprost, a inwentarz jest przygotowaniem decyzji, nie decyzją.
2. **Nie podniosła żadnego statusu dowodowego.** Uprząż kwalifikacyjna kończy
   bieg szybki statusem `NIEKOMPLETNE`, bo pominięte pomiary są meldowane jako
   pominięte — brak dowodu nie zamienia się w jego posiadanie przez to, że nic
   się nie wywaliło.
3. **Nie zbudowała uogólnionej uprzęży porównania postaci (§9)** dla dziesięciu
   pozycji z niezmierzoną alternatywą. Dla dwóch strategii ogranicznika GFM taka
   uprząż istnieje i ma pomiary; uogólnienie wymaga zaimplementowania
   alternatywnych postaci, a każda z nich jest osobnym modelem fizycznym.
4. **Nie tknęła CI ani produkcyjnego `src/`** — cała praca jest w
   `backend/research/`, odizolowana strukturalnie (`research_isolation_guard`).

## 6. Dług policzony, nie ukryty

* **21 błędów mypy w sześciu modułach `research/`** (`calkowanie.py` 12,
  `silnik.py` 8, `benchmarki.py` 8, `wzorzec_trajektoria.py` 4, `siec.py` 3,
  `walidacja.py` 1). Jedna przyczyna źródłowa powtórzona wielokrotnie: protokoły
  (`Zdarzenie`, `Integrator`, `UrzadzenieDynamiczne`) deklarują składowe jako
  zmienne modyfikowalne, a implementacje są zamrożonymi dataklasami o atrybutach
  tylko do odczytu — więc ŻADNA konkretna klasa nie przechodzi swojego protokołu
  i system typów jest dla całego laboratorium bezczynny. `research/` nie jest
  objęte bramką mypy w CI (CI liczy `mypy src`), więc nie jest to regresja CI.
  Naprawa: zadeklarować składowe protokołów jako właściwości tylko do odczytu.
  Nowe moduły tej transzy mają **0 błędów**.
* **Dziesięć ograniczników z niezmierzoną alternatywą** — wyliczone wyżej,
  wymienione imiennie w `INWENTARZ`.
