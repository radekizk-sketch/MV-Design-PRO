# ENM_OP_CONTRACTS_CANONICAL_FULL

## Dokument Wiazacy -- Kanoniczne Kontrakty Operacji Domenowych

| Pole              | Wartosc                                          |
|-------------------|--------------------------------------------------|
| Status            | **CANONICAL / NORMATIVE / BINDING**              |
| Wersja            | 1.0.0                                            |
| Data utworzenia    | 2026-02-17                                       |
| Klasyfikacja      | Industrial (benchmark-grade)                  |
| Warstwa           | Domain Layer (Application -> Domain -> Solver)   |
| Referencja Pydantic | `backend/src/domain/domain_ops_models.py`      |

> **REGULA**: Ten dokument jest JEDYNYM ZRODLEM PRAWDY dla nazw operacji domenowych,
> kontraktow payload JSON oraz zdarzen domenowych.
> Wszelkie inne dokumenty opisujace operacje traca waznosc w przypadku konfliktu.

---

## Spis tresci

1. [Kanoniczne nazwy operacji](#1-kanoniczne-nazwy-operacji)
2. [Regula nazewnictwa V11](#2-regula-nazewnictwa-v11)
3. [Przyklady payload JSON (16 kompletnych)](#3-przyklady-payload-json)
4. [Referencja schematow JSON (Pydantic)](#4-referencja-schematow-json-pydantic)
5. [Zdarzenia domenowe (Domain Events)](#5-zdarzenia-domenowe-domain-events)

---

## 1. Kanoniczne nazwy operacji

### 1.1 Operacje SN (Siec Sredniego Napiecia)

| Nr | Nazwa kanoniczna                   | Opis (PL)                                                      | Warstwa docelowa          |
|----|------------------------------------|-----------------------------------------------------------------|---------------------------|
| 1  | `add_grid_source_sn`              | Dodanie zrodla zasilania sieciowego (GPZ) do sieci SN          | Domain / NetworkModel     |
| 2  | `continue_trunk_segment_sn`       | Kontynuacja segmentu magistrali SN (dodanie kolejnego odcinka) | Domain / NetworkModel     |
| 3  | `insert_station_on_segment_sn`    | Wstawienie stacji na istniejacym segmencie SN (podzial)        | Domain / NetworkModel     |
| 4  | `start_branch_segment_sn`         | Rozpoczecie nowego odgalezienia (branch) od magistrali SN      | Domain / NetworkModel     |
| 5  | `insert_section_switch_sn`        | Wstawienie lacznika sekcyjnego na segmencie SN                 | Domain / NetworkModel     |
| 6  | `connect_secondary_ring_sn`       | Zamkniecie pierscienia wtornego (polaczenie dwoch konc. ciag.) | Domain / NetworkModel     |
| 7  | `set_normal_open_point`           | Ustawienie punktu normalnie otwartego (NOP) w pierścieniu      | Domain / NetworkModel     |

### 1.2 Operacje Stacyjne i nN (niskie Napiecie)

| Nr | Nazwa kanoniczna                   | Opis (PL)                                                      | Warstwa docelowa          |
|----|------------------------------------|-----------------------------------------------------------------|---------------------------|
| 8  | `add_transformer_sn_nn`           | Dodanie transformatora SN/nN w stacji                          | Domain / NetworkModel     |
| 9  | `add_nn_outgoing_field`           | Dodanie pola odpływowego nN                                    | Domain / NetworkModel     |
| 10 | `add_nn_outgoing_field`           | Dodanie pola nN w kontrakcie kanonicznym                       | Domain / NetworkModel     |
| 11 | `add_nn_load`                     | Dodanie obciazenia na szynie nN                                | Domain / NetworkModel     |
| 12 | `update_nn_bus_sections`          | Aktualizacja konfiguracji sekcji szyn nN                       | Domain / NetworkModel     |
| 13 | `update_nn_coupler_state`         | Zmiana stanu lacznika szyn nN (otwarty/zamkniety)              | Domain / NetworkModel     |

### 1.3 Operacje OZE w nN

| Nr | Nazwa kanoniczna                   | Opis (PL)                                                      | Warstwa docelowa          |
|----|------------------------------------|-----------------------------------------------------------------|---------------------------|
| 14 | `add_converter_source`            | Dodanie źródła przekształtnikowego PV/BESS/FW na szynie nN     | Domain / NetworkModel     |
| 15 | `add_converter_source`            | Dodanie źródła przekształtnikowego PV/BESS/FW na szynie nN     | Domain / NetworkModel     |
| 16 | `add_genset_nn`                   | Dodanie zespolu pradotwórczego (agregat) na szynie nN          | Domain / NetworkModel     |
| 17 | `add_ups_nn`                      | Dodanie zasilacza UPS na szynie nN                             | Domain / NetworkModel     |
| 18 | `set_source_operating_mode`       | Ustawienie trybu pracy zrodla (generacja/kompensacja/isl.)     | Domain / NetworkModel     |
| 19 | `set_dynamic_profile`             | Przypisanie profilu dynamicznego do zrodla (krzywa P(t), Q(t)) | Domain / NetworkModel     |

### 1.4 Operacje Zabezpieczen (Protection)

| Nr | Nazwa kanoniczna                   | Opis (PL)                                                      | Warstwa docelowa          |
|----|------------------------------------|-----------------------------------------------------------------|---------------------------|
| 20 | `add_ct`                          | Dodanie przekladnika pradowego (CT)                            | Domain / NetworkModel     |
| 21 | `add_vt`                          | Dodanie przekladnika napieciowego (VT)                         | Domain / NetworkModel     |
| 22 | `add_relay`                       | Dodanie przekaznika zabezpieczeniowego                         | Domain / NetworkModel     |
| 23 | `update_relay_settings`           | Aktualizacja nastaw przekaznika (Is, TMS, I>>, I>>>)           | Domain / NetworkModel     |
| 24 | `link_relay_to_field`             | Powiazanie przekaznika z polem rozdzielczym                    | Domain / NetworkModel     |
| 25 | `calculate_tcc_curve`             | Obliczenie krzywej czas-prad (TCC) dla przekaznika             | Analysis / Protection     |
| 26 | `validate_selectivity`            | Walidacja selektywnosci miedzy urzadzeniami zabezpieczeniowymi | Analysis / Protection     |

### 1.5 Operacje StudyCase (Przypadki obliczeniowe)

| Nr | Nazwa kanoniczna                   | Opis (PL)                                                      | Warstwa docelowa          |
|----|------------------------------------|-----------------------------------------------------------------|---------------------------|
| 27 | `create_study_case`               | Utworzenie nowego przypadku obliczeniowego                      | Domain / StudyCase        |
| 28 | `set_case_switch_state`           | Ustawienie stanu lacznika w kontekscie przypadku               | Domain / StudyCase        |
| 29 | `set_case_normal_state`           | Ustawienie stanu normalnego eksploatacji w przypadku           | Domain / StudyCase        |
| 30 | `set_case_source_mode`            | Ustawienie trybu pracy zrodla w kontekscie przypadku           | Domain / StudyCase        |
| 31 | `set_case_time_profile`           | Ustawienie profilu czasowego w przypadku (chwila t)            | Domain / StudyCase        |
| 32 | `run_short_circuit`               | Uruchomienie obliczen zwarciowych IEC 60909                    | Solver / IEC 60909        |
| 33 | `run_power_flow`                  | Uruchomienie obliczen rozplywu mocy (Newton-Raphson)           | Solver / Power Flow       |
| 34 | `run_time_series_power_flow`      | Uruchomienie serii obliczen rozplywu mocy w dziedzinie czasu   | Solver / Power Flow       |
| 35 | `compare_study_cases`             | Porownanie dwoch przypadkow obliczeniowych                     | Analysis / Comparison     |

### 1.6 Operacje Uniwersalne

| Nr | Nazwa kanoniczna                   | Opis (PL)                                                      | Warstwa docelowa          |
|----|------------------------------------|-----------------------------------------------------------------|---------------------------|
| 36 | `assign_catalog_to_element`       | Przypisanie typu katalogowego do elementu sieci                | Domain / Catalog          |
| 37 | `update_element_parameters`       | Aktualizacja parametrow elementu sieci                         | Domain / NetworkModel     |
| 38 | `rename_element`                  | Zmiana nazwy elementu sieci                                    | Domain / NetworkModel     |
| 39 | `set_label`                       | Ustawienie etykiety wyswietlanej na schemacie SLD              | Application / SLD         |

---

## 2. Regula nazewnictwa V11

W aktywnej powierzchni V11 obowiazuja wylacznie nazwy kanoniczne operacji.
Frontend, testy integracyjne, testy E2E i aktywna dokumentacja nie uzywaja
aliasow historycznych ani alternatywnych nazw payloadow.

### Reguly nazewnictwa

1. Dispatcher operacji przyjmuje wyłącznie nazwy kanoniczne w aktywnej powierzchni V11.
2. Dokumentacja aktywna opisuje wyłącznie nazwy kanoniczne.
3. Nowy kod NIE MOZE uzywac aliasow ani alternatywnych identyfikatorow operacji.
4. Zgodnosc historyczna, jesli jest potrzebna dla migracji, nie stanowi czesci kontraktu publicznego V11.

---

## 3. Przyklady payload JSON

Kazdy przyklad zawiera kompletny obiekt JSON -- bez skrotow, bez "...", z realistycznymi danymi polskimi.

### Przyklad 1: `add_grid_source_sn`

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

### Przyklad 2: `continue_trunk_segment_sn`

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

### Przyklad 3: `insert_station_on_segment_sn`

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
    "station_name": "Stacja transformatorowa ST-01 Wschodnia",
    "station_type": "TRAFO",
    "split_distance_km": 1.10,
    "voltage_level_kv": 15.0,
    "new_bus_name": "Szyna SN ST-01",
    "switch_type_upstream": "LOAD_SWITCH",
    "switch_type_downstream": "LOAD_SWITCH"
  }
}
```

### Przyklad 4: `start_branch_segment_sn`

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

### Przyklad 5: `insert_section_switch_sn`

```json
{
  "operation": "insert_section_switch_sn",
  "meta": {
    "snapshot_in": "S4",
    "idempotency_key": "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
    "ui_click_id": "click_005",
    "timestamp_utc": "2026-02-17T10:04:00Z"
  },
  "payload": {
    "segment_id": "branch-l1-01-a",
    "switch_name": "Lacznik sekcyjny LS-01",
    "switch_type": "LOAD_SWITCH",
    "rated_current_a": 630.0,
    "rated_voltage_kv": 17.5,
    "initial_state": "CLOSED",
    "split_position_km": 0.55
  }
}
```

### Przyklad 6: `connect_secondary_ring_sn`

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

### Przyklad 7: `set_normal_open_point`

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

### Przyklad 8: `add_transformer_sn_nn`

```json
{
  "operation": "add_transformer_sn_nn",
  "meta": {
    "snapshot_in": "S7",
    "idempotency_key": "1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c",
    "ui_click_id": "click_008",
    "timestamp_utc": "2026-02-17T10:07:00Z"
  },
  "payload": {
    "station_id": "station-st-01",
    "sn_bus_id": "bus-st-01-sn",
    "transformer_name": "Transformator TR1 ST-01",
    "type_ref": "ONAN_630kVA_15/0.4kV_Dyn11",
    "rated_power_mva": 0.63,
    "voltage_hv_kv": 15.0,
    "voltage_lv_kv": 0.4,
    "uk_percent": 6.0,
    "pk_kw": 6.5,
    "i0_percent": 0.3,
    "p0_kw": 1.1,
    "vector_group": "Dyn11",
    "tap_position": 0,
    "nn_bus_name": "Szyna nN 0.4 kV TR1 ST-01"
  }
}
```

### Przyklad 9: `add_nn_load`

```json
{
  "operation": "add_nn_load",
  "meta": {
    "snapshot_in": "S8",
    "idempotency_key": "2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d",
    "ui_click_id": "click_009",
    "timestamp_utc": "2026-02-17T10:08:00Z"
  },
  "payload": {
    "nn_bus_id": "bus-nn-tr1-st01-0.4kv",
    "load_name": "Obciazenie budynku biurowego B1",
    "active_power_kw": 120.0,
    "reactive_power_kvar": 45.0,
    "cos_phi": 0.936,
    "load_type": "STATIC",
    "voltage_dependency": "CONSTANT_POWER",
    "field_id": "field-nn-odpl-01"
  }
}
```

### Przyklad 10: `add_converter_source`

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

### Przyklad 11: `add_converter_source`

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

### Przyklad 12: `add_relay`

```json
{
  "operation": "add_relay",
  "meta": {
    "snapshot_in": "S11",
    "idempotency_key": "5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a",
    "ui_click_id": "click_012",
    "timestamp_utc": "2026-02-17T10:11:00Z"
  },
  "payload": {
    "field_id": "field-sn-odpl-01",
    "relay_name": "Zabezpieczenie nadpradowe F1 pole L1",
    "device_type": "RELAY",
    "manufacturer": "Schneider Electric",
    "model": "Sepam 20",
    "ct_id": "ct-field-sn-01",
    "rated_current_a": 5.0,
    "settings": {
      "stage_51": {
        "enabled": true,
        "pickup_current_a": 300.0,
        "time_s": null,
        "curve_settings": {
          "standard": "IEC",
          "variant": "SI",
          "pickup_current_a": 300.0,
          "time_multiplier": 0.30,
          "definite_time_s": null,
          "reset_time_s": 0.0
        },
        "directional": false
      },
      "stage_50": {
        "enabled": true,
        "pickup_current_a": 2500.0,
        "time_s": 0.05,
        "curve_settings": null,
        "directional": false
      },
      "stage_50_high": null,
      "stage_51n": {
        "enabled": true,
        "pickup_current_a": 30.0,
        "time_s": null,
        "curve_settings": {
          "standard": "IEC",
          "variant": "SI",
          "pickup_current_a": 30.0,
          "time_multiplier": 0.25,
          "definite_time_s": null,
          "reset_time_s": 0.0
        },
        "directional": false
      },
      "stage_50n": {
        "enabled": true,
        "pickup_current_a": 250.0,
        "time_s": 0.10,
        "curve_settings": null,
        "directional": false
      }
    }
  }
}
```

### Przyklad 13: `create_study_case`

```json
{
  "operation": "create_study_case",
  "meta": {
    "snapshot_in": "S12",
    "idempotency_key": "6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b",
    "ui_click_id": "click_013",
    "timestamp_utc": "2026-02-17T10:12:00Z"
  },
  "payload": {
    "case_name": "Przypadek bazowy -- stan normalny lato 2026",
    "description": "Stan normalny eksploatacji z pelnym obciazeniem letnim i wlaczonymi OZE",
    "network_snapshot_id": "S12",
    "config": {
      "c_factor_max": 1.10,
      "c_factor_min": 1.00,
      "base_mva": 100.0,
      "max_iterations": 50,
      "tolerance": 1e-6,
      "include_motor_contribution": true,
      "include_inverter_contribution": true,
      "thermal_time_seconds": 1.0
    },
    "is_active": true
  }
}
```

### Przyklad 14: `run_short_circuit`

```json
{
  "operation": "run_short_circuit",
  "meta": {
    "snapshot_in": "S12",
    "idempotency_key": "7b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c",
    "ui_click_id": "click_014",
    "timestamp_utc": "2026-02-17T10:13:00Z"
  },
  "payload": {
    "case_id": "case-bazowy-lato-2026",
    "fault_type": "SC3F",
    "fault_bus_ids": [
      "bus-st-01-sn",
      "bus-st-02-sn",
      "bus-rpz-polnocna-15kv"
    ],
    "c_factor": 1.10,
    "include_inverter_contribution": true,
    "include_motor_contribution": true,
    "calculate_peak_current": true,
    "calculate_thermal_current": true,
    "thermal_time_s": 1.0,
    "solver_version": "iec60909_v3.2"
  }
}
```

### Przyklad 15: `run_power_flow`

```json
{
  "operation": "run_power_flow",
  "meta": {
    "snapshot_in": "S12",
    "idempotency_key": "8c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d",
    "ui_click_id": "click_015",
    "timestamp_utc": "2026-02-17T10:14:00Z"
  },
  "payload": {
    "case_id": "case-bazowy-lato-2026",
    "solver_method": "NEWTON_RAPHSON",
    "base_mva": 100.0,
    "max_iterations": 50,
    "tolerance": 1e-6,
    "flat_start": true,
    "enforce_reactive_limits": true,
    "tap_adjustment": false,
    "solver_version": "power_flow_newton_v2.1"
  }
}
```

### Przyklad 16: `assign_catalog_to_element`

```json
{
  "operation": "assign_catalog_to_element",
  "meta": {
    "snapshot_in": "S12",
    "idempotency_key": "9d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e",
    "ui_click_id": "click_016",
    "timestamp_utc": "2026-02-17T10:15:00Z"
  },
  "payload": {
    "element_id": "branch-l1-01",
    "element_type": "CABLE",
    "catalog_type_ref": "NA2XS(F)2Y_1x240_12/20kV",
    "catalog_kind": "CableType",
    "resolve_params": true,
    "override_existing": false
  }
}
```

---

## 4. Referencja schematow JSON (Pydantic)

Ponizej opisano wymagane pola payload dla kazdej operacji.
Referencja wskazuje na modele Pydantic w `backend/src/domain/domain_ops_models.py`.

### 4.1 Wspólna koperta (meta)

| Pole              | Typ      | Wymagane | Opis                                                      |
|-------------------|----------|----------|------------------------------------------------------------|
| `snapshot_in`     | `string` | TAK      | ID snapshotu wejsciowego (stan sieci przed operacja)       |
| `idempotency_key` | `string` | TAK      | Klucz idempotentnosci (64 znaki hex)                       |
| `ui_click_id`     | `string` | NIE      | Identyfikator klikniecia UI (do audytu)                    |
| `timestamp_utc`   | `string` | TAK      | Znacznik czasu ISO 8601 UTC                                |

### 4.2 `add_grid_source_sn` -- AddGridSourceSNPayload

| Pole           | Typ      | Wymagane | Ograniczenia                    | Opis                              |
|----------------|----------|----------|---------------------------------|-----------------------------------|
| `source_name`  | `string` | TAK      | min 1, max 200 znakow           | Nazwa zrodla zasilania (GPZ)      |
| `bus_name`     | `string` | TAK      | min 1, max 200 znakow           | Nazwa szyny GPZ                   |
| `voltage_kv`   | `float`  | TAK      | > 0, typowo 6.0 / 10.0 / 15.0 / 20.0 / 30.0 | Napiecie znamionowe [kV] |
| `sk3_mva`      | `float`  | TAK      | > 0                             | Moc zwarciowa trojfazowa [MVA]    |
| `ik3_ka`       | `float`  | TAK      | > 0                             | Prad zwarciowy trojfazowy [kA]    |
| `rx_ratio`     | `float`  | TAK      | > 0, typowo 0.05 -- 0.3         | Stosunek R/X zrodla               |

### 4.3 `continue_trunk_segment_sn` -- ContinueTrunkSegmentSNPayload

| Pole              | Typ      | Wymagane | Ograniczenia            | Opis                                    |
|-------------------|----------|----------|-------------------------|-----------------------------------------|
| `from_bus_id`     | `string` | TAK      | musi istniec w modelu   | ID szyny startowej                      |
| `segment_name`    | `string` | TAK      | min 1                   | Nazwa segmentu kabla/linii              |
| `cable_type_ref`  | `string` | TAK      | musi istniec w katalogu | Referencja do typu kabla/linii          |
| `length_km`       | `float`  | TAK      | > 0                     | Dlugosc segmentu [km]                   |
| `new_bus_name`    | `string` | TAK      | min 1                   | Nazwa nowej szyny koncowej              |
| `laying_method`   | `string` | NIE      | GROUND / DUCT / AIR     | Metoda ulozenia kabla                   |
| `parallel_count`  | `int`    | NIE      | >= 1, domyslnie 1       | Liczba kabli rownoleglych               |

### 4.4 `insert_station_on_segment_sn` -- InsertStationOnSegmentSNPayload

| Pole                     | Typ      | Wymagane | Ograniczenia              | Opis                                    |
|--------------------------|----------|----------|---------------------------|-----------------------------------------|
| `segment_id`             | `string` | TAK      | musi istniec w modelu     | ID segmentu do podzialu                 |
| `station_name`           | `string` | TAK      | min 1                     | Nazwa nowej stacji                      |
| `station_type`           | `string` | TAK      | GPZ / RPZ / TRAFO / SWITCHING | Typ stacji                          |
| `split_distance_km`      | `float`  | TAK      | > 0, < dlugosc segmentu   | Odleglosc podzialu od poczatku [km]     |
| `voltage_level_kv`       | `float`  | TAK      | > 0                       | Poziom napiecia stacji [kV]             |
| `new_bus_name`           | `string` | TAK      | min 1                     | Nazwa nowej szyny w stacji              |
| `switch_type_upstream`   | `string` | NIE      | BREAKER / LOAD_SWITCH / DISCONNECTOR | Typ lacznika od strony zasilania |
| `switch_type_downstream` | `string` | NIE      | BREAKER / LOAD_SWITCH / DISCONNECTOR | Typ lacznika od strony odbioru   |

### 4.5 `start_branch_segment_sn` -- StartBranchSegmentSNPayload

| Pole              | Typ      | Wymagane | Ograniczenia            | Opis                                    |
|-------------------|----------|----------|-------------------------|-----------------------------------------|
| `from_bus_id`     | `string` | TAK      | musi istniec w modelu   | ID szyny startowej odgalezienia         |
| `branch_name`     | `string` | TAK      | min 1                   | Nazwa odgalezienia                      |
| `cable_type_ref`  | `string` | TAK      | musi istniec w katalogu | Referencja do typu kabla/linii          |
| `length_km`       | `float`  | TAK      | > 0                     | Dlugosc odgalezienia [km]               |
| `new_bus_name`    | `string` | TAK      | min 1                   | Nazwa szyny koncowej odgalezienia       |
| `laying_method`   | `string` | NIE      | GROUND / DUCT / AIR     | Metoda ulozenia kabla                   |
| `parallel_count`  | `int`    | NIE      | >= 1, domyslnie 1       | Liczba kabli rownoleglych               |

### 4.6 `insert_section_switch_sn` -- InsertSectionSwitchSNPayload

| Pole                | Typ      | Wymagane | Ograniczenia            | Opis                                  |
|---------------------|----------|----------|-------------------------|---------------------------------------|
| `segment_id`        | `string` | TAK      | musi istniec w modelu   | ID segmentu                           |
| `switch_name`       | `string` | TAK      | min 1                   | Nazwa lacznika sekcyjnego             |
| `switch_type`       | `string` | TAK      | BREAKER / LOAD_SWITCH / DISCONNECTOR | Typ aparatu laczeniowego    |
| `rated_current_a`   | `float`  | TAK      | > 0                     | Prad znamionowy [A]                   |
| `rated_voltage_kv`  | `float`  | TAK      | > 0                     | Napiecie znamionowe [kV]              |
| `initial_state`     | `string` | NIE      | OPEN / CLOSED, dom. CLOSED | Stan poczatkowy lacznika           |
| `split_position_km` | `float`  | TAK      | > 0, < dlugosc segmentu | Pozycja podzialu na segmencie [km]    |

### 4.7 `connect_secondary_ring_sn` -- ConnectSecondaryRingSNPayload

| Pole                | Typ      | Wymagane | Ograniczenia            | Opis                                   |
|---------------------|----------|----------|-------------------------|-----------------------------------------|
| `bus_a_id`          | `string` | TAK      | musi istniec w modelu   | ID szyny A (koniec ciagu 1)             |
| `bus_b_id`          | `string` | TAK      | musi istniec w modelu   | ID szyny B (koniec ciagu 2)             |
| `ring_segment_name` | `string` | TAK      | min 1                   | Nazwa segmentu zamykajacego             |
| `cable_type_ref`    | `string` | TAK      | musi istniec w katalogu | Referencja do typu kabla/linii          |
| `length_km`         | `float`  | TAK      | > 0                     | Dlugosc segmentu zamykajacego [km]      |
| `nop_switch_name`   | `string` | TAK      | min 1                   | Nazwa rozlacznika NOP                   |
| `nop_initial_state` | `string` | NIE      | OPEN / CLOSED, dom. OPEN | Stan NOP (domyslnie otwarty)           |

### 4.8 `set_normal_open_point` -- SetNormalOpenPointPayload

| Pole                     | Typ      | Wymagane | Ograniczenia          | Opis                                    |
|--------------------------|----------|----------|-----------------------|-----------------------------------------|
| `switch_id`              | `string` | TAK      | musi istniec w modelu | ID lacznika do oznaczenia jako NOP      |
| `is_nop`                 | `bool`   | TAK      |                       | Czy lacznik jest NOP (true/false)       |
| `previous_nop_switch_id` | `string` | NIE      | musi istniec (jesli podane) | ID poprzedniego NOP do zamkniecia  |
| `auto_close_previous`    | `bool`   | NIE      | domyslnie true        | Automatyczne zamkniecie poprzedniego NOP |

### 4.9 `add_transformer_sn_nn` -- AddTransformerSNnNPayload

| Pole               | Typ      | Wymagane | Ograniczenia            | Opis                                    |
|--------------------|----------|----------|-------------------------|-----------------------------------------|
| `station_id`       | `string` | TAK      | musi istniec w modelu   | ID stacji                               |
| `sn_bus_id`        | `string` | TAK      | musi istniec w modelu   | ID szyny SN (strona gorna)              |
| `transformer_name` | `string` | TAK      | min 1                   | Nazwa transformatora                    |
| `type_ref`         | `string` | NIE      | musi istniec w katalogu | Referencja do typu transformatora       |
| `rated_power_mva`  | `float`  | TAK      | > 0                     | Moc znamionowa [MVA]                    |
| `voltage_hv_kv`    | `float`  | TAK      | > 0                     | Napiecie znamionowe strony gornej [kV]  |
| `voltage_lv_kv`    | `float`  | TAK      | > 0                     | Napiecie znamionowe strony dolnej [kV]  |
| `uk_percent`       | `float`  | TAK      | > 0                     | Napiecie zwarcia [%]                    |
| `pk_kw`            | `float`  | TAK      | >= 0                    | Straty zwarciowe [kW]                   |
| `i0_percent`       | `float`  | NIE      | >= 0, dom. 0            | Prad jalowy [%]                         |
| `p0_kw`            | `float`  | NIE      | >= 0, dom. 0            | Straty jalowe [kW]                      |
| `vector_group`     | `string` | NIE      | dom. "Dyn11"            | Grupa polaczen                          |
| `tap_position`     | `int`    | NIE      | dom. 0                  | Pozycja zaczepow                        |
| `nn_bus_name`      | `string` | TAK      | min 1                   | Nazwa szyny nN (strona dolna)           |

### 4.10 `add_nn_load` -- AddNNLoadPayload

| Pole                  | Typ      | Wymagane | Ograniczenia                    | Opis                              |
|-----------------------|----------|----------|---------------------------------|-----------------------------------|
| `nn_bus_id`           | `string` | TAK      | musi istniec w modelu           | ID szyny nN                       |
| `load_name`           | `string` | TAK      | min 1                           | Nazwa obciazenia                  |
| `active_power_kw`     | `float`  | TAK      | >= 0                            | Moc czynna [kW]                   |
| `reactive_power_kvar` | `float`  | NIE      |                                 | Moc bierna [kvar]                 |
| `cos_phi`             | `float`  | NIE      | 0 < cos_phi <= 1               | Wspolczynnik mocy                 |
| `load_type`           | `string` | NIE      | STATIC / MOTOR / MIXED          | Typ obciazenia                    |
| `voltage_dependency`  | `string` | NIE      | CONSTANT_POWER / CONSTANT_IMPEDANCE / CONSTANT_CURRENT | Zaleznosc napiecia |
| `field_id`            | `string` | NIE      |                                 | ID pola odpływowego               |

### 4.11 `add_converter_source` -- AddConverterSourcePayload

| Pole              | Typ      | Wymagane | Ograniczenia            | Opis                                    |
|-------------------|----------|----------|-------------------------|-----------------------------------------|
| `nn_bus_id`       | `string` | TAK      | musi istniec w modelu   | ID szyny nN                             |
| `inverter_name`   | `string` | TAK      | min 1                   | Nazwa falownika PV                      |
| `converter_kind`  | `string` | TAK      | "PV"                    | Rodzaj przetwornika (staly: PV)         |
| `type_ref`        | `string` | NIE      | musi istniec w katalogu | Referencja do typu falownika            |
| `pmax_kw`         | `float`  | TAK      | > 0                     | Maksymalna moc czynna [kW]             |
| `sn_kva`          | `float`  | TAK      | > 0                     | Moc pozorna znamionowa [kVA]            |
| `cos_phi_min`     | `float`  | NIE      | > 0, <= 1               | Minimalny wspolczynnik mocy             |
| `cos_phi_max`     | `float`  | NIE      | > 0, <= 1               | Maksymalny wspolczynnik mocy            |
| `in_rated_a`      | `float`  | TAK      | > 0                     | Prad znamionowy [A]                     |
| `k_sc`            | `float`  | NIE      | > 0, dom. 1.1           | Wspolczynnik pradu zwarciowego          |
| `operating_mode`  | `string` | NIE      | MPPT / FIXED / OFF      | Tryb pracy                              |
| `in_service`      | `bool`   | NIE      | dom. true               | Czy urzadzenie jest w pracy             |

### 4.12 `add_converter_source` -- AddConverterSourcePayload

| Pole                   | Typ      | Wymagane | Ograniczenia            | Opis                                  |
|------------------------|----------|----------|-------------------------|---------------------------------------|
| `nn_bus_id`            | `string` | TAK      | musi istniec w modelu   | ID szyny nN                           |
| `inverter_name`        | `string` | TAK      | min 1                   | Nazwa falownika BESS                  |
| `converter_kind`       | `string` | TAK      | "BESS"                  | Rodzaj przetwornika (staly: BESS)     |
| `type_ref`             | `string` | NIE      | musi istniec w katalogu | Referencja do typu                    |
| `pmax_kw`              | `float`  | TAK      | > 0                     | Maksymalna moc czynna [kW]           |
| `sn_kva`               | `float`  | TAK      | > 0                     | Moc pozorna znamionowa [kVA]          |
| `energy_capacity_kwh`  | `float`  | TAK      | > 0                     | Pojemnosc energetyczna [kWh]          |
| `soc_initial_percent`  | `float`  | NIE      | 0--100, dom. 50         | Poczatkowy stan naladowania [%]       |
| `cos_phi_min`          | `float`  | NIE      | > 0, <= 1               | Minimalny wspolczynnik mocy           |
| `cos_phi_max`          | `float`  | NIE      | > 0, <= 1               | Maksymalny wspolczynnik mocy          |
| `in_rated_a`           | `float`  | TAK      | > 0                     | Prad znamionowy [A]                   |
| `k_sc`                 | `float`  | NIE      | > 0, dom. 1.0           | Wspolczynnik pradu zwarciowego        |
| `operating_mode`       | `string` | NIE      | GRID_SUPPORT / ISLAND / PEAK_SHAVE / OFF | Tryb pracy              |
| `in_service`           | `bool`   | NIE      | dom. true               | Czy urzadzenie jest w pracy           |

### 4.13 `add_relay` -- AddRelayPayload

| Pole              | Typ      | Wymagane | Ograniczenia              | Opis                                    |
|-------------------|----------|----------|---------------------------|-----------------------------------------|
| `field_id`        | `string` | TAK      | musi istniec w modelu     | ID pola rozdzielczego                   |
| `relay_name`      | `string` | TAK      | min 1                     | Nazwa przekaznika                       |
| `device_type`     | `string` | TAK      | RELAY / FUSE / RECLOSER / CIRCUIT_BREAKER | Typ urzadzenia zabezpieczeniowego |
| `manufacturer`    | `string` | NIE      |                           | Producent                               |
| `model`           | `string` | NIE      |                           | Model                                   |
| `ct_id`           | `string` | NIE      | musi istniec (jesli podane) | ID przekladnika pradowego CT          |
| `rated_current_a` | `float`  | NIE      | > 0                       | Prad znamionowy urzadzenia [A]          |
| `settings`        | `object` | TAK      | OvercurrentProtectionSettings | Nastawy zabezpieczenia nadpradowego |

**Struktura `settings` (OvercurrentProtectionSettings)**:

| Pole         | Typ      | Wymagane | Opis                                      |
|--------------|----------|----------|-------------------------------------------|
| `stage_51`   | `object` | TAK      | Stopien I> (czas-zalezny)                 |
| `stage_50`   | `object` | NIE      | Stopien I>> (szybki)                      |
| `stage_50_high` | `object` | NIE   | Stopien I>>> (bardzo szybki)              |
| `stage_51n`  | `object` | NIE      | Stopien I0> (ziemnozwarciowy czas-zalezny)|
| `stage_50n`  | `object` | NIE      | Stopien I0>> (ziemnozwarciowy szybki)     |

**Struktura kazdego stopnia (OvercurrentStageSettings)**:

| Pole               | Typ      | Wymagane | Opis                                |
|--------------------|----------|----------|-------------------------------------|
| `enabled`          | `bool`   | TAK      | Czy stopien jest aktywny            |
| `pickup_current_a` | `float`  | TAK      | Prad rozruchowy [A]                 |
| `time_s`           | `float`  | NIE      | Czas dzialania [s] (dla DT)        |
| `curve_settings`   | `object` | NIE      | Nastawy krzywej (dla IT)           |
| `directional`      | `bool`   | NIE      | Czy stopien jest kierunkowy         |

### 4.14 `create_study_case` -- CreateStudyCasePayload

| Pole                  | Typ      | Wymagane | Ograniczenia       | Opis                                |
|-----------------------|----------|----------|--------------------|-------------------------------------|
| `case_name`           | `string` | TAK      | min 1, max 200     | Nazwa przypadku obliczeniowego      |
| `description`         | `string` | NIE      |                    | Opis przypadku                      |
| `network_snapshot_id` | `string` | TAK      |                    | ID snapshotu sieci                  |
| `config`              | `object` | NIE      | StudyCaseConfig    | Konfiguracja obliczen               |
| `is_active`           | `bool`   | NIE      | dom. false         | Czy przypadek ma byc aktywny        |

### 4.15 `run_short_circuit` -- RunShortCircuitPayload

| Pole                          | Typ        | Wymagane | Ograniczenia       | Opis                                  |
|-------------------------------|------------|----------|--------------------|---------------------------------------|
| `case_id`                     | `string`   | TAK      |                    | ID przypadku obliczeniowego           |
| `fault_type`                  | `string`   | TAK      | SC3F / SC2F / SC1F / SC2FE | Typ zwarcia (wg IEC 60909)    |
| `fault_bus_ids`               | `string[]` | TAK      | min 1 element      | Lista ID szyn z punktami zwarcia      |
| `c_factor`                    | `float`    | NIE      | > 0, dom. 1.10     | Wspolczynnik napiecia c               |
| `include_inverter_contribution` | `bool`   | NIE      | dom. true          | Uwzglednienie wkladu falownikow       |
| `include_motor_contribution`  | `bool`     | NIE      | dom. true          | Uwzglednienie wkladu silnikow         |
| `calculate_peak_current`      | `bool`     | NIE      | dom. true          | Obliczenie pradu udarowego ip         |
| `calculate_thermal_current`   | `bool`     | NIE      | dom. true          | Obliczenie pradu cieplnego Ith        |
| `thermal_time_s`              | `float`    | NIE      | > 0, dom. 1.0      | Czas trwania zwarcia [s]             |
| `solver_version`              | `string`   | NIE      |                    | Wersja solvera (do reprodukowalnosci) |

### 4.16 `run_power_flow` -- RunPowerFlowPayload

| Pole                       | Typ      | Wymagane | Ograniczenia               | Opis                                    |
|----------------------------|----------|----------|----------------------------|-----------------------------------------|
| `case_id`                  | `string` | TAK      |                            | ID przypadku obliczeniowego             |
| `solver_method`            | `string` | NIE      | NEWTON_RAPHSON / GAUSS_SEIDEL / FAST_DECOUPLED | Metoda obliczeniowa     |
| `base_mva`                 | `float`  | NIE      | > 0, dom. 100.0            | Moc bazowa [MVA]                        |
| `max_iterations`           | `int`    | NIE      | > 0, dom. 50               | Maksymalna liczba iteracji              |
| `tolerance`                | `float`  | NIE      | > 0, dom. 1e-6             | Tolerancja zbieznosci                   |
| `flat_start`               | `bool`   | NIE      | dom. true                  | Start plaski (U=1.0 pu, theta=0)       |
| `enforce_reactive_limits`  | `bool`   | NIE      | dom. true                  | Egzekwowanie limitow mocy biernej       |
| `tap_adjustment`           | `bool`   | NIE      | dom. false                 | Automatyczna regulacja zaczepow         |
| `solver_version`           | `string` | NIE      |                            | Wersja solvera (do reprodukowalnosci)   |

### 4.17 `assign_catalog_to_element` -- AssignCatalogToElementPayload

| Pole               | Typ      | Wymagane | Ograniczenia                           | Opis                                |
|--------------------|----------|----------|----------------------------------------|-------------------------------------|
| `element_id`       | `string` | TAK      | musi istniec w modelu                  | ID elementu sieci                   |
| `element_type`     | `string` | TAK      | LINE / CABLE / TRANSFORMER / SWITCH / INVERTER | Typ elementu               |
| `catalog_type_ref` | `string` | TAK      | musi istniec w katalogu                | Referencja do typu katalogowego     |
| `catalog_kind`     | `string` | TAK      | LineType / CableType / TransformerType / SwitchEquipmentType / ConverterType | Rodzaj katalogu |
| `resolve_params`   | `bool`   | NIE      | dom. true                              | Rozwiazanie parametrow z katalogu   |
| `override_existing`| `bool`   | NIE      | dom. false                             | Nadpisanie istniejacego przypisania |

### 4.18 Pozostale operacje -- referencja skrocona

| Operacja                    | Klucze wymagane payload                                        | Model Pydantic                        |
|-----------------------------|----------------------------------------------------------------|---------------------------------------|
| `add_nn_outgoing_field`     | `station_id`, `nn_bus_id`, `field_name`, `cable_type_ref`, `length_km`, `load_bus_name` | AddNNOutgoingFieldPayload |
| `add_nn_outgoing_field`     | `station_id`, `nn_bus_id`, `field_name`, `transformer_id`      | AddNNOutgoingFieldPayload             |
| `update_nn_bus_sections`    | `station_id`, `nn_bus_id`, `section_count`, `coupler_states`   | UpdateNNBusSectionsPayload            |
| `update_nn_coupler_state`   | `coupler_id`, `new_state`                                      | UpdateNNCouplerStatePayload           |
| `add_genset_nn`             | `nn_bus_id`, `genset_name`, `rated_power_kva`, `voltage_kv`, `xd_percent` | AddGensetNNPayload          |
| `add_ups_nn`                | `nn_bus_id`, `ups_name`, `rated_power_kva`, `battery_time_min`, `in_rated_a` | AddUPSNNPayload            |
| `set_source_operating_mode` | `source_id`, `operating_mode`, `power_setpoint_kw`             | SetSourceOperatingModePayload         |
| `set_dynamic_profile`       | `source_id`, `profile_name`, `time_series`                     | SetDynamicProfilePayload              |
| `add_ct`                    | `field_id`, `ct_name`, `ratio_primary_a`, `ratio_secondary_a`, `accuracy_class` | AddCTPayload              |
| `add_vt`                    | `field_id`, `vt_name`, `ratio_primary_kv`, `ratio_secondary_v`, `accuracy_class` | AddVTPayload              |
| `update_relay_settings`     | `relay_id`, `settings`                                         | UpdateRelaySettingsPayload            |
| `link_relay_to_field`       | `relay_id`, `field_id`                                         | LinkRelayToFieldPayload               |
| `calculate_tcc_curve`       | `relay_id`, `current_range_a`                                  | CalculateTCCCurvePayload              |
| `validate_selectivity`      | `device_ids`, `fault_current_range_a`                          | ValidateSelectivityPayload            |
| `set_case_switch_state`     | `case_id`, `switch_id`, `state`                                | SetCaseSwitchStatePayload             |
| `set_case_normal_state`     | `case_id`                                                      | SetCaseNormalStatePayload             |
| `set_case_source_mode`      | `case_id`, `source_id`, `mode`                                 | SetCaseSourceModePayload              |
| `set_case_time_profile`     | `case_id`, `profile_id`, `time_point`                          | SetCaseTimeProfilePayload             |
| `run_time_series_power_flow`| `case_id`, `profile_id`, `time_steps`, `solver_method`         | RunTimeSeriesPowerFlowPayload         |
| `compare_study_cases`       | `case_a_id`, `case_b_id`                                       | CompareStudyCasesPayload              |
| `update_element_parameters` | `element_id`, `parameters`                                     | UpdateElementParametersPayload        |
| `rename_element`            | `element_id`, `new_name`                                       | RenameElementPayload                  |
| `set_label`                 | `element_id`, `label_text`, `label_position`                   | SetLabelPayload                       |

---

## 5. Zdarzenia domenowe (Domain Events)

Kompletna lista zdarzen domenowych emitowanych przez system.
Kazda operacja emituje jedno lub wiecej zdarzen domenowych.
Zdarzenia sa niemutowalne (immutable), kolejkowane i przetwarzane asynchronicznie.

### 5.1 Enum DomainEvent

```python
class DomainEvent(str, Enum):
    # === Warstwa NetworkModel (SN) ===
    SOURCE_CREATED = "SOURCE_CREATED"
    BUS_CREATED = "BUS_CREATED"
    SEGMENT_CREATED = "SEGMENT_CREATED"
    SEGMENT_SPLIT = "SEGMENT_SPLIT"
    CUT_NODE_CREATED = "CUT_NODE_CREATED"
    STATION_CREATED = "STATION_CREATED"
    PORTS_CREATED = "PORTS_CREATED"
    FIELDS_CREATED_SN = "FIELDS_CREATED_SN"
    DEVICES_CREATED_SN = "DEVICES_CREATED_SN"

    # === Warstwa Protection ===
    CT_CREATED = "CT_CREATED"
    VT_CREATED = "VT_CREATED"
    RELAY_CREATED = "RELAY_CREATED"
    RELAY_SETTINGS_UPDATED = "RELAY_SETTINGS_UPDATED"
    TCC_CURVE_COMPUTED = "TCC_CURVE_COMPUTED"
    SELECTIVITY_VALIDATED = "SELECTIVITY_VALIDATED"

    # === Warstwa NetworkModel (nN / Trafo) ===
    TR_CREATED = "TR_CREATED"
    BUS_NN_CREATED = "BUS_NN_CREATED"
    FIELDS_CREATED_NN = "FIELDS_CREATED_NN"
    DEVICES_CREATED_NN = "DEVICES_CREATED_NN"
    NN_SOURCE_CREATED = "NN_SOURCE_CREATED"
    NN_LOAD_CREATED = "NN_LOAD_CREATED"

    # === Warstwa Topologia / Pierscien ===
    RING_CONNECTED = "RING_CONNECTED"
    NOP_SET = "NOP_SET"

    # === Warstwa StudyCase ===
    STUDY_CASE_CREATED = "STUDY_CASE_CREATED"
    CASE_STATE_UPDATED = "CASE_STATE_UPDATED"

    # === Warstwa Analysis / Solver ===
    ANALYSIS_RUN_STARTED = "ANALYSIS_RUN_STARTED"
    ANALYSIS_RUN_COMPLETED = "ANALYSIS_RUN_COMPLETED"
    RESULTS_MAPPED = "RESULTS_MAPPED"

    # === Warstwa Prezentacja / SLD ===
    LOGICAL_VIEWS_UPDATED = "LOGICAL_VIEWS_UPDATED"
    VIEW_GEOMETRY_UPDATED = "VIEW_GEOMETRY_UPDATED"

    # === Warstwa Export ===
    EXPORT_CREATED = "EXPORT_CREATED"
```

### 5.2 Mapowanie operacji na zdarzenia

| Operacja kanoniczna                | Emitowane zdarzenia domenowe                                                |
|------------------------------------|-----------------------------------------------------------------------------|
| `add_grid_source_sn`              | `SOURCE_CREATED`, `BUS_CREATED`, `FIELDS_CREATED_SN`, `DEVICES_CREATED_SN` |
| `continue_trunk_segment_sn`       | `SEGMENT_CREATED`, `BUS_CREATED`, `PORTS_CREATED`                          |
| `insert_station_on_segment_sn`    | `SEGMENT_SPLIT`, `CUT_NODE_CREATED`, `STATION_CREATED`, `PORTS_CREATED`, `FIELDS_CREATED_SN`, `DEVICES_CREATED_SN` |
| `start_branch_segment_sn`         | `SEGMENT_CREATED`, `BUS_CREATED`, `PORTS_CREATED`                          |
| `insert_section_switch_sn`        | `SEGMENT_SPLIT`, `CUT_NODE_CREATED`, `DEVICES_CREATED_SN`                  |
| `connect_secondary_ring_sn`       | `SEGMENT_CREATED`, `RING_CONNECTED`, `DEVICES_CREATED_SN`                  |
| `set_normal_open_point`           | `NOP_SET`, `CASE_STATE_UPDATED`                                            |
| `add_transformer_sn_nn`           | `TR_CREATED`, `BUS_NN_CREATED`, `FIELDS_CREATED_NN`                        |
| `add_nn_outgoing_field`           | `FIELDS_CREATED_NN`, `SEGMENT_CREATED`, `BUS_CREATED`                      |
| `add_nn_outgoing_field`           | `FIELDS_CREATED_NN`, `DEVICES_CREATED_NN`                                  |
| `add_nn_load`                     | `NN_LOAD_CREATED`                                                          |
| `update_nn_bus_sections`          | `BUS_NN_CREATED`, `DEVICES_CREATED_NN`                                     |
| `update_nn_coupler_state`         | `CASE_STATE_UPDATED`                                                       |
| `add_converter_source`            | `NN_SOURCE_CREATED`, `DEVICES_CREATED_NN`                                  |
| `add_converter_source`            | `NN_SOURCE_CREATED`, `DEVICES_CREATED_NN`                                  |
| `add_genset_nn`                   | `NN_SOURCE_CREATED`, `DEVICES_CREATED_NN`                                  |
| `add_ups_nn`                      | `NN_SOURCE_CREATED`, `DEVICES_CREATED_NN`                                  |
| `set_source_operating_mode`       | `CASE_STATE_UPDATED`                                                       |
| `set_dynamic_profile`             | `CASE_STATE_UPDATED`                                                       |
| `add_ct`                          | `CT_CREATED`                                                               |
| `add_vt`                          | `VT_CREATED`                                                               |
| `add_relay`                       | `RELAY_CREATED`                                                            |
| `update_relay_settings`           | `RELAY_SETTINGS_UPDATED`                                                   |
| `link_relay_to_field`             | `RELAY_SETTINGS_UPDATED`                                                   |
| `calculate_tcc_curve`             | `TCC_CURVE_COMPUTED`                                                       |
| `validate_selectivity`            | `SELECTIVITY_VALIDATED`                                                    |
| `create_study_case`               | `STUDY_CASE_CREATED`                                                       |
| `set_case_switch_state`           | `CASE_STATE_UPDATED`                                                       |
| `set_case_normal_state`           | `CASE_STATE_UPDATED`                                                       |
| `set_case_source_mode`            | `CASE_STATE_UPDATED`                                                       |
| `set_case_time_profile`           | `CASE_STATE_UPDATED`                                                       |
| `run_short_circuit`               | `ANALYSIS_RUN_STARTED`, `ANALYSIS_RUN_COMPLETED`, `RESULTS_MAPPED`         |
| `run_power_flow`                  | `ANALYSIS_RUN_STARTED`, `ANALYSIS_RUN_COMPLETED`, `RESULTS_MAPPED`         |
| `run_time_series_power_flow`      | `ANALYSIS_RUN_STARTED`, `ANALYSIS_RUN_COMPLETED`, `RESULTS_MAPPED`         |
| `compare_study_cases`             | `RESULTS_MAPPED`                                                           |
| `assign_catalog_to_element`       | `DEVICES_CREATED_SN` lub `DEVICES_CREATED_NN` (zaleznie od warstwy)        |
| `update_element_parameters`       | `CASE_STATE_UPDATED`                                                       |
| `rename_element`                  | `LOGICAL_VIEWS_UPDATED`                                                    |
| `set_label`                       | `VIEW_GEOMETRY_UPDATED`                                                    |

### 5.3 Zdarzenia wyzwalajace automatyczne akcje

| Zdarzenie domenowe         | Automatyczna akcja                                                  |
|----------------------------|---------------------------------------------------------------------|
| `SOURCE_CREATED`           | Invalidacja wszystkich wynikow StudyCase -> OUTDATED                |
| `SEGMENT_CREATED`          | Invalidacja wynikow, aktualizacja SLD auto-layout                  |
| `SEGMENT_SPLIT`            | Invalidacja wynikow, przeliczenie topologii grafu                  |
| `STATION_CREATED`          | Aktualizacja widokow logicznych (station tree)                     |
| `TR_CREATED`               | Invalidacja wynikow, rozszerzenie grafu o szyne nN                 |
| `NN_SOURCE_CREATED`        | Invalidacja wynikow (nowe zrodlo wplywajace na rozplyw mocy)       |
| `NN_LOAD_CREATED`          | Invalidacja wynikow                                                |
| `RING_CONNECTED`           | Invalidacja wynikow, walidacja topologii (cykl w grafie)           |
| `NOP_SET`                  | Aktualizacja stanu pracy normalnej                                 |
| `RELAY_CREATED`            | Walidacja pokrycia zabezpieczeniowego                              |
| `RELAY_SETTINGS_UPDATED`   | Invalidacja wynikow TCC, ponowna walidacja selektywnosci           |
| `ANALYSIS_RUN_COMPLETED`   | Oznaczenie StudyCase jako FRESH, publikacja wynikow                |
| `EXPORT_CREATED`           | Logowanie audytowe (kto, kiedy, co wyeksportowano)                 |

---

## Zalacznik A -- Reguly walidacji miedzyoperacyjnej

1. **Kolejnosc operacji**: `add_grid_source_sn` MUSI byc pierwsza operacja w projekcie.
2. **Referencje szyn**: Kazda operacja tworzaca segment MUSI wskazywac na istniejaca szyne (`from_bus_id`).
3. **Typy katalogowe**: Operacje z `type_ref` / `cable_type_ref` MUSZA odwolywac sie do istniejacego typu w katalogu.
4. **Unikalnosc nazw**: Nazwy elementow w obrebie jednego typu MUSZA byc unikalne (np. dwie szyny nie moga miec tej samej nazwy).
5. **NOP**: W kazdym pierścieniu moze byc dokladnie jeden NOP. Operacja `set_normal_open_point` automatycznie zamyka poprzedni NOP (jesli `auto_close_previous = true`).
6. **StudyCase immutability**: Operacje `set_case_*` modyfikuja WYLACZNIE dane przypadku obliczeniowego, NIGDY modelu sieci (zgodnie z regula Case Immutability).
7. **Solver READ-ONLY**: Operacje `run_short_circuit`, `run_power_flow`, `run_time_series_power_flow` NIE modyfikuja modelu sieci -- dzialaja na niemutowalnym snapshocie.

---

## Zalacznik B -- Mapowanie do modeli backendowych

| Koncept                  | Plik zrodlowy backend                                   | Klasa / Typ                    |
|--------------------------|----------------------------------------------------------|---------------------------------|
| Bus (Szyna)              | `network_model/core/node.py`                             | `Node` (alias `Bus`)           |
| Branch (Segment/Odcinek) | `network_model/core/branch.py`                           | `Branch`, `LineBranch`, `TransformerBranch` |
| Switch (Lacznik)         | `network_model/core/switch.py`                           | `Switch`                        |
| Station (Stacja)         | `network_model/core/station.py`                          | `Station`                       |
| InverterSource (Falownik)| `network_model/core/inverter.py`                         | `InverterSource`                |
| StudyCase                | `domain/study_case.py`                                   | `StudyCase`, `StudyCaseConfig`  |
| ProtectionDevice         | `domain/protection_device.py`                            | `ProtectionDevice`              |
| CableType                | `network_model/catalog/types.py`                         | `CableType`                     |
| LineType                 | `network_model/catalog/types.py`                         | `LineType`                      |
| TransformerType          | `network_model/catalog/types.py`                         | `TransformerType`               |
| ConverterType            | `network_model/catalog/types.py`                         | `ConverterType`                 |
| SwitchEquipmentType      | `network_model/catalog/types.py`                         | `SwitchEquipmentType`           |
| ActionEnvelope           | `network_model/core/action_envelope.py`                  | `ActionEnvelope`                |
| NetworkSnapshot          | `network_model/core/snapshot.py`                         | `NetworkSnapshot`               |
| NetworkGraph             | `network_model/core/graph.py`                            | `NetworkGraph`                  |
| Source                   | `domain/sources.py`                                      | `Source`                        |
| Project                  | `domain/models.py`                                       | `Project`                       |

---

> **KONIEC DOKUMENTU WIAZACEGO**
>
> Wszelkie zmiany w tym dokumencie wymagaja przegladu architektonicznego
> i aktualizacji numeru wersji. Dokument ten jest referencja wiazaca
> dla implementacji backendu, frontendu, AI agentow oraz dokumentacji.

