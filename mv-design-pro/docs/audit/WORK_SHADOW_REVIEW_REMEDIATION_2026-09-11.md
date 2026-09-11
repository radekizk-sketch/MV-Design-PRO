# Remediacja po niezależnym shadow review — delta 1e962025..cac842855

Dokument odpowiada na `docs/audit/WORK_SHADOW_REVIEW_LATEST.md` (werdykt:
**REJECT CURRENT DELTA**). Każde znalezisko odtworzono WYKONYWALNIE przed
zmianą kodu; każda naprawa ma test akceptacyjny i mutację.

Historia odrzuconej delty zachowana — remediacja to nowe commity PO `cac842855`.

---

## A. ZAKRES ODRZUCONY

```
1e96202535abb0acfb123ebac8a49dae430e792c   (baza)
..
cac842855ca9acab9552435432492d85ddfe5bd0   (odrzucona głowa)
```

Gałąź: `claude/max-dynamic-audit-kzbivg`.

---

## B. ZNALEZISKA NIEZALEŻNE

| ID | Waga | Twierdzenie recenzenta |
|----|------|------------------------|
| P0-DELTA-03 | P0 | `DEFAULT_FORBIDDEN` `k_sc` nadal zasila miarodajną zdolność |
| P1-DELTA-04 | P1 | `+Inf` przyjmowane jako deklaracja `k_sc` |
| P1-DELTA-05 | P1 | Twierdzenie „57/57 ready" szersze niż wykonywalna bramka |
| P1-DELTA-06 | P1 | Zamknięta mapa napięć odrzuca sieci 11/22/33 kV |
| DODATKOWE-A | P1 | `WYMAGANE["transformer_types"]` pomija `p0_kw`/`i0_percent` |
| DODATKOWE-B | P1 | Pięć niezmienników katalogu zbyt mocnych dla swoich rodzin |
| DODATKOWE-C | P1 | `przestrzen_aparatu_dla_napiecia(None) -> APARAT_NN` |
| DODATKOWE-D | P1 | NOWA czerwień CI: V12K guard, `domain_operations_v2.py:5923` |

---

## C. DYSPOZYCJA ZNALEZISK

### P0-DELTA-03 — granica miarodajności `k_sc`

* **Odtworzenie (przed zmianą kodu):**
  ```
  deklaracja k_sc      : None
  wartosc efektywna    : 1.1
  znacznik pochodzenia : DOMYSLNE_SYSTEMOWE
  short_circuit_3f:
    payload k_sc          = 1.1
    trace source_kind     = DEFAULT_FORBIDDEN
    eligibility.eligible  = True        <-- znacznik bez konsumenta
  ```
* **Klasyfikacja:** `CONFIRMED`.
* **Przyczyna źródłowa:** znacznik proweniencji był informacyjny. Żaden predykat
  gotowości go nie czytał, więc granica istniała jako etykieta, nie jako reguła.
  Dodatkowo produkt ma DWIE warstwy gotowości odpowiadające na to samo pytanie
  (`solver_input.eligibility` — kontrakt wejścia solvera; `application.
  eligibility_service` — macierz widoczna dla projektanta), więc naprawa jednej
  zostawiłaby drugą otwartą.
* **Korekta:** nowy kontrakt maszynowy
  `network_model/core/zdolnosci_wkladu_zwarciowego.py` — zdolności ZALEŻNE od
  wkładu zwarciowego i NIEZALEŻNE wymienione JAWNIE (strona „niezależna" NIE jest
  liczona jako dopełnienie, bo dopełnienie wciągałoby każdą nową zdolność na
  stronę niebezpieczną). Bramka wpięta w OBIE warstwy; jedna reguła, dwa
  wywołania.
* **Test akceptacyjny:**
  `tests/solver_input/test_granica_miarodajnosci_wkladu_zwarciowego.py` (11
  przypadków, obie strony predykatu).
* **Mutacja:** M01, M02 — **KILLED**.
* **Ograniczenie rezydualne:** granica działa na poziomie ZDOLNOŚCI (eligibility)
  i ładunku solvera. Nie przepisano jej na warstwę dokumentów dowodowych, bo te
  konsumują wynik przez `analysis_run`, który uruchamia analizę dopiero po
  przejściu macierzy zdolności; osobnej ścieżki „wstrzyknij gotowy wynik do
  generatora dowodu z pominięciem macierzy" nie zmierzono w tej rundzie. To jest
  pozycja OTWARTA (sekcja J).

### P1-DELTA-04 — nieskończoności jako deklaracja

* **Odtworzenie:** `wspolczynnik_wkladu_zwarciowego(float("inf")) == (inf, "DEKLARACJA")`.
* **Klasyfikacja:** `CONFIRMED`.
* **Przyczyna źródłowa:** predykat sprawdzał wyłącznie `> 0`. `NaN > 0` jest
  fałszem (wpadał do domyślki „przypadkiem"), `+Inf > 0` prawdą (przechodził jako
  deklaracja). Asymetria była defektem, nie decyzją. Głębiej: model miał DWA
  stany (brak / deklaracja), więc każda wartość, której nie umiał przyjąć, cicho
  stawała się domyślką — zrównując „nikt nie podał" z „ktoś podał śmieć".
* **Korekta:** TRZY stany — `DOMYSLNE_SYSTEMOWE`, `DEKLARACJA`,
  `DANE_NIEPOPRAWNE`. `math.isfinite` odrzuca `NaN` i obie nieskończoności jednym
  warunkiem. Operacja domenowa ODRZUCA niepoprawną deklarację błędem
  `converter.k_sc_invalid` zamiast cicho sprowadzać ją do braku.
* **Test akceptacyjny:** pełna macierz w
  `tests/network_model/core/test_wklad_zwarciowy_przeksztaltnika.py` (sekcja D
  niżej) + `tests/enm/test_deklaracja_wspolczynnika_zwarciowego_oze.py`.
* **Mutacja:** M04, M05 — **KILLED**.
* **Ograniczenie rezydualne:** GÓRNEGO ograniczenia `k_sc` nie nałożono. Nie ma
  podstawy, którą dałoby się tu uczciwie zacytować, a wymyślony próg odrzucałby
  poprawne deklaracje z kart producentów.

### P1-DELTA-05 — twierdzenie „57/57" szersze niż bramka

* **Odtworzenie:** test filtrował problemy do `switch.catalog_ref_missing` i nie
  asertował `ready is True` ani braku innych blokad.
* **Klasyfikacja:** `CONFIRMED`.
* **Przyczyna źródłowa:** jedna liczba opisywała cztery różne stany.
* **Korekta:** miary rozłączne, każda ze swoim testem (sekcja E). Bramka asertuje
  teraz PEŁNY kontrakt gotowości (`ready is True` ORAZ zero blokad dowolnego
  kodu) i osobno mierzy pokrycie każdej zdolności. Dokument audytu skorygowany.
* **Test akceptacyjny:**
  `tests/api/test_bramka_pokrycia_katalogowego_szablonow.py` (117 przypadków).
* **Mutacja:** M08 — **KILLED**.
* **Uwaga o rzetelności pomiaru:** pierwszy odczyt macierzy zdolności czytał klucz
  `eligible` zamiast `status` i pokazywał `LOAD_FLOW 0/57`. Błąd wykryto przed
  zapisaniem wyniku — inaczej ten raport niósłby fałszywy regres.

### P1-DELTA-06 — zamknięta mapa napięć

* **Odtworzenie:** `napiecie_najwyzsze_sieci_kv` zwracało `None` dla 11, 22 i
  33 kV; 15 kV dawało 17,5 kV.
* **Klasyfikacja:** `CONFIRMED`.
* **Przyczyna źródłowa:** architektoniczna. Repozytorium MA JUŻ regułę „czy aparat
  pasuje do tej szyny" —
  `network_model.catalog.switchgear.family_validation.czy_rodzina_obsluguje_napiecie`,
  `U_m(urządzenia) ≥ U_n(sieci)`, z podstawą PN-EN 62271-1. Moja mapa była
  DRUGIM, niezależnym i WĘŻSZYM warunkiem na to samo pytanie.
* **Korekta:** mapa `SZEREG_U_M_KV` USUNIĘTA; stosujemy tę samą nierówność, co
  reguła kanoniczna. Zakres napięć produktu wynika odtąd z tego, co katalog
  REALNIE zawiera — nie z osobnej listy, którą ktoś musi pamiętać.
* **Test akceptacyjny:** sekcja G (macierz napięć).
* **Ograniczenie rezydualne:** 30 / 33 / 34,5 / 35 kV nie mają pokrycia, bo
  katalog nie zawiera klasy 36 kV. Komunikat mówi to wprost i nazywa brakującą
  klasę. To jest brak DANYCH KATALOGOWYCH, nie ograniczenie reguły.

### DODATKOWE-A — luka metryki transformatora

* **Odtworzenie:** `_klasyfikacja(1, 100, {"DOKUMENT_ZEWNETRZNY": 1}) -> "PRODUCTION_READY"`
  przy `WYMAGANE["transformer_types"]` bez `p0_kw` i `i0_percent`.
* **Klasyfikacja:** `CONFIRMED` jako luka metryki. **Nie jest** dowodem, że
  bieżące rekordy są złe — pomiar: wszystkie 192 transformatory MAJĄ `p0_kw` i
  `i0_percent` dodatnie.
* **Przyczyna źródłowa:** jeden zbiór pól wymaganych na rodzinę, przez co brak
  pola potrzebnego wyłącznie modelowi strat rozpływał się w średniej.
* **Korekta:** wymagania PER ZDOLNOŚĆ, wyprowadzone Z KONSUMENTÓW, nie z nazw:
  `p0_kw` → `LOSS_MODEL` (`equipment_checks/transformer_losses.py`: brak albo
  zero → wynik NIEDOSTEPNY); `i0_percent` → `LOAD_FLOW` (`solver_input/builder.py`,
  gałąź magnesująca); `uk_percent`/`pk_kw` → impedancja, czyli rozpływ ORAZ
  zwarcie. Kompletność rodziny liczona jako NAJGORSZA zdolność, nie średnia.
  Transformator MOŻE być `LOAD_FLOW_READY` i nie być `LOSS_MODEL_READY`.
* **Mutacja:** M10 — **KILLED**.

### DODATKOWE-B — zbyt mocne niezmienniki

* **Klasyfikacja:** `CONFIRMED`. Szczegóły i pomiary w sekcji F.
* **Korekta:** klasyfikacja mocy reguł w
  `network_model/catalog/niezmienniki_katalogu.py`; pięć reguł przeklasyfikowanych
  z TWARDEJ bramki na `WIARYGODNOSC` (ostrzeżenie „do przeglądu"). Reguły NIE
  znikają — zmienia się skutek, żeby sygnał nie został utracony.
* **Mutacja:** M11 — **KILLED**.

### DODATKOWE-C — nieznane napięcie domyślnie nN

* **Odtworzenie:** `przestrzen_aparatu_dla_napiecia(None) -> "APARAT_NN"`.
* **Klasyfikacja:** `CONFIRMED`.
* **Przyczyna źródłowa:** brak informacji traktowany jako przesłanka.
* **Korekta:** `PRZESTRZEN_NIEUSTALONA`. Obaj konsumenci fail-closed: operacja
  domenowa melduje `converter.bus_voltage_unresolved`, promocja wpisu NIE
  materializuje wiązania (łącznik bez `catalog_ref` → widoczny brak w gotowości)
  zamiast cicho materializować w nN.
* **Mutacja:** M07 — **KILLED**.

### DODATKOWE-D — nowa czerwień V12K

* **Odtworzenie:** `solver_input_substitute_guard.py` →
  `enm/domain_operations_v2.py: 'D:dictor:meta.quantity': budzet 0, znaleziono 1 (wiersze: 5923)`.
* **Klasyfikacja:** `CONFIRMED` — wprowadzone tą deltą.
* **Przyczyna źródłowa:** `int(meta.get("quantity") or 1)` było podstawieniem
  liczby za daną, która NIGDY nie jest nieobecna: `_resolve_converter_defaults`
  normalizuje `quantity` do `>= 1` i wpisuje ją do `meta` w każdej ze swoich
  trzech gałęzi. Druga domyślka niczego nie zabezpieczała — udawała, że dana bywa
  nieobecna.
* **Korekta:** `int(meta["quantity"])`. Rozjazd kontraktu ma wybuchnąć głośno, nie
  zostać zastąpiony jedynką.
* **Mutacja:** M14 — **KILLED**. Guard: **PASS**.

---

## D. MACIERZ AKCEPTACJI `k_sc`

Wykonywalna w `tests/network_model/core/test_wklad_zwarciowy_przeksztaltnika.py`
(`MACIERZ_AKCEPTACJI`) oraz w macierzy zdolności niżej.

| Wejście | Deklaracja | Wartość efektywna | Proweniencja | SC 3F/1F | Zabezpieczenia | Dowód |
|---------|-----------|-------------------|--------------|----------|----------------|-------|
| brak (`None`) | `None` | 1,1 | `DOMYSLNE_SYSTEMOWE` | ZABLOKOWANE | ZABLOKOWANE | ZABLOKOWANY |
| 1,35 (dodatnia skończona) | 1,35 | 1,35 | `DEKLARACJA` | dostępne | dostępne | dostępny |
| 0 / 0.0 | `None` | 1,1 | `DANE_NIEPOPRAWNE` | ZABLOKOWANE | ZABLOKOWANE | ZABLOKOWANY |
| ujemna | `None` | 1,1 | `DANE_NIEPOPRAWNE` | ZABLOKOWANE | ZABLOKOWANE | ZABLOKOWANY |
| `True` / `False` | `None` | 1,1 | `DANE_NIEPOPRAWNE` | ZABLOKOWANE | ZABLOKOWANE | ZABLOKOWANY |
| `NaN` | `None` | 1,1 | `DANE_NIEPOPRAWNE` | ZABLOKOWANE | ZABLOKOWANE | ZABLOKOWANY |
| `+Inf` | `None` | 1,1 | `DANE_NIEPOPRAWNE` | ZABLOKOWANE | ZABLOKOWANE | ZABLOKOWANY |
| `-Inf` | `None` | 1,1 | `DANE_NIEPOPRAWNE` | ZABLOKOWANE | ZABLOKOWANE | ZABLOKOWANY |
| `"1.35"` (tekst) | `None` | 1,1 | `DANE_NIEPOPRAWNE` | ZABLOKOWANE | ZABLOKOWANE | ZABLOKOWANY |
| `"abc"` | `None` | 1,1 | `DANE_NIEPOPRAWNE` | ZABLOKOWANE | ZABLOKOWANE | ZABLOKOWANY |

**Rozdział pojęć jest strukturalny, nie opisowy.** `k_sc` (deklaracja),
`k_sc_efektywny` (wartość w rachunku) i `k_sc_zrodlo` (proweniencja) są
odrębnymi pojęciami; dwa ostatnie są WYPROWADZANE z pierwszego, więc nie mogą się
z nim rozjechać. Wartość efektywna jest ZAWSZE skończona i dodatnia — także w
stanie `DANE_NIEPOPRAWNE` — żeby żaden konsument nie musiał radzić sobie z `NaN`;
o niemiarodajności mówi ZNACZNIK, nie liczba.

Podanie wartości niepoprawnej przez operację domenową kończy się BŁĘDEM
(`converter.k_sc_invalid`), a nie cichym sprowadzeniem do braku.

---

## E. MACIERZ GOTOWOŚCI

### E.1 Szablony stacji — miary rozłączne

| Miara | Wynik |
|-------|-------|
| materializacja szablonu | 57/57 |
| brak `switch.catalog_ref_missing` | 57/57 |
| `engineering-readiness.ready` | 57/57 |
| LOAD_FLOW eligible | 57/57 |
| SC_3F eligible | 31/57 |
| SC_1F eligible | 0/57 |
| SC_2F eligible | 0/57 |
| FAULT_LOOP_NN eligible | 0/57 |
| SWZ_NN eligible | 0/57 |

`SC_3F = 31/57` to działanie granicy `k_sc` — 26 szablonów DER. Bramka sprawdza
predykat parzysty: zbiór zablokowanych MUSI równać się zbiorowi szablonów z
czynnym falownikiem.

### E.2 Zdolności wobec wkładu zwarciowego falownika

| Zdolność | Zależna od `k_sc` | Zachowanie przy niemiarodajnej danej |
|----------|-------------------|--------------------------------------|
| SHORT_CIRCUIT_3F | TAK | blokada `SI-110` / `SI-111` |
| SHORT_CIRCUIT_1F | TAK | blokada |
| PROTECTION | TAK | blokada |
| BREAKING_CAPACITY_SELECTION | TAK | blokada |
| PROTECTION_COORDINATION | TAK | blokada |
| SC_WITHSTAND_EVIDENCE | TAK | blokada |
| REGULATORY_EVIDENCE | TAK | blokada |
| LOAD_FLOW | NIE | dostępne |
| TOPOLOGY | NIE | dostępne |
| SLD | NIE | dostępne |
| EDITING | NIE | dostępne |

**Granica ZMIERZONA, nie uznaniowa:** `FAULT_LOOP_NN` i `SWZ_NN` NIE są
bramkowane. Ich fizyka to impedancja pętli zasilania (transformator + kabel), a
`fault_loop.service` używa `graph.inverter_sources` WYŁĄCZNIE do przycięcia
wyspy, nie do wkładu prądowego. Bramkowanie ich byłoby blokadą bez przyczyny.

Źródło `in_service=False` nie blokuje — nie dokłada prądu do zwarcia.

---

## F. KLASYFIKACJA NIEZMIENNIKÓW KATALOGU

Klasy: `KONIECZNOSC_FIZYCZNA`, `WYMOG_NORMOWY`,
`OGRANICZENIE_ZAKRESU_PRODUKTU` (mogą być TWARDE) oraz `WIARYGODNOSC`
(ostrzeżenie).

| Reguła | Było | Jest | Podstawa zmiany (z pomiarem) |
|--------|------|------|------------------------------|
| `R0 >= R1` | TWARDA | `WIARYGODNOSC` | Zależy od konstrukcji żyły powrotnej, ekranu i drogi powrotu przez ziemię. Pomiar katalogu: R0/R1 od 3,0 do 6,5 — spójnie, ale to nie czyni nierówności uniwersalną. |
| `P0 < Pk` | TWARDA | `WIARYGODNOSC` | Typowe dla transformatorów rozdzielczych (pomiar: P0/Pk 0,11–0,22), nie konieczność matematyczna dla każdej rodziny. |
| `Icw <= Icu` (SN) | TWARDA | `WIARYGODNOSC` | Różne wielkości znamionowe porównywane globalnie przez rodziny o różnym zakresie normy. Pomiar: 28 par, WSZYSTKIE równe — reguła i tak niczego nie rozstrzyga. |
| `0 < R/X < 1` | TWARDA | `WIARYGODNOSC` (górna granica) | Równoważnik SN jest zwykle indukcyjny (pomiar: 0,08–0,12), ale rezystancyjny może mieć R/X ≥ 1. Dodatniość R/X zostaje TWARDA. |
| `0 < i0% < 10` | TWARDA | `WIARYGODNOSC` | Zakres rozsądny dla rozdzielczych (pomiar: 0,25–2,8 %), nie uniwersalny dla specjalnych; górna granica była kontrolą jednostki. |

Reguły pozostające TWARDE mają teraz test Z OBU STRON
(`tests/network_model/catalog/test_niezmienniki_obie_strony.py`): rekord jawnie
niepoprawny, który MUSI zostać odrzucony, ORAZ wariant nietypowy, ale legalny,
który MUSI przejść. Przykład drugiej strony: `Ics = 100 % Icu` to legalny wariant
katalogowy (cały typoszereg Emax 2 wpisany w tej gałęzi) — reguła ze ścisłą
nierównością odrzuciłaby go.

---

## G. DZIEDZINA NAPIĘĆ

Reguła: **`U_m(aparatu) ≥ U_n(szyny)`** (PN-EN 62271-1), TA SAMA co
`czy_rodzina_obsluguje_napiecie`. Zakres wynika z zawartości katalogu, nie z
osobnej listy.

| `U_n` sieci | Dobrana klasa aparatu | Uwaga |
|-------------|----------------------|-------|
| 10 kV | 12 kV | |
| 11 kV | 12 kV | zamykane P1-DELTA-06 |
| 13,8 kV | 17,5 kV | wariant regionalny |
| 15 kV | 17,5 kV | 12 kV słusznie odrzucone (12 ≥ 15 fałsz) |
| 20 kV | 24 kV | |
| 22 kV | 24 kV | zamykane P1-DELTA-06 |
| 22,9 kV | 24 kV | wariant regionalny |
| 30 / 33 / 34,5 / 35 kV | BRAK | katalog nie ma klasy 36 kV — komunikat nazywa brakującą klasę |
| ≤ 1 kV | `APARAT_NN` | granica nN wg IEC 60038 |
| nieustalone / ≤ 0 | `PRZESTRZEN_NIEUSTALONA` | fail-closed, brak wiązania |

---

## H. WYNIKI MUTACJI

| ID | Mutacja | Werdykt | Dowód |
|----|---------|---------|-------|
| M01 | Usuń bramkowanie zdolności dla `DEFAULT_FORBIDDEN` `k_sc` | **KILLED** | `eligible=False`, blokada `SI-110` |
| M02 | Wpuść domyślny `k_sc` do miarodajnego SC | **KILLED** | `wklad_jest_miarodajny('DOMYSLNE_SYSTEMOWE')=False` |
| M03 | Serializuj domyślne 1,1 jako jawną deklarację | **KILLED** | `to_dict k_sc=None`, po obiegu `DOMYSLNE_SYSTEMOWE` |
| M04 | Podaj `+Inf` jako deklarację | **KILLED** | `(1.1, 'DANE_NIEPOPRAWNE')` |
| M05 | Podaj `NaN` jako deklarację | **KILLED** | `(1.1, 'DANE_NIEPOPRAWNE')` |
| M06 | Zwiąż `APARAT_NN` na szynie 15 kV | **KILLED** | `przestrzen(15.0)=APARAT_SN` |
| M07 | Nieznane napięcie domyślnie `APARAT_NN` | **KILLED** | `NIEUSTALONA`, dobór `None` |
| M08 | Szablon `ready=False` bez `switch.catalog_ref_missing` uchodzi za gotowy | **KILLED** | bramka asertuje `ready is True` ORAZ zero blokad |
| M09 | Brak proweniencji staje się `PRODUCTION_QUALIFIED` | **KILLED** | klasy wyłącznie `FIELD_COMPLETE_*` |
| M10 | Brak `P0`/`i0` akceptowany dla zdolności konsumującej | **KILLED** | `LOSS_MODEL` wymaga `p0_kw`, `LOAD_FLOW` wymaga `i0_percent` |
| M11 | Legalny wariant odrzucony twardą bramką wiarygodności | **KILLED** | zero reguł przeklasyfikowanych pozostało twardych |
| M12 | Niezgodność sumy SHA-256 dokumentu ABB | **KILLED** | test wiązania wyciąg–importer |
| M13 | Zmiana wartości znamionowej w wyciągu ABB | **KILLED** | mutacja `Icu` rozjeżdża wyciąg z katalogiem |
| M14 | Powrót zakazanego podstawienia liczby (V12K) | **KILLED** | guard `PASS` |

**Przeżyło: BRAK.**

### Uczciwa granica dowodu ABB

Dwie tabele wyciągnięte TYM SAMYM parserem z TEGO SAMEGO dokumentu **nie są**
niezależnymi dowodami — recenzent ma rację. Kontrola krzyżowa wyklucza błąd
EKSTRAKCJI UKŁADU tabeli (inny wiersz, przesunięta kolumna, pomylony nagłówek) i
tylko to. Mutacje M12/M13 dowodzą WIĄZANIA (wyciąg ↔ dokument ↔ katalog), a nie
zgodności z producentem. Weryfikacja wobec producenta wymagałaby dokumentu
niezależnego od tego, z którego dane pochodzą.

---

## I. DELTA CI

| Kategoria | Pozycja | Stan |
|-----------|---------|------|
| **NAPRAWIONE** | `V12K Extended Invariant Guards` (`meta.quantity`, budżet 0/znaleziono 1) | guard `PASS` |
| **ODZIEDZICZONE** | `pytest` — 7 niepowodzeń na `cac842855` wg raportu recenzenta | poza zakresem tej remediacji |
| **ODZIEDZICZONE** | `SLD Contract Tests (Vitest)` czerwone | poza zakresem; granica SLD nietknięta |
| **NOWE** | — | brak |

Odziedziczonych czerwieni nie przypisuję tej delcie i nie „naprawiam przy
okazji": recenzja wprost zakazuje oportunistycznego przepisywania niepowiązanych
obszarów dla zazielenienia gałęzi.

---

## J. NIEROZSTRZYGNIĘTE

1. **Warstwa dowodowa poza macierzą zdolności.** Granica `k_sc` działa na
   poziomie gotowości i ładunku solvera. Nie zmierzono w tej rundzie, czy
   istnieje ścieżka wstrzyknięcia gotowego wyniku SC wprost do generatora
   dokumentu dowodowego z pominięciem macierzy zdolności. Dopóki nie zmierzone —
   pozycja otwarta, nie „zamknięta z założenia".
2. **Blokada vs ostrzeżenie przy braku `k_sc`** — wdrożono BLOKADĘ zgodnie z
   decyzją właściciela. Skutek uboczny: każdy istniejący projekt z OZE traci
   miarodajność zwarciową do czasu uzupełnienia danych z kart producentów.
3. **Klasa 36 kV w katalogu APARAT_SN** — brak danych; sieci 30/33/34,5/35 kV
   pozostają bez doboru aparatu pola.
4. **Proweniencja 350+ pozycji przekształtników** — `DATA_ACQUISITION_REQUIRED`;
   wymaga kart producentów, których w repozytorium nie ma.
5. **Zakres napięć produktu** nie jest nigdzie ZADEKLAROWANY jako kontrakt —
   wynika z zawartości katalogu. To poprawa wobec zamkniętej mapy, ale nadal nie
   jest jawną deklaracją zakresu produktu.
6. **Kod dynamiczny** pozostaje `UNVALIDATED_MODEL`, D-00 fail-closed, PR #475
   niescalone. Ta remediacja niczego w tym obszarze nie zmienia.
