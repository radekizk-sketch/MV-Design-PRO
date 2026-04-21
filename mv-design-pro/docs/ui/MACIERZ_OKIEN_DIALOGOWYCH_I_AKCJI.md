# Macierz okien dialogowych i akcji -- kompletna matryca

| Pole              | Wartosc                                          |
|-------------------|--------------------------------------------------|
| Status            | **BINDING**                                      |
| Wersja            | 1.0                                              |
| Data              | 2026-02-17                                       |
| Warstwa           | Prezentacja (Dialogi UI) -> Domena (Operacje)    |
| Jezyk             | Polski (bez anglicyzmow w naglowkach/etykietach) |

> **REGULA**: Ten dokument definiuje kompletna matryca 17 okien dialogowych (A--Q)
> systemu MV-DESIGN-PRO. Kazdy dialog jest jednoznacznie powiazany z operacja domenowa
> z `ENM_OP_CONTRACTS_CANONICAL_FULL.md`. Zadne okno dialogowe nie moze istniec
> bez odpowiadajacej mu operacji domenowej.

---

## Spis tresci

1. [Matryca obiekt -- akcja -- dialog](#1-matryca-obiekt--akcja--dialog)
2. [Szczegolowy opis 17 dialogow (A--Q)](#2-szczegolowy-opis-17-dialogow)
3. [Standardowy uklad dialogu](#3-standardowy-uklad-dialogu)
4. [Regula: zatwierdzenie = operacja domenowa](#4-regula-zatwierdzenie--operacja-domenowa)
5. [Referencje](#5-referencje)

---

## 1. Matryca obiekt -- akcja -- dialog

### 1.1 Pelna tabela mapowania

| Obiekt na SLD                    | Akcja z menu kontekstowego      | Dialog (ID)  | Nazwa dialogu (PL)          | Operacja kanoniczna              | Kody gotowosci po operacji                             |
|----------------------------------|---------------------------------|--------------|------------------------------|----------------------------------|--------------------------------------------------------|
| Pasek narzedzi / puste SLD       | "Dodaj zrodlo"                  | **A**        | Dodaj zrodlo GPZ             | `add_grid_source_sn`            | `source.sn_voltage_missing`, `source.connection_missing` |
| Terminal magistrali              | "Kontynuuj magistrale"          | **B**        | Kontynuuj magistrale         | `continue_trunk_segment_sn`     | `line.catalog_ref_missing`, `line.length_missing`       |
| Segment magistrali               | "Wstaw stacje"                  | **C**        | Wstaw stacje SN/nN           | `insert_station_on_segment_sn`  | `station.transformer_required`, `station.nn_bus_required` |
| Port stacji SN_BRANCH            | "Dodaj odgalezienie"            | **D**        | Dodaj odgalezienie           | `start_branch_segment_sn`       | `line.catalog_ref_missing`, `line.length_missing`       |
| Segment magistrali               | "Wstaw lacznik sekcyjny"       | **E**        | Wstaw lacznik sekcyjny       | `insert_section_switch_sn`      | (brak BLOCKER-ow przy kompletnych danych)               |
| 2 terminale koncowe              | "Domknij pierscien"             | **F**        | Domknij pierscien            | `connect_secondary_ring_sn`     | `ring.nop_required`                                     |
| Lacznik w pierścieniu            | "Ustaw NOP"                     | **G**        | Ustaw NOP                    | `set_normal_open_point`         | (brak BLOCKER-ow)                                       |
| Element sieci                    | "Wybierz z katalogu"            | **H**        | Wybierz z katalogu           | `assign_catalog_to_element`     | `line.catalog_ref_missing` -> usuniecie                 |
| Element sieci                    | "Edytuj parametry"              | **I**        | Edytuj parametry             | `update_element_parameters`     | (zalezy od kontekstu)                                   |
| Szyna nN w stacji                | "Dodaj odplyw nN"               | **J**        | Dodaj odplyw nN              | `add_nn_outgoing_field`         | `nn.outgoing_catalog_missing`                           |
| Szyna nN / odplyw nN             | "Dodaj odbior"                  | **K**        | Dodaj odbior nN              | `add_nn_load`                   | `nn.load_parameters_missing`                            |
| Szyna nN                         | "Dodaj falownik PV"             | **L**        | Dodaj falownik PV            | `add_converter_source`          | `pv.inverter_catalog_missing`, `pv.transformer_required` |
| Szyna nN                         | "Dodaj magazyn energii"         | **M**        | Dodaj falownik BESS          | `add_converter_source`          | `bess.inverter_catalog_missing`, `bess.energy_missing`  |
| Szyna nN                         | "Dodaj agregat"                 | **N**        | Dodaj agregat                | `add_genset_nn`                 | `source.operating_mode_missing`                         |
| Szyna nN                         | "Dodaj UPS"                     | **O**        | Dodaj UPS                    | `add_ups_nn`                    | (brak BLOCKER-ow przy kompletnych danych)               |
| Pole rozdzielcze SN/nN           | "Dodaj przekladnik"             | **P**        | Dodaj CT/VT                  | `add_ct` / `add_vt`            | `protection.ct_missing` -> usuniecie                    |
| Pole rozdzielcze SN/nN           | "Dodaj przekaznik"              | **Q**        | Dodaj przekaznik             | `add_relay`                     | `protection.relay_missing` -> usuniecie                 |

---

## 2. Szczegolowy opis 17 dialogow

### Dialog A: Dodaj zrodlo GPZ

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | A                                             |
| **Nazwa dialogu (PL)**       | Dodaj zrodlo GPZ                               |
| **Operacja kanoniczna**       | `add_grid_source_sn`                           |
| **Wyzwalacz**                 | Klikniecie "Dodaj zrodlo" na pasku narzedzi lub pustym SLD |

#### Pola formularza

| Pole              | Typ        | Jednostka | Wymagane | Walidacja                              | Opis                              |
|-------------------|------------|-----------|----------|----------------------------------------|-----------------------------------|
| Nazwa zrodla      | tekst      | --        | TAK      | min 1 znak, max 200 znakow             | Nazwa GPZ                         |
| Nazwa szyny       | tekst      | --        | TAK      | min 1 znak, max 200 znakow             | Nazwa szyny zbiorczej SN          |
| Napiecie znamionowe | liczba   | kV        | TAK      | > 0; dozwolone: 6,0 / 10,0 / 15,0 / 20,0 / 30,0 | Napiecie SN                  |
| Moc zwarciowa     | liczba     | MVA       | TAK      | > 0                                    | Sk3 trojfazowa                    |
| Prad zwarciowy    | liczba     | kA        | TAK      | > 0                                    | Ik3 trojfazowy                    |
| Stosunek R/X      | liczba     | --        | TAK      | > 0; typowo 0,05--0,30                 | R/X zrodla zasilania              |

#### Walidacja

- Wszystkie pola wymagane musza byc wypelnione
- `voltage_kv` musi nalezec do zbioru dozwolonych napiec SN
- `sk3_mva` i `ik3_ka` musza byc dodatnie
- `rx_ratio` musi byc w zakresie fizycznym (> 0)

#### Kody gotowosci po operacji

| Kod                          | Warunek wystapienia                            |
|------------------------------|------------------------------------------------|
| `source.sn_voltage_missing`  | Brak jesli voltage_kv podane                   |
| `source.connection_missing`  | Brak jesli szyna utworzona poprawnie            |

---

### Dialog B: Kontynuuj magistrale

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | B                                             |
| **Nazwa dialogu (PL)**       | Kontynuuj magistrale                           |
| **Operacja kanoniczna**       | `continue_trunk_segment_sn`                    |
| **Wyzwalacz**                 | Klikniecie terminala magistrali, menu: "Kontynuuj magistrale" |

#### Pola formularza

| Pole              | Typ        | Jednostka | Wymagane | Walidacja                              | Opis                              |
|-------------------|------------|-----------|----------|----------------------------------------|-----------------------------------|
| Szyna startowa    | odczyt     | --        | TAK      | musi istniec w modelu (auto-wypelniane)| ID szyny startowej (from_bus_id)  |
| Nazwa segmentu    | tekst      | --        | TAK      | min 1 znak                             | Nazwa odcinka kabla/linii         |
| Typ kabla/linii   | wybor z katalogu | --   | TAK      | musi istniec w katalogu                | Referencja do CableType/LineType  |
| Dlugosc           | liczba     | km        | TAK      | > 0                                    | Dlugosc segmentu                  |
| Nazwa szyny koncowej | tekst   | --        | TAK      | min 1 znak                             | Nazwa nowej szyny                 |
| Metoda ulozenia   | lista      | --        | NIE      | ZIEMIA / KANAL / NAPOWIETRZNA          | Sposob ulozenia kabla             |
| Ilosc rownolegle  | liczba     | szt.      | NIE      | >= 1, domyslnie 1                      | Kable rownolegle                  |

#### Walidacja

- `from_bus_id` musi wskazywac na istniejaca szyne z wolnym terminalem
- `cable_type_ref` musi istniec w CatalogRepository
- `length_km` musi byc > 0

#### Kody gotowosci po operacji

| Kod                          | Warunek wystapienia                            |
|------------------------------|------------------------------------------------|
| `line.catalog_ref_missing`   | Jesli catalog_type_ref pusty (nie powinno wystapic) |
| `line.length_missing`        | Jesli length_km pusty (nie powinno wystapic)   |

---

### Dialog C: Wstaw stacje SN/nN

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | C                                             |
| **Nazwa dialogu (PL)**       | Wstaw stacje SN/nN                             |
| **Operacja kanoniczna**       | `insert_station_on_segment_sn`                 |
| **Wyzwalacz**                 | Klikniecie segmentu magistrali, menu: "Wstaw stacje" |

#### Pola formularza

| Pole                    | Typ        | Jednostka | Wymagane | Walidacja                              | Opis                              |
|-------------------------|------------|-----------|----------|----------------------------------------|-----------------------------------|
| Segment docelowy        | odczyt     | --        | TAK      | musi istniec w modelu (auto)           | ID segmentu do podzialu           |
| Nazwa stacji            | tekst      | --        | TAK      | min 1 znak                             | Nazwa nowej stacji                |
| Typ stacji              | lista      | --        | TAK      | GPZ / RPZ / TRAFO / SWITCHING          | Rodzaj stacji                     |
| Odleglosc podzialu      | liczba     | km        | TAK      | > 0 i < dlugosc segmentu              | Pozycja wstawienia na segmencie   |
| Napiecie stacji         | liczba     | kV        | TAK      | > 0                                    | Poziom napiecia SN                |
| Nazwa szyny SN          | tekst      | --        | TAK      | min 1 znak                             | Nazwa nowej szyny w stacji        |
| Lacznik od zasilania    | lista      | --        | NIE      | WYLACZNIK / ROZLACZNIK / ODLACZNIK    | Typ aparatu od strony zasilania   |
| Lacznik od odbioru      | lista      | --        | NIE      | WYLACZNIK / ROZLACZNIK / ODLACZNIK    | Typ aparatu od strony odbioru     |

#### Walidacja

- `split_distance_km` musi byc wieksze od 0 i mniejsze od dlugosci segmentu
- `station_type` musi nalezec do dozwolonych typow
- `voltage_level_kv` musi odpowiadac napieciu magistrali

#### Kody gotowosci po operacji

| Kod                              | Warunek wystapienia                          |
|----------------------------------|----------------------------------------------|
| `station.transformer_required`   | Typ TRAFO, brak transformatora               |
| `station.nn_bus_required`        | Typ TRAFO, brak szyny nN                     |
| `station.required_field_missing` | Brak wymaganego pola SN                      |

---

### Dialog D: Dodaj odgalezienie

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | D                                             |
| **Nazwa dialogu (PL)**       | Dodaj odgalezienie                             |
| **Operacja kanoniczna**       | `start_branch_segment_sn`                      |
| **Wyzwalacz**                 | Klikniecie portu SN_BRANCH stacji, menu: "Dodaj odgalezienie" |

#### Pola formularza

| Pole              | Typ        | Jednostka | Wymagane | Walidacja                              | Opis                              |
|-------------------|------------|-----------|----------|----------------------------------------|-----------------------------------|
| Szyna startowa    | odczyt     | --        | TAK      | musi istniec w modelu (auto)           | ID szyny startowej                |
| Nazwa odgalezienia | tekst     | --        | TAK      | min 1 znak                             | Nazwa odgalezienia                |
| Typ kabla/linii   | wybor z katalogu | --   | TAK      | musi istniec w katalogu                | Referencja do CableType/LineType  |
| Dlugosc           | liczba     | km        | TAK      | > 0                                    | Dlugosc odgalezienia              |
| Nazwa szyny koncowej | tekst   | --        | TAK      | min 1 znak                             | Nazwa szyny na koncu              |
| Metoda ulozenia   | lista      | --        | NIE      | ZIEMIA / KANAL / NAPOWIETRZNA          | Sposob ulozenia                   |
| Ilosc rownolegle  | liczba     | szt.      | NIE      | >= 1, domyslnie 1                      | Kable rownolegle                  |

#### Walidacja

- Identyczna z dialogiem B (kontynuacja magistrali)
- `from_bus_id` musi wskazywac na port SN_BRANCH stacji

---

### Dialog E: Wstaw lacznik sekcyjny

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | E                                             |
| **Nazwa dialogu (PL)**       | Wstaw lacznik sekcyjny                         |
| **Operacja kanoniczna**       | `insert_section_switch_sn`                     |
| **Wyzwalacz**                 | Klikniecie segmentu magistrali, menu: "Wstaw lacznik sekcyjny" |

#### Pola formularza

| Pole                | Typ        | Jednostka | Wymagane | Walidacja                              | Opis                              |
|---------------------|------------|-----------|----------|----------------------------------------|-----------------------------------|
| Segment docelowy    | odczyt     | --        | TAK      | musi istniec w modelu (auto)           | ID segmentu                       |
| Nazwa lacznika      | tekst      | --        | TAK      | min 1 znak                             | Nazwa aparatu                     |
| Typ aparatu         | lista      | --        | TAK      | WYLACZNIK / ROZLACZNIK / ODLACZNIK    | Rodzaj aparatu laczeniowego       |
| Prad znamionowy     | liczba     | A         | TAK      | > 0                                    | In lacznika                       |
| Napiecie znamionowe | liczba     | kV        | TAK      | > 0                                    | Un lacznika                       |
| Stan poczatkowy     | lista      | --        | NIE      | OTWARTY / ZAMKNIETY, dom. ZAMKNIETY    | Stan lacznika                     |
| Pozycja na segmencie | liczba   | km        | TAK      | > 0, < dlugosc segmentu               | Punkt podzialu segmentu           |

#### Walidacja

- `split_position_km` musi byc w zakresie (0, dlugosc_segmentu)
- `rated_current_a` i `rated_voltage_kv` musza byc dodatnie

---

### Dialog F: Domknij pierscien

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | F                                             |
| **Nazwa dialogu (PL)**       | Domknij pierscien                              |
| **Operacja kanoniczna**       | `connect_secondary_ring_sn`                    |
| **Wyzwalacz**                 | Zaznaczenie 2 terminali koncowych, menu: "Domknij pierscien" |

#### Pola formularza

| Pole                  | Typ        | Jednostka | Wymagane | Walidacja                              | Opis                              |
|-----------------------|------------|-----------|----------|----------------------------------------|-----------------------------------|
| Szyna A               | odczyt     | --        | TAK      | musi istniec w modelu (auto)           | ID szyny A (terminal 1)           |
| Szyna B               | odczyt     | --        | TAK      | musi istniec w modelu (auto)           | ID szyny B (terminal 2)           |
| Nazwa segmentu        | tekst      | --        | TAK      | min 1 znak                             | Nazwa segmentu zamykajacego       |
| Typ kabla/linii       | wybor z katalogu | --   | TAK      | musi istniec w katalogu                | Referencja do CableType/LineType  |
| Dlugosc               | liczba     | km        | TAK      | > 0                                    | Dlugosc segmentu zamykajacego     |
| Nazwa rozlacznika NOP | tekst     | --        | TAK      | min 1 znak                             | Nazwa rozlacznika NOP             |
| Stan NOP              | lista      | --        | NIE      | OTWARTY / ZAMKNIETY, dom. OTWARTY      | Stan poczatkowy NOP               |

#### Walidacja

- `bus_a_id` != `bus_b_id`
- Oba terminale musza byc "wolne" (bez polaczenia wychodzacego)
- Polaczenie musi tworzyc prawidlowy cykl w grafie topologicznym

#### Kody gotowosci po operacji

| Kod                    | Warunek wystapienia                          |
|------------------------|----------------------------------------------|
| `ring.nop_required`    | Jesli NOP nie zostal ustawiony               |

---

### Dialog G: Ustaw NOP

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | G                                             |
| **Nazwa dialogu (PL)**       | Ustaw NOP                                      |
| **Operacja kanoniczna**       | `set_normal_open_point`                        |
| **Wyzwalacz**                 | Klikniecie lacznika w pierścieniu, menu: "Ustaw NOP" |

#### Pola formularza

| Pole                       | Typ        | Jednostka | Wymagane | Walidacja                        | Opis                              |
|----------------------------|------------|-----------|----------|----------------------------------|-----------------------------------|
| Lacznik                    | odczyt     | --        | TAK      | musi istniec w modelu (auto)     | ID lacznika                       |
| Oznacz jako NOP            | przelacznik | --       | TAK      | --                               | Czy ustawic jako NOP              |
| Poprzedni NOP              | odczyt     | --        | NIE      | jesli istnieje w pierścieniu     | ID poprzedniego NOP               |
| Zamknij poprzedni          | przelacznik | --       | NIE      | domyslnie: tak                   | Automatyczne zamkniecie           |

#### Walidacja

- Lacznik musi nalezec do pierscienia
- W kazdym pierścieniu moze byc dokladnie 1 NOP

---

### Dialog H: Wybierz z katalogu

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | H                                             |
| **Nazwa dialogu (PL)**       | Wybierz z katalogu                             |
| **Operacja kanoniczna**       | `assign_catalog_to_element`                    |
| **Wyzwalacz**                 | Klikniecie elementu sieci, menu: "Wybierz z katalogu" |

#### Pola formularza

| Pole                 | Typ        | Jednostka | Wymagane | Walidacja                              | Opis                              |
|----------------------|------------|-----------|----------|----------------------------------------|-----------------------------------|
| Element docelowy     | odczyt     | --        | TAK      | musi istniec w modelu (auto)           | ID elementu sieci                 |
| Typ elementu         | odczyt     | --        | TAK      | LINIA / KABEL / TRANSFORMATOR / LACZNIK / FALOWNIK | Rodzaj elementu         |
| Typ katalogowy       | wybor z katalogu | --   | TAK      | musi istniec w katalogu                | Referencja do typu                |
| Rodzaj katalogu      | odczyt     | --        | TAK      | auto-wypelniany z typu elementu        | LineType / CableType / ...        |
| Rozwiaz parametry    | przelacznik | --       | NIE      | domyslnie: tak                         | Automatyczne wypelnienie parametrow |
| Nadpisz istniejacy   | przelacznik | --       | NIE      | domyslnie: nie                         | Czy nadpisac obecne przypisanie   |

#### Walidacja

- Kompatybilnosc typu katalogowego z typem elementu
- Napiecie znamionowe typu musi odpowiadac napieciu szyny

#### Uklad specjalny

Dialog H zawiera wbudowana przegladarke katalogu (`TypeLibraryBrowser`) z filtrami: producent, przekroj, napiecie, material. Parametry katalogowe wyswietlane sa w trybie TYLKO DO ODCZYTU.

---

### Dialog I: Edytuj parametry

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | I                                             |
| **Nazwa dialogu (PL)**       | Edytuj parametry                               |
| **Operacja kanoniczna**       | `update_element_parameters`                    |
| **Wyzwalacz**                 | Klikniecie elementu sieci, menu: "Edytuj parametry" |

#### Pola formularza

Pola dynamiczne -- zaleznie od typu elementu:

**Dla odcinka kabla/linii:**

| Pole              | Typ        | Jednostka | Wymagane | Walidacja         | Opis                |
|-------------------|------------|-----------|----------|-------------------|---------------------|
| Dlugosc           | liczba     | km        | TAK      | > 0               | Dlugosc segmentu    |
| Ilosc rownolegle  | liczba     | szt.      | NIE      | >= 1              | Kable rownolegle    |
| Metoda ulozenia   | lista      | --        | NIE      | ZIEMIA/KANAL/NAP  | Sposob ulozenia     |

**Dla transformatora:**

| Pole              | Typ        | Jednostka | Wymagane | Walidacja         | Opis                |
|-------------------|------------|-----------|----------|-------------------|---------------------|
| Pozycja zaczepu   | liczba     | --        | NIE      | zakres z typu     | Tap position        |
| Uziemienie GW     | przelacznik | --       | NIE      | --                | Uziemienie gornej   |
| Uziemienie DN     | przelacznik | --       | NIE      | --                | Uziemienie dolnej   |

**Parametry katalogowe** (po materializacji -- TYLKO DO ODCZYTU):

| Pole              | Tryb          | Opis                              |
|-------------------|---------------|-----------------------------------|
| R' [ohm/km]       | TYLKO ODCZYT  | Rezystancja z katalogu            |
| X' [ohm/km]       | TYLKO ODCZYT  | Reaktancja z katalogu             |
| In [A]            | TYLKO ODCZYT  | Prad znamionowy z katalogu        |
| Un [kV]           | TYLKO ODCZYT  | Napiecie znamionowe z katalogu    |

#### Walidacja

- Parametry zmienne: walidacja zakresow fizycznych
- Parametry katalogowe: NIEDOSTEPNE do edycji (tryb EKSPERT wymaga odrebnej aktywacji)

---

### Dialog J: Dodaj odplyw nN

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | J                                             |
| **Nazwa dialogu (PL)**       | Dodaj odplyw nN                                |
| **Operacja kanoniczna**       | `add_nn_outgoing_field`                        |
| **Wyzwalacz**                 | Klikniecie szyny nN, menu: "Dodaj odplyw nN"  |

#### Pola formularza

| Pole              | Typ        | Jednostka | Wymagane | Walidacja                    | Opis                              |
|-------------------|------------|-----------|----------|------------------------------|-----------------------------------|
| Stacja            | odczyt     | --        | TAK      | auto-wypelniany              | ID stacji                         |
| Szyna nN          | odczyt     | --        | TAK      | auto-wypelniany              | ID szyny nN                       |
| Nazwa pola        | tekst      | --        | TAK      | min 1 znak                   | Nazwa pola odplywowego            |
| Typ kabla         | wybor z katalogu | --   | TAK      | musi istniec w katalogu      | Referencja do CableType           |
| Dlugosc           | liczba     | km        | TAK      | > 0                          | Dlugosc odpływu                   |
| Nazwa szyny odbioru | tekst    | --        | TAK      | min 1 znak                   | Nazwa szyny odbiorczej            |

---

### Dialog K: Dodaj odbior nN

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | K                                             |
| **Nazwa dialogu (PL)**       | Dodaj odbior nN                                |
| **Operacja kanoniczna**       | `add_nn_load`                                  |
| **Wyzwalacz**                 | Klikniecie szyny nN lub odplywu, menu: "Dodaj odbior" |

#### Pola formularza

| Pole                | Typ        | Jednostka | Wymagane | Walidacja                    | Opis                              |
|---------------------|------------|-----------|----------|------------------------------|-----------------------------------|
| Szyna nN            | odczyt     | --        | TAK      | auto-wypelniany              | ID szyny nN                       |
| Nazwa odbioru       | tekst      | --        | TAK      | min 1 znak                   | Nazwa odbiorcy                    |
| Moc czynna          | liczba     | kW        | TAK      | >= 0                         | P odbioru                         |
| Moc bierna          | liczba     | kvar      | NIE      | --                           | Q odbioru                         |
| Wspolczynnik mocy   | liczba     | --        | NIE      | > 0, <= 1                   | cos(fi)                           |
| Typ odbioru         | lista      | --        | NIE      | STATYCZNY / SILNIKOWY / MIESZANY | Charakter obciazenia           |
| Zaleznosc napiecia  | lista      | --        | NIE      | STALA_MOC / STALA_IMPEDANCJA / STALY_PRAD | Model napieciowy         |
| Pole odplywowe      | wybor      | --        | NIE      | musi istniec w stacji        | ID pola odplywowego               |

---

### Dialog L: Dodaj falownik PV

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | L                                             |
| **Nazwa dialogu (PL)**       | Dodaj falownik PV                              |
| **Operacja kanoniczna**       | `add_converter_source`                         |
| **Wyzwalacz**                 | Klikniecie szyny nN, menu: "Dodaj falownik PV" |

#### Pola formularza

| Pole                | Typ        | Jednostka | Wymagane | Walidacja                    | Opis                              |
|---------------------|------------|-----------|----------|------------------------------|-----------------------------------|
| Szyna nN            | odczyt     | --        | TAK      | auto-wypelniany              | ID szyny nN                       |
| Nazwa falownika     | tekst      | --        | TAK      | min 1 znak                   | Nazwa falownika PV                |
| Rodzaj przetwornika | odczyt     | --        | TAK      | staly: "PV"                  | converter_kind                    |
| Typ z katalogu      | wybor z katalogu | --   | NIE      | musi istniec w katalogu      | Referencja do ConverterType       |
| Moc maksymalna      | liczba     | kW        | TAK      | > 0                          | Pmax falownika                    |
| Moc pozorna         | liczba     | kVA       | TAK      | > 0                          | Sn znamionowa                     |
| Min. cos(fi)        | liczba     | --        | NIE      | > 0, <= 1                   | Dolna granica cosfi               |
| Maks. cos(fi)       | liczba     | --        | NIE      | > 0, <= 1                   | Gorna granica cosfi               |
| Prad znamionowy     | liczba     | A         | TAK      | > 0                          | In falownika                      |
| Wsp. pradu zwarc.   | liczba     | --        | NIE      | > 0, dom. 1,1               | k_sc                              |
| Tryb pracy          | lista      | --        | NIE      | MPPT / STALY / WYLACZONY     | operating_mode                    |
| W eksploatacji      | przelacznik | --       | NIE      | dom. tak                     | in_service                        |

---

### Dialog M: Dodaj falownik BESS

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | M                                             |
| **Nazwa dialogu (PL)**       | Dodaj falownik BESS                            |
| **Operacja kanoniczna**       | `add_converter_source`                         |
| **Wyzwalacz**                 | Klikniecie szyny nN, menu: "Dodaj magazyn energii" |

#### Pola formularza

| Pole                    | Typ        | Jednostka | Wymagane | Walidacja                    | Opis                              |
|-------------------------|------------|-----------|----------|------------------------------|-----------------------------------|
| Szyna nN                | odczyt     | --        | TAK      | auto-wypelniany              | ID szyny nN                       |
| Nazwa falownika         | tekst      | --        | TAK      | min 1 znak                   | Nazwa falownika BESS              |
| Rodzaj przetwornika     | odczyt     | --        | TAK      | staly: "BESS"                | converter_kind                    |
| Typ z katalogu          | wybor z katalogu | --   | NIE      | musi istniec w katalogu      | Referencja do ConverterType       |
| Moc maksymalna          | liczba     | kW        | TAK      | > 0                          | Pmax falownika                    |
| Moc pozorna             | liczba     | kVA       | TAK      | > 0                          | Sn znamionowa                     |
| Pojemnosc energetyczna  | liczba     | kWh       | TAK      | > 0                          | Pojemnosc magazynu                |
| Poczatkowy stan naladowania | liczba | %         | NIE      | 0--100, dom. 50              | SOC poczatkowy                    |
| Min. cos(fi)            | liczba     | --        | NIE      | > 0, <= 1                   | Dolna granica cosfi               |
| Maks. cos(fi)           | liczba     | --        | NIE      | > 0, <= 1                   | Gorna granica cosfi               |
| Prad znamionowy         | liczba     | A         | TAK      | > 0                          | In falownika                      |
| Wsp. pradu zwarc.       | liczba     | --        | NIE      | > 0, dom. 1,0               | k_sc                              |
| Tryb pracy              | lista      | --        | NIE      | WSPARCIE_SIECI / WYSPOWY / SZCZYT / WYL | operating_mode            |
| W eksploatacji          | przelacznik | --       | NIE      | dom. tak                     | in_service                        |

---

### Dialog N: Dodaj agregat

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | N                                             |
| **Nazwa dialogu (PL)**       | Dodaj agregat                                  |
| **Operacja kanoniczna**       | `add_genset_nn`                                |
| **Wyzwalacz**                 | Klikniecie szyny nN, menu: "Dodaj agregat"    |

#### Pola formularza

| Pole                | Typ        | Jednostka | Wymagane | Walidacja                    | Opis                              |
|---------------------|------------|-----------|----------|------------------------------|-----------------------------------|
| Szyna nN            | odczyt     | --        | TAK      | auto-wypelniany              | ID szyny nN                       |
| Nazwa agregatu      | tekst      | --        | TAK      | min 1 znak                   | Nazwa zespolu pradotworczego      |
| Moc znamionowa      | liczba     | kVA       | TAK      | > 0                          | Sn agregatu                       |
| Napiecie znamionowe | liczba     | kV        | TAK      | > 0                          | Un agregatu                       |
| Reaktancja Xd''     | liczba     | %         | TAK      | > 0                          | Reaktancja podprzejsciowa         |

---

### Dialog O: Dodaj UPS

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | O                                             |
| **Nazwa dialogu (PL)**       | Dodaj UPS                                      |
| **Operacja kanoniczna**       | `add_ups_nn`                                   |
| **Wyzwalacz**                 | Klikniecie szyny nN, menu: "Dodaj UPS"        |

#### Pola formularza

| Pole                | Typ        | Jednostka | Wymagane | Walidacja                    | Opis                              |
|---------------------|------------|-----------|----------|------------------------------|-----------------------------------|
| Szyna nN            | odczyt     | --        | TAK      | auto-wypelniany              | ID szyny nN                       |
| Nazwa UPS           | tekst      | --        | TAK      | min 1 znak                   | Nazwa zasilacza UPS               |
| Moc znamionowa      | liczba     | kVA       | TAK      | > 0                          | Sn UPS                            |
| Czas baterii        | liczba     | min       | TAK      | > 0                          | Czas podtrzymania bateryjnego     |
| Prad znamionowy     | liczba     | A         | TAK      | > 0                          | In UPS                            |

---

### Dialog P: Dodaj CT/VT

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | P                                             |
| **Nazwa dialogu (PL)**       | Dodaj przekladnik CT/VT                        |
| **Operacja kanoniczna**       | `add_ct` / `add_vt`                            |
| **Wyzwalacz**                 | Klikniecie pola rozdzielczego, menu: "Dodaj przekladnik" |

#### Pola formularza -- przekladnik pradowy (CT)

| Pole                  | Typ        | Jednostka | Wymagane | Walidacja                    | Opis                              |
|-----------------------|------------|-----------|----------|------------------------------|-----------------------------------|
| Pole rozdzielcze      | odczyt     | --        | TAK      | auto-wypelniany              | ID pola                          |
| Nazwa CT              | tekst      | --        | TAK      | min 1 znak                   | Nazwa przekladnika                |
| Przekladnia pierwotna | liczba     | A         | TAK      | > 0                          | Prad pierwotny znamionowy         |
| Przekladnia wtorna    | liczba     | A         | TAK      | > 0 (typowo 1 lub 5)        | Prad wtorny znamionowy            |
| Klasa dokladnosci     | tekst      | --        | TAK      | 0.2 / 0.5 / 1 / 5P / 10P   | Klasa dokladnosci                 |

#### Pola formularza -- przekladnik napieciowy (VT)

| Pole                  | Typ        | Jednostka | Wymagane | Walidacja                    | Opis                              |
|-----------------------|------------|-----------|----------|------------------------------|-----------------------------------|
| Pole rozdzielcze      | odczyt     | --        | TAK      | auto-wypelniany              | ID pola                          |
| Nazwa VT              | tekst      | --        | TAK      | min 1 znak                   | Nazwa przekladnika                |
| Przekladnia pierwotna | liczba     | kV        | TAK      | > 0                          | Napiecie pierwotne                |
| Przekladnia wtorna    | liczba     | V         | TAK      | > 0 (typowo 100 lub 100/sqrt3) | Napiecie wtorne                |
| Klasa dokladnosci     | tekst      | --        | TAK      | 0.2 / 0.5 / 1 / 3P          | Klasa dokladnosci                 |

---

### Dialog Q: Dodaj przekaznik

| Pole                          | Opis                                          |
|-------------------------------|-----------------------------------------------|
| **Identyfikator dialogu**     | Q                                             |
| **Nazwa dialogu (PL)**       | Dodaj przekaznik                               |
| **Operacja kanoniczna**       | `add_relay`                                    |
| **Wyzwalacz**                 | Klikniecie pola rozdzielczego, menu: "Dodaj przekaznik" |

#### Pola formularza

| Pole                | Typ        | Jednostka | Wymagane | Walidacja                              | Opis                              |
|---------------------|------------|-----------|----------|----------------------------------------|-----------------------------------|
| Pole rozdzielcze    | odczyt     | --        | TAK      | musi istniec w modelu (auto)           | ID pola                          |
| Nazwa przekaznika   | tekst      | --        | TAK      | min 1 znak                             | Nazwa urzadzenia                  |
| Typ urzadzenia      | lista      | --        | TAK      | PRZEKAZNIK / BEZPIECZNIK / REKLOZER / WYLACZNIK | Rodzaj urzadzenia          |
| Producent           | tekst      | --        | NIE      | --                                      | Producent                         |
| Model               | tekst      | --        | NIE      | --                                      | Model urzadzenia                  |
| CT powiazany        | wybor      | --        | NIE      | musi istniec w modelu                  | ID przekladnika CT                |
| Prad znamionowy     | liczba     | A         | NIE      | > 0                                    | In urzadzenia                     |

**Nastawy zabezpieczen (sekcja rozwijana):**

| Stopien | Opis                    | Pola                                          |
|---------|-------------------------|-----------------------------------------------|
| I>      | Stopien czas-zalezny    | aktywny, prad rozruchowy [A], krzywa (IEC SI/VI/EI/LI), mnoznik TMS |
| I>>     | Stopien szybki          | aktywny, prad rozruchowy [A], czas [s]        |
| I>>>    | Stopien bardzo szybki   | aktywny, prad rozruchowy [A], czas [s]        |
| I0>     | Ziemnozwarciowy czas-z. | aktywny, prad rozruchowy [A], krzywa, TMS     |
| I0>>    | Ziemnozwarciowy szybki  | aktywny, prad rozruchowy [A], czas [s]        |

---

## 3. Standardowy uklad dialogu

Kazdy dialog (A--Q) stosuje jednolity uklad sekcji:

```
┌─────────────────────────────────────────────────────────┐
│  NAGLOWEK DIALOGU                                        │
│  Nazwa dialogu + ikona operacji                          │
├─────────────────────────────────────────────────────────┤
│  SEKCJA 1: Dane wymagane                                 │
│  Pola oznaczone (*) -- musza byc wypelnione              │
│  Walidacja inline (czerwona ramka + komunikat)           │
├─────────────────────────────────────────────────────────┤
│  SEKCJA 2: Katalog (jesli dotyczy)                       │
│  Przycisk "Wybierz z katalogu" -> TypePicker             │
│  Parametry katalogowe: TYLKO DO ODCZYTU                  │
├─────────────────────────────────────────────────────────┤
│  SEKCJA 3: Parametry obliczeniowe                        │
│  Pola po materializacji -- TYLKO DO ODCZYTU              │
│  (R, X, In, Un -- wartosci z katalogu + resolver)       │
├─────────────────────────────────────────────────────────┤
│  SEKCJA 4: Skutki w modelu                               │
│  Podglad: jakie elementy zostana utworzone/zmienione     │
│  Lista: "Zostanie utworzone: Bus, Branch, 2x Switch"     │
├─────────────────────────────────────────────────────────┤
│  SEKCJA 5: Gotowosc                                     │
│  Kody gotowosci po operacji (prognoza)                   │
│  BLOKER-y: [!] lista problemow                          │
│  OSTRZEZENIA: [i] lista ostrzezen                        │
├─────────────────────────────────────────────────────────┤
│  PRZYCISKI                                               │
│  [Anuluj]                          [Zatwierdz]           │
│                                                          │
│  Zatwierdz = wywolanie operacji domenowej                │
│  Anuluj = zamkniecie dialogu bez zmian                   │
└─────────────────────────────────────────────────────────┘
```

### Reguly ukladu

| Regula                                         | Opis                                                      |
|------------------------------------------------|-----------------------------------------------------------|
| Dane wymagane zawsze na gorze                  | Uzytkownik widzi najpierw to, co musi wypelnic            |
| Katalog po danych wymaganych                   | Wybor typu jest drugim krokiem                            |
| Parametry obliczeniowe TYLKO ODCZYT            | Po przypisaniu katalogu parametry sa zablokowane          |
| Skutki w modelu przed zatwierdzeniem           | Uzytkownik widzi co zostanie zmienione                    |
| Gotowosc na dole                               | Prognozy kodow gotowosci po operacji                      |
| Przycisk Zatwierdz aktywny gdy brak bledow     | Walidacja inline blokuje zatwierdzenie                    |

---

## 4. Regula: zatwierdzenie = operacja domenowa

### 4.1 Zasada (BINDING)

Kazde klikniecie przycisku "Zatwierdz" w dialogu:

1. Wywoluje dokladnie JEDNA operacje domenowa (z `ENM_OP_CONTRACTS_CANONICAL_FULL.md`)
2. Tworzy nowy, niemutowalny Zrzut stanu
3. Powoduje natychmiastowy render SLD
4. Aktualizuje kody gotowosci
5. Zamyka dialog

### 4.2 Zakazy (BINDING)

| Zakaz                                          | Uzasadnienie                                              |
|------------------------------------------------|-----------------------------------------------------------|
| ZAKAZ "lokalnego zapisu"                       | Brak stanu posredniego -- wszystko przez operacje         |
| ZAKAZ buforowania zmian                        | Kazda zmiana natychmiast widoczna na SLD                   |
| ZAKAZ dialogow bez operacji                    | Kazdy dialog musi miec przypisana operacje kanoniczna      |
| ZAKAZ operacji bez dialogu                     | Kazda operacja UI musi miec zdefiniowany dialog            |
| ZAKAZ edycji parametrow katalogowych           | Parametry katalogowe sa TYLKO DO ODCZYTU (tryb EKSPERT wymaga odrebnej aktywacji) |

---

## 5. Referencje

| Dokument                                              | Sciezka                                                    | Rola                           |
|-------------------------------------------------------|------------------------------------------------------------|--------------------------------|
| Kontrakty operacji domenowych                         | `docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md`           | Nazwy kanoniczne operacji       |
| Kody gotowosci i akcje naprawcze                      | `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md`         | Slownik kodow gotowosci         |
| Indeks kanoniczny V12.5                               | `docs/INDEX_KANONICZNY.md`                                  | Wejscie do wiazacych specyfikacji systemowych |
| Kanon kreatora na zywo                                | `docs/ui/KANON_KREATOR_SN_NN_NA_ZYWO.md`                  | Budowa sieci na zywo            |
| Kontrakty operacji i schematy JSON                    | `docs/domain/KONTRAKTY_OPERACJI_I_SCHEMATY_JSON.md`       | Schematy JSON                   |
| Specyfikacja systemu (SYSTEM_SPEC)                    | `SYSTEM_SPEC.md`                                           | Architektura nadrzedna          |

---

## Historia zmian

| Data       | Wersja | Opis                                                       |
|------------|--------|-------------------------------------------------------------|
| 2026-02-17 | 1.0    | Utworzenie dokumentu -- kompletna matryca 17 dialogow A--Q   |

---

> **KONIEC DOKUMENTU WIAZACEGO**
>
> Wszelkie zmiany wymagaja przegladu architektonicznego
> i aktualizacji numeru wersji.
