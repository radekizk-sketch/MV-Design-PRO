# Uruchamianie analiz i gotowosc -- specyfikacja blokowania

| Pole              | Wartosc                                          |
|-------------------|--------------------------------------------------|
| Status            | **BINDING**                                      |
| Wersja            | 1.0                                              |
| Data              | 2026-02-17                                       |
| Warstwa           | Analiza + Solver (brama pre-obliczeniowa)        |
| Jezyk             | Polski (bez anglicyzmow w naglowkach/etykietach) |

> **REGULA**: Ten dokument definiuje kompletna specyfikacje blokowania analiz
> przez kody gotowosci (readiness codes). Zadna analiza nie moze byc uruchomiona
> przy obecnosci kodow BLOCKER dotyczacych jej zakresu.
> Obowiazuje rownoczesnie z: `READINESS_FIXACTIONS_CANONICAL_PL.md`.

---

## Spis tresci

1. [Warunek wstepny uruchomienia analizy](#1-warunek-wstepny-uruchomienia-analizy)
2. [Typy analiz i wymagania gotowosci](#2-typy-analiz-i-wymagania-gotowosci)
3. [Kompletna tabela kodow gotowosci](#3-kompletna-tabela-kodow-gotowosci)
4. [Specyfikacja akcji naprawczych](#4-specyfikacja-akcji-naprawczych)
5. [Determinizm priorytetow](#5-determinizm-priorytetow)
6. [Struktura wynikow analiz](#6-struktura-wynikow-analiz)
7. [Nakladki wynikowe na SLD](#7-nakladki-wynikowe-na-sld)
8. [Referencje](#8-referencje)

---

## 1. Warunek wstepny uruchomienia analizy

### 1.1 Regula naczelna (BINDING)

```
Analiza moze byc uruchomiona WYLACZNIE gdy:
  - Brak kodow gotowosci na poziomie BLOCKER
    dla obszarow wymaganych przez dana analize
  - Istnieje aktywny StudyCase z konfiguracja
  - Model ENM przeszedl walidacje NetworkValidator (13 regul)
```

### 1.2 Brama obliczeniowa (AnalysisAvailability)

Brama obliczeniowa jest deterministyczna -- ten sam model ENM = te same dostepne analizy.

```
Wejscie: Model ENM (snapshot) + StudyCase (config)
    |
    v
NetworkValidator (13 regul: E001--E008 + W001--W005)
    |
    v
ReadinessEvaluator (35 kodow gotowosci)
    |
    v
AnalysisAvailability:
    SC_3F:       true / false
    SC_2F:       true / false
    SC_1F:       true / false
    LOAD_FLOW:   true / false
    PROTECTION:  true / false
```

### 1.3 Logika blokowania

```python
# Pseudokod bramy obliczeniowej
blocker_codes = [c for c in readiness_codes if c.level == "BLOCKER"]

if len(blocker_codes) > 0:
    # Sprawdz czy BLOCKER-y dotycza zakresu danej analizy
    for analysis_type in [SC_3F, SC_2F, SC_1F, LOAD_FLOW, PROTECTION]:
        required_areas = get_required_areas(analysis_type)
        blocking = [c for c in blocker_codes if c.area in required_areas]
        availability[analysis_type] = len(blocking) == 0
else:
    # Brak BLOCKER-ow -- wszystkie analizy dostepne
    availability = {t: True for t in ALL_ANALYSIS_TYPES}
```

---

## 2. Typy analiz i wymagania gotowosci

### 2.1 Matryca analiz i wymaganych obszarow

| Typ analizy       | Operacja kanoniczna       | Wymagane obszary wolne od BLOCKER-ow                  | Dodatkowe wymagania                               |
|-------------------|---------------------------|-------------------------------------------------------|---------------------------------------------------|
| **SC_3F**         | `run_short_circuit` (fault_type=SC3F) | TOPOLOGY + SOURCES + CATALOGS               | Co najmniej 1 Bus + 1 Source w modelu             |
| **SC_2F**         | `run_short_circuit` (fault_type=SC2F) | TOPOLOGY + SOURCES + CATALOGS                | Jak SC_3F                                          |
| **SC_1F**         | `run_short_circuit` (fault_type=SC1F) | TOPOLOGY + SOURCES + CATALOGS + dane uziemienia (Z0) | Z0 na wszystkich liniach/kablach i zrodlach  |
| **SC_2FE**        | `run_short_circuit` (fault_type=SC2FE) | TOPOLOGY + SOURCES + CATALOGS + dane uziemienia (Z0) | Jak SC_1F                                   |
| **LOAD_FLOW**     | `run_power_flow`          | TOPOLOGY + SOURCES + CATALOGS + GENERATORS            | Co najmniej 1 Load lub 1 Generator                |
| **PROTECTION**    | `validate_selectivity` / `calculate_tcc_curve` | TOPOLOGY + SOURCES + CATALOGS + PROTECTION | Wyniki SC (SC_3F) musza byc w stanie FRESH   |

### 2.2 Szczegolowe wymagania per analiza

#### SC_3F (Zwarcie trojfazowe symetryczne IEC 60909)

| Warunek                            | Kod BLOCKER (jesli niespelniony)           | Opis                                        |
|-------------------------------------|--------------------------------------------|--------------------------------------------|
| Istnieje Source w modelu            | `source.grid_supply_missing`               | Brak zrodla zasilania                       |
| Source ma parametry zwarciowe       | `source.sn_voltage_missing`                | Brak napiecia na zrodle                     |
| Source jest podlaczony do szyny     | `source.connection_missing`                | Zrodlo niepodlaczone                        |
| Szyny maja napiecie                 | `bus.sn_voltage_missing`                   | Brak napiecia na szynie                     |
| Odcinki maja katalog                | `line.catalog_ref_missing`                 | Brak katalogu na odcinku                    |
| Odcinki maja dlugosc                | `line.length_missing`                      | Brak dlugosci odcinka                       |
| Graf jest spojny                   | (E003 -- NetworkValidator)                 | Izolowane wyspy                             |
| Impedancja niezerowa               | (E005 -- NetworkValidator)                 | R=0 i X=0 na segmencie                     |
| Pierscienie maja NOP               | `ring.nop_required`                        | Brak NOP w pierścieniu                      |

#### SC_1F (Zwarcie jednofazowe)

Wszystkie wymagania SC_3F PLUS:

| Warunek                            | Kod BLOCKER                                 | Opis                                        |
|-------------------------------------|--------------------------------------------|--------------------------------------------|
| Dane uziemienia na liniach (Z0)    | (W001 -- NetworkValidator, podniesiony do BLOCKER dla SC_1F) | Brak skladowej zerowej |
| Dane uziemienia na zrodle          | (dodatkowa walidacja SC_1F)                | Brak parametrow Z0 zrodla                   |

#### LOAD_FLOW (Rozplyw mocy Newton-Raphson)

Wszystkie wymagania SC_3F PLUS:

| Warunek                            | Kod BLOCKER                                 | Opis                                        |
|-------------------------------------|--------------------------------------------|--------------------------------------------|
| Obecnosc odbioru lub generatora    | (AnalysisAvailability: has_loads or has_generators) | Brak punktow mocy                |
| Falowniki maja katalog              | `pv.inverter_catalog_missing` / `bess.inverter_catalog_missing` | Brak katalogu falownika       |
| Falowniki maja transformator       | `pv.transformer_required` / `bess.transformer_required` | Brak transformatora w sciezce   |
| Magazyny BESS maja pojemnosc       | `bess.energy_missing`                      | Brak parametrow pojemnosci                  |
| Zrodla maja tryb pracy             | `source.operating_mode_missing`            | Brak trybu pracy                            |

#### PROTECTION (Analiza zabezpieczen)

Wszystkie wymagania SC_3F PLUS:

| Warunek                            | Kod BLOCKER                                 | Opis                                        |
|-------------------------------------|--------------------------------------------|--------------------------------------------|
| Wyniki SC w stanie FRESH           | `analysis.blocked_by_readiness`            | Wymagane aktualne wyniki zwarciowe          |
| Pola maja przekladnik CT           | `protection.ct_missing`                    | Brak CT na polu                             |
| Pola maja przekaznik               | `protection.relay_missing`                 | Brak przekaznika na polu                    |
| Przekazniki maja nastawy           | `protection.relay_settings_missing`        | Brak nastaw przekaznika                     |

---

## 3. Kompletna tabela kodow gotowosci

### 3.1 Zrodla zasilania i szyny (SOURCES / TOPOLOGY)

| Nr | Kod                          | Obszar    | Priorytet | Poziom  | Komunikat PL                                               | Akcja naprawcza         | Nawigacja                                           |
|----|------------------------------|-----------|-----------|---------|-------------------------------------------------------------|-------------------------|-----------------------------------------------------|
| 1  | `source.sn_voltage_missing`  | SOURCES   | 1         | BLOCKER | Brak napiecia znamionowego SN zrodla zasilania              | `fix_source_voltage`    | panel: inspector, zakladka: parametry, pole: voltage_kv |
| 2  | `bus.sn_voltage_missing`     | TOPOLOGY  | 1         | BLOCKER | Szyna nie ma zdefiniowanego napiecia SN                     | `fix_bus_voltage`       | panel: inspector, zakladka: parametry, pole: voltage_kv |
| 3  | `source.connection_missing`  | SOURCES   | 2         | BLOCKER | Zrodlo zasilania nie jest podlaczone do szyny               | `fix_source_connection` | panel: inspector, zakladka: polaczenia               |
| 4  | `source.grid_supply_missing` | SOURCES   | 1         | BLOCKER | Brak zrodla zasilania sieciowego (GPZ)                      | `fix_add_source`        | panel: kreator, modal: dodaj_zrodlo                 |

### 3.2 Odcinki SN (TOPOLOGY / CATALOGS)

| Nr | Kod                          | Obszar    | Priorytet | Poziom  | Komunikat PL                                               | Akcja naprawcza         | Nawigacja                                           |
|----|------------------------------|-----------|-----------|---------|-------------------------------------------------------------|-------------------------|-----------------------------------------------------|
| 5  | `line.catalog_ref_missing`   | CATALOGS  | 3         | BLOCKER | Odcinek SN nie ma przypisanego katalogu                     | `fix_line_catalog`      | panel: inspector, zakladka: katalog, modal: wybor_katalogu |
| 6  | `line.length_missing`        | TOPOLOGY  | 2         | BLOCKER | Odcinek SN nie ma zdefiniowanej dlugosci                    | `fix_line_length`       | panel: inspector, zakladka: parametry, pole: length_km |
| 7  | `line.type_missing`          | TOPOLOGY  | 2         | BLOCKER | Odcinek SN nie ma zdefiniowanego typu (kabel/linia)         | `fix_line_type`         | panel: inspector, zakladka: parametry, pole: typ     |

### 3.3 Stacje (STATIONS)

| Nr | Kod                              | Obszar    | Priorytet | Poziom   | Komunikat PL                                              | Akcja naprawcza              | Nawigacja                                        |
|----|----------------------------------|-----------|-----------|----------|------------------------------------------------------------|-----------------------------|--------------------------------------------------|
| 8  | `station.required_field_missing` | STATIONS  | 3         | BLOCKER  | Stacja nie ma wymaganego pola SN                           | `fix_station_field`          | panel: inspector, zakladka: pola, modal: dodaj_pole |
| 9  | `station.transformer_required`   | STATIONS  | 2         | BLOCKER  | Stacja SN/nN wymaga transformatora                         | `fix_station_transformer`    | panel: inspector, zakladka: transformator, modal: dodaj_transformator |
| 10 | `station.nn_bus_required`        | STATIONS  | 2         | BLOCKER  | Stacja nie ma szyny nN                                     | `fix_station_nn_bus`         | panel: inspector, zakladka: nN, modal: dodaj_szyne_nn |
| 11 | `station.nn_outgoing_min_1`      | STATIONS  | 4         | WARNING  | Stacja powinna miec co najmniej 1 odplyw nN                | `fix_station_outgoing`       | panel: inspector, zakladka: nN, modal: dodaj_odplyw_nn |

### 3.4 Pierscienie i NOP (TOPOLOGY)

| Nr | Kod                          | Obszar    | Priorytet | Poziom  | Komunikat PL                                               | Akcja naprawcza         | Nawigacja                                           |
|----|------------------------------|-----------|-----------|---------|-------------------------------------------------------------|-------------------------|-----------------------------------------------------|
| 12 | `ring.nop_required`          | TOPOLOGY  | 3         | BLOCKER | Pierscien SN wymaga punktu normalnie otwartego (NOP)        | `fix_ring_nop`          | panel: sld, modal: ustaw_nop                        |
| 13 | `terminal.not_open`          | TOPOLOGY  | 5         | INFO    | Terminal magistrali jest zajety                               | brak                    | brak                                                |
| 14 | `ring.endpoints_invalid`     | TOPOLOGY  | 2         | BLOCKER | Punkty koncowe pierscienia sa nieprawidlowe                 | `fix_ring_endpoints`    | panel: sld                                          |

### 3.5 Strona nN (STATIONS / CATALOGS)

| Nr | Kod                              | Obszar    | Priorytet | Poziom   | Komunikat PL                                              | Akcja naprawcza              | Nawigacja                                        |
|----|----------------------------------|-----------|-----------|----------|------------------------------------------------------------|-----------------------------|--------------------------------------------------|
| 15 | `nn.bus_required`                | STATIONS  | 2         | BLOCKER  | Stacja wymaga szyny nN                                     | `fix_nn_bus`                 | panel: inspector, zakladka: nN                   |
| 16 | `nn.main_breaker_required`       | STATIONS  | 3         | BLOCKER  | Szyna nN wymaga wylacznika glownego                        | `fix_nn_breaker`             | panel: inspector, zakladka: nN                   |
| 17 | `nn.outgoing_catalog_missing`    | CATALOGS  | 4         | WARNING  | Odplyw nN nie ma katalogu                                  | `fix_nn_outgoing_catalog`    | panel: inspector, zakladka: katalog              |
| 18 | `nn.load_parameters_missing`     | STATIONS  | 4         | WARNING  | Odbior nN nie ma parametrow mocy                           | `fix_nn_load_params`         | panel: inspector, zakladka: parametry            |

### 3.6 OZE -- zrodla rozproszone (GENERATORS / CATALOGS / ANALYSIS)

| Nr | Kod                              | Obszar      | Priorytet | Poziom   | Komunikat PL                                              | Akcja naprawcza         | Nawigacja                                           |
|----|----------------------------------|-------------|-----------|----------|------------------------------------------------------------|-----------------------|-----------------------------------------------------|
| 19 | `pv.transformer_required`        | GENERATORS  | 1         | BLOCKER  | Falownik PV wymaga transformatora w sciezce zasilania      | `fix_pv_transformer`  | panel: inspector, zakladka: transformator           |
| 20 | `bess.transformer_required`      | GENERATORS  | 1         | BLOCKER  | Falownik BESS wymaga transformatora w sciezce zasilania    | `fix_bess_transformer` | panel: inspector, zakladka: transformator          |
| 21 | `pv.inverter_catalog_missing`    | CATALOGS    | 3         | BLOCKER  | Falownik PV nie ma katalogu                                | `fix_pv_catalog`      | panel: inspector, zakladka: katalog                 |
| 22 | `bess.inverter_catalog_missing`  | CATALOGS    | 3         | BLOCKER  | Falownik BESS nie ma katalogu                              | `fix_bess_catalog`    | panel: inspector, zakladka: katalog                 |
| 23 | `bess.energy_missing`            | GENERATORS  | 2         | BLOCKER  | Magazyn energii BESS nie ma parametrow pojemnosci          | `fix_bess_energy`     | panel: inspector, zakladka: parametry               |
| 24 | `source.operating_mode_missing`  | GENERATORS  | 3         | BLOCKER  | Zrodlo nN nie ma ustawionego trybu pracy                   | `fix_source_mode`     | panel: inspector, zakladka: tryb_pracy              |
| 25 | `dynamic.profile_invalid`        | ANALYSIS    | 4         | WARNING  | Profil dynamiczny jest nieprawidlowy                       | `fix_dynamic_profile` | panel: inspector, zakladka: profil                  |

### 3.7 Ochrona (PROTECTION)

| Nr | Kod                                  | Obszar      | Priorytet | Poziom   | Komunikat PL                                              | Akcja naprawcza         | Nawigacja                                           |
|----|--------------------------------------|-------------|-----------|----------|------------------------------------------------------------|-----------------------|-----------------------------------------------------|
| 26 | `protection.ct_missing`              | PROTECTION  | 2         | BLOCKER  | Pole nie ma przekladnika pradowego (CT)                    | `fix_add_ct`          | panel: inspector, zakladka: ochrona, modal: dodaj_ct |
| 27 | `protection.vt_missing`              | PROTECTION  | 3         | WARNING  | Pole nie ma przekladnika napieciowego (VT)                 | `fix_add_vt`          | panel: inspector, zakladka: ochrona, modal: dodaj_vt |
| 28 | `protection.relay_missing`           | PROTECTION  | 2         | BLOCKER  | Pole nie ma przekaznika ochronnego                         | `fix_add_relay`       | panel: inspector, zakladka: ochrona, modal: dodaj_przekaznik |
| 29 | `protection.relay_settings_missing`  | PROTECTION  | 3         | BLOCKER  | Przekaznik nie ma nastaw                                   | `fix_relay_settings`  | panel: inspector, zakladka: ochrona, modal: nastawy_przekaznika |
| 30 | `protection.selectivity_failed`      | PROTECTION  | 4         | WARNING  | Selektywnosc ochrony nie jest zapewniona                   | `fix_selectivity`     | panel: ochrona, zakladka: selektywnosc              |

### 3.8 Analiza i przypadki obliczeniowe (ANALYSIS)

| Nr | Kod                              | Obszar    | Priorytet | Poziom   | Komunikat PL                                              | Akcja naprawcza              | Nawigacja                                        |
|----|----------------------------------|-----------|-----------|----------|------------------------------------------------------------|-----------------------------|--------------------------------------------------|
| 31 | `analysis.blocked_by_readiness`  | ANALYSIS  | 1         | BLOCKER  | Analiza zablokowana -- wymagane naprawienie problemow gotowosci | `fix_readiness`         | panel: gotowosc                                  |
| 32 | `study_case.invalid_state`       | ANALYSIS  | 2         | BLOCKER  | Przypadek obliczeniowy ma nieprawidlowa konfiguracje       | `fix_study_case`            | panel: przypadek_obliczeniowy                    |
| 33 | `study_case.profile_missing`     | ANALYSIS  | 3         | WARNING  | Przypadek obliczeniowy nie ma profilu czasowego             | `fix_study_case_profile`    | panel: przypadek_obliczeniowy, zakladka: profil  |

### 3.9 Podsumowanie statystyczne

| Poziom      | Liczba kodow |
|-------------|-------------|
| BLOCKER     | 27          |
| WARNING     | 7           |
| INFO        | 1           |
| **Razem**   | **35**      |

| Obszar      | Liczba kodow |
|-------------|-------------|
| SOURCES     | 4           |
| TOPOLOGY    | 7           |
| CATALOGS    | 4           |
| STATIONS    | 6           |
| GENERATORS  | 5           |
| PROTECTION  | 5           |
| ANALYSIS    | 4           |

---

## 4. Specyfikacja akcji naprawczych

### 4.1 Struktura akcji naprawczej (BINDING)

Kazda akcja naprawcza (fix_action) posiada nastepujaca strukture:

```json
{
  "code": "fix_station_transformer",
  "description_pl": "Dodaj transformator do stacji ST-01 Wschodnia",
  "target_element_id": "station-st-01",
  "navigation": {
    "screen": "sld",
    "panel": "inspector",
    "tab": "transformator",
    "modal": "add_transformer_sn_nn",
    "step": null,
    "focus": null
  }
}
```

### 4.2 Opis pol

| Pole                  | Typ      | Wymagane | Opis                                                      |
|-----------------------|----------|----------|------------------------------------------------------------|
| `code`                | tekst    | TAK      | Identyfikator akcji naprawczej (unikalny w systemie)       |
| `description_pl`      | tekst    | TAK      | Opis w jezyku polskim -- co nalezy zrobic                  |
| `target_element_id`   | tekst    | TAK      | ID elementu ktorego dotyczy naprawa                        |
| `navigation.screen`   | tekst    | TAK      | Ekran docelowy (sld, kreator, ochrona, gotowosc, przypadek_obliczeniowy) |
| `navigation.panel`    | tekst    | TAK      | Panel docelowy (inspector, kreator, sld, gotowosc)         |
| `navigation.tab`      | tekst    | NIE      | Zakladka wewnatrz panelu                                   |
| `navigation.modal`    | tekst    | NIE      | Okno modalne do otwarcia                                   |
| `navigation.step`     | tekst    | NIE      | Krok kreatora (K1--K10)                                    |
| `navigation.focus`    | tekst    | NIE      | Pole formularza do podswietlenia                           |

### 4.3 Zachowanie po kliknieciu akcji naprawczej

Klikniecie akcji naprawczej przez uzytkownika:

```
1. System nawiguje do wskazanego ekranu (screen)
2. Otwiera wskazany panel (panel)
3. Przelacza na wskazana zakladke (tab) -- jesli podana
4. Otwiera okno modalne (modal) -- jesli podane
5. Ustawia fokus na polu formularza (focus) -- jesli podane
6. Podswietla element docelowy na SLD (target_element_id)
```

### 4.4 Kompletna lista akcji naprawczych

| Akcja naprawcza              | Powiazane kody gotowosci                          | Opis dzialania                                    |
|------------------------------|---------------------------------------------------|---------------------------------------------------|
| `fix_source_voltage`         | `source.sn_voltage_missing`                       | Otwiera inspector zrodla, pole napiecia            |
| `fix_bus_voltage`            | `bus.sn_voltage_missing`                          | Otwiera inspector szyny, pole napiecia             |
| `fix_source_connection`      | `source.connection_missing`                       | Otwiera inspector zrodla, zakladka polaczen        |
| `fix_add_source`             | `source.grid_supply_missing`                      | Otwiera kreator, modal dodawania zrodla            |
| `fix_line_catalog`           | `line.catalog_ref_missing`                        | Otwiera inspector odcinka, modal wyboru katalogu   |
| `fix_line_length`            | `line.length_missing`                             | Otwiera inspector odcinka, pole dlugosci           |
| `fix_line_type`              | `line.type_missing`                               | Otwiera inspector odcinka, pole typu               |
| `fix_station_field`          | `station.required_field_missing`                  | Otwiera inspector stacji, modal dodawania pola     |
| `fix_station_transformer`    | `station.transformer_required`                    | Otwiera inspector stacji, modal dodawania trafo    |
| `fix_station_nn_bus`         | `station.nn_bus_required`                         | Otwiera inspector stacji, zakladka nN              |
| `fix_station_outgoing`       | `station.nn_outgoing_min_1`                       | Otwiera inspector stacji, modal odplywu nN         |
| `fix_ring_nop`               | `ring.nop_required`                               | Otwiera SLD, modal ustawiania NOP                  |
| `fix_ring_endpoints`         | `ring.endpoints_invalid`                          | Nawiguje do punktow koncowych na SLD               |
| `fix_nn_bus`                 | `nn.bus_required`                                 | Otwiera inspector stacji, zakladka nN              |
| `fix_nn_breaker`             | `nn.main_breaker_required`                        | Otwiera inspector stacji, zakladka nN              |
| `fix_nn_outgoing_catalog`    | `nn.outgoing_catalog_missing`                     | Otwiera inspector odplywu, zakladka katalogu       |
| `fix_nn_load_params`         | `nn.load_parameters_missing`                      | Otwiera inspector odbioru, zakladka parametrow     |
| `fix_pv_transformer`         | `pv.transformer_required`                         | Otwiera inspector stacji, zakladka transformatora  |
| `fix_bess_transformer`       | `bess.transformer_required`                       | Otwiera inspector stacji, zakladka transformatora  |
| `fix_pv_catalog`             | `pv.inverter_catalog_missing`                     | Otwiera inspector falownika, zakladka katalogu     |
| `fix_bess_catalog`           | `bess.inverter_catalog_missing`                   | Otwiera inspector falownika, zakladka katalogu     |
| `fix_bess_energy`            | `bess.energy_missing`                             | Otwiera inspector BESS, zakladka parametrow        |
| `fix_source_mode`            | `source.operating_mode_missing`                   | Otwiera inspector zrodla, zakladka trybu pracy     |
| `fix_dynamic_profile`        | `dynamic.profile_invalid`                         | Otwiera inspector zrodla, zakladka profilu         |
| `fix_add_ct`                 | `protection.ct_missing`                           | Otwiera inspector pola, modal dodawania CT         |
| `fix_add_vt`                 | `protection.vt_missing`                           | Otwiera inspector pola, modal dodawania VT         |
| `fix_add_relay`              | `protection.relay_missing`                        | Otwiera inspector pola, modal dodawania przekaznika |
| `fix_relay_settings`         | `protection.relay_settings_missing`               | Otwiera inspector przekaznika, modal nastaw        |
| `fix_selectivity`            | `protection.selectivity_failed`                   | Otwiera panel koordynacji zabezpieczen             |
| `fix_readiness`              | `analysis.blocked_by_readiness`                   | Otwiera panel gotowosci z lista BLOCKER-ow         |
| `fix_study_case`             | `study_case.invalid_state`                        | Otwiera panel przypadku obliczeniowego             |
| `fix_study_case_profile`     | `study_case.profile_missing`                      | Otwiera panel przypadku, zakladka profilu          |

---

## 5. Determinizm priorytetow

### 5.1 Regula sortowania (BINDING)

Jesli model ENM zawiera wiele kodow gotowosci, sa one prezentowane uzytkownikowi w scisle deterministycznym porzadku:

```
Sortowanie wielopoziomowe:
  1. Poziom:    BLOCKER (1) > WARNING (2) > INFO (3)
  2. Priorytet: nizszy numer = wyzszy priorytet (1 jest najwazniejszy)
  3. Obszar:    alfabetycznie (ANALYSIS < CATALOGS < GENERATORS < ...)
  4. Kod:       alfabetycznie w ramach tego samego obszaru
```

### 5.2 Przyklad sortowania

Dla modelu z nastepujacymi kodami:

```
[source.grid_supply_missing]  -> SOURCES,   priorytet 1, BLOCKER
[ring.nop_required]           -> TOPOLOGY,  priorytet 3, BLOCKER
[line.catalog_ref_missing]    -> CATALOGS,  priorytet 3, BLOCKER
[station.nn_outgoing_min_1]   -> STATIONS,  priorytet 4, WARNING
[terminal.not_open]           -> TOPOLOGY,  priorytet 5, INFO
```

Kolejnosc prezentacji:

```
1. source.grid_supply_missing    (BLOCKER, priorytet 1)
2. line.catalog_ref_missing      (BLOCKER, priorytet 3, CATALOGS)
3. ring.nop_required             (BLOCKER, priorytet 3, TOPOLOGY)
4. station.nn_outgoing_min_1     (WARNING, priorytet 4)
5. terminal.not_open             (INFO,    priorytet 5)
```

### 5.3 Gwarancja determinizmu

Ten sam model ENM zawsze produkuje te sama liste kodow gotowosci w tej samej kolejnosci. Gwarancja ta jest wymagana do:
- reprodukowalnosci stanu interfejsu
- deterministycznych testow
- audytowalnosci decyzji blokowania

---

## 6. Struktura wynikow analiz

### 6.1 Wyniki zwarcia (SC) -- ShortCircuitResult

Wyniki obliczen zwarciowych IEC 60909 sa zamrozone (frozen dataclass):

```json
{
  "analysis_type": "SC_3F",
  "solver_version": "iec60909_v3.2",
  "case_id": "case-bazowy-lato-2026",
  "fault_bus_results": {
    "bus-st-01-sn": {
      "bus_id": "bus-st-01-sn",
      "bus_name": "Szyna SN ST-01",
      "voltage_kv": 15.0,
      "ikss_ka": 8.234,
      "ip_ka": 19.876,
      "ith_ka": 8.156,
      "idyn_ka": 19.876,
      "sk_mva": 213.8,
      "z_thevenin_ohm": {"r": 0.324, "x": 1.052},
      "white_box_trace": {
        "steps": [
          "1. Macierz admitancji wezlowej Y-bus: 12x12",
          "2. Impedancja Thevenina: Z_th = (0.324 + j1.052) ohm",
          "3. Prad zwarciowy poczatkowy: Ik'' = c * Un / (sqrt(3) * |Z_th|) = 1.10 * 15.0 / (sqrt(3) * 1.101) = 8.234 kA",
          "4. Prad udarowy: ip = kappa * sqrt(2) * Ik'' = 1.707 * 1.414 * 8.234 = 19.876 kA",
          "5. Prad cieplny: Ith = Ik'' * sqrt(m + n) = 8.234 * sqrt(0.980 + 0.002) = 8.156 kA"
        ]
      }
    },
    "bus-st-02-sn": {
      "bus_id": "bus-st-02-sn",
      "bus_name": "Szyna SN ST-02",
      "voltage_kv": 15.0,
      "ikss_ka": 6.789,
      "ip_ka": 16.234,
      "ith_ka": 6.721,
      "idyn_ka": 16.234,
      "sk_mva": 176.3,
      "z_thevenin_ohm": {"r": 0.456, "x": 1.278},
      "white_box_trace": { "steps": ["..."] }
    }
  }
}
```

#### Pola wynikow SC per punkt zwarcia (BINDING -- zamrozone)

| Pole              | Jednostka | Opis                                          | Norma IEC 60909     |
|-------------------|-----------|-----------------------------------------------|---------------------|
| `ikss_ka`         | kA        | Prad zwarciowy poczatkowy symetryczny Ik''     | Sekcja 4.2          |
| `ip_ka`           | kA        | Prad udarowy (szczytowy) ip                    | Sekcja 4.3.1        |
| `ith_ka`          | kA        | Prad cieplny rownowazny Ith                    | Sekcja 4.8          |
| `idyn_ka`         | kA        | Prad dynamiczny (= ip)                         | Sekcja 4.3          |
| `sk_mva`          | MVA       | Moc zwarciowa Sk''                              | Sekcja 4.2          |
| `z_thevenin_ohm`  | ohm       | Impedancja Thevenina (R + jX)                  | Sekcja 4.2          |

**UWAGA**: Pola `idyn_ka` i `ith_ka` sa OBOWIAZKOWE w wynikach SC_3F (patrz: SYSTEM_SPEC.md, sekcja 5.2).

### 6.2 Wyniki rozplywu mocy (LOAD_FLOW) -- PowerFlowResult

```json
{
  "analysis_type": "LOAD_FLOW",
  "solver_version": "power_flow_newton_v2.1",
  "case_id": "case-bazowy-lato-2026",
  "convergence": {
    "converged": true,
    "iterations": 7,
    "max_mismatch_pu": 0.000000342,
    "tolerance": 0.000001
  },
  "bus_voltages": {
    "bus-gpz-szyna-15kv": {
      "bus_id": "bus-gpz-szyna-15kv",
      "bus_name": "Szyna GPZ 15 kV",
      "voltage_kv": 15.0,
      "voltage_pu": 1.000,
      "angle_deg": 0.000,
      "deviation_percent": 0.0,
      "within_limits": true,
      "limit_low_pu": 0.95,
      "limit_high_pu": 1.05
    },
    "bus-st-01-sn": {
      "bus_id": "bus-st-01-sn",
      "bus_name": "Szyna SN ST-01",
      "voltage_kv": 14.82,
      "voltage_pu": 0.988,
      "angle_deg": -1.234,
      "deviation_percent": -1.2,
      "within_limits": true,
      "limit_low_pu": 0.95,
      "limit_high_pu": 1.05
    }
  },
  "branch_flows": {
    "branch-l1-01-a": {
      "branch_id": "branch-l1-01-a",
      "branch_name": "Segment L1-01-a",
      "from_bus_id": "bus-gpz-szyna-15kv",
      "to_bus_id": "bus-st-01-sn",
      "p_from_kw": 245.6,
      "q_from_kvar": 89.3,
      "p_to_kw": -243.1,
      "q_to_kvar": -87.8,
      "current_a": 10.23,
      "loading_percent": 2.44,
      "rated_current_a": 420.0,
      "losses_kw": 2.5,
      "losses_kvar": 1.5,
      "overloaded": false
    }
  },
  "losses": {
    "total_active_losses_kw": 12.34,
    "total_reactive_losses_kvar": 7.89,
    "loss_percentage": 1.23
  },
  "violations": {
    "voltage_violations": [],
    "overloaded_branches": [],
    "total_violations": 0
  }
}
```

#### Pola wynikow rozplywu mocy per szyna (BINDING -- zamrozone)

| Pole                  | Jednostka | Opis                                          |
|-----------------------|-----------|-----------------------------------------------|
| `voltage_kv`          | kV        | Napiecie wezlowe                               |
| `voltage_pu`          | pu        | Napiecie w jednostkach wzglednych              |
| `angle_deg`           | stopnie   | Kat fazowy napiecia                            |
| `deviation_percent`   | %         | Odchylenie napiecia od znamionowego            |
| `within_limits`       | tak/nie   | Czy napiecie jest w granicach dopuszczalnych   |

#### Pola wynikow rozplywu mocy per galaz (BINDING -- zamrozone)

| Pole                  | Jednostka | Opis                                          |
|-----------------------|-----------|-----------------------------------------------|
| `p_from_kw`           | kW        | Moc czynna od strony poczatku                  |
| `q_from_kvar`         | kvar      | Moc bierna od strony poczatku                   |
| `current_a`           | A         | Prad obciazeniowy                               |
| `loading_percent`     | %         | Obciazenie galeziowe (I/In * 100)              |
| `losses_kw`           | kW        | Straty mocy czynnej na galeziach                |
| `losses_kvar`         | kvar      | Straty mocy biernej na galeziach                |
| `overloaded`          | tak/nie   | Czy galaz jest przeciazona                      |

---

## 7. Nakladki wynikowe na SLD

### 7.1 Typy nakladek

Po uruchomieniu analiz, SLD moze wyswietlac nakladki wynikowe. Nakladki sa warstwa wizualna nalozona na istniejacy uklad geometryczny.

| Nakladka                  | Opis                                                      | Dane zrodlowe            |
|---------------------------|-----------------------------------------------------------|--------------------------|
| Prady zwarciowe           | Wartosci Ik'', ip, Ith przy kazdej szynie z punktem zwarcia | `run_short_circuit`     |
| Napiecia wezlowe          | Wartosci U [kV] lub U [pu] przy kazdej szynie              | `run_power_flow`        |
| Prady obciazeniowe        | Wartosci I [A] i obciazenie [%] przy kazdej galeziach       | `run_power_flow`        |
| Straty                    | Wartosci dP [kW] i dQ [kvar] przy galeziach                 | `run_power_flow`        |
| Naruszenia napieciowe     | Czerwone znaczniki na szynach z napiecia poza zakresem      | Analiza napieciowa      |
| Naruszenia pradowe        | Czerwone znaczniki na galeziach przeciazonych                | Analiza obciazeniowa    |
| Kolorowanie termiczne     | Skala kolorow od zielonego (0%) do czerwonego (100%+)       | `run_power_flow`        |

### 7.2 Reguly nakladek (BINDING)

| Regula                                                 | Opis                                                      |
|--------------------------------------------------------|-----------------------------------------------------------|
| Nakladki NIGDY nie zmieniaja geometrii                 | Pozycje elementow, trasy kabli, ramki stacji -- bez zmian |
| Nakladki sa wylacznie wizualne                         | Brak wplywu na model ENM, solver, obliczenia              |
| Nakladki moga byc wlaczane/wylaczane niezaleznie       | Uzytkownik wybiera ktore nakladki chce widziec           |
| Nakladki wymagaja wynikow w stanie FRESH               | OUTDATED wyniki nie moga byc wyswietlane jako nakladka   |
| Legenda nakladki jest obowiazkowa                      | Kazda nakladka posiada legende z jednostkami i zakresami  |

### 7.3 Legenda nakladki

Kazda aktywna nakladka wyswietla legende:

```
┌──────────────────────────────────────────┐
│ NAKLADKA: Prady zwarciowe SC_3F          │
│ Solver: IEC 60909 v3.2                   │
│ Przypadek: Bazowy -- lato 2026           │
│ Stan: AKTUALNY (FRESH)                   │
│──────────────────────────────────────────│
│ Ik'' [kA]   ip [kA]    Ith [kA]          │
│ zakres: 0.5--19.2 kA                     │
│ [===] zielony: < 5 kA                    │
│ [===] zolty:  5--10 kA                   │
│ [===] pomaranczowy: 10--15 kA            │
│ [===] czerwony: > 15 kA                  │
└──────────────────────────────────────────┘
```

### 7.4 Filtry nakladek

Uzytkownik moze filtrowac wyswietlane wyniki:

| Filtr                          | Opis                                              |
|--------------------------------|---------------------------------------------------|
| Typ zwarcia                    | SC_3F / SC_2F / SC_1F                             |
| Wielkosc wynikowa              | Ik'' / ip / Ith / Sk                              |
| Zakres wartosci                | Od -- Do (slider)                                 |
| Naruszenia                     | Pokaz tylko naruszenia (elementy poza zakresem)    |
| Poziom napiecia                | SN / nN / wszystkie                                |

### 7.5 Znaczniki naruszen

Elementy z wartosciami poza zakresem dopuszczalnym sa oznaczane:

| Naruszenie                     | Symbol                      | Kolor          |
|--------------------------------|-----------------------------|----------------|
| Napiecie ponizej dopuszczalnego | Trojkat w dol ze strzalka  | Czerwony       |
| Napiecie powyzej dopuszczalnego | Trojkat w gore ze strzalka | Czerwony       |
| Przeciazenie galeziowe          | Wykrzyknik w kolku         | Pomaranczowy   |
| Przekroczenie pradu cieplnego   | Plomien                    | Czerwony       |

---

## 8. Referencje

| Dokument                                              | Sciezka                                                    | Rola                           |
|-------------------------------------------------------|------------------------------------------------------------|--------------------------------|
| Kody gotowosci i akcje naprawcze (SLOWNIK)            | `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md`         | Autorytatywny slownik kodow     |
| Kontrakty operacji domenowych                         | `docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md`           | Nazwy kanoniczne operacji       |
| Kontrakty operacji i schematy JSON                    | `docs/domain/KONTRAKTY_OPERACJI_I_SCHEMATY_JSON.md`       | Schematy JSON odpowiedzi        |
| Specyfikacja systemu (SYSTEM_SPEC)                    | `SYSTEM_SPEC.md`                                           | Architektura nadrzedna, zamrozone API |
| Indeks kanoniczny V12.5                               | `docs/INDEX_KANONICZNY.md`                                  | Wejscie do wiazacych specyfikacji systemowych |
| Kanon kreatora na zywo                                | `docs/ui/KANON_KREATOR_SN_NN_NA_ZYWO.md`                  | Budowa sieci, render SLD        |
| Macierz okien dialogowych i akcji                     | `docs/ui/MACIERZ_OKIEN_DIALOGOWYCH_I_AKCJI.md`            | Szczegoly dialogow              |
| Kanoniczny system SLD                                 | `docs/KANON_SLD_SYSTEM.md`                                 | Architektura nakladek SLD       |
| Architektura zabezpieczen                             | `docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md`       | Kontrakty analizy zabezpieczen  |
| Przypadki obliczeniowe                                | `docs/analysis/STUDY_CASE_SYSTEM_CANONICAL.md`             | Architektura StudyCase          |

---

## Historia zmian

| Data       | Wersja | Opis                                                       |
|------------|--------|-------------------------------------------------------------|
| 2026-02-17 | 1.0    | Utworzenie dokumentu -- specyfikacja blokowania, 35 kodow, nakladki SLD |

---

> **KONIEC DOKUMENTU WIAZACEGO**
>
> Wszelkie zmiany wymagaja przegladu architektonicznego
> i aktualizacji numeru wersji.
