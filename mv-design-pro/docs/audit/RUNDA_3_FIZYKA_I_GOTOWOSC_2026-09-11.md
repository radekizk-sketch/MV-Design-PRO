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

### 4.2 Pięć specyfikacji e2e — cztery naprawione u źródła, jedna z długiem

PROWENIENCJA ZMIERZONA, nie założona. `Frontend E2E full` na checkpoincie rundy 2
(`9349b3ed`, bieg 409): **12 failed / 396 passed / 2 skipped**. Na `89f0d7de` po
naprawie rozjazdu gotowości: **5 failed / 403 passed / 2 skipped** — pozostała
piątka to ŚCISŁY PODZBIÓR tamtej dwunastki, zero nowych czerwieni. Dalsza praca
tej sekcji zamyka cztery z pięciu.

| Specyfikacja | Zmierzona przyczyna | Stan |
|--------------|---------------------|------|
| `kreator-oze-max` | sieć bez odbioru i bez generatora ⇒ `POST /runs {LOAD_FLOW}` → **409** | naprawiona (4.5) |
| `nastawy-i-akcje-oze` | ta sama przyczyna | naprawiona (4.5) |
| `legenda-na-zadanie` | asercja opisywała zachowanie, którego produkt nigdy nie miał | naprawiona (4.7) |
| `industrial-template-mass-flow` | `switch.catalog_ref_missing` na wyłączniku głównym nN — **57/57 szablonów** | CZĘŚCIOWO (4.6) |
| `sld-audyt-powykonawczy-screenshot` | niezmiennik niezależności kanwy od motywu | naprawiona (4.8) |

POTWIERDZENIE Z CI, nie z deklaracji. `Frontend E2E full` na kolejnych HEAD-ach
tej gałęzi: `9349b3ed` — **12 failed / 396 passed**; `89f0d7de` — **5 / 403**;
`0cd93e96` — **1 failed / 407 passed / 2 skipped**. Jedyna pozostała czerwień to
`industrial-template-mass-flow`, a w jej komunikacie kodu `W041` **już nie ma**
(naprawa pól TR zadziałała na wszystkich 50 zastosowanych szablonach). Zostają
wyłącznie kody długu z 4.6: `switch.catalog_ref_missing` ×128 i `W061` ×73.

---

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

**POSTĘP ZMIERZONY W CI (aktualizacja po globalizacji solvera, 4.9).** Liczba
czerwonych testów `Python tests` na kolejnych HEAD-ach tej gałęzi:

| HEAD | Wynik CI |
|------|----------|
| `78d60d84` | **9 failed** / 11 467 passed / 14 skipped |
| `f453334c` | **7 failed** / 11 476 passed / 14 skipped |

Dwie czerwienie, które zniknęły, to DOKŁADNIE te dwie nazwane wyżej jako (a):
`test_gfm_ogranicznik::test_ogranicznik_oslabia_sztywnosc_a_ranking_zalezy_od_glebokosci`
i `test_najtrudniejsze_zadanie_sieci_ma_margines_iteracji`. Ich przyczyną nie był
jednak zapas iteracji, jak zakładała pierwsza diagnoza — tylko BRAK GLOBALIZACJI
metody (patrz 4.9, gdzie ta diagnoza jest skorygowana wraz z dowodem).

Siedem pozostałych to ten sam mechanizm co (b): porównanie zapisanych fikstur z
wynikiem solvera operatorem `==`. Ich rozstrzygnięcie nadal należy do właściciela,
bo dotyczy ZNACZENIA reguły determinizmu, a nie jednego testu.

**MECHANIZM POTWIERDZONY DRUGIM POMIAREM — I DOWÓD, ŻE „7" NIE JEST WŁASNOŚCIĄ
KODU.** Pełna suita uruchomiona na TEJ SAMEJ maszynie, tym samym kodzie i tym
samym środowisku, z jedyną zmienną `OPENBLAS_NUM_THREADS`:

| Liczba wątków BLAS | Wynik pełnej suity |
|---|---|
| domyślna (4 rdzenie) | **11 611 passed, 6 skipped, 0 failed** |
| 1 | **11 609 passed, 6 skipped, 2 failed** |
| CI (inny procesor, inne jądro BLAS) | **11 476 passed, 14 skipped, 7 failed** |

Obie czerwienie przy jednym wątku to `test_scenariusze_nn::test_json_w_repo_rowny_odpowiedzi_backendu`
dla scenariuszy `13_loads_via_fields` i `17_sc_results` — czyli DOKŁADNIE ta
rodzina, co (b). LICZBA czerwonych fikstur (0 / 2 / 7) zależy więc od jądra
obliczeniowego, a nie od kodu: to jest własność przyjętego SPOSOBU PORÓWNANIA,
nie defekt w solverze ani w danych. Naprawa „przez regenerację fikstur" jest
niemożliwa z definicji — przeniosłaby czerwień na następne środowisko.

### 4.4 Jedenaście kopii pętli „samonaprawiającej" w fiksturach e2e

`(i) => i.code.includes('catalog')` z dwustronnym odwzorowaniem
(transformator ⇒ `TRAFO_SN_NN`, cokolwiek innego ⇒ `KABEL_SN`) występuje w
**11 plikach**. Przy pierwszej nowej kategorii (łącznik) odwzorowanie
przypisało kablową pozycję łącznikowi i operacja je odrzuciła. Propozycja:
jeden wspólny `e2e/helpers/gotowosc.ts` zamiast jedenastu kopii.

---

### 4.5 Phantom cosφ w DRODZE PROJEKTANTA — `add_nn_load` nie czytała katalogu

DWIE specyfikacje OZE padały na `POST /runs {analysis_type: LOAD_FLOW}` → **409
`Analiza rozpływu mocy nie jest dostępna dla bieżącego snapshotu ENM`**. Produkt
miał rację: obie fikstury nazywają się `zbudujSiecGotowaDoObliczen`, a budowały
stację SN/nN zasilającą NIC (`loads: 0`, `generators: 0`). Domena mówi to wprost —
`W003` z akcją naprawczą w kroku K6 — tylko że pętla samonaprawiająca fikstury
(patrz 4.4) filtruje wyłącznie kody `*catalog*` i `E005`.

Naprawa poszła DROGĄ REALNĄ (dwie operacje kanoniczne: `add_nn_outgoing_field` →
`add_nn_load`), a nie osłabieniem bramki dostępności analizy. I ta droga
natychmiast odsłoniła **dwa defekty produktu**.

#### (a) Odbiór katalogowy szedł do rozpływu z Q = 0

`add_nn_load` pobierała pozycję katalogu WYŁĄCZNIE po to, żeby sprawdzić jej
istnienie (`_, blad = _pozycja_katalogu(...)` — tabliczka wyrzucana), po czym
budowała rekord z `q_mvar` z samego payloadu. Zmierzone na żywym backendzie dla
`load_przem_75kw` (katalog: `q_kvar = 28,0`, `cos_phi = 0,94` IND):

| Pole | PRZED | PO |
|------|-------|-----|
| `q_mvar` | **0.0** | **0.028** |
| `materialized_params` | `null` | `{q_source: KATALOG_Q_KVAR, catalog_p_kw: 75.0, catalog_cos_phi: 0.94, …}` |
| `parameter_source` | `CATALOG` | `CATALOG` |
| `source_mode` | `KATALOG` | `KATALOG` |

Rachunek szedł z cosφ = 1,0, a rekord twierdził „parametry z katalogu" — to
DOKŁADNIE phantom cosφ V12K-050. Bliźniacza migracja legacy
(`catalog_completion.complete_station_loads_from_nn_feeders`) broniła się przed
nim od dawna, a JEJ docstring deklarował „parytet z naprawionym `add_nn_load`".
**Deklaracja była nieprawdziwa** — klasa była zamknięta w JEDNYM z dwóch pisarzy.
Obietnica bez przypiętego testu jest groźniejsza niż sam defekt, bo wyłącza
czujność; docstring poprawiony, parytet pilnuje
`tests/enm/test_add_nn_load_katalog_q.py` (10 testów, iloczyn cech: źródło Q ×
obecność katalogu × wielomian ZIP).

Hierarchia Q ma teraz JEDNO źródło prawdy (`moc_bierna_odbioru_katalogowego`),
wspólne dla obu pisarzy. Katalog milczący (bez `q_kvar` i bez cosφ) ODRZUCA
operację kodem `catalog.load_reactive_power_unresolved` — parytet z migracją,
zamiast cichego Q = 0 pod pieczątką „CATALOG".

#### (b) Pole nN nie miało DROGI wskazania aparatu z katalogu

Promocja pól nN (`enm/migrations/nn_field_specs_promocja.migruj`) CZYTA z meta
wpisu `catalog_binding`/`catalog_bindings` i buduje `SwitchBranch` z `catalog_ref`,
`source_mode: KATALOG` i `materialized_params`. Czytelnik istniał — w klasie
CZTERECH pisarzy `nn_field_specs` karmiły go tylko DWA:

| Pisarz | wiązanie w meta (PRZED) |
|--------|------------------------|
| `domain_operations._build_nn_field_specs` (wyłącznik główny nN) | TAK (naprawione 2026-09-11) |
| `_append_converter_field_if_needed` (pole przekształtnika) | TAK |
| `_add_nn_outgoing_field_internal` (rola FEEDER) | **NIE** |
| `_append_nn_source_meta_field` (rola SOURCE) | **NIE** |

Oba brakujące siedzą za JEDYNYM publicznym write-pathem pola nN
(`add_nn_outgoing_field`), więc projektant tworzący odpływ nN nie miał ŻADNEJ
drogi związania jego aparatu. Zmierzone przed naprawą: `ready = False`, kody
`['W002', 'W061', 'switch.catalog_ref_missing']` na `nn/<seed>/feeder_device`.
Po naprawie (obie role, z bramką istnienia pozycji): `ready = True`.

To ta sama KLASA co wyłącznik główny nN — wtedy naprawiono INSTANCJĘ z karty,
nie klasę. Teraz klasa zamknięta, pilnuje jej `tests/enm/test_pole_nn_wiazanie_aparatu.py`
(8 testów, PARAMI: tor pozytywny i negatywny dla KAŻDEJ z dwóch ról).

---

### 4.6 CAŁA biblioteka szablonów stacji nie osiąga gotowości — DECYZJA WŁAŚCICIELA

Pomiar wyczerpujący (apply KAŻDEGO z 57 szablonów przez API + `engineering-readiness`):

| Zbiór | Liczność | Kody |
|-------|----------|------|
| wszystkie szablony | **57/57** | `ready = False` |
| z `switch.catalog_ref_missing` + `W061` | **57/57** | wyłącznik główny nN bez wiązania (`glowny_meta = None`) |
| dodatkowo `W041` | 15 | `prosument_pv` (6), `slupowa` (6), `sekcyjna` (3) |

**Co naprawione:** `W041` dla wszystkich 15 — stacja z transformatorem na szynie
SN musi mieć pole roli `TR` (bez aparatu w polu nie da się ani odłączyć
transformatora do prac, ani zbudować selektywności wobec szyny). Pozostałe 42
miały pole TR albo transformator blokowy toru DER. Pilnuje
`tests/api/test_szablony_pole_transformatorowe.py` — **parametryzacja po CAŁEJ
bibliotece**, mierząca SKUTEK predykatem domeny (`transformatory_bez_pola_sn`),
nie deklarację szablonu; obie legalne drogi (pole TR, blok DER) jednym warunkiem.

**Czego NIE naprawiam i dlaczego.** Wiązanie wyłącznika głównego nN wymaga doboru
do prądu znamionowego strony dolnej transformatora, `I_n = S_n/(√3·U_nN)`.
Zmierzony rozrzut biblioteki: **90,9 A … 3608,4 A**. Rodzina „Wyłącznik główny nN"
w katalogu APARAT_NN kończy się na **1600 A** (`cb_nn_400a/630a/800a/1000a/1250a/1600a`).
Dla **ponad dwudziestu** szablonów nie istnieje pozycja, którą wolno związać —
dobranie mniejszej byłoby fabrykacją aparatu niezdolnego do przewodzenia prądu
roboczego, czyli dokładnie tym, czego zakazuje reguła zero-fabrykacji.

Głębszy problem jest projektowy: `_build_nn_field_specs` tworzy `nn_main_breaker`
BEZWARUNKOWO, także dla stacji generacyjnej z transformatorem blokowym 2,5 MVA /
0,4 kV, która nie ma rozdzielnicy nN — tam sam wyłącznik główny nN jest elementem
wymyślonym, a nie niedobranym. Trzy rozłączne drogi wyjścia, każda to decyzja
produktowa:

* **(A)** rozszerzyć katalog APARAT_NN do 4000 A i dobierać z prądu znamionowego;
* **(B)** nie tworzyć `nn_main_breaker` dla stacji bez rozdzielnicy nN (bloki
  generacyjne) — wtedy nie ma czego wiązać;
* **(C)** uznać brak wiązania AUTOMATYCZNIE utworzonego wyłącznika głównego za
  ostrzeżenie, nie blokadę gotowości, do czasu konfiguracji rozdzielnicy nN
  przez projektanta.

Pomiary są PRZYPIĘTE testami (`test_rodzina_wylacznikow_glownych_nn_konczy_sie_na_1600A`,
`test_ponad_dwadziescia_szablonow_wykracza_poza_zakres_katalogu`), więc gdy
którakolwiek strona się zmieni, ta sekcja wywali się razem z kodem.

**Uczciwie: to moja naprawa fail-open z sekcji 3 ODSŁONIŁA ten dług.** Przed nią
`/engineering-readiness` meldował `ready: true` dla każdego z 57 szablonów, bo
nie znał kontroli domenowych. Dług istniał w całości wcześniej — był niewidoczny.
Odwrót od naprawy byłby przywróceniem kłamstwa, więc dług zostaje nazwany, nie
schowany. `industrial-template-mass-flow` pozostaje przez to czerwony.

---

### 4.7 Asercja e2e opisująca zachowanie, którego produkt NIGDY nie miał

`legenda-na-zadanie.spec.ts` twierdziła, że backend materializuje „potrzeby
własne" stacji „bezwarunkowo przy KAŻDYM tworzeniu transformatora", więc sieć ma
agregat 0,4 kV i `loadArrow` jest asercją POZYTYWNĄ.

Twierdzenie było nieprawdziwe **od chwili napisania**: `_materialize_station_auxiliary_load`
wprowadzono TYM SAMYM commitem (`4e9ca9d9`) i od początku zaczyna się od
`if not isinstance(aux, dict) or not aux: return None`, a builder tej specyfikacji
nie podaje bloku `station_auxiliary`. Pomiar: `loads: 0`. Spec był czerwony
nieprzerwanie od tego commitu.

Naprawa przywraca spójność z własną nazwą buildera (`buildStationNetworkWithoutDer`)
i nagłówkiem pliku („BEZ kroku dodania odbioru/Load"): `loadArrow` wraca do roli
NEGATYWU, więc bramka „legenda pokazuje WYŁĄCZNIE symbole obecne w projekcie"
ma teraz dwa niezależne negatywy (brak DER, brak odbioru) i dwa pozytywy
(transformator, źródło SN). PARA dla `loadArrow` po stronie pozytywnej: test
jednostkowy `src/ui/sld/v3/sheet/__tests__/projectLegend.test.ts` — bez niej sama
negacja przepuściłaby legendę, która nie pokazuje NICZEGO.

### 4.8 Niezmiennik motywu SLD został w tyle za produktem — POMIAR PIKSELOWY

`sld-audyt-powykonawczy-screenshot.spec.ts` żądał, żeby para zrzutów
jasny/ciemny była BAJTOWO IDENTYCZNA: kanwa v3 miała mieć stałe tło techniczne,
więc sześć plików nazwanych „light"/„dark" nie niosłoby żadnego pokrycia
motywów. Sama asercja nazywała oba możliwe rozstrzygnięcia — „render zaczął
reagować na motyw" albo „do zrzutu wszedł chrome harnessu".

ZMIERZONE (dekodowany PNG, nie porównanie bajtów skompresowanych — filtry PNG
kodują RÓŻNICE, więc jednolite tło daje identyczne bajty filtrowane i pierwszy,
naiwny pomiar pokazał mylące „0,6 % bajtów"):

| Poziom | tło jasny | tło ciemny | wiersze z różnicą | kolumny z różnicą |
|--------|-----------|------------|-------------------|-------------------|
| L0 | `#FFFFFF` | `#0B0F14` | 1080/1080 | 1920/1920 |
| L1 | `#FFFFFF` | `#0B0F14` | 1080/1080 | 1920/1920 |
| L2 | `#FFFFFF` | `#0B0F14` | 1080/1080 | 1920/1920 |

Rozstrzygnięcie jest więc pierwsze z dwóch: kanwa v3 ma DZIŚ dwie palety ekranu
(`ui/sld/v3/theme/palette.ts`), `SldCanvasV3` honoruje prop `paletteMode`
(pin: `canvas/__tests__/motywRenderuStatycznego.test.tsx`), a harness podaje go
wprost. Niezmiennik pochodzi sprzed tej zmiany i nigdy nie został zaktualizowany.

Naprawa idzie DOKŁADNIE tam, gdzie kieruje komunikat asercji: niezmiennik
odwraca się i dopiero teraz pilnuje tego, po co powstał — nazwa pliku
„light"/„dark" ma być FAKTEM SPRAWDZONYM. Test żąda, żeby para się RÓŻNIŁA i
żeby tło każdego zrzutu było tłem deklarowanej palety (odczyt ze stylu
obliczonego kanwy, nie z założenia). Geometria zostaje niezależna od motywu —
to orzeczenie ma własny pin jednostkowy (`v3/theme/__tests__/palette.test.ts`:
„hash geometrii sceny identyczny niezależnie od aktywnej palety"), więc nie
dubluje się w e2e.

TO NIE JEST WERDYKT WIZUALNY. Rozstrzygnięcie opiera się na pomiarze piksela i
na istniejącym, jednostkowym pinie zdolności produktu — nie na ocenie, czy
rysunek wygląda dobrze. Ocena jakości rysunku zostaje właścicielowi (B-02) i
dotyczy sekcji niżej.

---

### 4.9 Solver sieci nie miał GLOBALIZACJI — ten sam kod, dwa różne werdykty

NAJPOWAŻNIEJSZE ZNALEZISKO NUMERYCZNE TEJ RUNDY, zmierzone na dwóch maszynach.
`SolverSieci.rozwiaz` brał PEŁNY krok Newtona zawsze, bez żadnego warunku na
residuum. Na zadaniu z AKTYWNYM ogranicznikiem prądu falownika GFM przy zwarciu
bliskim metalicznemu (`x_f = 0,01` p.u.) dawało to:

| Środowisko | Wynik |
|------------|-------|
| lokalnie | zbieżność w **34 iteracjach**, residuum końcowe `1,716e-14` |
| CI | po **120 iteracjach** residuum STOJĄCE na `1,569e-01` — trzynaście rzędów od progu |

To jest naruszenie reguły determinizmu (to samo wejście, inny wynik), a nie
kwestia zapasu iteracji. **I to obnaża moją własną naprawę z poprzedniej karty
jako leczenie INSTANCJI:** podniesienie limitu 40 → 120 wyleczyło jeden przypadek
i zostawiło klasę. Klasą jest „Newton bez globalizacji na residuum niegładkim":
bez warunku dostatecznego spadku metoda nie ma ŻADNEJ gwarancji zbliżania się do
rozwiązania, więc o wyniku decydują ostatnie bity `np.linalg.solve`.

**Co zostało wprowadzone** (metody podręcznikowe, nie heurystyki, nie zmiana
tolerancji — próg pozostaje `1e-12`):

1. **nawrót Armijo** — krok `α` połowiony, aż `‖r(V+αΔV)‖ ≤ (1 − c·α)·odniesienie`,
   `c = 1e-4` (Dennis & Schnabel §6.3);
2. **luz niemonotoniczny Grippo–Lampariello–Lucidi** — odniesieniem jest
   największa norma z ostatnich 8 przyjętych iteracji, bo przejście przez grzbiet
   załamania ogranicznika WYMAGA chwilowego wzrostu residuum (przy warunku
   ściśle monotonicznym to samo zadanie stawało na `2,25e-01` po 6 iteracjach);
3. **zabezpieczenie monotoniczne** — pamięć najlepszego punktu i powrót do niego,
   gdy luz przestaje służyć zbieżności (bez niej residuum dryfowało do `2,63e+00`);
4. **zapasowy kierunek Levenberga–Marquardta** `(JᵀJ + λ·diag(JᵀJ))δ = −Jᵀr`,
   gdy kierunek Newtona nie jest kierunkiem spadku — przy AKTYWNYM ograniczniku
   moduł wstrzyknięcia przestaje zależeć od `|V|`, więc jakobian traci rząd.

**DAWNA „GRANICA ZBIEŻNOŚCI" BYŁA ARTEFAKTEM METODY, NIE WŁASNOŚCIĄ MODELU.**
Test `test_zwarcie_bliskie_metalicznemu_lamie_nasycenie_a_nie_impedancje` opisywał
monotoniczny próg rosnący z limitem prądowym i brzmiał jak orzeczenie o fizyce
(„źródło prądowe w niemal zerowej impedancji nie ma dobrze uwarunkowanego
rozwiązania"). Po globalizacji zmierzona siatka `i_max ∈ {0,9; 1,2; 1,5; 2,0; 3,0}`
× `x_f ∈ {0,01; 0,005; 0,003; 0,001; 0}` liczy się CAŁA — **ze zwarciem
metalicznym włącznie** — poza JEDNYM punktem `(i_max = 1,2, x_f = 0,003)`, i ten
wyjątek NIE jest monotoniczny (te same `i_max` przy płytszym `x_f = 0,001` i przy
`x_f = 0` zbiegają). Rozwiązanie istniało; nie umiał do niego dojść solver.

Ten jeden punkt melduje dziś uczciwie, co się dzieje: residuum `3,517e-06`
(najlepsze osiągnięte `1,737e-06`), 99 kroków tłumionych, najmniejszy przyjęty
krok `1,526e-05`, 3 powroty do najlepszego punktu. To nie rozjazd i nie cykl —
to zbieżność w żółwim tempie na załamaniu charakterystyki, z rozwiązaniem
leżącym praktycznie NA załamaniu.

**Trzy pomiary przesunęły się i zostały przepisane, nie ukryte:**

| Test | Było | Jest |
|------|------|------|
| granica zbieżności nasycenia | monotoniczny próg `x_f ≈ 0,0045` | jeden izolowany punkt `(1,2; 0,003)` |
| chwila awarii solvera w zwarciu 0,5 s | w czasie trwania zwarcia | **t = 1,4320 s**, w wybiegu pozwarciowym |
| tabela sztywności | żądała `BrakZbieznosciSieciError` w tabeli | pilnuje KONTRAKTU tabeli (wiersz na pomiar, oznaczenie niestabilnych, powód dokładnie tam, gdzie jest) |

Każdy z trzech ma dziś w docstringu zapisane, CO się zmieniło i DLACZEGO —
nowy pomiar zamiast starego, nie obok niego. Mechanizmy globalizacji mają własny
plik pinów: `tests/research/test_globalizacja_solvera_sieci.py` (7 testów, w tym
bramka „tolerancja nie jest luźniejsza niż przed globalizacją" i rozróżnienie
dwóch komunikatów porażki: stagnacja ≠ wyczerpanie limitu).

---

### 4.10 Bramka SLD ozyla i NATYCHMIAST zlapala nagromadzony regres — B-02

Po usunieciu martwego odwolania bramka `SLD Determinism Guards` przeszla
wszystkie 14 wczesniej zablokowanych krokow i zatrzymala sie na OSTATNIM:
odbiorze renderu (`npm run accept:sld-v3`). Sonda `vertical_length_probe`
(§15.1) melduje przekroczenie zapadki sumy dlugosci pionow:

| LOD | zapadka | wartosc |
|-----|---------|---------|
| 0 | 22 440 | **22 672** (+1,0 %) |
| 1 | 39 448 | **45 656** (+15,7 %) |
| 2 | 39 448 | **45 656** (+15,7 %) |

PROWENIENCJA ZMIERZONA, NIE ZALOZONA. Ta sama sonda daje IDENTYCZNE liczby na
`main` @ `7e84753a` (uruchomione na odlaczonej glowie, ta sama komenda) —
regres jest w calosci odziedziczony. Zapadka nie zmienila sie na `main` od
`2031fc75`; urosl RYSUNEK, po stronie portalu nN (osiem commitow pod
`src/ui/sld/v3/` po `2031fc75`). Ta galaz nie dotyka geometrii SLD: jej jedyne
zmiany pod `sld/v3/` to pliki TESTOWE (dlug typow, karta czterech bramek).

Czyli: bramka byla martwa przez dziesiec dni, rysunek przez ten czas urosl o
15,7 % w pionie na L1/L2, i dowiedzielismy sie o tym DOPIERO po jej naprawie.
To jest dokladnie ta szkoda, ktora opisuje sekcja 2 — tylko widziana od strony
skutku, a nie mechanizmu.

**DLACZEGO NIE PODNOSZE ZAPADKI.** Sonda pionow jest miara JAKOSCI RYSUNKU, a
werdykt wizualny SLD wystawia wlasciciel (ZASADA NR 2 kanonu, bramka B-02) —
nie agent. Podniesienie zapadki do zmierzonej wartosci byloby samocertyfikacja
jakosci wizualnej: uznaniem 15,7 % wiekszego rozciagniecia w pionie za
zamierzone, bez obejrzenia rysunku. To jedno z TRZECH dozwolonych zatrzyman
kanonu, nie odlozenie.

Do rozstrzygniecia po obejrzeniu renderu: czy wzrost jest CENA portalu nN
(wtedy zapadka idzie w gore razem z uzasadnieniem), czy REGRESEM ukladu
(wtedy naprawa jest po stronie geometrii, a zapadka zostaje).

---

## 5. Weryfikacja

| Stos | Komenda | Wynik |
|------|---------|-------|
| Laboratorium | `poetry run pytest tests/research -q` | **827 passed**, RC=0 |
| Backend (komplet) | `poetry run pytest -q` | **11 611 passed, 6 skipped**, RC=0 |
| Frontend (vitest) | `npm run test:ci` | **887 plików, 11 989 passed**, 1 skipped, 14 todo, RC=0 |
| Lint/format backend | `ruff check src tests` · `black --check src tests` | RC=0 · RC=0 |
| Lint frontendu | `npm run lint` | RC=0 |
| Typy frontendu | `npx tsc --noEmit` | RC=0 |
| Guardy (venv CI) | `catalog_*`, `readiness_codes`, `audit_contract`, `arch`, `docs`, `utf8`, `repo_hygiene`, `solver_input_substitute`, `api_lifecycle`, `severity_contract` | wszystkie RC=0 |
| e2e OZE (realny backend) | `kreator-oze-max` + `nastawy-i-akcje-oze` | 3 passed, RC=0 |
| e2e legenda (realny backend) | `legenda-na-zadanie` | 3 passed, RC=0 |
| e2e SLD (realny backend) | `sld-audyt-powykonawczy-screenshot` | 9 passed, RC=0 |

Przyrost testów backendu względem poprzedniego pomiaru tej gałęzi: 11 539 →
11 611 (+72 nowe, zero czerwonych). Bramka rejestru kodów złapała brak wpisu
dla nowego kodu `catalog.load_reactive_power_unresolved` — uzupełniony w
`READINESS_CODES` i w mapie celów frontu, zamiast obchodzenia bramki.

**CI na GitHubie NIE jest w pełni zielone** — stan ZMIERZONY na HEAD `f453334c`,
wszystkie dziewięć bramek ukończone:

| Bramka | Wynik | Uwaga |
|--------|-------|-------|
| Physics Label Guard | ✅ success | |
| Docs Integrity Guard | ✅ success | |
| Architectural And Repo Hygiene Guard | ✅ success | |
| P0 Extended Guards (V12K) | ✅ success | |
| Frontend checks | ✅ success | |
| Frontend E2E smoke | ✅ success | |
| Python tests | ❌ 7 failed / 11 476 passed | równość bitowa fikstur — dług 4.3 |
| Frontend E2E full | ❌ 1 failed / 407 passed | wiązanie wyłącznika nN — dług 4.6 |
| SLD Determinism Guards | ❌ failure | sonda pionów — regres odziedziczony, B-02 (4.10) |

Trzy czerwienie to TRZY NAZWANE DŁUGI, każdy z pomiarem i każdy z rozstrzygnięciem
należącym do właściciela. Żadna nie jest maskowana, wyciszona ani obchodzona.

Żaden wynik tej rundy nie jest zgłaszany jako „ACCEPTED"; kod pozostaje
`UNVALIDATED_MODEL`, bez promocji do produkcji i bez `VALIDATED_SIMULATION`.
