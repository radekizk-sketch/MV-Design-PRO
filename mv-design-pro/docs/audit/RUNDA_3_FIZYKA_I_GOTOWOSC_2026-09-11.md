# Runda 3 — fizyka/matematyka laboratorium + rozjazd gotowości

Data: 2026-09-11 · Gałąź: `claude/opus5-dynamic-physics-audit-fixes`
Punkt wyjścia: `9349b3ed` (checkpoint rundy 2, nietknięty — historia wyłącznie dopisywana)

Dokument utrwala POMIARY, nie deklaracje. Każda liczba niżej pochodzi z
uruchomienia, nie z rozumowania; przy każdej podana jest droga odtworzenia.

---

## 1. Co zostało domknięte, z dowodem

| § | Rzecz | Pomiar PRZED | Pomiar PO |
|---|-------|--------------|-----------|
| §2 | Tożsamość biegu = pełne zagadnienie początkowe | `P_G = 0,2` i `0,9` dawały TEN SAM odcisk | odciski różne; komplet `{dyspozycja, nastawy, x0, v0}` |
| §3 | Tożsamość implementacji | wynik bez informacji, CZYM policzono | SHA-256 treści wszystkich modułów `dynamic_lab` w wyniku |
| §4 | Niezależność od historii obiektu | `U_GEN(A po B) = 0,32` vs `U_GEN(A świeży) = 1,01` p.u. | bit-identyczne przebiegi dla 4 historii |
| §5 | Inicjalizacja nie zmienia modelu | **5 z 6** klas urządzeń zmieniało odcisk po `inicjalizuj` | **0 z 6** |
| §12 | Niezmienniki stanu w biegu | `Efd ∈ [−1273,463; +431,155]` p.u. przy suficie `[0; 5]` | `[0,000; 5,000]` we wszystkich przypadkach |
| §13 | Semantyka zbieżności w wyniku | 93/410 biegów: SUKCES przy residuum ponad progiem, maks. **1249×** | trzy stany kroku w `DiagnostykaSolvera`, predykat `kazdy_krok_scisle_zbiezny` |
| §14 | Równoległość serii | brak kontroli długości — przeplot dawał serię 2× dłuższą od osi czasu | `WynikDynamiczny` odrzuca niezgodność, niemonotoniczność i kolizję tożsamości |
| §16 | Bazy względne | brak członu `(V_u/V_s)²` — **10,25 %** błędu reaktancji dla 15,75 kV na bazie 15 kV | pełny mnożnik, bazy napięciowe WYMAGANE, przeliczenie wpięte w budowę modelu |
| §17 | Niezmienniki fizyczne | brak — sprawdzano wyłącznie zbieżność | 5 praw odtwarzanych Z WYNIKU (Kirchhoff, bilans mocy, tożsamość mocy maszyny, równanie ruchu, energia magazynu) |

Odtworzenie: `cd mv-design-pro/backend && poetry run pytest tests/research -q`
→ **826 passed**, RC=0.

### Znaleziska uboczne (reguła KLASA, NIE INSTANCJA)

1. **`FalownikGFL` bez ograniczenia żądania biernej.** Statyzm Q(U) rośnie
   liniowo z odchyłką napięcia. Zmierzone na pochodnej modelu: `k_qu = 20`,
   `|V| = 1,30` p.u. → falownik `s_zn = 1,0` p.u. żąda **6,0 p.u.** mocy biernej
   (600 %). Dwie klasy siostrzane ograniczały to samo zadanie okręgiem — ten sam
   mechanizm naprawiony w dwóch klasach, pominięty w trzeciej.
2. **Ogranicznik prądu w TRZECH kopiach, jedna już rozjechana.** Gałąź
   `priorytet_biernej=False` w `FalownikGFL` skalowała cały wektor (zachowywała
   współczynnik mocy) zamiast zachować składową czynną. Dla `I = 2+2j`,
   `i_max = 1`: `(0,707; 0,707)` zamiast `(1,000; 0,000)` — **29 %** mniej mocy
   czynnej z urządzenia, któremu kazano ją utrzymać.
3. **Martwy warunek udający ochronę.** Zerowanie pochodnej na granicy
   ogranicznika nie mogło się wykonać (cel leży w przedziale), a sugerowało
   ochronę, której nie dawało.
4. **Dwa nieprawdziwe docstringi** — baza parametrów maszyny („przeliczenie
   wykonuje `ZespolSynchroniczny` przez `BazyMocy`" przy ZERO wywołań poza
   testami) i nieaktualna uwaga BESS o zbieraczu przebiegów.

---

## 2. CI — prowieniencja każdej czerwonej bramki

Stan na `e3756aa6` (przed naprawami tej rundy): 4 czerwone workflow.

| Bramka | Przyczyna | Czyja | Stan |
|--------|-----------|-------|------|
| Python tests | `BrakZbieznosciSieciError` (residuum `3,090e+00`) — wejście zagadnienia liczone PO pętli zdarzeń, na topologii pozwarciowej | **moja regresja z `e3756aa6`** | NAPRAWIONA |
| P0 Extended Guards | `ModuleNotFoundError: networkx` — workflow instalował sam `pydantic` | odziedziczona (czerwona na `main` @ `7e84753a`, `a1ab2959`) | NAPRAWIONA |
| SLD Determinism | `vitest` na skasowanym `StationInternalView.test.tsx` — „No test files found" | odziedziczona (`08ccf7c9` na `main`, 2026-09-01) | NAPRAWIONA |
| Frontend E2E full | 12 specyfikacji | odziedziczona (czerwona na `main` @ `a1ab2959`) | 7 z 12 naprawionych |

**Skala szkody odziedziczonych bramek.** Obie przerywały się na kroku, który nie
sprawdza żadnego inwariantu, więc kolejne kroki NIE WYKONAŁY SIĘ ANI RAZU:
12 guardów w P0 Extended Guards i **14 kroków** w SLD Determinism (cały komplet
kontraktów SLD v3 i odbiór renderu) — od 2026-09-01. To jest gorsze niż brak
bramki: alarm bez treści plus brak ochrony inwariantów rdzenia produktu.

Po naprawie: 52/52 kroki guardowe RC=0 (odtworzone w czystym venv odwzorowującym
CI), 18/18 kroków vitest bramki SLD przechodzi lokalnie.

---

## 3. Rozjazd gotowości — defekt FAIL-OPEN (P0)

### Pomiar

Ten sam przypadek, ta sama rewizja ENM (10), trzy drogi do tej samej wielkości:

```
POST .../enm/domain-ops (refresh_snapshot)  ->  ready=False,
     blokada `switch.catalog_ref_missing` na nn/.../feeder_device
GET  .../engineering-readiness              ->  ready=True,  0 blokad
GET  .../enm/readiness                      ->  ready=True,  0 blokad
```

### Przyczyna

`ENMValidator` nie zna kontroli DOMENOWYCH, które
`enm.domain_operations._build_readiness` dokłada ponad walidator: wiązania
katalogowego łączników (**Catalog Binding Rule** — reguła NIENARUSZALNA),
transformatora blokowego DER przekształtnikowego, portów i stanu łącznika
punktów odgałęźnych. Końcówki agregujące — te, z których żyje panel gotowości i
macierz zdolności analiz — używały wyłącznie walidatora.

### Dlaczego to groźne, a nie tylko niespójne

Rozjazd szedł w stronę **FAIL-OPEN**: model z łącznikiem bez pozycji katalogowej
był meldowany jako gotowy do obliczeń. Objawem widocznym dla użytkownika były
dwa sprzeczne napisy w jednym oknie — chip powłoki (czyta operację)
„Model: w budowie" i panel gotowości (czyta końcówkę) „zwalidowany".

### Naprawa

Werdykt trzech dróg pochodzi teraz z JEDNEJ funkcji (`_build_readiness`).
Lista `issues` końcówki nadal niesie `wizard_step_hint`/`suggested_fix`/kanon
z walidatora, a blokady domenowe są do niej dokładane jawnie — końcówka nie może
meldować `ready=False` bez ani jednego problemu w liście.
Pin: `tests/api/test_gotowosc_jedno_zrodlo.py` (5 testów, iloczyn
„trzy drogi × model z blokadą domenową / bez niej").

---

## 4. DŁUG NAZWANY — decyzja dla właściciela

### 4.1 Wyłącznik główny nN powstaje BEZ wiązania katalogowego

**Pomiar:** w jednym przebiegu e2e „50 szablonów stacji" model zawierał
**128 łączników** `nn/.../feeder_device` bez `catalog_ref` — po jednym na każdą
utworzoną stację z blokiem nN.

**Stan bramy katalogowej — inwentarz klasy:**

| Element | Brama katalogowa |
|---------|------------------|
| pole SN (aparat) | **WYMAGANE** — `_sn_field_apparatus_catalog_ref` odrzuca brak jawnym błędem |
| odpływ nN | opcjonalne — `feeder_spec.catalog_bindings` |
| **wyłącznik główny nN** | **NIEOSIĄGALNE** przed tą zmianą — brak jakiegokolwiek kanału wskazania pozycji |

To jest ta sama klasa, którą przegląd 2026-08-01 zapisał jako „bramkowano
transformator, ale nie źródło nN ani aparat pola" — wróciła wraz z portalem nN.

**Co zrobiono tutaj:** wiązanie stało się MOŻLIWE
(`nn_block.main_breaker_catalog_bindings`, przestrzeń `APARAT_NN`, klucz
dopisany do inwentarza bramy API). Fikstury e2e podają je jawnie — ścieżką
realnego użytkownika, nie obejściem.

**Czego NIE zrobiono i dlaczego:** uczynienie wiązania WYMAGANYM (symetria z
polem SN) jest zmianą ŁAMIĄCĄ kontrakt dla każdego istniejącego wywołania —
kreatora stacji w UI, wszystkich fikstur, wszystkich zapisanych projektów.
To jest rozstrzygnięcie produktowe, nie techniczne, więc trafia tutaj zamiast
być cicho przepchnięte. **Dopóki nie zapadnie, operacja nadal tworzy łącznik bez
wiązania, gdy wołający go nie poda — i gotowość takiego modelu jest (słusznie)
zablokowana.**

Wariant do rozstrzygnięcia:
* **(a)** wymagać wiązania przy tworzeniu bloku nN — symetria z SN, zmiana łamiąca;
* **(b)** zostawić opcjonalnym i pogodzić się z tym, że stacja utworzona bez
  wskazania aparatu nie jest gotowa do obliczeń, dopóki użytkownik go nie wskaże.

Wariantu „domyślny aparat z katalogu" NIE ma na liście świadomie: domyślna
pozycja katalogowa jest zgadywaniem wielkości rozstrzygającej wynik
(Zero fabrykacji — dyrektywa właściciela #3).

### 4.2 Pięć specyfikacji e2e nadal czerwonych — osobne defekty

Po naprawie rozjazdu gotowości z 12 czerwonych zostało 5, każda z INNEJ przyczyny:

| Specyfikacja | Objaw |
|--------------|-------|
| `industrial-template-mass-flow` | 128 nieobwiązanych łączników nN — patrz 4.1 (ścieżka szablonowa nie przechodzi przez `nn_block`) |
| `kreator-oze-max` | readout gotowości kreatora OZE |
| `legenda-na-zadanie` | panel legendy — element nieznaleziony |
| `nastawy-i-akcje-oze` | „Analiza rozpływu mocy nie jest dostępna dla bieżącego snapshotu ENM" |
| `sld-audyt-powykonawczy-screenshot` | niezmiennik niezależności kanwy od motywu |

Żadna z nich nie wynika z pracy tej rundy; wszystkie są czerwone na `main`
od `a1ab2959`. Nie są maskowane ani wyciszone.

### 4.3 Osiem testów czerwonych W CI, zielonych lokalnie — dwie przyczyny zmierzone

Bieg `Python tests` na `3030f343`: **8 failed, 11380 passed** w CI wobec
**11521 passed, 0 failed** lokalnie na tym samym drzewie. Kolektor CI zbiera
11 402 testy, lokalny 11 527 — różnica bierze się z pakietów spoza pliku
blokady obecnych lokalnie (m.in. ANDES 2.0.0, którego `pyproject.toml` nie
wymienia). Interfejs logów GitHuba zwrócił nazwy DWÓCH z ośmiu; obie zdiagnozowane:

**(a) `test_gfm_ogranicznik::test_ogranicznik_oslabia_sztywnosc_a_ranking_zalezy_od_glebokosci`
— NAPRAWIONE.** Ograniczniki prądu falownika GFM są ciągłe, ale
NIERÓŻNICZKOWALNE, więc jakobian różnicowy jest w otoczeniu załamania złym
modelem funkcji i Newton kuleje. Zmierzone: najtrudniejsze zadanie laboratorium
(sztywność napięciowa DER przy nasyceniu zadania, `x_f = 0,01` p.u.) zużywa
**34 iteracje** z limitu 40, residuum końcowe `1,716e-14`. Sześć iteracji zapasu
na zadaniu wymagającym trzydziestu czterech to nie jest margines — stąd CI padało
(`residuum 6,890e-01`), a lokalnie przechodziło.

Limit podniesiony do **120**, z pomiaru. To NIE jest podniesienie tolerancji:
żądana dokładność (`1e-12`) bez zmian, zmienia się wyłącznie ile pracy wolno na
nią poświęcić. Rozjazd nadal kończy się błędem po kilku krokach. Dodatkowo
komunikat błędu niesie teraz residuum STARTOWE, więc odróżnia rozjazd (residuum
rośnie) od kulenia (maleje, ale wolno), a zapas iteracji stał się wielkością
PILNOWANĄ — `test_najtrudniejsze_zadanie_sieci_ma_margines_iteracji` zaświeci,
gdy zadanie zacznie wymagać więcej niż połowy limitu.

**(a-bis) POTWIERDZENIE NA CI.** Po podniesieniu limitu bieg `Python tests` na
`89f0d7de` dal **11394 passed, 14 skipped, 0 failed** w kroku pytest — wszystkie
OSIEM czerwonych testow zgaslo jedna zmiana. Liczba zgadza sie co do jednego z
biegiem lokalnym w srodowisku odwzorowujacym CI (11394 passed, 14 skipped;
+1 wzgledem CI sprzed naprawy to nowy test marginesu).

**(b) `test_scenariusze_nn::test_json_w_repo_rowny_odpowiedzi_backendu`
— NAZWANE, NIENAPRAWIONE.** Test porównuje zapisaną w repo fiksturę z odpowiedzią
backendu operatorem `==`. Zmierzone: `17_sc_results.json` zawiera **333 liczby o
co najmniej dziewieciu cyfrach po przecinku** — pelna precyzje podwojna wynikow
solvera zwarciowego. Rownosc dokladna takich liczb MIEDZY MASZYNAMI wymaga
bit-identycznego stosu numerycznego.

MECHANIZM UDOWODNIONY POMIAREM, NIE HIPOTEZA. Ta sama maszyna, to samo
srodowisko, ten sam kod — zmieniana WYLACZNIE liczba watkow biblioteki algebry:

| `OPENBLAS_NUM_THREADS` | iteracje sieci (najtrudniejsze zadanie) | sztywnosc [p.u./p.u.] | pelna suita |
|---|---|---|---|
| domyslne (4 rdzenie) | 34 | 0,16769623308515585 | 11394 passed, **0 failed** |
| 1 | **33** | 0,167696233085**49447** | 11392 passed, **2 failed** |
| 2 | 34 | 0,16769623308515585 | — |
| 4 | 34 | 0,16769623308515585 | — |

Przy jednym watku wynik rozni sie na dwunastej cyfrze znaczacej, zmienia sie
liczba iteracji Newtona, a DWIE fikstury przestaja sie zgadzac
(`13_loads_via_fields` i `17_sc_results`). To jest naruszenie reguly nr 7
kanonu („to samo wejscie MUSI dawac identyczne wyjscie") przez wielkosc, ktorej
zaden test nie kontroluje: liczbe watkow BLAS. Rozjazd CI vs lokalnie jest tego
samego rodzaju — inny procesor to inne jadro obliczeniowe tej samej biblioteki.

Rozstrzygniecie nalezy do wlasciciela, bo dotyczy ZNACZENIA reguly determinizmu:

* **(a)** „bit-identycznie na TYM SAMYM stosie" — wtedy stos numeryczny trzeba
  przypiac (wersja BLAS/LAPACK w obrazie CI i w srodowisku deweloperskim);
* **(b)** „bit-identycznie dla struktury, z tolerancja dla wielkosci
  fizycznych" — wtedy porownanie fikstur musi te roznice honorowac.

Samo przypiecie `OPENBLAS_NUM_THREADS=1` jest naprawa CZESCIOWA: usuwa jedno
zrodlo (liczbe watkow), nie usuwa drugiego (dobor jadra pod procesor). Dlatego
nie zostalo wprowadzone jednostronnie — i dlatego wariant (b) jest mocniejszy.

Regeneracja fikstury z mojej maszyny NIE jest naprawa — przeniosalaby jedynie
czerwien z CI na inne srodowisko.

Pozostale szesc nazw nie bylo dostepnych: interfejs logow zwraca okno o stalym
rozmiarze, a blok podsumowania pytest wypadl poza nie. Nie zgaduje ich.

### 4.4 Jedenaście kopii pętli „samonaprawiającej" w fiksturach e2e

`(i) => i.code.includes('catalog')` z dwustronnym odwzorowaniem
(transformator ⇒ `TRAFO_SN_NN`, cokolwiek innego ⇒ `KABEL_SN`) występuje w
**11 plikach**. Przy pierwszej nowej kategorii (łącznik) odwzorowanie
przypisało kablową pozycję łącznikowi i operacja je odrzuciła. Propozycja:
jeden wspólny `e2e/helpers/gotowosc.ts` zamiast jedenastu kopii.

---

## 5. Weryfikacja

| Stos | Komenda | Wynik |
|------|---------|-------|
| Laboratorium | `poetry run pytest tests/research -q` | 826 passed, RC=0 |
| Backend (komplet) | `poetry run pytest -q` | patrz stopka commita |
| Lint/format backend | `ruff check src tests` · `black --check src tests` | RC=0 · RC=0 |
| Typy frontendu | `npx tsc --noEmit` | RC=0 |
| Bramka SLD | 18 kroków vitest z `sld-determinism.yml` | 18/18 RC=0 |
| Bramka P0 | 52 kroki guardowe w venv odwzorowującym CI | 52/52 RC=0 |

**CI na GitHubie nie jest zielone** — patrz 4.2. Żaden wynik tej rundy nie jest
zgłaszany jako „ACCEPTED"; kod pozostaje `UNVALIDATED_MODEL`, bez promocji do
produkcji i bez `VALIDATED_SIMULATION`.
