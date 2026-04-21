# Kontrakty operacji domenowych i schematy JSON

| Pole       | Wartosc                            |
|------------|------------------------------------|
| Status     | **BINDING**                        |
| Wersja     | 1.0                               |
| Data       | 2026-02-17                         |

> **Referencja**: Dokument `ENM_OP_CONTRACTS_CANONICAL_FULL.md` jest JEDYNYM ZRODLEM PRAWDY
> dla nazw operacji domenowych, pelnych schematow Pydantic i aktywnego kontraktu V11.
> Niniejszy dokument opisuje **kontrakt odpowiedzi**, **kontrakt magistrali**,
> **przyklady payload JSON** oraz **reguly kanonizacji i identyfikatorow deterministycznych**.

---

## Spis tresci

1. [Kontrakt odpowiedzi (Response Contract)](#1-kontrakt-odpowiedzi-response-contract)
2. [Kontrakt magistrali (Trunk Contract)](#2-kontrakt-magistrali-trunk-contract)
3. [Przyklady payload JSON](#3-przyklady-payload-json)
4. [Kanonizacja JSON](#4-kanonizacja-json)
5. [Identyfikatory deterministyczne](#5-identyfikatory-deterministyczne)

---

## 1. Kontrakt odpowiedzi (Response Contract)

KAZDA operacja domenowa (bez wyjatku) zwraca odpowiedz o nastepujacej strukturze.
Zadne pole NIE moze byc pominiete -- nawet jesli lista jest pusta.

| Pole                  | Typ                        | Opis                                                                           |
|-----------------------|----------------------------|--------------------------------------------------------------------------------|
| `snapshot`            | `NetworkSnapshot`          | Nowy zrzut stanu (niemutowalny) -- pelny stan sieci po operacji. Kazdy snapshot jest immutable; nowa operacja tworzy nowy snapshot z referencja do rodzica (`parent_snapshot_id`). |
| `logical_views`       | `LogicalViews`             | Projekcje logiczne: magistrale/trunks, odgalezienia/branches, pierscienie/rings, terminale/terminals. Projekcje sa derywowane ze snapshotu -- nie przechowuja wlasnych danych fizycznych. |
| `readiness`           | `list[ReadinessCode]`      | Lista kodow gotowosci z pierwszenstwem. Sortowanie deterministyczne: (1) poziom BLOCKER > WARNING > INFO, (2) priorytet rosnaco, (3) kod leksykograficznie. Pelny slownik: `READINESS_FIXACTIONS_CANONICAL_PL.md`. |
| `fix_actions`         | `list[FixAction]`          | Lista dzialan naprawczych. Kazde zawiera: `code` (identyfikator), `description_pl` (opis po polsku), `target_element_id` (element docelowy), `navigation` (sciezka: panel/tab/modal/focus). Klikniecie na fix_action nawiguje do dokladnego miejsca w UI. |
| `changes`             | `ChangeSet`                | Zbiory identyfikatorow zmian: `created_element_ids` (nowe), `updated_element_ids` (zmodyfikowane), `deleted_element_ids` (usuniete). |
| `selection_hint`      | `SelectionHint`            | Wskazowka selekcji dla UI: `element_id` (co zaznaczyc), `element_type` (typ), `zoom_to` (czy przyblizyc widok). |
| `audit_trail`         | `list[AuditStep]`          | Lista krokow audytowych (deterministyczna -- kolejnosc gwarantowana, ten sam input = te same kroki). |
| `domain_events`       | `list[DomainEvent]`        | Lista zdarzen domenowych: `event_seq` (numer sekwencyjny), `event_type` (typ zdarzenia), `element_id` (element zrodlowy). Zdarzenia sa niemutowalne, kolejkowane i przetwarzane asynchronicznie. |
| `materialized_params` | `MaterializedParams`       | Zmaterializowane parametry z wersja katalogu. Zawiera: referencje katalogowa, wersje katalogu, zrodlo parametrow (TYPE_REF / OVERRIDE / INSTANCE), wartosci finalne. |
| `layout`              | `LayoutMeta`               | Metadane layoutu SLD: `layout_hash` (hash stanu geometrii), `layout_version` (wersja algorytmu auto-layout). |

---

## 2. Kontrakt magistrali (Trunk Contract)

Operacje SN odwoluja sie do kontekstu magistrali za pomoca nastepujacych struktur.

### 2.1 trunk_ref

Referencja do magistrali -- kontekst wstawienia elementu:

| Pole                              | Typ      | Wymagane | Opis                                                  |
|-----------------------------------|----------|----------|--------------------------------------------------------|
| `trunk_id`                        | `string` | TAK      | Identyfikator magistrali (corridor)                    |
| `terminal_id`                     | `string` | TAK      | Identyfikator terminala (konca magistrali)             |
| `segment_order_index_expected`    | `int`    | TAK      | Oczekiwany indeks segmentu w uporzadkowanej liscie     |

### 2.2 segment_target

Cel operacji na segmencie -- wskazuje dokladne miejsce ciecia:

| Pole                   | Typ      | Wymagane | Opis                                                            |
|------------------------|----------|----------|-----------------------------------------------------------------|
| `segment_id`           | `string` | TAK      | Identyfikator segmentu docelowego                               |
| `segment_length`       | `object` | TAK      | Dlugosc segmentu: `{value: float, unit: "m" \| "km"}`          |
| `cut`                  | `object` | TAK      | Punkt ciecia -- patrz tryby ponizej                             |
| `cut_resolution_policy`| `object` | NIE      | Polityka rozwiazywania konfliktu -- patrz ponizej               |

**Tryby ciecia (`cut.mode`)**:

| Mode             | Opis                                           | Pole `value`              |
|------------------|-------------------------------------------------|---------------------------|
| `FRACTION`       | Ulamek dlugosci segmentu (0.0 -- 1.0)          | `float` (0.0 -- 1.0)     |
| `DISTANCE_M`     | Odleglosc w metrach od poczatku segmentu        | `float` (> 0)            |
| `WORLD_POINT`    | Wspolrzedne swiatowe (x, y)                     | `{x: float, y: float}`  |

### 2.3 cut_resolution_policy

Polityka rozwiazywania konfliktu gdy punkt ciecia jest zbyt blisko istniejacego wezla:

| Pole                                | Typ      | Wymagane | Opis                                                              |
|-------------------------------------|----------|----------|-------------------------------------------------------------------|
| `snap_to_existing_node_threshold_m` | `float`  | TAK      | Prog odleglosci do istniejacego wezla [m] -- ponizej: przyciaganie|
| `if_within_threshold`               | `string` | TAK      | Akcja w progu: `"PRZYKLEJ_DO_WEZLA"` (snap) lub `"ODRZUC_Z_BLEDEM"` (reject) |
| `if_hits_port_exactly`              | `string` | NIE      | Akcja przy trafieniu dokladnie w port: `"PRZYKLEJ"` lub `"ODRZUC"` |
| `deterministic_tie_breaker`         | `string` | NIE      | Strategia rozstrzygania remisow: `"LOWER_INDEX"` lub `"FIRST_CREATED"` |

### 2.4 embedding_intent

Zamiar osadzenia -- opisuje co zostanie wstawione w punkcie podzialu:

| Pole                    | Typ      | Wymagane | Opis                                                    |
|-------------------------|----------|----------|---------------------------------------------------------|
| `continuity`            | `string` | TAK      | `"CIAGLOSC_IN_OUT"` -- kontynuacja magistrali (stacja przelotowa), lub `"ODNOGA"` -- odgalezienie (branch point) |
| `branch_ports_allowed`  | `bool`   | NIE      | Czy dozwolone sa porty odgalezieniowe (domyslnie `true`) |

---

## 3. Przyklady payload JSON

Kazdy przyklad zawiera kompletny obiekt JSON z realistycznymi danymi.
Nazwy operacji sa **kanoniczne** i stanowia jedyny aktywny kontrakt V11.

### 3.1 `add_grid_source_sn`

```json
{
  "operation": "add_grid_source_sn",
  "meta": {
    "snapshot_in": "S0",
    "idempotency_key": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "ui_click_id": "click_001",
    "timestamp_utc": "2026-02-17T10:00:00Z"
  },
  "payload": {
    "source_name": "GPZ Glowne",
    "bus_name": "Szyna GPZ 15 kV",
    "voltage_kv": 15.0,
    "sk3_mva": 500.0,
    "ik3_ka": 19.2,
    "rx_ratio": 0.1
  }
}
```

### 3.2 `continue_trunk_segment_sn`

```json
{
  "operation": "continue_trunk_segment_sn",
  "meta": {
    "snapshot_in": "S1",
    "idempotency_key": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
    "ui_click_id": "click_002",
    "timestamp_utc": "2026-02-17T10:01:00Z"
  },
  "payload": {
    "from_bus_id": "bus-gpz-szyna-15kv",
    "segment_name": "Kabel magistralny L1-01",
    "cable_type_ref": "NA2XS(F)2Y_1x240_12/20kV",
    "length_km": 2.35,
    "new_bus_name": "Szyna RPZ Polnocna 15 kV",
    "laying_method": "GROUND",
    "parallel_count": 1
  }
}
```

### 3.3 `insert_station_on_segment_sn` (typ B -- pelny przyklad z sn_fields, transformer, nn_block)

```json
{
  "operation": "insert_station_on_segment_sn",
  "meta": {
    "snapshot_in": "S2",
    "idempotency_key": "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    "ui_click_id": "click_003",
    "timestamp_utc": "2026-02-17T10:02:00Z"
  },
  "payload": {
    "segment_id": "branch-l1-01",
    "insert_at": {
      "mode": "DISTANCE_M",
      "value": 1100.0
    },
    "station": {
      "station_type": "B",
      "station_name": "Stacja transformatorowa ST-01 Wschodnia",
      "sn_voltage_kv": 15.0,
      "nn_voltage_kv": 0.4
    },
    "sn_fields": [
      {
        "role": "LINIA_IN",
        "field_name": "Pole liniowe wejsciowe L1-IN",
        "switch_type": "LOAD_SWITCH",
        "rated_current_a": 630.0
      },
      {
        "role": "LINIA_OUT",
        "field_name": "Pole liniowe wyjsciowe L1-OUT",
        "switch_type": "LOAD_SWITCH",
        "rated_current_a": 630.0
      },
      {
        "role": "TRANSFORMATOROWE",
        "field_name": "Pole transformatorowe TR1",
        "switch_type": "LOAD_SWITCH",
        "rated_current_a": 200.0
      }
    ],
    "transformer": {
      "create": true,
      "transformer_catalog_ref": "ONAN_630kVA_15/0.4kV_Dyn11",
      "transformer_name": "Transformator TR1 ST-01",
      "rated_power_mva": 0.63,
      "voltage_hv_kv": 15.0,
      "voltage_lv_kv": 0.4,
      "uk_percent": 6.0,
      "pk_kw": 6.5,
      "i0_percent": 0.3,
      "p0_kw": 1.1,
      "vector_group": "Dyn11",
      "tap_position": 0
    },
    "nn_block": {
      "create_nn_bus": true,
      "nn_bus_name": "Szyna nN 0.4 kV TR1 ST-01",
      "outgoing_feeders_nn_count": 2,
      "outgoing_feeders_nn": [
        {
          "field_name": "Odplyw nN 1 -- budynek biurowy",
          "cable_type_ref": "YAKXS_4x120_0.6/1kV",
          "length_m": 45.0,
          "load_bus_name": "Szyna odbiorcza nN B1"
        },
        {
          "field_name": "Odplyw nN 2 -- parking",
          "cable_type_ref": "YAKXS_4x70_0.6/1kV",
          "length_m": 80.0,
          "load_bus_name": "Szyna odbiorcza nN P1"
        }
      ]
    },
    "trunk_ref": {
      "trunk_id": "corridor-magistrala-1",
      "terminal_id": "terminal-polnocny",
      "segment_order_index_expected": 0
    },
    "options": {
      "auto_assign_catalog": true,
      "create_main_breaker_nn": true
    }
  }
}
```

### 3.4 `start_branch_segment_sn`

```json
{
  "operation": "start_branch_segment_sn",
  "meta": {
    "snapshot_in": "S3",
    "idempotency_key": "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
    "ui_click_id": "click_004",
    "timestamp_utc": "2026-02-17T10:03:00Z"
  },
  "payload": {
    "from_bus_id": "bus-rpz-polnocna-15kv",
    "branch_name": "Odgalezienie OD-01 do ST-02",
    "cable_type_ref": "NA2XS(F)2Y_1x150_12/20kV",
    "length_km": 0.85,
    "new_bus_name": "Szyna SN ST-02",
    "laying_method": "GROUND",
    "parallel_count": 1
  }
}
```

### 3.5 `connect_secondary_ring_sn` + `set_normal_open_point`

**Krok 1 -- zamkniecie pierscienia:**

```json
{
  "operation": "connect_secondary_ring_sn",
  "meta": {
    "snapshot_in": "S5",
    "idempotency_key": "f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
    "ui_click_id": "click_006",
    "timestamp_utc": "2026-02-17T10:05:00Z"
  },
  "payload": {
    "bus_a_id": "bus-st-02-sn",
    "bus_b_id": "bus-rpz-zachodnia-15kv",
    "ring_segment_name": "Segment zamykajacy pierscien R1",
    "cable_type_ref": "NA2XS(F)2Y_1x240_12/20kV",
    "length_km": 1.70,
    "nop_switch_name": "Rozlacznik NOP pierscienia R1",
    "nop_initial_state": "OPEN"
  }
}
```

**Krok 2 -- ustawienie NOP:**

```json
{
  "operation": "set_normal_open_point",
  "meta": {
    "snapshot_in": "S6",
    "idempotency_key": "0a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b",
    "ui_click_id": "click_007",
    "timestamp_utc": "2026-02-17T10:06:00Z"
  },
  "payload": {
    "switch_id": "sw-nop-r1",
    "is_nop": true,
    "previous_nop_switch_id": null,
    "auto_close_previous": true
  }
}
```

### 3.6 `add_converter_source` (źródło przekształtnikowe do rozdzielnicy nN)

```json
{
  "operation": "add_converter_source",
  "meta": {
    "snapshot_in": "S9",
    "idempotency_key": "3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e",
    "ui_click_id": "click_010",
    "timestamp_utc": "2026-02-17T10:09:00Z"
  },
  "payload": {
    "nn_bus_id": "bus-nn-tr1-st01-0.4kv",
    "inverter_name": "Falownik PV dach B1",
    "converter_kind": "PV",
    "type_ref": "SMA_Sunny_Tripower_50kW",
    "pmax_kw": 49.9,
    "sn_kva": 50.0,
    "cos_phi_min": 0.90,
    "cos_phi_max": 1.00,
    "in_rated_a": 72.2,
    "k_sc": 1.1,
    "operating_mode": "MPPT",
    "in_service": true
  }
}
```

### 3.7 `add_converter_source` (źródło przekształtnikowe do rozdzielnicy nN)

```json
{
  "operation": "add_converter_source",
  "meta": {
    "snapshot_in": "S10",
    "idempotency_key": "4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f",
    "ui_click_id": "click_011",
    "timestamp_utc": "2026-02-17T10:10:00Z"
  },
  "payload": {
    "nn_bus_id": "bus-nn-tr1-st01-0.4kv",
    "inverter_name": "BESS magazyn energii ST-01",
    "converter_kind": "BESS",
    "type_ref": "BYD_HVS_10kWh_hybrid",
    "pmax_kw": 10.0,
    "sn_kva": 10.0,
    "energy_capacity_kwh": 10.24,
    "soc_initial_percent": 80.0,
    "cos_phi_min": 0.85,
    "cos_phi_max": 1.00,
    "in_rated_a": 14.4,
    "k_sc": 1.0,
    "operating_mode": "GRID_SUPPORT",
    "in_service": true
  }
}
```

---

## 4. Kanonizacja JSON

Wszystkie obiekty JSON przechowywane i porownywane w systemie MUSZA byc zkanonizowane.

### 4.1 Reguly kanonizacji (BINDING)

| Regula                         | Opis                                                                   | Przyklad                          |
|--------------------------------|------------------------------------------------------------------------|-----------------------------------|
| Klucze sortowane leksykograficznie | Klucze obiektow JSON sortowane rekurencyjnie wg Unicode            | `{"a":1,"b":2,"c":3}`            |
| Brak spacji                    | Separatory: `","` i `":"` -- brak spacji po dwukropku i przecinku      | `{"a":1,"b":2}` (nie `{"a": 1}`) |
| Liczby w zapisie staloprzecinkowym | Liczby zmiennoprzecinkowe z co najmniej 1 miejscem po kropce       | `15.0` (nie `15` ani `1.5e1`)    |
| Skwantowanie FRACTION do quantum 1e-6 | Wartosc FRACTION zaokraglona do 6 miejsc dziesietnych          | `0.468000` (nie `0.4680001`)     |
| Brak komentarzy                | JSON nie zawiera komentarzy                                            | --                                |
| Brak koncowych przecinkow      | Brak trailing commas                                                   | --                                |
| Kodowanie UTF-8 bez BOM        | Wszystkie pliki JSON w UTF-8, bez znacznika BOM                        | --                                |

### 4.2 Procedura kanonizacji

```
1. Wez obiekt JSON
2. Posortuj klucze rekurencyjnie (na kazdym poziomie zagniezdzen) leksykograficznie
3. Usun wszystkie biale znaki (spacje, nowe linie, tabulacje)
4. Zaokraglij wartosci FRACTION do kwantu 1e-6
5. Zapisz liczby zmiennoprzecinkowe w notacji staloprzecinkowej
6. Zakoduj w UTF-8 bez BOM
7. Wynik = kanoniczny JSON
```

### 4.3 Przyklad kanonizacji

Wejscie (sformatowane):
```json
{
  "voltage_kv": 15.0,
  "bus_name": "Szyna GPZ",
  "rx_ratio": 0.1
}
```

Po kanonizacji:
```
{"bus_name":"Szyna GPZ","rx_ratio":0.100000,"voltage_kv":15.000000}
```

---

## 5. Identyfikatory deterministyczne

Kazdy element sieci otrzymuje identyfikator deterministyczny oparty na seedzie kryptograficznym.
Ten sam zestaw danych wejsciowych ZAWSZE generuje ten sam identyfikator.

### 5.1 Algorytm generowania seed

```
seed = sha256(kanoniczny_json) -> pierwsze 16 bajtow -> hex (32 znaki)
```

### 5.2 Dane wchodzace do seed (seed_includes)

| Pole                   | Opis                                              |
|------------------------|---------------------------------------------------|
| `trunk_id`             | Identyfikator magistrali                          |
| `segment_id`           | Identyfikator segmentu                            |
| `cut`                  | Punkt ciecia (mode + value po kanonizacji)         |
| Typ stacji             | `station_type` (A / B / C / D)                    |
| Plan portow            | Lista rol pol SN (uporzadkowana leksykograficznie) |
| Wiazania katalogowe    | Referencje do typow katalogowych                  |

### 5.3 Dane wykluczone z seed (seed_excludes)

| Pole                       | Powod wylaczenia                                         |
|----------------------------|----------------------------------------------------------|
| Czas (`timestamp_utc`)     | Niedeterministyczny -- zmienia sie miedzy wywolaniami    |
| ID klikniecia (`ui_click_id`) | Artefakt UI -- nie wplywa na semantyke operacji       |
| ID sesji                   | Artefakt sesji -- nie wplywa na model                    |
| Surowe wspolrzedne pikselowe | Zaleznie od rozdzielczosci ekranu -- niedeterministyczne |

### 5.4 Format ElementId

```
prefix/seed/sciezka_lokalna
```

Gdzie:
- **prefix** -- typ elementu: `bus`, `branch`, `sw`, `station`, `source`, `tr`, `gen`, `load`, `ct`, `vt`, `relay`
- **seed** -- 32-znakowy hex z SHA-256 (pierwsze 16 bajtow)
- **sciezka_lokalna** -- opcjonalna sciezka w obrebie kontekstu (np. `sn`, `nn`, `tr1`)

### 5.5 Przyklady ElementId

| ElementId                                                  | Opis                                        |
|------------------------------------------------------------|---------------------------------------------|
| `bus/a3f4b2c1d5e6f7a8b9c0d1e2f3a4b5c6/sn`                | Szyna SN -- seed z operacji                 |
| `branch/c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6/l1-01-a`        | Segment lewy po podziale                    |
| `station/e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2/st-01`         | Stacja transformatorowa ST-01               |
| `sw/f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3/nop-r1`             | Lacznik NOP pierscienia R1                  |
| `tr/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/tr1-st01`           | Transformator TR1 stacji ST-01              |
| `gen/b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5/pv-dach-b1`        | Falownik PV dach B1                         |

### 5.6 Wlasciwosci gwarantowane

- **Determinizm**: te same dane wejsciowe (po kanonizacji) -> ten sam seed -> ten sam ElementId
- **Unikalnosc**: rozne dane wejsciowe -> rozne seedy (z prawdopodobienstwem granicznym kolizji SHA-256)
- **Audytowalnosc**: seed moze byc zweryfikowany przez ponowne obliczenie z danych wejsciowych
- **Stabilnosc**: ElementId nie zmienia sie przy ponownym wykonaniu tej samej operacji z tymi samymi danymi
- **Brak diakrytykow**: ElementId nie zawiera polskich znakow diakrytycznych (transliteracja)
- **Dozwolone znaki**: `a-z`, `0-9`, `-`, `/`

---

## Referencje

| Dokument                                              | Sciezka                                                    | Rola                           |
|-------------------------------------------------------|------------------------------------------------------------|--------------------------------|
| Kontrakty operacji domenowych (ZRODLO PRAWDY)         | `docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md`           | Nazwy kanoniczne, payloady, zdarzenia |
| Kody gotowosci i akcje naprawcze                      | `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md`         | Slownik kodow gotowosci         |
| Indeks kanoniczny V12.5                               | `docs/INDEX_KANONICZNY.md`                                  | Wejscie do wiazacych specyfikacji systemowych |
| Specyfikacja systemu                                  | `SYSTEM_SPEC.md`                                           | Architektura nadrzedna          |
| Modele Pydantic                                       | `backend/src/domain/domain_ops_models.py`                  | Schematy danych backendowe      |

---

## Historia zmian

| Data       | Wersja | Opis                                                       |
|------------|--------|-------------------------------------------------------------|
| 2026-02-17 | 1.0    | Utworzenie dokumentu -- kontrakt odpowiedzi, magistrala, przyklady JSON, kanonizacja, identyfikatory deterministyczne |

---

> **KONIEC DOKUMENTU WIAZACEGO**
>
> Wszelkie zmiany w tym dokumencie wymagaja przegladu architektonicznego
> i aktualizacji numeru wersji.
