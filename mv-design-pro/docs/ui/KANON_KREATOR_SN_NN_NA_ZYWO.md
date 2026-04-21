# Kanon kreatora sieci SN+nN -- budowa na zywo

| Pole              | Wartosc                                          |
|-------------------|--------------------------------------------------|
| Status            | **BINDING**                                      |
| Wersja            | 1.0                                              |
| Data              | 2026-02-17                                       |
| Warstwa           | Prezentacja + Aplikacja (Kreator + SLD)           |
| Jezyk             | Polski (bez anglicyzmow w naglowkach/etykietach) |

> **REGULA NACZELNA**: Ten dokument jest kanoniczna specyfikacja budowania sieci SN+nN
> w trybie "na zywo" -- kazda operacja domenowa natychmiast aktualizuje schemat SLD.
> Obowiazuje rownoczesnie z: `ENM_OP_CONTRACTS_CANONICAL_FULL.md`,
> `READINESS_FIXACTIONS_CANONICAL_PL.md`, `KANON_SLD_SYSTEM.md`.

---

## Spis tresci

1. [Zasada naczelna -- 1 klik = 1 operacja](#1-zasada-naczelna)
2. [Obiekty klikalne SN](#2-obiekty-klikalne-sn)
3. [Obiekty klikalne nN](#3-obiekty-klikalne-nn)
4. [Przepracowanie krok po kroku -- scenariusz inzyniera OSD](#4-przepracowanie-krok-po-kroku)
5. [Reguly renderowania SLD na zywo](#5-reguly-renderowania-sld-na-zywo)
6. [Referencje](#6-referencje)

---

## 1. Zasada naczelna

### 1.1 Formula

```
1 klik = 1 operacja domenowa = nowy Zrzut stanu = natychmiastowy render SLD
```

Kazde dzialanie uzytkownika w interfejsie SLD (kreatorze) przeksztalca sie w dokladnie jedna operacje domenowa (patrz: `ENM_OP_CONTRACTS_CANONICAL_FULL.md`). Operacja ta produkuje nowy, niemutowalny Zrzut stanu (snapshot). Na podstawie nowego Zrzutu stanu silnik SLD oblicza uklad geometryczny i renderuje schemat jednokreskowy.

### 1.2 Lancuch przyczynowo-skutkowy

```
Klikniecie uzytkownika
    |
    v
Operacja domenowa (np. add_grid_source_sn)
    |
    v
Nowy Zrzut stanu (S[n] -> S[n+1])
    |
    v
Przeliczenie topologii grafu
    |
    v
SLD Layout Pipeline (5 faz: pasma napieciowe, detekcja pol,
    minimalizacja skrzyzowan, wspolrzedne, trasowanie krawedzi)
    |
    v
Render na plaszczyzne (Canvas / SVG)
    |
    v
Aktualizacja kodow gotowosci (readiness) w pasku stanu
```

### 1.3 Gwarancje

| Gwarancja                              | Opis                                                                 |
|----------------------------------------|----------------------------------------------------------------------|
| Determinizm                            | Ten sam Zrzut stanu = identyczny SLD (bit po bicie)                  |
| Bijekcja                               | Kazdy symbol SLD odpowiada dokladnie jednemu elementowi ENM          |
| Brak fikcyjnych elementow              | SLD nie tworzy elementow nieistniejacych w modelu                    |
| Natychmiastosc                         | Render po KAZDEJ operacji, bez buforowania                           |
| Brak blokowania rysowania              | Brakujace dane blokuja WYLACZNIE analizy, nigdy rysowanie           |
| Kody gotowosci w czasie rzeczywistym   | Po kazdej operacji przeliczane i wyswietlane na zywo                 |

---

## 2. Obiekty klikalne SN (Siec Sredniego Napiecia)

Ponizej kompletna lista obiektow klikalnych na schemacie SLD warstwy SN. Kazdy obiekt posiada przypisane operacje domenowe dostepne z menu kontekstowego.

### 2.1 Tabela obiektow klikalnych SN

| Nr | Obiekt klikalny                  | Opis                                                        | Typ elementu ENM       | Operacje dostepne z menu kontekstowego                                    |
|----|----------------------------------|-------------------------------------------------------------|------------------------|---------------------------------------------------------------------------|
| 1  | Zrodlo GPZ                       | Punkt zasilania sieci SN z sieci WN/110 kV                  | Source + Bus            | `add_grid_source_sn`, `update_element_parameters`, `assign_catalog_to_element` |
| 2  | Szyna GPZ                        | Szyna zbiorcza SN w Glownym Punkcie Zasilajacym              | Bus                    | `continue_trunk_segment_sn`, `start_branch_segment_sn`, `update_element_parameters` |
| 3  | Koniec magistrali (terminal)     | Wolny koniec segmentu magistrali -- punkt kontynuacji         | Bus (terminal)         | `continue_trunk_segment_sn`, `connect_secondary_ring_sn`                  |
| 4  | Segment magistrali               | Odcinek kabla/linii napowietrznej SN                         | Branch (Line/Cable)    | `insert_station_on_segment_sn`, `insert_section_switch_sn`, `assign_catalog_to_element`, `update_element_parameters` |
| 5  | Wstawka stacji                   | Stacja transformatorowa lub rozdzielcza wstawiona na segment  | Station                | `add_transformer_sn_nn`, `update_element_parameters`, `rename_element`    |
| 6  | Port stacji SN_IN                | Port wejsciowy stacji od strony zasilania                     | Port (Bay IN)          | `update_element_parameters`                                               |
| 7  | Port stacji SN_OUT               | Port wyjsciowy stacji w kierunku dalszej magistrali           | Port (Bay OUT)         | `continue_trunk_segment_sn`                                               |
| 8  | Port stacji SN_BRANCH_x          | Port odgalezienia bocznego stacji                             | Port (Bay BRANCH)      | `start_branch_segment_sn`                                                 |
| 9  | Lacznik sekcyjny                 | Aparat laczeniowy sekcjonujacy magistrale SN                  | Switch                 | `set_normal_open_point`, `update_element_parameters`, `assign_catalog_to_element` |
| 10 | Rozlacznik SN                    | Rozlacznik w obwodzie SN                                      | Switch                 | `set_normal_open_point`, `update_element_parameters`, `assign_catalog_to_element` |
| 11 | Wylacznik SN                     | Wylacznik mocy w obwodzie SN                                  | Switch (BREAKER)       | `update_element_parameters`, `assign_catalog_to_element`                  |
| 12 | Przekaznik                       | Urzadzenie zabezpieczeniowe (ANSI 50/51)                      | ProtectionDevice       | `add_relay`, `update_relay_settings`, `link_relay_to_field`               |
| 13 | Przekladnik pradowy (CT)         | Przekladnik pradowy w polu SN                                  | CT                     | `add_ct`, `update_element_parameters`                                     |
| 14 | Przekladnik napieciowy (VT)      | Przekladnik napieciowy w polu SN                               | VT                     | `add_vt`, `update_element_parameters`                                     |
| 15 | Punkt NOP                        | Punkt normalnie otwarty w pierścieniu SN                      | Switch (NOP)           | `set_normal_open_point`                                                   |
| 16 | Element pierscienia              | Segment zamykajacy pierscien wtorny                            | Branch (Ring)          | `update_element_parameters`, `assign_catalog_to_element`                  |

---

## 3. Obiekty klikalne nN (niskie Napiecie)

Ponizej kompletna lista obiektow klikalnych na schemacie SLD warstwy nN. Obiekty nN sa widoczne po rozwinieciu stacji transformatorowej na schemacie.

### 3.1 Tabela obiektow klikalnych nN

| Nr | Obiekt klikalny                  | Opis                                                        | Typ elementu ENM         | Operacje dostepne z menu kontekstowego                                    |
|----|----------------------------------|-------------------------------------------------------------|--------------------------|---------------------------------------------------------------------------|
| 1  | Transformator SN/nN              | Transformator rozdzielczy SN/0,4 kV                          | Transformer              | `add_transformer_sn_nn`, `assign_catalog_to_element`, `update_element_parameters` |
| 2  | Szyna nN                         | Szyna zbiorcza strony dolnej 0,4 kV                          | Bus (nN)                 | `add_nn_outgoing_field`, `add_converter_source`, `add_genset_nn`, `add_ups_nn`, `update_nn_bus_sections` |
| 3  | Sekcja szyny nN                  | Wydzielona sekcja szyny zbiorczej nN                         | Bus (sekcja)             | `update_nn_bus_sections`, `update_element_parameters`                     |
| 4  | Sprzeglo szyn nN                 | Lacznik szyn (sprzeglo) laczacy sekcje nN                    | Switch (coupler)         | `update_nn_coupler_state`, `update_element_parameters`                    |
| 5  | Pole glowne nN                   | Pole zasilajace szyne nN od strony transformatora             | Bay (SOURCE)             | `add_nn_outgoing_field`, `update_element_parameters`                      |
| 6  | Odplyw nN                        | Pole odplywowe niskiego napiecia                              | Bay (FEEDER)             | `add_nn_outgoing_field`, `add_nn_load`, `assign_catalog_to_element`       |
| 7  | Odbior nN                        | Odbiorca energii na szynie nN                                 | Load                     | `add_nn_load`, `update_element_parameters`                                |
| 8  | Falownik PV                      | Falownik fotowoltaiczny podlaczony do szyny nN               | Generator (PV Inverter)  | `add_converter_source`, `assign_catalog_to_element`, `update_element_parameters`, `set_source_operating_mode` |
| 9  | Falownik BESS                    | Falownik magazynu energii podlaczony do szyny nN             | Generator (BESS)         | `add_converter_source`, `assign_catalog_to_element`, `update_element_parameters`, `set_source_operating_mode` |
| 10 | Agregat                          | Zespol pradotworczy (generator synchroniczny)                 | Generator (Genset)       | `add_genset_nn`, `assign_catalog_to_element`, `update_element_parameters`, `set_source_operating_mode` |
| 11 | UPS                              | Zasilacz awaryjny UPS                                         | Generator (UPS)          | `add_ups_nn`, `update_element_parameters`                                 |
| 12 | Licznik                          | Urzadzenie pomiarowe energii                                  | MeteringDevice           | `update_element_parameters`                                               |
| 13 | Punkt pomiarowy                  | Punkt pomiaru pradu/napiecia (CT/VT nN)                       | CT / VT                  | `add_ct`, `add_vt`, `update_element_parameters`                          |
| 14 | Zabezpieczenie odplywu           | Zabezpieczenie nadpradowe pola odplywowego nN                 | ProtectionDevice         | `add_relay`, `update_relay_settings`, `link_relay_to_field`               |

---

## 4. Przepracowanie krok po kroku -- scenariusz inzyniera OSD

Ponizszy scenariusz przedstawia kompletne budowanie sieci SN z odgalezieniem, pierscieniem, NOP i integracjia OZE. Kazdy krok odpowiada jednemu kliknieciu uzytkownika i jednej operacji domenowej.

### 4.1 Scenariusz: Budowa sieci SN z pierscieniem i stacja OZE

```
Stan poczatkowy: Pusty projekt (Zrzut stanu S0)
```

---

#### Krok 1: Dodanie zrodla zasilania GPZ

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie "Dodaj zrodlo" na pasku narzedzi |
| Operacja          | `add_grid_source_sn`                 |
| Dane wejsciowe    | GPZ Glowne, 15 kV, Sk3=500 MVA, Ik3=19,2 kA, R/X=0,1 |
| Zrzut wyjsciowy   | S0 -> S1                             |
| Elementy utworzone | Source + Bus SN (szyna GPZ 15 kV)    |
| Render SLD        | Pojawia sie symbol GPZ z szyna 15 kV |
| Kody gotowosci    | `source.sn_voltage_missing` = brak (dane kompletne) |

---

#### Krok 2: Kontynuacja magistrali (3 segmenty)

Klikniecie koncowego terminala szyny GPZ, trzykrotne powtorzenie:

**Krok 2a**: Terminal szyny GPZ -> pierwszy segment magistrali

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie terminala szyny GPZ, menu: "Kontynuuj magistrale" |
| Operacja          | `continue_trunk_segment_sn`          |
| Dane wejsciowe    | Kabel NA2XS(F)2Y 1x240 12/20 kV, dlugosc 2,35 km |
| Zrzut wyjsciowy   | S1 -> S2                             |
| Elementy utworzone | Branch (segment kabla) + Bus (terminal) |
| Render SLD        | Nowy segment na schemacie z terminalem |

**Krok 2b**: Terminal -> drugi segment

| Operacja          | `continue_trunk_segment_sn`          |
| Zrzut wyjsciowy   | S2 -> S3                             |
| Dane wejsciowe    | Kabel NA2XS(F)2Y 1x240 12/20 kV, dlugosc 1,80 km |

**Krok 2c**: Terminal -> trzeci segment

| Operacja          | `continue_trunk_segment_sn`          |
| Zrzut wyjsciowy   | S3 -> S4                             |
| Dane wejsciowe    | Kabel NA2XS(F)2Y 1x240 12/20 kV, dlugosc 1,50 km |

Po kroku 2: SLD pokazuje magistrale z 3 segmentami kablowymi, 4 szynami (GPZ + 3 terminale).

---

#### Krok 3: Wstawienie stacji na segmencie (typ B -- transformatorowa)

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie segmentu kabla L1-01, menu: "Wstaw stacje" |
| Operacja          | `insert_station_on_segment_sn`       |
| Dane wejsciowe    | Stacja ST-01 Wschodnia, typ TRAFO, podzial na 1,10 km, napiecie 15 kV, laczniki: LOAD_SWITCH po obu stronach |
| Zrzut wyjsciowy   | S4 -> S5                             |
| Elementy utworzone | Station + 2x Switch + nowa Bus SN w stacji + podzial segmentu na 2 czesci |
| Zdarzenia         | SEGMENT_SPLIT, CUT_NODE_CREATED, STATION_CREATED, PORTS_CREATED, FIELDS_CREATED_SN, DEVICES_CREATED_SN |
| Render SLD        | Symbol stacji z ramka, 2 laczniki, magistrala przechodzi przez stacje |
| Kody gotowosci    | `station.transformer_required` = BLOCKER (stacja TRAFO bez transformatora) |

---

#### Krok 4: Kontynuacja magistrali za stacja

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie portu SN_OUT stacji ST-01 |
| Operacja          | `continue_trunk_segment_sn`          |
| Dane wejsciowe    | Kabel NA2XS(F)2Y 1x150 12/20 kV, dlugosc 0,95 km |
| Zrzut wyjsciowy   | S5 -> S6                             |

---

#### Krok 5: Odgalezienie boczne z portu SN_BRANCH

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie portu SN_BRANCH_1 stacji, menu: "Dodaj odgalezienie" |
| Operacja          | `start_branch_segment_sn`            |
| Dane wejsciowe    | Kabel NA2XS(F)2Y 1x150 12/20 kV, dlugosc 0,85 km, nazwa: Odgalezienie OD-01 |
| Zrzut wyjsciowy   | S6 -> S7                             |
| Elementy utworzone | Branch (odgalezienie) + Bus (terminal odgalezienia) |
| Render SLD        | Nowe ramie odgalezienia od stacji    |

---

#### Krok 6: Wstawienie stacji na odgalezieniu (typ C -- rozdzielcza)

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie segmentu odgalezienia, menu: "Wstaw stacje" |
| Operacja          | `insert_station_on_segment_sn`       |
| Dane wejsciowe    | Stacja ST-02 Zachodnia, typ TRAFO, podzial na 0,40 km |
| Zrzut wyjsciowy   | S7 -> S8                             |
| Elementy utworzone | Station + podzial segmentu + nowa Bus SN |
| Render SLD        | Druga stacja na schemacie            |

---

#### Krok 7: Domkniecie pierscienia wtornego

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie terminala A + terminala B, menu: "Domknij pierscien" |
| Operacja          | `connect_secondary_ring_sn`          |
| Dane wejsciowe    | Segment zamykajacy: NA2XS(F)2Y 1x240 12/20 kV, 1,70 km, rozlacznik NOP |
| Zrzut wyjsciowy   | S8 -> S9                             |
| Elementy utworzone | Branch (segment zamykajacy) + Switch (rozlacznik NOP w stanie OPEN) |
| Zdarzenia         | SEGMENT_CREATED, RING_CONNECTED, DEVICES_CREATED_SN |
| Render SLD        | Pierscien zamkniety z widocznym symbolem NOP |

---

#### Krok 8: Ustawienie punktu normalnie otwartego (NOP)

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie lacznika na pierścieniu, menu: "Ustaw NOP" |
| Operacja          | `set_normal_open_point`              |
| Dane wejsciowe    | switch_id: sw-nop-r1, is_nop: true   |
| Zrzut wyjsciowy   | S9 -> S10                            |
| Zdarzenia         | NOP_SET, CASE_STATE_UPDATED          |
| Render SLD        | Symbol NOP podswietlony na lacznikach pierscienia |
| Kody gotowosci    | `ring.nop_required` = brak (NOP ustawiony) |

---

#### Krok 9: Integracja OZE na szynie nN

Wymagane: najpierw dodanie transformatora SN/nN w stacji ST-01.

**Krok 9a**: Dodanie transformatora

| Operacja          | `add_transformer_sn_nn`              |
| Dane wejsciowe    | TR1 ST-01, ONAN 630 kVA 15/0,4 kV Dyn11, uk=6%, Pk=6,5 kW |
| Zrzut wyjsciowy   | S10 -> S11                           |
| Elementy utworzone | Transformer + Bus nN 0,4 kV          |
| Kody gotowosci    | `station.transformer_required` = brak (transformator dodany) |

**Krok 9b**: Dodanie falownika PV

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie szyny nN, menu: "Dodaj falownik PV" |
| Operacja          | `add_converter_source`               |
| Dane wejsciowe    | Falownik PV dach B1, SMA Sunny Tripower 50 kW, Pmax=49,9 kW, Sn=50 kVA |
| Zrzut wyjsciowy   | S11 -> S12                           |
| Zdarzenia         | NN_SOURCE_CREATED, DEVICES_CREATED_NN |
| Render SLD        | Symbol falownika PV na szynie nN      |

**Krok 9c**: Dodanie falownika BESS

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie szyny nN, menu: "Dodaj magazyn energii" |
| Operacja          | `add_converter_source`               |
| Dane wejsciowe    | BESS ST-01, BYD HVS 10 kWh, Pmax=10 kW, Sn=10 kVA, pojemnosc=10,24 kWh |
| Zrzut wyjsciowy   | S12 -> S13                           |
| Zdarzenia         | NN_SOURCE_CREATED, DEVICES_CREATED_NN |
| Render SLD        | Symbol magazynu BESS na szynie nN     |

---

#### Krok 10: Uruchomienie analiz

| Parametr          | Wartosc                              |
|-------------------|--------------------------------------|
| Dzialanie         | Klikniecie "Uruchom analizy" na pasku narzedzi |
| Operacje          | `create_study_case` -> `run_short_circuit` -> `run_power_flow` |
| Warunek wstepny   | Brak kodow gotowosci na poziomie BLOCKER |
| Dane wejsciowe    | Przypadek bazowy, c_factor=1,10, metoda Newton-Raphson, tolerancja 1e-6 |
| Wynik             | Zrzut wynikow zwarciowych (Ik'', ip, Ith) + rozplyw mocy (napiecia, prady, straty) |
| Render SLD        | Nakladka wynikowa: wartosci pradow/napiec przy elementach, kolorowanie naruszen |

---

### 4.2 Podsumowanie scenariusza

| Krok | Operacja kanoniczna               | Zrzut stanu    | Elementy nowe           |
|------|-----------------------------------|----------------|-------------------------|
| 1    | `add_grid_source_sn`             | S0 -> S1       | Source, Bus GPZ          |
| 2a   | `continue_trunk_segment_sn`      | S1 -> S2       | Branch, Bus              |
| 2b   | `continue_trunk_segment_sn`      | S2 -> S3       | Branch, Bus              |
| 2c   | `continue_trunk_segment_sn`      | S3 -> S4       | Branch, Bus              |
| 3    | `insert_station_on_segment_sn`   | S4 -> S5       | Station, 2x Switch, Bus  |
| 4    | `continue_trunk_segment_sn`      | S5 -> S6       | Branch, Bus              |
| 5    | `start_branch_segment_sn`        | S6 -> S7       | Branch, Bus              |
| 6    | `insert_station_on_segment_sn`   | S7 -> S8       | Station, 2x Switch, Bus  |
| 7    | `connect_secondary_ring_sn`      | S8 -> S9       | Branch, Switch (NOP)     |
| 8    | `set_normal_open_point`          | S9 -> S10      | (zmiana stanu)           |
| 9a   | `add_transformer_sn_nn`          | S10 -> S11     | Transformer, Bus nN      |
| 9b   | `add_converter_source`           | S11 -> S12     | Generator PV             |
| 9c   | `add_converter_source`           | S12 -> S13     | Generator BESS           |
| 10   | `run_short_circuit` + `run_power_flow` | S13 (odczyt) | Wyniki obliczen    |

---

## 5. Reguly renderowania SLD na zywo

### 5.1 SLD renderuje po KAZDEJ operacji

Po zakonczeniu kazdej operacji domenowej i utworzeniu nowego Zrzutu stanu, silnik SLD:

1. Pobiera nowy Zrzut stanu (niemutowalny)
2. Buduje TopologyGraph z modelu ENM
3. Uruchamia SLD Layout Pipeline (5 faz)
4. Renderuje schemat na plaszczyzne
5. Aktualizuje wskazniki gotowosci

**ZAKAZ**: buforowania operacji, opozniania renderowania, batching'u renderow.

### 5.2 Brakujace dane blokuja WYLACZNIE analizy, nie rysowanie

| Stan elementu                    | Rysowanie SLD | Uruchamianie analiz |
|----------------------------------|---------------|---------------------|
| Element z kompletem danych       | TAK           | TAK                 |
| Element bez katalogu             | TAK           | BLOCKER             |
| Element bez dlugosci             | TAK           | BLOCKER             |
| Stacja bez transformatora        | TAK           | BLOCKER             |
| Pierscien bez NOP                | TAK           | BLOCKER             |
| Falownik bez parametrow mocy     | TAK           | BLOCKER             |

**REGULA**: Jesli element istnieje w modelu ENM, MUSI byc widoczny na SLD. Brakujace dane NIE moga powodowac ukrycia elementu. Zamiast tego:
- element jest rysowany z oznaczeniem "niekompletny" (ikona ostrzezenia)
- kod gotowosci BLOCKER jest wyswietlany w pasku stanu
- akcja naprawcza (fix_action) jest dostepna do klikniecia

### 5.3 Kody gotowosci w czasie rzeczywistym

Po kazdej operacji system przelicza kody gotowosci (readiness codes) i wyswietla je:

```
Pasek stanu:
┌──────────────────────────────────────────────────────────────────┐
│ BLOKERY: 2                                                       │
│  [!] Stacja ST-01: brak katalogu odcinka SN (fix_line_catalog)  │
│  [!] Pierscien R1: brak NOP (fix_ring_nop)                      │
│ OSTRZEZENIA: 1                                                   │
│  [i] Stacja ST-02: brak odplywu nN (fix_station_outgoing)      │
└──────────────────────────────────────────────────────────────────┘
```

Kazdy BLOKER i OSTRZEZENIE:
- jest klikalny
- prowadzi do miejsca naprawy (nawigacja: panel/zakladka/modal/pole)
- jest posortowany wg priorytetu (najnizszy numer = najwyzszy priorytet)

Referencja: `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md`

### 5.4 Nakladki wynikowe na SLD

Po uruchomieniu analiz, SLD moze wyswietlac nakladki wynikowe:

| Nakladka                | Dane                                  | Zrodlo                    |
|-------------------------|---------------------------------------|---------------------------|
| Prady zwarciowe         | Ik'' [kA], ip [kA], Ith [kA]          | `run_short_circuit`       |
| Napiecia wezlowe        | U [kV], U [pu], odchylenie [%]        | `run_power_flow`          |
| Prady obciazeniowe      | I [A], obciazenie [%]                 | `run_power_flow`          |
| Straty                  | dP [kW], dQ [kvar]                    | `run_power_flow`          |
| Naruszenia              | Przekroczenia napiec/pradow           | Analiza                   |

**REGULA**: Nakladki wynikowe NIGDY nie zmieniaja geometrii SLD. Sa wylacznie warstwa wizualna nalozona na istniejacy uklad.

### 5.5 Operacje niedostepne z poziomu SLD

Nastepujace operacje NIE sa dostepne bezposrednio z SLD -- wymagaja dedykowanego panelu:

| Operacja                      | Panel                              |
|-------------------------------|------------------------------------|
| `create_study_case`           | Panel przypadkow obliczeniowych    |
| `set_case_switch_state`       | Panel przypadkow obliczeniowych    |
| `compare_study_cases`         | Panel porownania przypadkow        |
| `validate_selectivity`        | Panel koordynacji zabezpieczen     |
| `calculate_tcc_curve`         | Panel koordynacji zabezpieczen     |
| `run_time_series_power_flow`  | Panel analiz czasowych             |

---

## 6. Referencje

| Dokument                                              | Sciezka                                                    | Rola                           |
|-------------------------------------------------------|------------------------------------------------------------|--------------------------------|
| Kontrakty operacji domenowych                         | `docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md`           | Nazwy kanoniczne operacji       |
| Kody gotowosci i akcje naprawcze                      | `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md`         | Slownik kodow gotowosci         |
| Kanoniczny system SLD                                 | `docs/KANON_SLD_SYSTEM.md`                                 | Architektura SLD                |
| Indeks kanoniczny V12.5                               | `docs/INDEX_KANONICZNY.md`                                  | Wejscie do wiazacych specyfikacji systemowych |
| Specyfikacja systemu (SYSTEM_SPEC)                    | `SYSTEM_SPEC.md`                                           | Architektura nadrzedna          |
| Macierz okien dialogowych i akcji                     | `docs/ui/MACIERZ_OKIEN_DIALOGOWYCH_I_AKCJI.md`            | Szczegoly dialogow              |
| Kontrakty operacji i schematy JSON                    | `docs/domain/KONTRAKTY_OPERACJI_I_SCHEMATY_JSON.md`       | Schematy JSON                   |
| Uruchamianie analiz i gotowosc                        | `docs/analysis/URUCHAMIANIE_ANALIZ_I_GOTOWOSC.md`         | Blokowanie analiz               |

---

## Historia zmian

| Data       | Wersja | Opis                                                       |
|------------|--------|-------------------------------------------------------------|
| 2026-02-17 | 1.0    | Utworzenie dokumentu -- kompletny kanon kreatora na zywo     |

---

> **KONIEC DOKUMENTU WIAZACEGO**
>
> Wszelkie zmiany wymagaja przegladu architektonicznego
> i aktualizacji numeru wersji.
