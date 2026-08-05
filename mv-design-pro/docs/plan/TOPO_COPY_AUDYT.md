# TOPO-COPY — audyt aliasingu kopii ENM w operacjach topologicznych

**Data:** 2026-08-05 · **Zakres:** `backend/src/enm/topology_ops.py` i jego wołający ·
**Dług nazwany w:** V12K-323 (pomiar wykonawcy DET-9) · **Status:** audyt zamknięty,
kontrakt rozstrzygnięty

---

## 1. Dług — pomiar wejściowy

`topology_ops` wykonuje `copy.deepcopy` CAŁEGO modelu ENM przy KAŻDYM dodawanym
elemencie, mimo że operacja domenowa, która ją woła, zrobiła już własną prywatną
głęboką kopię na wejściu. Koszt dodania N-tego elementu rośnie liniowo z rozmiarem
modelu.

Pomiar na budowie substratu 53 stacji
(`backend/tests/reference_networks/sld_substrate_52s.py`, sonda podmieniająca
`copy` w module i mierząca czas kopiowania):

| moduł | wywołań `deepcopy` | sekundy | udział w budowie |
|---|---:|---:|---:|
| `enm/topology_ops.py` | 737 | 6,594 | **60,5 %** |
| `enm/domain_operations.py` | 2 949 | 0,592 | 5,4 % |
| `enm/domain_operations_v2.py` | 60 | 1,172 | 10,8 % |
| **razem** | 3 746 | 8,358 | 76,7 % |

Budowa substratu: **10,90 s** (53 stacje, 88 gałęzi, 20 DER).
Kopie w `domain_operations*` to kopie GRANICZNE operacji (jedna na operację) plus
drobne kopie payloadów — one zostają. Do usunięcia jest wyłącznie warstwa
`topology_ops`, czyli 6,6 s z 10,9 s.

---

## 2. Inwentarz KLASY (nie instancji)

Karta nazwała `create_node:150` i `create_branch:291`. Wzorzec jest jednak KLASĄ:
**każda** funkcja mutująca w `topology_ops.py` kopiuje cały model. Pełny inwentarz
miejsc `copy.deepcopy(enm)` w module (stan przed naprawą):

| # | funkcja | linia `deepcopy` | mutowana kolekcja |
|---|---|---:|---|
| 1 | `create_node` | 150 | `buses` (append) |
| 2 | `update_node` | 186 | `buses[idx]` (write) |
| 3 | `delete_node` | 235 | `buses` (filter) |
| 4 | `create_branch` | 291 | `branches` (append) |
| 5 | `update_branch` | 368 | `branches[idx]` (write) |
| 6 | `delete_branch` | 405 | `branches` (filter) |
| 7 | `create_device` — transformator | 449 | `transformers` (append) |
| 8 | `create_device` — odbiór | 494 | `loads` (append) |
| 9 | `create_device` — generator | 521 | `generators` (append) |
| 10 | `create_device` — źródło | 560 | `sources` (append) |
| 11 | `update_device` | 633 | `<kolekcja>[idx]` (write) |
| 12 | `delete_device` | 663 | `<kolekcja>` (filter) |
| 13 | `create_measurement` | 712 | `measurements` (append) |
| 14 | `delete_measurement` | 755 | `measurements` (filter) |
| 15 | `attach_protection` | 824 | `protection_assignments` (append) |
| 16 | `update_protection` | 868 | `protection_assignments[idx]` (write) |
| 17 | `detach_protection` | 885 | `protection_assignments` (filter) |

**17 miejsc kopiowania w 14 funkcjach publicznych.** Funkcje odczytowe
(`compute_topology_summary`, `_detect_cycles`, `_check_cycle_on_add`, `_bus_refs_set`,
`_all_refs_set`, `_find_breaker_refs`, `_find_ct_refs`) nie kopiują — nie dotyczy ich nic
z tej karty.

Niezmiennik wspólny wszystkich 17: **kopia powstaje DOPIERO po bramce BLOCKER**.
Ścieżka błędu zwraca `TopologyOpResult(False, enm, …)` — ten sam obiekt, bez żadnej
mutacji. Ta własność jest podstawą kontraktu z §4 (operacja meldująca błąd nie
zostawia skutku) i została przypięta testem.

---

## 3. Audyt wywołań — kto woła, czym woła, co robi z wynikiem

Inwentarz zebrany mechanicznie (AST po `src/**`, `tests/**`): **59 wywołań w kodzie
produkcyjnym** — 35 w `domain_operations.py` (33 K1 + 2 K5), 10 w `domain_operations_v2.py`
(7 K2 + 3 K3), 14 w `api/enm.py` (lambdy jednej tablicy `_OP_DISPATCH`) — oraz
**81 wywołań w testach** w 53 funkcjach testowych. Razem **140**.

### K1 — operacje domenowe V1 (`enm/domain_operations.py`), 33 wywołania w 8 funkcjach

`add_grid_source_sn` (5), `continue_trunk_segment_sn` (2), `insert_station_on_segment_sn` (10),
`_insert_branch_point_on_segment_sn` (5), `start_branch_segment_sn` (2),
`insert_section_switch_sn` (7), `connect_secondary_ring_sn` (1), `add_transformer_sn_nn` (1).
Dziewiąta funkcja tego pliku, `append_station_on_endpoint`, woła operacje wyłącznie przez
domknięcie i jest rozliczona osobno jako K5.

* Wejściowy ENM to **prywatna kopia wołającego**: każda z tych funkcji ma własne
  `new_enm = copy.deepcopy(enm)` (linie 3364, 3990, 5169, 6045, 6388, 6620, 6817, 6960;
  K5 — 8331) i do operacji podaje WYŁĄCZNIE `new_enm`.
* Zwrócony model: `new_enm = result.enm` — przepięcie nazwy; przy mutacji in-place jest to
  przypisanie tego samego obiektu, więc bez skutku.
* Wejściowy `enm` po wywołaniu: **tylko odczyt** (np. `segment = _find_branch(enm, …)`
  w `insert_station_on_segment_sn:5003`, `_insert_branch_point_on_segment_sn:5959`,
  `insert_section_switch_sn:6567`). Ponieważ `enm` nigdy nie trafia do operacji, pozostaje
  nietknięty w OBU semantykach — te odczyty są poprawne tak samo przed i po zmianie.
* **Wynik: BEZPIECZNE przy mutacji in-place (33/33).**

### K2 — operacje domenowe V2 z kopią graniczną (`enm/domain_operations_v2.py`), 7 wywołań

`add_sn_bay` (kopia w 1928), `_add_converter_source_der_sn` (kopia w 3283).
Ten sam wzorzec co K1. Nazwy związane z modelu PRZED operacją (`station:1803`,
`existing_field:1809`, `bus_ref:1796`) pochodzą z **wejściowego `enm`** i po operacji są
wyłącznie CZYTANE (`station["ref_id"]`, `existing_field.get(…)`); zapisy idą przez
`_update_field_spec(new_enm, …)` / `_append_substation_field_spec(new_enm, …)`, czyli
rozwiązywane na bieżącym modelu.
**Wynik: BEZPIECZNE (7/7).**

### K3 — operacje domenowe V2 BEZ kopii granicznej, 3 wywołania — **WYMAGA kopii**

| operacja | wywołanie | co robi ze zwróconym modelem |
|---|---:|---|
| `add_ct` | `create_measurement(enm, …)` : 558 | `new_enm = result.enm`, następnie `measurement.update({…})` |
| `add_vt` | `create_measurement(enm, …)` : 702 | `new_enm = result.enm`, następnie `measurement.update({…})` |
| `add_relay` | `attach_protection(enm, …)` : 837 | `new_enm = result.enm`, `assignment.update({…})`, `_update_field_spec(new_enm, …)` |

Te trzy operacje podają **wprost swój argument wejściowy** i polegają na tym, że operacja
topologiczna odda KOPIĘ — bo zaraz potem dopisują do zwróconego modelu metadane
katalogowe. Przy mutacji in-place dopisywałyby do modelu wołającego.

Że to nie jest teoria, widać po dwóch realnych konsumentach wejściowego modelu PO operacji:

1. `execute_domain_operation` (`domain_operations.py:8828`) liczy
   `result["semantic_issues"] = validate_semantic_as_dicts(enm_dict)` na **argumencie
   wejściowym**, już po wykonaniu handlera. Bez kopii granicznej te trzy operacje (i tylko
   one) zaczęłyby raportować zagadnienia semantyczne z modelu PO zmianie, a pozostałe ~40
   nadal sprzed zmiany — niespójność wprowadzona tylnymi drzwiami.
2. `_zastosuj_wyposazenie_pol` (`domain_operations.py:4390`) woła `add_ct`/`add_vt`/`add_relay`
   w pętli na wspólnej migawce i przy błędzie któregokolwiek kroku **przerywa całą operację
   stacyjną**, oddając model sprzed serii (gwarancja B-3 „albo stacja z kompletnym
   wyposażeniem, albo nic"). Mutacja in-place bez kopii granicznej zostawiłaby w migawce
   wołającego CT/VT dopisane przed błędem — czyli dokładnie ten stan połowiczny, który
   B-3 usuwa.

**Rozstrzygnięcie: dokładamy kopię graniczną w `add_ct`/`add_vt`/`add_relay`**, tuż przed
wywołaniem operacji topologicznej (po wszystkich bramkach walidacji i katalogu). Koszt
zerowy: każda z tych operacji woła operację topologiczną DOKŁADNIE RAZ, więc jedna kopia
graniczna zastępuje jedną kopię wewnętrzną. Efekt: wszystkie operacje domenowe mają
JEDNO źródło prawdy o kopii — własną granicę.

### K4 — dyspozytor API (`api/enm.py`, `_OP_DISPATCH` 501–518), 14 lambd, 2 wejścia

Wejścia: `_topology_ops_pod_blokada` (POST `/{case_id}/enm/ops`) oraz
`_topology_ops_batch_pod_blokada` (POST `/{case_id}/enm/ops/batch`), oba pod
`blokada_przypadku(case_id)`.

* Argument to `enm.model_dump(mode="json")` — **struktura w pełni odczepiona** od modelu
  w magazynie. Zweryfikowane pomiarem, nie założeniem: dla pola `meta: dict[str, Any]`
  z zagnieżdżonym słownikiem i listą żaden z obiektów zrzutu nie jest tym samym obiektem
  co w modelu (`is` = False na trzech poziomach zagnieżdżenia, tryb `json` i `python`).
* Zwrócony model: `EnergyNetworkModel.model_validate(result.enm)` → `_set_enm(...)`.
* Wejściowy model po wywołaniu: w ścieżce błędu czytana jest wyłącznie
  `enm.header.revision` z **modelu pydantic**, nie ze zrzutu — wycofanie serii w trybie
  wsadowym nie zależy od stanu `enm_dict`.
* **Wynik: BEZPIECZNE (14/14).**

### K5 — domknięcie `_materialize_sn_field_apparatus` (`domain_operations.py:8206`), 2 wywołania

Czyta `new_enm` z zakresu otaczającego (`append_station_on_endpoint`, kopia w 8331), a drugą
operację łańcuchuje po `terminal_result.enm`. Wołający po każdym wywołaniu przepina
`new_enm = <wynik>.enm` i **ponownie rozwiązuje** lokalną referencję
(`new_substation = next(…)`, linia 8377) — idiom wprost udokumentowany w komentarzu w linii
8683: „handler … zwraca GŁĘBOKĄ KOPIĘ modelu: wcześniejsze podmienienie `new_enm`
unieważniłoby lokalne referencje". Przy mutacji in-place ponowne rozwiązanie zwraca
TEN SAM obiekt, więc idiom pozostaje poprawny (staje się zbędny, nie błędny).
Zapisy do `new_substation` (8419, 8470) następują między wywołaniami, po ponownym
rozwiązaniu. **Wynik: BEZPIECZNE (2/2).**

### K6 — wywołania bezpośrednie w testach, 81 wywołań w 53 funkcjach

`tests/test_topology_ops_determinism.py`, `tests/test_protection_assignment.py`,
`tests/test_branching_recursion.py`, `tests/test_topology_guardians_step1.py`.
Wzorzec bez wyjątku: `result = op(enm, …)` → `assert result.success` → `enm = result.enm`
(łańcuchowanie), albo `op(copy.deepcopy(enm), …)` tam, gdzie test porównuje dwa niezależne
przebiegi (`test_create_node_deterministic`, `test_create_branch_deterministic`,
`test_batch_operations_deterministic`). Asercje dotyczą wyłącznie `result.enm` i modelu
przepiętego. **Wynik: BEZPIECZNE (81/81).**

### Podsumowanie audytu

| kategoria | wywołań | BEZPIECZNE | WYMAGA kopii | NIEJASNE |
|---|---:|---:|---:|---:|
| K1 operacje domenowe V1 | 33 | 33 | 0 | 0 |
| K2 operacje domenowe V2 z kopią | 7 | 7 | 0 | 0 |
| K3 `add_ct`/`add_vt`/`add_relay` | 3 | 0 | **3** | 0 |
| K4 dyspozytor API | 14 | 14 | 0 | 0 |
| K5 domknięcie stacji na końcu ciągu | 2 | 2 | 0 | 0 |
| K6 testy | 81 | 81 | 0 | 0 |
| **razem** | **140** | **137** | **3** | **0** |

Pozycji NIEJASNYCH nie zostało: 19 miejsc, które analiza statyczna zgłosiła jako „bez
wykrytej kopii prywatnej", rozstrzygnięto ręcznie — 14 to lambdy dyspozytora API (K4, kopia
jest zrzutem modelu, weryfikacja pomiarowa), 2 to domknięcie stacji (K5, kopia w zakresie
otaczającym), 3 to `add_ct`/`add_vt`/`add_relay` (K3, kopia rzeczywiście brakująca —
dokładana).

### Trzy wzorce ryzyka, nie jeden

Audyt szukał TRZECH sposobów, na jakie mutacja w miejscu mogłaby zmienić zachowanie —
bo „czy wołający ma swoją kopię" odpowiada tylko na pierwszy z nich:

* **A — wołający podaje model, którego używa dalej.** Rozstrzygnięte tabelą wyżej (K1–K6).
* **B — wołający trzyma referencję do PODOBIEKTU modelu sprzed operacji.** Pod semantyką
  kopii taka referencja stawała się odczepiona (martwa); pod in-place zostaje żywa. Skan
  AST znalazł 22 takie wiązania. Wszystkie okazały się albo skalarami (napięcie, ref_id —
  semantyka wartości, kopia bez znaczenia), albo podobiektami wziętymi z **wejściowego
  `enm`**, którego żadna operacja nie dotyka, i wyłącznie CZYTANYMI po operacji
  (`segment` w `insert_station_on_segment_sn:5003`, `_insert_branch_point_on_segment_sn:5959`,
  `insert_section_switch_sn:6567`; `station`/`existing_field` w `add_sn_bay:1803/1809`).
  Jedyne miejsce, gdzie podobiekt jest po operacji ZAPISYWANY (`new_substation` w
  `append_station_on_endpoint:8419,8470`), ponownie rozwiązuje referencję z bieżącego
  modelu (linia 8377) — idiom wprowadzony właśnie pod semantykę kopii, poprawny również
  bez niej.
* **C — pętla po kolekcji modelu z operacją w ciele.** Pod semantyką kopii dopisanie
  elementu nie dotykało iterowanej listy; pod in-place dotknęłoby (pętla mogłaby się nie
  zakończyć). Skan AST po wszystkich pętlach `for … in <model>[…]` / `<model>.get('<kolekcja>')`
  w trzech plikach wołających: **0 wystąpień** — każda pętla wołająca operację iteruje po
  danych z payloadu (krotki ról pól, `range(liczba_portów)`), nie po kolekcji modelu.

---

## 4. Kontrakt — rozstrzygnięcie

**Wybrany mechanizm: `topology_ops` mutuje model IN-PLACE; kopiowanie jest
odpowiedzialnością granicy operacji domenowej.**

Uzasadnienie wprost z audytu, nie z wygody:

1. **137 ze 140 wywołań już dziś podaje prywatną kopię.** Kopia w `topology_ops` jest
   w tych miejscach czystym powtórzeniem pracy, którą wołający wykonał sekundę wcześniej.
2. **Jedyne 3 miejsca bez kopii to brak po stronie wołającego, nie potrzeba semantyki
   kopii w operacji.** `add_ct`/`add_vt`/`add_relay` są operacjami domenowymi tej samej klasy
   co `add_sn_bay` czy `add_grid_source_sn` i jako jedyne w swojej klasie nie miały własnej
   granicy. Dołożenie granicy USUWA niespójność, zamiast utrwalać ją parametrem.
3. **Wariant „jawny parametr / warianty `_inplace`" odrzucony**, bo audyt nie znalazł ANI
   JEDNEGO miejsca polegającego na semantyce kopii, którego nie da się naprawić granicą
   operacji. Parametr trybu dawałby dwie ścieżki zachowania w kodzie kanonicznym i wprost
   zapraszał do „a tu przekażę `False`, bo szybciej" — czyli do defektu aliasingu w miejscu
   niewidocznym z granicy.
4. **Deklaracja bez testu = fałszywa pewność.** Kontrakt (wejście mutowane w miejscu, wynik
   jest TYM SAMYM obiektem, ścieżka błędu bez skutku, granica operacji domenowej izoluje
   wołającego) jest PRZYPIĘTY testami w
   `backend/tests/enm/test_topology_ops_kontrakt_kopii.py` — również testami napisanymi
   PRZED chirurgią i przechodzącymi na starym kodzie (izolacja operacji domenowej), które
   przeżyły chirurgię bez zmiany treści.

### Zapis kontraktu

* Parametr operacji mutującej nazywa się `enm` i jest udokumentowany jako **mutowany
  w miejscu**; docstring modułu i każdej z 14 funkcji mówi to wprost.
* Sukces: `result.enm is enm` (ten sam obiekt, zmutowany).
* Błąd BLOCKER: `result.enm is enm` i model jest **bajtowo nietknięty** — walidacja biegnie
  w całości przed jakąkolwiek mutacją.
* Wołający, który potrzebuje izolacji od wejścia, robi kopię SAM, na swojej granicy —
  przed tą kartą robiło tak 11 operacji domenowych (9 w V1: linie 3364, 3990, 5169, 6045,
  6388, 6620, 6817, 6960, 8331; 2 w V2: 1928, 3283), po niej **14** (dochodzą
  `add_ct`/`add_vt`/`add_relay`).

**Odstępstwo od karty, świadome i zameldowane.** Karta prosiła o deklarację kontraktu
„w docstringu **i nazwie parametru**". Nazwa parametru została na `enm`. Powód: wszystkie
140 wywołań podaje model POZYCYJNIE (sprawdzone skanem AST), więc zmiana nazwy nie
pokazałaby się w żadnym miejscu wywołania — byłaby zmianą publicznej sygnatury 14 funkcji
bez ani jednego czytelnika. Nośnikiem deklaracji są zamiast tego: docstring modułu,
docstring KAŻDEJ z 14 funkcji (zdanie „MUTUJE `enm` W MIEJSCU") oraz testy kontraktu,
w tym test kompletności, który skanuje moduł i wywala się na funkcji mutującej bez pokrycia.

---

## 5. Weryfikacja

* **Kanarek determinizmu:** substrat 53 stacji (~700 operacji topologicznych na modelu
  rosnącym do 88 gałęzi) daje identyczny SHA-256 migawki przed i po zmianie:
  `b0e7518ed3736ea476a702eb79804f94460b8488b3de7b1ea3e8e5938410007c`.
* **Pomiar (zmierzone po chirurgii):**

  | | przed | po |
  |---|---:|---:|
  | budowa substratu 53 stacji | 10,900 s | **4,115 s** (−62 %; powtórka na drzewie po przywróceniu iniekcji: 4,057 s) |
  | kopie w `topology_ops` | 737 / 6,594 s | **0 / 0,000 s** |
  | kopie w `domain_operations` | 2 949 / 0,592 s | 2 949 / 0,657 s |
  | kopie w `domain_operations_v2` | 60 / 1,172 s | 60 / 1,140 s |

  Cel karty (~3 s) NIE został osiągnięty w pełni: pozostałe 1,80 s to kopie GRANICZNE
  operacji domenowych — jedna na operację, czyli dokładnie ten mechanizm, na którym stoi
  kontrakt izolacji z §4. Ich usunięcie wymagałoby przeniesienia izolacji o kolejny
  poziom wyżej (do dyspozytora operacji) i jest osobną decyzją kontraktową, nie
  kontynuacją tej karty. Liczba kopii granicznych `domain_operations` (2 949) to
  w większości drobne kopie payloadów i wiązań katalogowych, nie kopie modelu.

* **Pełna regresja backendu:** `poetry run pytest -q` RC=0 przed (8238 passed, 11 skipped,
  464 s) i po zmianie (8311 passed, 11 skipped, 396 s — regresja przyspieszyła o 15 %,
  bo z kopii korzystał również sam bieg testów). Bieg końcowy wykonany na drzewie PO
  przywróceniu obu iniekcji, a więc na dokładnie tym kodzie, który idzie do scalenia.

### Iniekcje — dowód, że testy wykrywają cofnięcie zmiany

**Iniekcja 1 — przywrócenie `deepcopy` w JEDNYM miejscu** (`create_node`, plus `import copy`).
Wykryta przez **cztery niezależne asercje**, w tym deterministyczną (nie czasową) asercję
liczby kopii, o którą prosiła karta:

| test | komunikat |
|---|---|
| `test_warstwa_topologiczna_nie_wykonuje_glebokich_kopii` | „warstwa topologiczna wykonała **4** głębokich kopii" |
| `test_modul_nie_zawiera_ani_jednej_glebokiej_kopii` | „topology_ops wykonuje głębokie kopie w liniach: **[175]**" |
| `test_sukces_zwraca_ten_sam_obiekt[create_node]` | wynik nie jest TYM SAMYM obiektem co wejście |
| `test_tabele_pokrywaja_kazda_funkcje_mutujaca_modulu` | „moduł ma **13** funkcji mutujących, audyt naliczył 14" |

`4 failed, 69 passed`. Przywrócenie pliku: SHA-256 `81f0d1ab…539a` — bajtowo zgodne.

**Iniekcja 2 — wycięcie kopii GRANICZNEJ w JEDNYM miejscu** (`add_ct`, `roboczy = enm`).
Wykryta przez **pięć asercji, wszystkie z klasy napisanej PRZED chirurgią**:
`test_operacja_nie_mutuje_modelu_wejsciowego[K3/ct]`,
`test_wynik_niezalezny_od_pozniejszych_mutacji_wejscia[K3/ct]`,
`test_wejscie_niezalezne_od_mutacji_wyniku[K3/ct]`,
`test_seria_operacji_na_wspolnej_migawce_izoluje_pierwotne_wejscie`,
`test_wyposazenie_pola_z_bledem_nie_zostawia_polowicznej_migawki`
(„nieudany krok serii zostawił ślad w modelu pierwotnym" — czyli dokładnie stan połowiczny
z §3/K3). `5 failed, 68 passed`. Przywrócenie pliku: SHA-256 `a290e8c0…e369` — bajtowo zgodne.
