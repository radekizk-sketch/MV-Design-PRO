# ENM_OP_CONTRACTS_CANONICAL_FULL

## Kanoniczne kontrakty operacji domenowych — widok rejestru

| Pole | Wartość |
|---|---|
| Status | **BINDING** — widok rejestru operacji (nie osobne źródło prawdy) |
| Wersja | 2.1.0 |
| Data | 2026-10-22 |
| Źródło prawdy | `backend/src/domain/canonical_operations.py` (`CANONICAL_OPERATIONS`, `REQUIRED_FIELD_ALIASES`) |
| Handlery | `backend/src/enm/domain_operations.py::_HANDLERS`, `backend/src/enm/domain_operations_v2.py::ALL_V2_HANDLERS` |
| Zdarzenia | `backend/src/enm/domain_ops_models.py::DOMAIN_EVENT_TYPES` |
| Generator | `backend/tests/ci/dokument_operacji_enm.py` |

> **REGUŁA.** Ten dokument jest WIDOKIEM rejestru operacji. Bloki między znacznikami
> `GENEROWANE:…:POCZATEK` / `GENEROWANE:…:KONIEC` powstają z kodu i nie są edytowane ręcznie —
> test `backend/tests/ci/test_dokument_kontraktow_operacji.py` porównuje je z generatorem, a
> przykłady wykonuje przez produkcyjną końcówkę API. Regeneracja (z katalogu `backend`):
> `PYTHONPATH=src:. python -m tests.ci.dokument_operacji_enm --write`.
> W razie rozjazdu z innym dokumentem rozstrzyga kod rejestru, nie tekst.

---

## Spis treści

1. [Źródło prawdy i pilnowanie spójności](#1-źródło-prawdy-i-pilnowanie-spójności)
2. [Koperta wywołania i odpowiedź](#2-koperta-wywołania-i-odpowiedź)
3. [Reguła nazewnictwa](#3-reguła-nazewnictwa)
4. [Rejestr operacji](#4-rejestr-operacji)
5. [Operacje usunięte i fikcyjne](#5-operacje-usunięte-i-fikcyjne)
6. [Przykłady wykonane przez API](#6-przykłady-wykonane-przez-api)
7. [Zdarzenia domenowe](#7-zdarzenia-domenowe)
8. [Historia zmian](#8-historia-zmian)

---

## 1. Źródło prawdy i pilnowanie spójności

Pola ładunku każdej operacji (`required_fields`, `optional_fields`, klucze zastępcze) są
RÓWNE zbiorowi kluczy najwyższego poziomu ładunku, które czyta handler, a kształty obiektów
zagnieżdżonych (`KSZTALTY_ZAGNIEZDZONE`, sekcja 4) — kluczom tych obiektów czytanym przez
handler; przypina to test `backend/tests/ci/test_spec_operacji_rowna_odczytom_handlera.py`
(analiza AST handlerów `enm/**`, przechodnio przez funkcje pomocnicze, z iniekcją pola
fantomowego). Klucz spoza kontraktu na dowolnym poziomie dyspozytor melduje w dzienniku
serwera, a testy backendu (`backend/tests/conftest.py`) i frontendu (`src/test/setup.ts`)
oraz skan seedów, narzędzi i speców e2e
(`backend/tests/ci/test_ladunki_nadawcow_frontendu.py`) traktują go jako błąd. Skutki
operacji w ciągach liniowych (`CIAGI_LINIOWE`, sekcja 4) przypina
`backend/tests/ci/test_ciagi_liniowe_operacji.py`. Zbiór operacji
rejestru jest równy zbiorowi handlerów w obu kierunkach (`scripts/canonical_ops_guard.py`).
Operacja z oknem, ze ścieżką menu albo świadomie bez okna — klasyfikacja w
`scripts/dialog_completeness_guard.py` (każda operacja rejestru).

Test tego dokumentu (`backend/tests/ci/test_dokument_kontraktow_operacji.py`) pilnuje:

- bloki generowane są równe generatorowi (rejestr, operacje usunięte, przykłady, zdarzenia);
- każda operacja rejestru ma co najmniej jeden przykład, a przykład przechodzi przez
  `POST /api/cases/{case_id}/enm/domain-ops` z wynikiem, który deklaruje (sukces albo nazwana
  odmowa), i niesie wyłącznie pola zadeklarowane w rejestrze; każda operacja ma przykład
  zakończony sukcesem poza `przepnij_element_na_pole` — akcją naprawczą modelu archiwalnego,
  której przyczyny (element omijający pole) operacje budowy nie wytwarzają; jej sukces
  przypina `backend/tests/enm/test_pola_w_torze.py`;
- każda nazwa operacji wymieniona w dokumentach kontraktu operacji (ten dokument,
  `docs/domain/KONTRAKTY_OPERACJI_I_SCHEMATY_JSON.md`, `docs/domain/OPERACJE_DOMENOWE_V1.md`,
  `docs/ui/KONTRAKT_OPERACJI_ENM_OP.md`, `docs/catalog/CATALOG_FIRST_DOMAIN_OPERATIONS_SPEC.md`)
  jest w rejestrze albo na liście operacji usuniętych,
  a żadna operacja usunięta nie wróciła do rejestru;
- pole w tabeli pól operacji dokumentów siostrzanych (wiersz pod nagłówkiem z nazwą operacji)
  jest polem rejestru tej operacji.

Modele Pydantic ładunków w `backend/src/enm/domain_ops_models.py` są opisem pomocniczym
(strażnik parytetu kontraktu i testy kształtu) — kontraktem operacji jest rejestr i handler.

---

## 2. Koperta wywołania i odpowiedź

Każda operacja domenowa idzie jedną końcówką `POST /api/cases/{case_id}/enm/domain-ops`
(`backend/src/api/enm.py`, model `DomainOpEnvelopeModel`):

| Pole | Typ | Opis |
|---|---|---|
| `project_id` | `string` | Identyfikator projektu. |
| `snapshot_base_hash` | `string` | Skrót migawki, na której operację oparto (`header.hash_sha256` z `GET /api/cases/{case_id}/enm`). Inny niż bieżący → **HTTP 409** (kontrola współbieżności); pusty = bez kontroli. |
| `operation.name` | `string` | Nazwa kanoniczna z rejestru (sekcja 4). Nazwa spoza rejestru (także operacji usuniętej, sekcja 5) kończy się odmową nazwaną `dispatcher.unknown_operation` bez zmiany modelu. |
| `operation.idempotency_key` | `string` | Klucz idempotencji wywołania. |
| `operation.payload` | `object` | Ładunek operacji — wyłącznie pola z sekcji 4. |

Przed operacją brama katalogowa (`api/domain_ops_policy.py::validate_and_materialize_catalog_binding`)
rozstrzyga referencje katalogowe ładunku w katalogu modelu; referencja, której nie ma, kończy
żądanie kodem **HTTP 422** (`catalog.item_not_found`) bez zmiany modelu.

Odpowiedź (HTTP 200) niesie:

| Pole | Opis |
|---|---|
| `snapshot` | Migawka modelu po operacji (przy odmowie `null`, model bez zmian). |
| `changes` | `created_element_ids`, `updated_element_ids`, `deleted_element_ids`. |
| `domain_events` | Zdarzenia `{event_seq, event_type, element_id}`; `event_type` z rejestru (sekcja 7). |
| `selection_hint` | Element do zaznaczenia po operacji: `element_id`, `element_type`, `zoom_to` (albo `null`). |
| `audit_trail` | Kroki operacji: `step`, `action`, `element_id`. |
| `readiness`, `fix_actions` | Gotowość obliczeniowa po operacji (`ready`, `blockers`, `warnings`) i akcje naprawcze. |
| `logical_views`, `materialized_params`, `layout`, `semantic_issues` | Widoki logiczne magistral, parametry zmaterializowane z katalogu, skrót układu, uwagi semantyczne. |
| `error`, `error_code` | Odmowa nazwana: komunikat po polsku i kod (przy sukcesie nieobecne). |
| `wyposazenie_pola` | Wyłącznie `set_bay_equipment`: stan danych wyposażenia pola i dane przyjęte. |

---

## 3. Reguła nazewnictwa

1. Dispatcher operacji przyjmuje wyłącznie nazwy kanoniczne rejestru — bez aliasów nazw.
2. Frontend (`frontend/src/types/domainOps.ts`), testy i dokumentacja używają wyłącznie nazw
   kanonicznych.
3. Klucz zastępczy pola wymaganego (sekcja 4, „albo”) jest częścią kontraktu handlera, nie
   aliasem operacji.
4. Operacja skasowana nie wraca pod starą nazwą bez decyzji zapisanej w sekcji 5.

---

## 4. Rejestr operacji

<!-- GENEROWANE:rejestr-operacji:POCZATEK -->
Rejestr liczy **50** operacji. Pole w nawiasie „albo” to klucz zastępczy (`REQUIRED_FIELD_ALIASES`): handler przyjmuje pole wymagane ALBO ten klucz. Nazwa z `{…}` to rodzina kluczy numerowanych. Kolumna „Tworzy” = `OperationSpec.creates_elements`.

### Sieć SN (`sn_network`, 22)

| Operacja | Opis | Pola wymagane | Pola opcjonalne | Tworzy | Handler |
|---|---|---|---|---|---|
| `add_generator_sn` | Dodanie generatora synchronicznego wprost na szynę SN/WN (bez przekształtnika) | `bus_ref`, `p_mw` | `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `control_mode`, `manual_params`, `name`, `q_max_mvar`, `q_min_mvar`, `q_mvar`, `source_name`, `u_set_pu` | tak | `enm/domain_operations_v2.py::add_generator_sn` |
| `add_gpz_section` | Dodanie sekcji szyn GPZ (strona SN lub WN) do stacji GPZ | `substation_ref` | `bus_ref`, `line_field_name`, `name`, `order`, `section_id`, `side` | tak | `enm/domain_operations.py::add_gpz_section` |
| `add_grid_source_sn` | Dodanie źródła zasilania sieciowego (GPZ) do sieci SN | `voltage_kv` | `catalog_binding`, `catalog_ref`, `gpz_coupler_name`, `gpz_line_field_apparatus`, `gpz_line_field_name`, `gpz_section_name`, `gpz_sections`, `grounding`, `hv_voltage_kv`, `ik3_ka`, `ik3_min_ka`, `line_fields_per_section`, `manual_equivalent`, `manufacturer_ref`, `name_pl`, `overrides`, `parameter_source`, `r0_ohm`, `r_ohm`, `rx_ratio`, `rx_ratio_min`, `sections_count`, `short_circuit_input_side`, `short_circuit_mode`, `sk3_hv_mva`, `sk3_min_mva`, `sk3_mva`, `solution_ref`, `source_id`, `source_mode`, `source_name`, `switchgear_family_ref`, `transformer_catalog_binding`, `transformer_catalog_ref`, `transformer_control_mode`, `transformer_controlled_bus_ref`, `transformer_count`, `transformer_deadband_kv`, `transformer_delay_seconds`, `transformer_ldc_enabled`, `transformer_ldc_r_ohm`, `transformer_ldc_x_ohm`, `transformer_regulated_winding`, `transformer_regulation_type`, `transformer_sn_mva`, `transformer_tap_changer_catalog_ref`, `transformer_tap_current_position`, `transformer_tap_max_position`, `transformer_tap_min_position`, `transformer_tap_neutral_position`, `transformer_tap_step_percent`, `transformer_voltage_setpoint_kv`, `transformer_{order}_name`, `u_set_pu`, `x0_ohm`, `x_ohm`, `z0_z1_ratio`, `zero_sequence` | tak | `enm/domain_operations.py::add_grid_source_sn` |
| `add_load_sn` | Dodanie odbioru wprost na wskazaną szynę (bez pośredniej stacji SN/nN) | `bus_ref` | `a_p`, `a_q`, `active_power_kw`, `b_p`, `b_q`, `c_p`, `c_q`, `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `connection_type`, `cos_phi`, `f0_hz`, `k_pf`, `k_qf`, `load_kind`, `load_name`, `p_mw`, `phases`, `q_mvar`, `reactive_power_kvar`, `v0_pu` | tak | `enm/domain_operations_v2.py::add_load_sn` |
| `add_shunt_compensator_sn` | Dodanie baterii kondensatorów (kompensatora bocznikowego) na szynę SN | — | `bus_nn_ref`, `bus_ref`, `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `name`, `status` | tak | `enm/domain_operations_v2.py::add_shunt_compensator_sn` |
| `add_sn_bay` | Dodanie pola SN do GPZ, stacji, ZKSN albo pola źródłowego — także z katalogu rozdzielnic (kompletne pole rodziny modułowej albo jednostka bloku fabrycznego RMU) z trybem próby (werdykt konfiguracji bez zapisu) | — | `apparatus_kind`, `bay_kind`, `bay_role`, `bay_template_ref`, `bus_ref`, `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `complete_bay_template_ref`, `dry_run`, `earthing_role`, `existing_field_ref`, `factory_configuration_ref`, `factory_unit_index`, `field_name`, `field_ref`, `funkcja_pomiaru`, `gpz_section_id`, `manufacturer_ref`, `protection_ref`, `rodzaj_pomiaru`, `source_refs`, `source_status`, `station_ref`, `switchgear_family_ref`, `tags` | tak | `enm/domain_operations_v2.py::add_sn_bay` |
| `add_surge_arrester_sn` | Dodanie ogranicznika przepięć w polu SN | — | `bay_ref`, `bus_ref`, `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `field_ref`, `station_ref` | tak | `enm/domain_operations_v2.py::add_surge_arrester_sn` |
| `append_station_on_endpoint` | Dołączenie stacji na końcu istniejącego ciągu SN | — | `construction_type`, `designation`, `dry_run`, `endpoint_bus_ref`, `field_apparatus_catalog_ref`, `nn_block`, `nn_earthing`, `nn_voltage_kv`, `run_ref`, `sn_fields`, `station`, `station_auxiliary`, `station_name`, `station_type`, `switchgear`, `transformer` | tak | `enm/domain_operations.py::append_station_on_endpoint` |
| `close_switch` | Zamknięcie łącznika w modelu bazowym (pozycja normalna bez zmian) | `switch_ref` | — | nie | `enm/operacje_lacznikow.py::close_switch` |
| `connect_secondary_ring_sn` | Zamknięcie pierścienia wtórnego | `from_bus_ref`, `to_bus_ref` | `catalog_binding`, `dlugosc_m`, `ring_name`, `segment` | tak | `enm/domain_operations.py::connect_secondary_ring_sn` |
| `continue_trunk_segment_sn` | Kontynuacja segmentu magistrali SN | — | `catalog_binding`, `dlugosc_m`, `field_ref`, `from_terminal_id`, `segment`, `terminal_id`, `trunk_id` | tak | `enm/domain_operations.py::continue_trunk_segment_sn` |
| `delete_gpz_section` | Usunięcie sekcji szyn GPZ ze stacji | `substation_ref`, `section_id` | `side` | nie | `enm/domain_operations.py::delete_gpz_section` |
| `insert_branch_pole_on_segment_sn` | Wstawienie słupa odgałęźnego na segmencie SN | `segment_id` (albo `segment_ref`) | `branch_ports_count`, `catalog_binding`, `catalog_namespace`, `catalog_ref`, `catalog_version`, `insert_at`, `materialized_params`, `name`, `source_mode`, `switch_state` | tak | `enm/domain_operations.py::insert_branch_pole_on_segment_sn` |
| `insert_section_switch_sn` | Wstawienie łącznika sekcyjnego na segmencie SN | `segment_id` | `catalog_binding`, `catalog_ref`, `close_ref`, `insert_at`, `normal_state`, `switch_name`, `switch_type` | tak | `enm/domain_operations.py::insert_section_switch_sn` |
| `insert_station_on_segment_sn` | Wstawienie stacji na istniejącym segmencie SN | `segment_id` (albo `segment_ref`) | `catalog_binding`, `construction_type`, `designation`, `dry_run`, `field_apparatus_catalog_ref`, `insert_at`, `name`, `name_pl`, `nn_block`, `nn_earthing`, `sn_fields`, `station`, `station_auxiliary`, `station_name`, `station_type`, `transformer` | tak | `enm/domain_operations.py::insert_station_on_segment_sn` |
| `insert_zksn_on_segment_sn` | Wstawienie złącza kablowego SN (ZK-SN) na segmencie SN | `segment_id` (albo `segment_ref`) | `branch_ports_count`, `catalog_binding`, `catalog_namespace`, `catalog_ref`, `catalog_version`, `insert_at`, `materialized_params`, `name`, `source_mode`, `switch_state` | tak | `enm/domain_operations.py::insert_zksn_on_segment_sn` |
| `open_switch` | Otwarcie łącznika w modelu bazowym (pozycja normalna bez zmian) | `switch_ref` | — | nie | `enm/operacje_lacznikow.py::open_switch` |
| `przepnij_element_na_pole` | Przepięcie elementu (połówki odcinka, strony górnej transformatora) z szyny głównej stacji na zacisk pola, które mu służy — aparat pola w torze prądowym | `element_ref` | `field_ref` | nie | `enm/domain_operations.py::przepnij_element_na_pole` |
| `set_bay_equipment` | Ustawienie wyposażenia pola SN — aparaty z katalogu, propozycja z szablonu pola albo usunięcie wyposażenia | `bay_ref`, `mode` | `bay_template_ref`, `devices` | nie | `enm/wyposazenie_pola.py::set_bay_equipment` |
| `set_normal_open_point` | Przeniesienie punktu normalnie otwartego (NOP) na wskazany łącznik — poprzedni punkt podziału tego samego pierścienia zostaje zamknięty | `switch_ref` | `close_ref` | nie | `enm/operacje_lacznikow.py::set_normal_open_point` |
| `start_branch_segment_sn` | Rozpoczęcie nowego odgałęzienia od magistrali SN | — | `catalog_binding`, `dlugosc_m`, `from_bus_ref`, `from_ref`, `segment` | tak | `enm/domain_operations.py::start_branch_segment_sn` |
| `update_gpz_section` | Aktualizacja sekcji szyn GPZ (nazwa, kolejność, sprzęgła) | `substation_ref`, `section_id` | `side`, `updates` | nie | `enm/domain_operations.py::update_gpz_section` |

### Stacja SN/nN i strona nN stacji (`station_nn`, 3)

| Operacja | Opis | Pola wymagane | Pola opcjonalne | Tworzy | Handler |
|---|---|---|---|---|---|
| `add_nn_load` | Dodanie obciążenia na szynie nN | `feeder_ref` | `a_p`, `a_q`, `active_power_kw`, `b_p`, `b_q`, `bus_nn_ref`, `c_p`, `c_q`, `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `connection_type`, `cos_phi`, `f0_hz`, `k_pf`, `k_qf`, `load_kind`, `load_name`, `phases`, `reactive_power_kvar`, `source_mode`, `v0_pu` | tak | `enm/domain_operations_v2.py::add_nn_load` |
| `add_nn_outgoing_field` | Dodanie pola nN z jawną intencją odpływu albo pola źródłowego | `bus_nn_ref` | `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `feeder_role`, `field_name`, `field_role`, `source_field_kind`, `station_ref`, `tags` | tak | `enm/domain_operations_v2.py::add_nn_outgoing_field` |
| `add_transformer_sn_nn` | Dodanie transformatora SN/nN | — | `catalog_binding`, `hv_bus_ref`, `hv_voltage_kv`, `lv_bus_ref`, `lv_voltage_kv`, `pk_kw`, `sn_mva`, `station_ref`, `transformer_catalog_ref`, `transformer_control_mode`, `transformer_controlled_bus_ref`, `transformer_deadband_kv`, `transformer_delay_seconds`, `transformer_ldc_enabled`, `transformer_ldc_r_ohm`, `transformer_ldc_x_ohm`, `transformer_regulated_winding`, `transformer_regulation_type`, `transformer_tap_changer_catalog_ref`, `transformer_tap_current_position`, `transformer_tap_max_position`, `transformer_tap_min_position`, `transformer_tap_neutral_position`, `transformer_tap_step_percent`, `transformer_voltage_setpoint_kv`, `uhv_kv`, `uk_percent`, `ulv_kv`, `vector_group` | tak | `enm/domain_operations.py::add_transformer_sn_nn` |

### Źródła, wytwórcy i wiązania katalogowe (`oze_nn`, 7)

| Operacja | Opis | Pola wymagane | Pola opcjonalne | Tworzy | Handler |
|---|---|---|---|---|---|
| `add_converter_source` | Dodanie źródła przekształtnikowego PV, BESS lub FW | `source_technology`, `connection_variant` | `battery_catalog_ref`, `bess_mode`, `blocking_transformer_ref`, `bus_nn_ref`, `catalog_binding`, `catalog_ref`, `control_mode`, `cos_phi`, `data_umowy_przylaczeniowej`, `deklaracje_modulu`, `der_topology`, `existing_field_ref`, `frequency_droop_percent`, `has_hvrt_curve`, `has_lvrt_curve`, `lfsm_deadband_hz`, `loadability_pu`, `materialized_params`, `modul_istniejacy`, `mv_bus_ref`, `nastawy_zabezpieczen`, `placement`, `power_setpoint_mw`, `q_max_mvar`, `q_min_mvar`, `qu_deadband_high_pu`, `qu_deadband_low_pu`, `qu_slope_pu_per_pu`, `quantity`, `simultaneity_factor`, `soc_max_percent`, `soc_min_percent`, `source_field`, `source_name`, `station_ref`, `u_set_pu` | tak | `enm/domain_operations_v2.py::add_converter_source` |
| `add_genset_nn` | Dodanie zespołu prądotwórczego na szynie nN | `bus_nn_ref`, `genset_spec` | `existing_field_ref`, `placement`, `source_field`, `station_ref` | tak | `enm/domain_operations_v2.py::add_genset_nn` |
| `add_ups_nn` | Dodanie zasilacza UPS na szynie nN | `bus_nn_ref`, `ups_spec` | `existing_field_ref`, `placement`, `source_field`, `station_ref` | tak | `enm/domain_operations_v2.py::add_ups_nn` |
| `dodaj_karte_widmowa_projektu` | Dodanie karty widmowej urządzenia do katalogu projektu | `karta` | — | nie | `enm/domain_operations_v2.py::dodaj_karte_widmowa_projektu` |
| `set_der_catalog_bindings` | Wiązania katalogowe i profile zgodności wytwórcy (DER) | `generator_ref` (albo `source_ref`) | `bess_operation_mode_refs`, `ct_catalog_ref`, `dynamic_model_ref`, `hvrt_curve_ref`, `karty_widmowe_ref`, `lvrt_curve_ref`, `nc_rfg_profile_ref`, `pf_curve_ref`, `protection_catalog_ref`, `vt_catalog_ref` | nie | `enm/domain_operations_v2.py::set_der_catalog_bindings` |
| `set_load_dynamic_binding` | Wiązanie odbioru z profilem modelu dynamicznego z katalogu | `load_ref`, `dynamic_model_ref` | — | nie | `enm/domain_operations_v2.py::set_load_dynamic_binding` |
| `set_source_operating_mode` | Ustawienie trybu pracy źródła nN | `source_ref` (albo `element_ref`), `mode` | — | nie | `enm/domain_operations_v2.py::set_source_operating_mode` |

### Przekładniki i zabezpieczenia (`protection`, 5)

| Operacja | Opis | Pola wymagane | Pola opcjonalne | Tworzy | Handler |
|---|---|---|---|---|---|
| `add_ct` | Dodanie przekładnika prądowego (CT) | — | `accuracy_class`, `bay_ref`, `breaker_ref`, `burden_va`, `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `connection`, `field_ref`, `name`, `obwod_wtorny`, `purpose`, `ratio_primary_a`, `ratio_secondary_a` | tak | `enm/domain_operations_v2.py::add_ct` |
| `add_relay` | Dodanie przekaźnika zabezpieczeniowego | — | `bay_ref`, `breaker_ref`, `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `ct_ref`, `field_ref`, `name`, `protection`, `relay_type`, `settings`, `vt_ref` | tak | `enm/domain_operations_v2.py::add_relay` |
| `add_vt` | Dodanie przekładnika napięciowego (VT) | `field_ref` (albo `bay_ref`) | `accuracy_class`, `burden_va`, `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_ref`, `connection`, `name`, `obwod_wtorny`, `purpose`, `ratio_primary_v`, `ratio_secondary_v`, `vt_uzwojenie` | tak | `enm/domain_operations_v2.py::add_vt` |
| `set_measurement_secondary_circuit` | Zapis obwodu wtórnego przekładnika CT/VT na już istniejącym przekładniku | `measurement_ref` (albo `ref_id`), `obwod_wtorny` | `vt_uzwojenie` | nie | `enm/domain_operations_v2.py::set_measurement_secondary_circuit` |
| `update_protection_settings` | Zapis nastaw zabezpieczenia w modelu sieci | `protection_ref`, `settings` | — | nie | `enm/domain_operations_v2.py::update_protection_settings` |

### Operacje uniwersalne (`universal`, 5)

| Operacja | Opis | Pola wymagane | Pola opcjonalne | Tworzy | Handler |
|---|---|---|---|---|---|
| `assign_catalog_to_element` | Przypisanie typu katalogowego do elementu | `element_ref` | `catalog_binding`, `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref` | nie | `enm/domain_operations.py::assign_catalog_to_element` |
| `delete_element` | Usunięcie elementu z modelu sieci | `element_ref` | — | nie | `enm/domain_operations.py::delete_element` |
| `refresh_snapshot` | Odświeżenie koperty odpowiedzi bez modyfikacji modelu | — | — | nie | `enm/domain_operations.py::refresh_snapshot` |
| `set_connection_conditions` | Ustawienie warunków przyłączenia OSD (moc przyłączeniowa, cosφ, tryb pracy) | — | `moc_przylaczeniowa_mw`, `tryb_pracy`, `wymagany_cos_phi` | nie | `enm/domain_operations_v2.py::set_connection_conditions` |
| `update_element_parameters` | Aktualizacja parametrów elementu | `element_ref`, `parameters` | — | nie | `enm/domain_operations.py::update_element_parameters` |

### Topologia sieci nN (`nn_network`, 8)

| Operacja | Opis | Pola wymagane | Pola opcjonalne | Tworzy | Handler |
|---|---|---|---|---|---|
| `add_nn_cable_segment` | Dodanie odcinka kabla nN od szyny/pola do nowej lub istniejącej szyny nN | `from_bus_ref` (albo `from_ref`), `length_m` | `cable_laying_conditions`, `catalog_binding`, `catalog_ref`, `n_parallel`, `name`, `ref_id`, `screen_bonding`, `to_bus_name`, `to_bus_ref` | tak | `enm/domain_operations_v2.py::add_nn_cable_segment` |
| `add_nn_distribution_board` | Dodanie podrozdzielnicy/rozdzielnicy nN (RGnN) z szyną główną | `voltage_kv` | `construction_type`, `designation`, `name`, `supply` | tak | `enm/domain_operations_v2.py::add_nn_distribution_board` |
| `add_nn_section_coupler` | Dodanie nowej sekcji szyn i sprzęgła w rozdzielnicy nN (RGnN) | `station_ref` | `catalog_binding`, `catalog_ref`, `name` | tak | `enm/domain_operations_v2.py::add_nn_section_coupler` |
| `add_nn_switch_device` | Dodanie aparatu (wyłącznik/rozłącznik/bezpiecznik) w torze nN | `from_bus_ref`, `to_bus_ref` | `catalog_binding`, `catalog_ref`, `device_class`, `name` | tak | `enm/domain_operations_v2.py::add_nn_switch_device` |
| `copy_nn_feeder` | Kopia poddrzewa odpływu nN (od aparatu odpływowego w dół) | `feeder_apparatus_ref` | `name` | tak | `enm/domain_operations_v2.py::copy_nn_feeder` |
| `merge_nn_segments` | Scalenie dwóch odcinków kabla nN tego samego typu przez szynę pośrednią | `segment_a_ref`, `segment_b_ref` | — | tak | `enm/domain_operations_v2.py::merge_nn_segments` |
| `set_nn_cable_laying_conditions` | Zapis warunków ułożenia odcinka kabla nN (meta, bez fizyki) | `segment_ref`, `cable_laying_conditions` | — | nie | `enm/domain_operations_v2.py::set_nn_cable_laying_conditions` |
| `split_nn_segment` | Rozcięcie odcinka kabla nN na dwa z nową szyną pośrednią | `segment_ref`, `split_at_m` | — | tak | `enm/domain_operations_v2.py::split_nn_segment` |
<!-- GENEROWANE:rejestr-operacji:KONIEC -->

### Obiekty zagnieżdżone ładunku

<!-- GENEROWANE:ksztalty-ladunku:POCZATEK -->
Obiekty zagnieżdżone ładunku mają kształt w **30** operacjach (`KSZTALTY_ZAGNIEZDZONE`). Kształt obowiązuje obiekt pod kluczem i KAŻDY element listy obiektów pod tym kluczem; klucz spoza kształtu melduje dyspozytor (`klucze_spoza_kontraktu`, ścieżka `station.x`, `sn_fields[0].x`), a test go odrzuca. Obiekt bez wiersza (np. `manual_params`) czyta handler kluczami wyliczanymi w biegu — lista z przyczyną: `backend/tests/ci/test_spec_operacji_rowna_odczytom_handlera.py`.

| Operacja | Obiekt | Klucze |
|---|---|---|
| `add_converter_source` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_converter_source` | `der_topology` | `block_transformer`, `connection_level`, `connection_method`, `has_block_transformer`, `has_manufacturer_lv_switchgear`, `inverter_output_voltage_kv`, `lv_switchgear_variant`, `mv_bus_ref`, `mv_field_configuration`, `simultaneity_factor` |
| `add_converter_source` | `der_topology.block_transformer` | `catalog_binding`, `catalog_ref`, `loadability_pu`, `primary_voltage_kv`, `rated_power_mva`, `secondary_voltage_kv`, `uk_percent`, `vector_group` |
| `add_converter_source` | `der_topology.mv_field_configuration` | `apparatus_catalog_binding`, `bay_template_ref`, `cable_catalog_binding`, `cable_catalog_ref`, `cable_head`, `cable_laying_conditions`, `cable_length_km`, `cable_screen_bonding`, `ct`, `earthing_switch`, `field_name`, `protection_relay`, `surge_arrester`, `switching_device`, `vt` |
| `add_converter_source` | `der_topology.mv_field_configuration.apparatus_catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_converter_source` | `der_topology.mv_field_configuration.cable_laying_conditions` | `f_grunt`, `f_grupa`, `f_wiazka`, `opis_pl`, `set_name` |
| `add_converter_source` | `source_field` | `catalog_binding`, `field_name`, `source_field_kind`, `switching_device` |
| `add_converter_source` | `source_field.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_ct` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_generator_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_generator_sn` | `manual_params` | `q_max_mvar`, `q_min_mvar`, `rated_kv`, `rated_mva` |
| `add_genset_nn` | `genset_spec` | `fuel_type`, `operation_mode`, `power_factor`, `rated_power_kw`, `rated_voltage_kv`, `source_name` |
| `add_genset_nn` | `source_field` | `catalog_binding`, `field_name`, `source_field_kind`, `switching_device` |
| `add_genset_nn` | `source_field.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_grid_source_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_grid_source_sn` | `gpz_line_field_apparatus` | `apparatus_kind`, `catalog_binding`, `catalog_item_id`, `catalog_ref` |
| `add_grid_source_sn` | `gpz_line_field_apparatus.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_grid_source_sn` | `grounding` | `r_ohm`, `type`, `x_ohm` |
| `add_grid_source_sn` | `manual_equivalent` | `hv_voltage_kv`, `ik3_ka`, `ik3_min_ka`, `r0_ohm`, `r_ohm`, `rx_ratio`, `rx_ratio_min`, `short_circuit_input_side`, `short_circuit_mode`, `sk3_hv_mva`, `sk3_min_mva`, `sk3_mva`, `skip_hv_transformer`, `sn_voltage_kv`, `u_set_pu`, `voltage_hv_kv`, `x0_ohm`, `x_ohm`, `z0_z1_ratio` |
| `add_grid_source_sn` | `transformer_catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_grid_source_sn` | `zero_sequence` | `enabled`, `r0_ohm`, `x0_ohm`, `z0_z1_ratio` |
| `add_load_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_nn_cable_segment` | `cable_laying_conditions` | `ambient_temperature_c`, `circuit_count`, `environment`, `insulation`, `soil_thermal_resistivity_km_w` |
| `add_nn_cable_segment` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_nn_distribution_board` | `supply` | `cable_laying_conditions`, `catalog_binding`, `catalog_ref`, `from_bus_ref`, `from_ref`, `length_m`, `n_parallel`, `name`, `ref_id`, `screen_bonding`, `to_bus_name` |
| `add_nn_distribution_board` | `supply.cable_laying_conditions` | `ambient_temperature_c`, `circuit_count`, `environment`, `insulation`, `soil_thermal_resistivity_km_w` |
| `add_nn_distribution_board` | `supply.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_nn_load` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_nn_outgoing_field` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_nn_section_coupler` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_nn_switch_device` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_relay` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_relay` | `protection` | `catalog_item_id`, `catalog_item_version`, `catalog_ref` |
| `add_shunt_compensator_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_sn_bay` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_surge_arrester_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_transformer_sn_nn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_ups_nn` | `source_field` | `catalog_binding`, `field_name`, `source_field_kind`, `switching_device` |
| `add_ups_nn` | `source_field.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `add_ups_nn` | `ups_spec` | `backup_time_min`, `battery_type`, `operation_mode`, `rated_power_kw`, `source_name` |
| `add_vt` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `append_station_on_endpoint` | `nn_block` | `cos_phi`, `loadability_pu`, `nn_configuration`, `outgoing_feeders_nn`, `outgoing_feeders_nn_count`, `simultaneity_factor`, `source_converter_catalog_ref`, `source_converter_kind`, `source_converter_name`, `source_protection` |
| `append_station_on_endpoint` | `nn_block.source_protection` | `analysis_scope`, `breaker_role`, `device_catalog_ref`, `device_label`, `protected_object` |
| `append_station_on_endpoint` | `nn_earthing` | `lv_system`, `neutral_point`, `{side}_neutral_point`, `{side}_r_ohm`, `{side}_x_ohm` |
| `append_station_on_endpoint` | `sn_fields` | `apparatus_catalog_ref`, `bay_kind`, `bay_template_ref`, `catalog_bindings`, `equipment`, `equipment_refs`, `factory_configuration_ref`, `factory_unit_index`, `field_role`, `funkcja_pomiaru`, `manufacturer_ref`, `protection_ref`, `rodzaj_pomiaru`, `source_refs`, `source_status`, `switchgear_family_ref` |
| `append_station_on_endpoint` | `station` | `construction_type`, `designation`, `name`, `nn_earthing`, `nn_voltage_kv`, `station_auxiliary`, `station_type`, `switchgear` |
| `append_station_on_endpoint` | `station.nn_earthing` | `lv_system`, `neutral_point`, `{side}_neutral_point`, `{side}_r_ohm`, `{side}_x_ohm` |
| `append_station_on_endpoint` | `station.station_auxiliary` | `active_power_kw`, `cos_phi`, `name`, `reactive_power_kvar` |
| `append_station_on_endpoint` | `station.switchgear` | `manufacturer_ref`, `switchgear_family_ref` |
| `append_station_on_endpoint` | `station_auxiliary` | `active_power_kw`, `cos_phi`, `name`, `reactive_power_kvar` |
| `append_station_on_endpoint` | `transformer` | `catalog_binding`, `catalog_ref`, `create`, `n_parallel`, `transformer_catalog_ref`, `transformer_control_mode`, `transformer_controlled_bus_ref`, `transformer_deadband_kv`, `transformer_delay_seconds`, `transformer_ldc_enabled`, `transformer_ldc_r_ohm`, `transformer_ldc_x_ohm`, `transformer_regulated_winding`, `transformer_regulation_type`, `transformer_tap_changer_catalog_ref`, `transformer_tap_current_position`, `transformer_tap_max_position`, `transformer_tap_min_position`, `transformer_tap_neutral_position`, `transformer_tap_step_percent`, `transformer_voltage_setpoint_kv` |
| `append_station_on_endpoint` | `transformer.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `assign_catalog_to_element` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `connect_secondary_ring_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `connect_secondary_ring_sn` | `segment` | `catalog_binding`, `catalog_ref`, `dlugosc_m`, `rodzaj`, `screen_bonding` |
| `connect_secondary_ring_sn` | `segment.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `continue_trunk_segment_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `continue_trunk_segment_sn` | `segment` | `b0_siemens_per_km`, `bus_name`, `catalog_binding`, `catalog_ref`, `dlugosc_m`, `name`, `r0_ohm_per_km`, `rodzaj`, `screen_bonding`, `x0_ohm_per_km`, `zero_sequence` |
| `continue_trunk_segment_sn` | `segment.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `continue_trunk_segment_sn` | `segment.zero_sequence` | `b0_siemens_per_km`, `r0_ohm_per_km`, `x0_ohm_per_km` |
| `insert_branch_pole_on_segment_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `insert_branch_pole_on_segment_sn` | `insert_at` | `mode`, `value` |
| `insert_section_switch_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `insert_section_switch_sn` | `insert_at` | `mode`, `value` |
| `insert_station_on_segment_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `insert_station_on_segment_sn` | `insert_at` | `mode`, `value` |
| `insert_station_on_segment_sn` | `nn_block` | `cos_phi`, `loadability_pu`, `nn_configuration`, `outgoing_feeders_nn`, `outgoing_feeders_nn_count`, `simultaneity_factor`, `source_converter_catalog_ref`, `source_converter_kind`, `source_converter_name`, `source_protection` |
| `insert_station_on_segment_sn` | `nn_block.source_protection` | `analysis_scope`, `breaker_role`, `device_catalog_ref`, `device_label`, `protected_object` |
| `insert_station_on_segment_sn` | `nn_earthing` | `lv_system`, `neutral_point`, `{side}_neutral_point`, `{side}_r_ohm`, `{side}_x_ohm` |
| `insert_station_on_segment_sn` | `sn_fields` | `apparatus_catalog_ref`, `bay_kind`, `bay_template_ref`, `equipment`, `factory_configuration_ref`, `factory_unit_index`, `field_role`, `funkcja_pomiaru`, `manufacturer_ref`, `protection_ref`, `rodzaj_pomiaru`, `source_refs`, `source_status`, `switchgear_family_ref` |
| `insert_station_on_segment_sn` | `station` | `construction_type`, `designation`, `name`, `name_pl`, `nn_earthing`, `nn_voltage_kv`, `sn_voltage_kv`, `station_auxiliary`, `station_name`, `station_type`, `switchgear` |
| `insert_station_on_segment_sn` | `station.nn_earthing` | `lv_system`, `neutral_point`, `{side}_neutral_point`, `{side}_r_ohm`, `{side}_x_ohm` |
| `insert_station_on_segment_sn` | `station.station_auxiliary` | `active_power_kw`, `cos_phi`, `name`, `reactive_power_kvar` |
| `insert_station_on_segment_sn` | `station.switchgear` | `manufacturer_ref`, `switchgear_family_ref` |
| `insert_station_on_segment_sn` | `station_auxiliary` | `active_power_kw`, `cos_phi`, `name`, `reactive_power_kvar` |
| `insert_station_on_segment_sn` | `transformer` | `catalog_binding`, `create`, `n_parallel`, `transformer_catalog_ref`, `transformer_control_mode`, `transformer_controlled_bus_ref`, `transformer_deadband_kv`, `transformer_delay_seconds`, `transformer_ldc_enabled`, `transformer_ldc_r_ohm`, `transformer_ldc_x_ohm`, `transformer_regulated_winding`, `transformer_regulation_type`, `transformer_tap_changer_catalog_ref`, `transformer_tap_current_position`, `transformer_tap_max_position`, `transformer_tap_min_position`, `transformer_tap_neutral_position`, `transformer_tap_step_percent`, `transformer_voltage_setpoint_kv` |
| `insert_station_on_segment_sn` | `transformer.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `insert_zksn_on_segment_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `insert_zksn_on_segment_sn` | `insert_at` | `mode`, `value` |
| `set_bay_equipment` | `devices` | `catalog_ref`, `designation`, `earthing_role`, `kind`, `linked_ref`, `placement` |
| `set_nn_cable_laying_conditions` | `cable_laying_conditions` | `ambient_temperature_c`, `circuit_count`, `environment`, `insulation`, `soil_thermal_resistivity_km_w` |
| `start_branch_segment_sn` | `catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `start_branch_segment_sn` | `segment` | `b0_siemens_per_km`, `bus_name`, `catalog_binding`, `catalog_ref`, `dlugosc_m`, `name`, `r0_ohm_per_km`, `rodzaj`, `screen_bonding`, `x0_ohm_per_km`, `zero_sequence` |
| `start_branch_segment_sn` | `segment.catalog_binding` | `catalog_item_id`, `catalog_item_version`, `catalog_namespace`, `catalog_ref`, `materialize`, `snapshot_mapping_version` |
| `start_branch_segment_sn` | `segment.zero_sequence` | `b0_siemens_per_km`, `r0_ohm_per_km`, `x0_ohm_per_km` |
<!-- GENEROWANE:ksztalty-ladunku:KONIEC -->

### Ciągi liniowe (`line_runs`)

<!-- GENEROWANE:ciagi-liniowe:POCZATEK -->
Ciąg liniowy (`line_runs`, `enm/models.py::LineRun`) to magistrala albo odgałęzienie jako uporządkowana lista odcinków kabla/linii (`segments`: `segment_ref`, `order`) z początkiem w polu (`starting_bay_ref`, `starting_port_ref`); id ciągu = `ref_id` magistrali (`corridors`), `run_kind` ∈ `main_trunk`, `branch`, `ring`, `loop`, odgałęzienie wskazuje ciąg macierzysty (`parent_run_ref`). Każdy odcinek ciągu istnieje w `branches`, każda stacja listy `stations` — w `substations`. Operacje nie prowadzą listy `stations`: stacje ciągu wyprowadza się z końcówek odcinków (SLD `inferStationRefsForSegments`); lista z zapisu zastanego traci stację usuniętą. Ciągi zmienia **8** operacji (`CIAGI_LINIOWE`, zbiór równy operacjom, których handler zapisuje ciągi — `backend/tests/ci/test_ciagi_liniowe_operacji.py`); pozostałe operacje ciągów nie zmieniają.

| Operacja | Klucz ciągu | Skutek w `line_runs` |
|---|---|---|
| `add_grid_source_sn` | — | Zakłada ciąg magistrali GPZ (`run_kind` `main_trunk`, id = id magistrali, bez odcinków) z początkiem w pierwszym polu liniowym GPZ i jego zacisku. |
| `continue_trunk_segment_sn` | `trunk_id` | Dopisuje utworzony odcinek na koniec ciągu `trunk_id` (brak albo nieznana magistrala → pierwsza magistrala modelu); ciąg zakładany, gdy magistrala go nie ma (początek: `field_ref`, `from_terminal_id`). Odcinek bez nazwy w ładunku dostaje nazwę ciągu i numer `order`. |
| `delete_element` | — | Usuwa z `segments` i `stations` każdego ciągu odcinki i stacje usunięte wprost albo kaskadą (numeracja `order` od nowa) — para do czyszczenia magistral; ciąg bez odcinków zostaje razem z magistralą. |
| `insert_branch_pole_on_segment_sn` | — | Dzielony odcinek (`segment_id`) zastąpiony w ciągu dwiema połówkami w tym samym miejscu, numeracja `order` od nowa (`_podziel_odcinek_w_widokach` — ta sama reguła dla magistrali i ciągu). Wstawienie na końcu odcinka nie dzieli go. |
| `insert_section_switch_sn` | — | Dzielony odcinek (`segment_id`) zastąpiony w ciągu dwiema połówkami w tym samym miejscu, numeracja `order` od nowa (`_podziel_odcinek_w_widokach` — ta sama reguła dla magistrali i ciągu). Łącznik nie jest odcinkiem ciągu (magistrala wymienia go między połówkami). |
| `insert_station_on_segment_sn` | — | Dzielony odcinek (`segment_id`) zastąpiony w ciągu dwiema połówkami w tym samym miejscu, numeracja `order` od nowa (`_podziel_odcinek_w_widokach` — ta sama reguła dla magistrali i ciągu). Stacja nie jest odcinkiem ciągu. |
| `insert_zksn_on_segment_sn` | — | Dzielony odcinek (`segment_id`) zastąpiony w ciągu dwiema połówkami w tym samym miejscu, numeracja `order` od nowa (`_podziel_odcinek_w_widokach` — ta sama reguła dla magistrali i ciągu). Wstawienie na końcu odcinka nie dzieli go. |
| `start_branch_segment_sn` | — | Zakłada ciąg odgałęzienia (`run_kind` `branch`) z utworzonym odcinkiem; początek i `branch_origin_station_ref` = element początku (`from_ref`), `parent_run_ref` = ciąg odcinków punktu rozgałęzienia (początek `bp/…`). |
<!-- GENEROWANE:ciagi-liniowe:KONIEC -->

---

## 5. Operacje usunięte i fikcyjne

Operacje, które wcześniejsze wersje dokumentów wymieniały, a których nie ma w rejestrze —
z powodem i drogą zastępczą.

<!-- GENEROWANE:operacje-usuniete:POCZATEK -->
| Operacja | Powód |
|---|---|
| `add_sn_bay_from_catalog` | MENU-KANON (2026-10-22): dubel `add_sn_bay` (tryb próby `dry_run` przeniesiony) |
| `calculate_tcc_curve` | W3-A (2026-09): krzywe TCC niesie wynik koordynacji zabezpieczeń |
| `compare_study_cases` | CV-3.2 (58e520ce): porównanie przypadków to warstwa przypadków (`api/study_cases.py`) |
| `create_study_case` | CV-3.2 (58e520ce): zapis `study_cases[]` do dokumentu ENM, którego model nie ma — przypadek obliczeniowy żyje w `api/study_cases.py` i `domain/study_case.py` |
| `link_relay_to_field` | BIEG-ZABEZPIECZEN-Z-MODELU (2026-09-30): przekaźnik wiąże z polem `add_relay` (`field_ref`) |
| `remove_nn_element` | MENU-KANON (2026-10-22): dubel `delete_element` |
| `rename_element` | MENU-KANON (2026-10-22): dubel `update_element_parameters` (pole `name`) |
| `run_power_flow` | CV-3.2 (58e520ce): bieg obliczeń to `enm/canonical_analysis.py::create_run/execute_run` |
| `run_short_circuit` | CV-3.2 (58e520ce): bieg obliczeń to `enm/canonical_analysis.py::create_run/execute_run` |
| `run_time_series_power_flow` | CV-3.2 (58e520ce): zapis w próżnię, 0 konsumentów |
| `set_case_normal_state` | CV-3.2 (58e520ce): stan roboczy to `enm/scenariusze.py::OperatingScenario` |
| `set_case_source_mode` | CV-3.2 (58e520ce): tryb źródła w scenariuszu to `enm/scenariusze.py::OperatingScenario` |
| `set_case_switch_state` | CV-3.2 (58e520ce): stan roboczy łączników to `enm/scenariusze.py::OperatingScenario` |
| `set_case_time_profile` | CV-3.2 (58e520ce): zapis w próżnię, 0 konsumentów |
| `set_dynamic_profile` | MENU-KANON (2026-10-22): zapis bez konsumenta — model dynamiczny wytwórcy wiąże `set_der_catalog_bindings` (`dynamic_model_ref`), odbioru `set_load_dynamic_binding` |
| `set_label` | MENU-KANON (2026-10-22): dubel `update_element_parameters` (pole `label`) |
| `update_nn_bus_sections` | nigdy nie istniała w kodzie (fikcja dokumentu) — sekcje nN buduje `add_nn_section_coupler` |
| `update_nn_coupler_state` | nigdy nie istniała w kodzie (fikcja dokumentu) — stan łącznika zmieniają `open_switch` / `close_switch` |
| `update_relay_settings` | BIEG-ZABEZPIECZEN-Z-MODELU (2026-09-30): zaślepka z odmową — następca `update_protection_settings` |
| `validate_selectivity` | BIEG-ZABEZPIECZEN-Z-MODELU (2026-09-30): selektywność z kolejności listy — liczy ją koordynacja zabezpieczeń na nastawach z modelu |
<!-- GENEROWANE:operacje-usuniete:KONIEC -->

---

## 6. Przykłady wykonane przez API

Łańcuch budowy sieci od pustego modelu: GPZ, magistrala z pierścieniem, stacje, punkty ciągu,
pola, źródła, przekładniki i zabezpieczenia, sieć nN, operacje uniwersalne. Każdy krok jest
wywołaniem `POST /api/cases/{case_id}/enm/domain-ops` (API aplikacji w procesie) na migawce po
kroku poprzednim — identyfikatory w ładunkach są identyfikatorami, które operacje nadały
deterministycznie. W kopercie `project_id` i `snapshot_base_hash` są pokazane jako znaczniki
(w wywołaniu: identyfikator projektu i skrót bieżącej migawki). Skutek pochodzi z odpowiedzi
API. Krok oznaczony „odmowa nazwana” pokazuje odmowę z kodem — model zostaje bez zmian.

<!-- GENEROWANE:przyklady-operacji:POCZATEK -->
#### 1. `add_grid_source_sn` — GPZ 110/15 kV z pozycji katalogu źródeł

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_grid_source_sn",
    "idempotency_key": "przyklad-01",
    "payload": {
      "voltage_kv": 15.0,
      "source_name": "GPZ Północ",
      "sk3_mva": 300.0,
      "rx_ratio": 0.1,
      "catalog_binding": {
        "catalog_namespace": "ZRODLO_SN",
        "catalog_item_id": "src-gpz-15kv-300mva-rx010",
        "catalog_item_version": "2024.1"
      },
      "hv_voltage_kv": 110.0,
      "transformer_sn_mva": 25.0
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 6, zmienione 0, usunięte 0; zdarzenia: `BUS_CREATED` ×2, `LOGICAL_VIEWS_UPDATED`, `SOURCE_CREATED`, `STATION_CREATED`, `TRANSFORMER_CREATED`; zaznaczenie: `gpz/699c3628e2bdfd1ca650543a594e9ac3/substation`.

#### 2. `continue_trunk_segment_sn` — pierwszy odcinek magistrali

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "continue_trunk_segment_sn",
    "idempotency_key": "przyklad-02",
    "payload": {
      "segment": {
        "rodzaj": "KABEL",
        "dlugosc_m": 350,
        "name": "Odcinek 1",
        "catalog_binding": {
          "catalog_namespace": "KABEL_SN",
          "catalog_item_id": "cable-tfk-yakxs-3x120",
          "catalog_item_version": "2024.1"
        }
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `BRANCH_CREATED`, `BUS_CREATED`, `LOGICAL_VIEWS_UPDATED`; zaznaczenie: `bus/fde26ce612c7cc9c1d5f0411b5100d54/downstream`.

#### 3. `continue_trunk_segment_sn` — drugi odcinek

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "continue_trunk_segment_sn",
    "idempotency_key": "przyklad-03",
    "payload": {
      "segment": {
        "rodzaj": "KABEL",
        "dlugosc_m": 420,
        "name": "Odcinek 2",
        "catalog_binding": {
          "catalog_namespace": "KABEL_SN",
          "catalog_item_id": "cable-tfk-yakxs-3x120",
          "catalog_item_version": "2024.1"
        }
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `BRANCH_CREATED`, `BUS_CREATED`, `LOGICAL_VIEWS_UPDATED`; zaznaczenie: `bus/156cd6bb93e243cc59c96e85f99b6631/downstream`.

#### 4. `continue_trunk_segment_sn` — trzeci odcinek

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "continue_trunk_segment_sn",
    "idempotency_key": "przyklad-04",
    "payload": {
      "segment": {
        "rodzaj": "KABEL",
        "dlugosc_m": 300,
        "name": "Odcinek 3",
        "catalog_binding": {
          "catalog_namespace": "KABEL_SN",
          "catalog_item_id": "cable-tfk-yakxs-3x120",
          "catalog_item_version": "2024.1"
        }
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `BRANCH_CREATED`, `BUS_CREATED`, `LOGICAL_VIEWS_UPDATED`; zaznaczenie: `bus/cbe1be9d8e79464503ea6eb4d4953377/downstream`.

#### 5. `continue_trunk_segment_sn` — czwarty odcinek

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "continue_trunk_segment_sn",
    "idempotency_key": "przyklad-05",
    "payload": {
      "segment": {
        "rodzaj": "KABEL",
        "dlugosc_m": 280,
        "name": "Odcinek 4",
        "catalog_binding": {
          "catalog_namespace": "KABEL_SN",
          "catalog_item_id": "cable-tfk-yakxs-3x120",
          "catalog_item_version": "2024.1"
        }
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `BRANCH_CREATED`, `BUS_CREATED`, `LOGICAL_VIEWS_UPDATED`; zaznaczenie: `bus/8ce5dea454a451c8dc2c7d84a8e41eba/downstream`.

#### 6. `insert_station_on_segment_sn` — stacja przelotowa typu B w połowie drugiego odcinka

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "insert_station_on_segment_sn",
    "idempotency_key": "przyklad-06",
    "payload": {
      "segment_id": "seg/156cd6bb93e243cc59c96e85f99b6631/segment",
      "insert_at": {
        "mode": "RATIO",
        "value": 0.5
      },
      "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
      "station": {
        "station_type": "B",
        "station_name": "Stacja S01",
        "sn_voltage_kv": 15.0,
        "nn_voltage_kv": 0.4
      },
      "nn_earthing": {
        "lv_system": "TN-C-S"
      },
      "sn_fields": [
        {
          "field_role": "LINIA_IN"
        },
        {
          "field_role": "LINIA_OUT"
        },
        {
          "field_role": "MEASUREMENT"
        },
        {
          "field_role": "TRANSFORMATOROWE"
        }
      ],
      "transformer": {
        "create": true,
        "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11"
      },
      "nn_block": {
        "outgoing_feeders_nn_count": 2
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 14, zmienione 0, usunięte 1; zdarzenia: `BUS_NN_CREATED`, `CUT_NODE_CREATED`, `DEVICES_CREATED_NN`, `DEVICES_CREATED_SN`, `FIELDS_CREATED_NN`, `FIELDS_CREATED_SN`, `LOGICAL_VIEWS_UPDATED`, `PORTS_CREATED`, `RECONNECTED_GRAPH`, `SEGMENT_SPLIT`, `STATION_CREATED`, `TR_CREATED`; zaznaczenie: `stn/01524d2cac166b45ccb95ed78dee5347/station`.

#### 7. `insert_section_switch_sn` — rozłącznik sekcyjny w połowie trzeciego odcinka

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "insert_section_switch_sn",
    "idempotency_key": "przyklad-07",
    "payload": {
      "segment_id": "seg/cbe1be9d8e79464503ea6eb4d4953377/segment",
      "insert_at": {
        "mode": "RATIO",
        "value": 0.5
      },
      "switch_type": "ROZLACZNIK",
      "switch_name": "Rozłącznik R1",
      "catalog_binding": {
        "catalog_namespace": "APARAT_SN",
        "catalog_item_id": "sw-ls-schneider-rm6-17kv-400a",
        "catalog_item_version": "2024.1"
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 5, zmienione 0, usunięte 1; zdarzenia: `SWITCH_INSERTED`; zaznaczenie: `sw/1c07212c287372722f9699f400b3b6cf/switch`.

#### 8. `insert_zksn_on_segment_sn` — złącze kablowe SN (ZKSN) w połowie czwartego odcinka

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "insert_zksn_on_segment_sn",
    "idempotency_key": "przyklad-08",
    "payload": {
      "segment_id": "seg/8ce5dea454a451c8dc2c7d84a8e41eba/segment",
      "insert_at": {
        "mode": "RATIO",
        "value": 0.5
      },
      "catalog_binding": {
        "catalog_namespace": "mv_branch_points",
        "catalog_item_id": "ZKSN-2P-630A",
        "catalog_item_version": "2024.1"
      },
      "switch_state": "closed",
      "name": "ZKSN-1"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 12, zmienione 0, usunięte 1; zdarzenia: `BRANCH_POINT_CREATED`; zaznaczenie: `bp/811059e3e2f5d62f30cf7aa9c502b9aa/zksn`.

#### 9. `start_branch_segment_sn` — odgałęzienie napowietrzne od węzła za pierwszym odcinkiem

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "start_branch_segment_sn",
    "idempotency_key": "przyklad-09",
    "payload": {
      "from_bus_ref": "bus/fde26ce612c7cc9c1d5f0411b5100d54/downstream",
      "segment": {
        "rodzaj": "LINIA_NAPOWIETRZNA",
        "dlugosc_m": 900,
        "name": "Odgałęzienie 1",
        "catalog_binding": {
          "catalog_namespace": "LINIA_SN",
          "catalog_item_id": "line-base-al-st-70",
          "catalog_item_version": "2024.1"
        }
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 3, zmienione 0, usunięte 0; zdarzenia: `BRANCH_CREATED`, `BUS_CREATED`; zaznaczenie: `seg/a23025970632df99326678aca5e5de2f/branch_segment`.

#### 10. `insert_branch_pole_on_segment_sn` — słup rozgałęźny w połowie odgałęzienia

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "insert_branch_pole_on_segment_sn",
    "idempotency_key": "przyklad-10",
    "payload": {
      "segment_id": "seg/a23025970632df99326678aca5e5de2f/branch_segment",
      "insert_at": {
        "mode": "RATIO",
        "value": 0.5
      },
      "catalog_binding": {
        "catalog_namespace": "mv_branch_points",
        "catalog_item_id": "SLUP-ODG-12",
        "catalog_item_version": "2024.1"
      },
      "switch_state": "closed",
      "name": "Słup S-1"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 6, zmienione 0, usunięte 1; zdarzenia: `BRANCH_POINT_CREATED`; zaznaczenie: `bp/775f8958c010c37358204c32c2cd5c0e/branch_pole`.

#### 11. `append_station_on_endpoint` — stacja końcowa na otwartym końcu odgałęzienia

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "append_station_on_endpoint",
    "idempotency_key": "przyklad-11",
    "payload": {
      "endpoint_bus_ref": "bus/a23025970632df99326678aca5e5de2f/branch_end",
      "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
      "station": {
        "station_type": "A",
        "name": "Stacja S02",
        "nn_voltage_kv": 0.4
      },
      "nn_earthing": {
        "lv_system": "TN-C-S"
      },
      "transformer": {
        "create": true,
        "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11"
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 9, zmienione 0, usunięte 0; zdarzenia: `BUS_NN_CREATED`, `FIELDS_CREATED_SN` ×2, `STATION_APPENDED_ON_ENDPOINT`, `STATION_CREATED`, `TR_CREATED`; zaznaczenie: `sub/1d6531a012a82f5d88559301220959e1/substation`.

#### 12. `connect_secondary_ring_sn` — zamknięcie pierścienia od szyny GPZ do końca magistrali

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "connect_secondary_ring_sn",
    "idempotency_key": "przyklad-12",
    "payload": {
      "from_bus_ref": "gpz/699c3628e2bdfd1ca650543a594e9ac3/section/001/bus_sn",
      "to_bus_ref": "bus/8ce5dea454a451c8dc2c7d84a8e41eba/downstream",
      "ring_name": "Pierścień P1",
      "segment": {
        "rodzaj": "KABEL",
        "dlugosc_m": 1500,
        "catalog_binding": {
          "catalog_namespace": "KABEL_SN",
          "catalog_item_id": "cable-tfk-yakxs-3x120",
          "catalog_item_version": "2024.1"
        }
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `RING_CONNECTED`; zaznaczenie: `seg/a07bc46116a5293ea3e62471e9ef72d3/ring_closure`.

#### 13. `set_normal_open_point` — rozłącznik R1 punktem normalnie otwartym pierścienia

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "set_normal_open_point",
    "idempotency_key": "przyklad-13",
    "payload": {
      "switch_ref": "sw/1c07212c287372722f9699f400b3b6cf/switch"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `NOP_SET`; zaznaczenie: `sw/1c07212c287372722f9699f400b3b6cf/switch`.

#### 14. `close_switch` — zamknięcie rozłącznika R1 (stan łączeniowy)

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "close_switch",
    "idempotency_key": "przyklad-14",
    "payload": {
      "switch_ref": "sw/1c07212c287372722f9699f400b3b6cf/switch"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `SWITCH_CLOSED`; zaznaczenie: `sw/1c07212c287372722f9699f400b3b6cf/switch`.

#### 15. `open_switch` — ponowne otwarcie rozłącznika R1

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "open_switch",
    "idempotency_key": "przyklad-15",
    "payload": {
      "switch_ref": "sw/1c07212c287372722f9699f400b3b6cf/switch"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `SWITCH_OPENED`; zaznaczenie: `sw/1c07212c287372722f9699f400b3b6cf/switch`.

#### 16. `przepnij_element_na_pole` — akcja naprawcza modelu archiwalnego — odcinek zbudowany operacją już leży na polu

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "przepnij_element_na_pole",
    "idempotency_key": "przyklad-16",
    "payload": {
      "element_ref": "seg/fde26ce612c7cc9c1d5f0411b5100d54/segment"
    }
  }
}
```

Odpowiedź: HTTP 200, odmowa nazwana `tor.element_not_bypassing_field` — „Element „Odcinek 1” nie leży na szynie głównej stacji z pominięciem pola — nie ma czego przepinać.” Model bez zmian.

#### 17. `add_gpz_section` — sekcja szyn WN GPZ na szynie 110 kV

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_gpz_section",
    "idempotency_key": "przyklad-17",
    "payload": {
      "substation_ref": "gpz/699c3628e2bdfd1ca650543a594e9ac3/substation",
      "side": "hv",
      "section_id": "WN-1",
      "bus_ref": "gpz/699c3628e2bdfd1ca650543a594e9ac3/transformer/001/bus_110",
      "name": "Sekcja WN 1"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `GPZ_SECTION_ADDED`; zaznaczenie: `gpz/699c3628e2bdfd1ca650543a594e9ac3/substation`.

#### 18. `update_gpz_section` — zmiana nazwy sekcji WN

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "update_gpz_section",
    "idempotency_key": "przyklad-18",
    "payload": {
      "substation_ref": "gpz/699c3628e2bdfd1ca650543a594e9ac3/substation",
      "side": "hv",
      "section_id": "WN-1",
      "updates": {
        "name": "Sekcja WN 1 (główna)"
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `GPZ_SECTION_UPDATED`; zaznaczenie: `gpz/699c3628e2bdfd1ca650543a594e9ac3/substation`.

#### 19. `delete_gpz_section` — usunięcie sekcji WN

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "delete_gpz_section",
    "idempotency_key": "przyklad-19",
    "payload": {
      "substation_ref": "gpz/699c3628e2bdfd1ca650543a594e9ac3/substation",
      "side": "hv",
      "section_id": "WN-1"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 0, usunięte 1; zdarzenia: `GPZ_SECTION_DELETED`; zaznaczenie: `gpz/699c3628e2bdfd1ca650543a594e9ac3/substation`.

#### 20. `add_sn_bay` — dodatkowe pole liniowe w rozdzielnicy SN stacji S01

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_sn_bay",
    "idempotency_key": "przyklad-20",
    "payload": {
      "station_ref": "stn/01524d2cac166b45ccb95ed78dee5347/station",
      "bus_ref": "stn/01524d2cac166b45ccb95ed78dee5347/sn_bus",
      "bay_role": "OUT",
      "field_name": "Pole liniowe L3",
      "catalog_ref": "sw-cb-abb-vd4-17kv-630a"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 3, zmienione 0, usunięte 0; zdarzenia: `FIELDS_CREATED_SN`, `FIELD_DEVICE_CREATED_SN`, `FIELD_TERMINAL_CREATED_SN`; zaznaczenie: `sn/fa384bcb497c69b3e04606638c813794/bay`.

#### 21. `set_bay_equipment` — wyposażenie nowego pola z szablonu pola liniowego

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "set_bay_equipment",
    "idempotency_key": "przyklad-21",
    "payload": {
      "bay_ref": "sn/fa384bcb497c69b3e04606638c813794/bay",
      "mode": "szablon",
      "bay_template_ref": "bay_template_line_out"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `BAY_EQUIPMENT_SET`; zaznaczenie: `sn/fa384bcb497c69b3e04606638c813794/bay`.

#### 22. `add_load_sn` — odbiór SN na węźle za pierwszym odcinkiem

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_load_sn",
    "idempotency_key": "przyklad-22",
    "payload": {
      "bus_ref": "bus/fde26ce612c7cc9c1d5f0411b5100d54/downstream",
      "p_mw": 0.4,
      "q_mvar": 0.1,
      "load_name": "Odbiór SN 1"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `LOAD_SN_CREATED`; zaznaczenie: `load/9ed239f8488b67b6b57f7d55abb23954/sn`.

#### 23. `add_generator_sn` — generator synchroniczny SN z tabliczką podaną ręcznie (katalog bez typu maszyny)

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_generator_sn",
    "idempotency_key": "przyklad-23",
    "payload": {
      "bus_ref": "bus/cbe1be9d8e79464503ea6eb4d4953377/downstream",
      "p_mw": 1.0,
      "name": "Generator G1",
      "manual_params": {
        "rated_mva": 1.25,
        "rated_kv": 15.0,
        "q_min_mvar": -0.6,
        "q_max_mvar": 0.75
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `GENERATOR_SN_CREATED`; zaznaczenie: `gen/18bb5c3eea2d9dd189d65bf2ff5178df/sn`.

#### 24. `add_shunt_compensator_sn` — bateria kondensatorów SN z katalogu

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_shunt_compensator_sn",
    "idempotency_key": "przyklad-24",
    "payload": {
      "bus_ref": "bus/cbe1be9d8e79464503ea6eb4d4953377/downstream",
      "name": "Bateria K1",
      "catalog_binding": {
        "catalog_namespace": "KOMPENSATOR_SN",
        "catalog_item_id": "KOMP_SN_1V2_15KV",
        "catalog_item_version": "2024.1"
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `SHUNT_COMPENSATOR_CREATED`; zaznaczenie: `shunt/c84b420ba39265762c7fa4a4360f263b/cap`.

#### 25. `add_surge_arrester_sn` — ogranicznik przepięć w polu liniowym stacji S01

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_surge_arrester_sn",
    "idempotency_key": "przyklad-25",
    "payload": {
      "station_ref": "stn/01524d2cac166b45ccb95ed78dee5347/station",
      "field_ref": "stn/01524d2cac166b45ccb95ed78dee5347/sn_field/000",
      "catalog_binding": {
        "catalog_namespace": "OGRANICZNIK_SN",
        "catalog_item_id": "arrester-abb-polim-d-24kv-10ka",
        "catalog_item_version": "2024.1"
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `SURGE_ARRESTER_CREATED`; zaznaczenie: `stn/01524d2cac166b45ccb95ed78dee5347/sn_field/000`.

#### 26. `add_nn_outgoing_field` — pole odpływowe nN w stacji S01

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_nn_outgoing_field",
    "idempotency_key": "przyklad-26",
    "payload": {
      "station_ref": "stn/01524d2cac166b45ccb95ed78dee5347/station",
      "bus_nn_ref": "stn/01524d2cac166b45ccb95ed78dee5347/nn_bus",
      "field_name": "Odpływ nN 3"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `FIELDS_CREATED_NN`; zaznaczenie: `nn/ba89aff2fd3a27d119dfd0149b7847a6/outgoing`.

#### 27. `add_nn_load` — odbiór nN z katalogu na nowym odpływie

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_nn_load",
    "idempotency_key": "przyklad-27",
    "payload": {
      "bus_nn_ref": "stn/01524d2cac166b45ccb95ed78dee5347/nn_bus",
      "feeder_ref": "nn/ba89aff2fd3a27d119dfd0149b7847a6/outgoing",
      "catalog_binding": {
        "catalog_namespace": "OBCIAZENIE",
        "catalog_item_id": "load_mieszk_15kw",
        "catalog_item_version": "2024.1"
      },
      "cos_phi": 0.95,
      "load_name": "Odbiór nN 1"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `NN_LOAD_CREATED`; zaznaczenie: `nn/381b5ead9e43c45a8f2c9a35d4168b19/load`.

#### 28. `add_converter_source` — źródło PV na szynie nN stacji S01

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_converter_source",
    "idempotency_key": "przyklad-28",
    "payload": {
      "source_technology": "PV",
      "connection_variant": "nn_side",
      "station_ref": "stn/01524d2cac166b45ccb95ed78dee5347/station",
      "bus_nn_ref": "stn/01524d2cac166b45ccb95ed78dee5347/nn_bus",
      "catalog_binding": {
        "catalog_namespace": "ZRODLO_NN_PV",
        "catalog_item_id": "conv-pv-nn-0p5mw-0p4kv",
        "catalog_item_version": "2024.1"
      },
      "power_setpoint_mw": 0.02,
      "source_name": "PV S01"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `NN_SOURCE_FIELD_CREATED`, `PV_INVERTER_CREATED`; zaznaczenie: `nn/ba5e5a4dc51f56f6bff86d6bbdf90a29/source_field`.

#### 29. `add_genset_nn` — agregat prądotwórczy w nowym polu źródłowym nN

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_genset_nn",
    "idempotency_key": "przyklad-29",
    "payload": {
      "bus_nn_ref": "stn/01524d2cac166b45ccb95ed78dee5347/nn_bus",
      "station_ref": "stn/01524d2cac166b45ccb95ed78dee5347/station",
      "placement": "NEW_FIELD",
      "source_field": {
        "source_field_kind": "AGREGAT",
        "field_name": "Pole agregatu"
      },
      "genset_spec": {
        "rated_power_kw": 400.0,
        "rated_voltage_kv": 0.4,
        "power_factor": 0.8,
        "operation_mode": "PRACA_AWARYJNA",
        "fuel_type": "DIESEL"
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `GENSET_CREATED`, `NN_SOURCE_FIELD_CREATED`; zaznaczenie: `gen/aa6acdb78ce1d3cb43d2afa3698262c5/genset`.

#### 30. `add_ups_nn` — UPS wprost na szynie nN

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_ups_nn",
    "idempotency_key": "przyklad-30",
    "payload": {
      "bus_nn_ref": "stn/01524d2cac166b45ccb95ed78dee5347/nn_bus",
      "ups_spec": {
        "rated_power_kw": 120.0,
        "backup_time_min": 15.0,
        "operation_mode": "ONLINE",
        "battery_type": "VRLA"
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `UPS_CREATED`; zaznaczenie: `ups/a7e8fdfce222756678471201c2aa874a/ups`.

#### 31. `set_source_operating_mode` — tryb pracy agregatu

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "set_source_operating_mode",
    "idempotency_key": "przyklad-31",
    "payload": {
      "source_ref": "gen/aa6acdb78ce1d3cb43d2afa3698262c5/genset",
      "mode": "gotowosc"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `PARAMETERS_UPDATED`; zaznaczenie: brak.

#### 32. `dodaj_karte_widmowa_projektu` — karta widmowa projektu typu falownika PV

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "dodaj_karte_widmowa_projektu",
    "idempotency_key": "przyklad-32",
    "payload": {
      "karta": {
        "id": "karta-widmowa-pv-1",
        "urzadzenie_ref": "conv-pv-nn-0p5mw-0p4kv",
        "producent": "PRODUCENT",
        "model_urzadzenia": "MODEL",
        "modele": [
          {
            "ident": "m-1",
            "rodzaj": "CURRENT_SPECTRUM",
            "dziedzina": "HARMONIC_FREQUENCY_DOMAIN",
            "f1_hz": 50.0,
            "zakres_czestotliwosci": {
              "f_min_hz": 0.0,
              "f_max_hz": 2500.0
            },
            "skladowe": [
              {
                "f_hz": 250.0,
                "amplituda": {
                  "wartosc": 3.0,
                  "jednostka": "%"
                },
                "faza_deg": null,
                "faza_nieznana_powod_pl": "faza nieznana — karta nie podaje"
              },
              {
                "f_hz": 350.0,
                "amplituda": {
                  "wartosc": 2.0,
                  "jednostka": "%"
                },
                "faza_deg": null,
                "faza_nieznana_powod_pl": "faza nieznana — karta nie podaje"
              }
            ],
            "admitancja": null,
            "impedancja": null,
            "model_parametryczny": null,
            "punkt_pracy": {
              "baza_mocy": "S_N_URZADZENIA",
              "p": {
                "dolna": 0.0,
                "gorna": 1.0,
                "domkniecie_dolne": true,
                "domkniecie_gorne": true
              },
              "q": null,
              "u": null,
              "soc": null,
              "tryb": null,
              "stacjonarny": true
            },
            "odniesienie_amplitudy": {
              "rodzaj": "I_N_URZADZENIA",
              "wartosc": null,
              "pola_karty": [
                "sn_mva",
                "un_kv"
              ]
            },
            "odniesienie_fazy": null,
            "pomiar": null,
            "pasmo_ref": null,
            "podstawa": {
              "rodzaj": "KATALOG_PRODUCENTA",
              "dokument": "Raport R-1",
              "wydanie": "2024-01",
              "jednostka_redakcyjna": "tabela 3",
              "status": "WSKAZANE",
              "uwagi_pl": null
            },
            "wersja": "1",
            "czestotliwosc_przelaczania_hz": null
          }
        ],
        "dowody": [],
        "podstawa": {
          "rodzaj": "KATALOG_PRODUCENTA",
          "dokument": "Raport R-1",
          "wydanie": "2024-01",
          "jednostka_redakcyjna": "tabela 3",
          "status": "WSKAZANE",
          "uwagi_pl": null
        },
        "wersja": "1",
        "verification_status": "NIEWERYFIKOWANY",
        "source_reference": "Raport R-1, tabela 3",
        "catalog_status": "PROJEKTOWY_V1",
        "contract_version": "2.0"
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `CATALOG_ASSIGNED`; zaznaczenie: brak.

#### 33. `set_der_catalog_bindings` — wiązanie źródła PV z kartą widmową projektu

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "set_der_catalog_bindings",
    "idempotency_key": "przyklad-33",
    "payload": {
      "generator_ref": "pv/98df57c83129338b466ceca712cbd53f/converter",
      "karty_widmowe_ref": [
        "karta-widmowa-pv-1"
      ]
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `PARAMETERS_UPDATED`; zaznaczenie: `pv/98df57c83129338b466ceca712cbd53f/converter`.

#### 34. `set_load_dynamic_binding` — profil modelu dynamicznego odbioru SN

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "set_load_dynamic_binding",
    "idempotency_key": "przyklad-34",
    "payload": {
      "load_ref": "load/9ed239f8488b67b6b57f7d55abb23954/sn",
      "dynamic_model_ref": "load_dyn_zagregowany_sn"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `PARAMETERS_UPDATED`; zaznaczenie: `load/9ed239f8488b67b6b57f7d55abb23954/sn`.

#### 35. `add_ct` — przekładnik prądowy w polu liniowym stacji S01

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_ct",
    "idempotency_key": "przyklad-35",
    "payload": {
      "field_ref": "stn/01524d2cac166b45ccb95ed78dee5347/sn_field/000",
      "catalog_binding": {
        "catalog_namespace": "CT",
        "catalog_item_id": "ct_400_5_5p20_15va_abb",
        "catalog_item_version": "2024.1"
      },
      "ratio_primary_a": 400.0,
      "ratio_secondary_a": 5.0
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `CT_CREATED`; zaznaczenie: `ct/2469c74b955cd9f1c0204e3c36ddbe38/measurement`.

#### 36. `add_vt` — przekładnik napięciowy w polu pomiarowym stacji S01

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_vt",
    "idempotency_key": "przyklad-36",
    "payload": {
      "field_ref": "stn/01524d2cac166b45ccb95ed78dee5347/sn_field/002",
      "catalog_binding": {
        "catalog_namespace": "VT",
        "catalog_item_id": "vt_15kv_100v_3p_abb",
        "catalog_item_version": "2024.1"
      },
      "ratio_primary_v": 15000.0,
      "ratio_secondary_v": 100.0
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `VT_CREATED`; zaznaczenie: `vt/e32d2d56c26eeb345431010a82ab049b/measurement`.

#### 37. `set_measurement_secondary_circuit` — obwód wtórny przekładnika prądowego

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "set_measurement_secondary_circuit",
    "idempotency_key": "przyklad-37",
    "payload": {
      "measurement_ref": "ct/2469c74b955cd9f1c0204e3c36ddbe38/measurement",
      "obwod_wtorny": {
        "dlugosc_przewodu_m": 25.0,
        "przekroj_przewodu_mm2": 2.5
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `MEASUREMENT_SECONDARY_CIRCUIT_SET`; zaznaczenie: `ct/2469c74b955cd9f1c0204e3c36ddbe38/measurement`.

#### 38. `add_relay` — zabezpieczenie nadprądowe pola liniowego z nastawami

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_relay",
    "idempotency_key": "przyklad-38",
    "payload": {
      "field_ref": "stn/01524d2cac166b45ccb95ed78dee5347/sn_field/000",
      "ct_ref": "ct/2469c74b955cd9f1c0204e3c36ddbe38/measurement",
      "catalog_ref": "REF-OC-100",
      "settings": [
        {
          "function_type": "overcurrent_51",
          "threshold_a": 2.0,
          "threshold_unit": "A_WTORNY",
          "curve_type": "IEC_SI",
          "time_multiplier": 0.3
        },
        {
          "function_type": "overcurrent_50",
          "threshold_a": 20.0,
          "threshold_unit": "A_WTORNY",
          "curve_type": "DT",
          "time_delay_s": 0.4
        }
      ]
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 1, usunięte 0; zdarzenia: `PROTECTION_CREATED`; zaznaczenie: `relay/c516457324fcfa614347ccf0e4e9d239/assignment`.

#### 39. `update_protection_settings` — zmiana nastaw (zwłoka członu zwarciowego 0,3 s)

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "update_protection_settings",
    "idempotency_key": "przyklad-39",
    "payload": {
      "protection_ref": "relay/c516457324fcfa614347ccf0e4e9d239/assignment",
      "settings": [
        {
          "function_type": "overcurrent_51",
          "threshold_a": 2.0,
          "threshold_unit": "A_WTORNY",
          "curve_type": "IEC_SI",
          "time_multiplier": 0.3
        },
        {
          "function_type": "overcurrent_50",
          "threshold_a": 20.0,
          "threshold_unit": "A_WTORNY",
          "curve_type": "DT",
          "time_delay_s": 0.3
        }
      ]
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `PROTECTION_SETTINGS_UPDATED`; zaznaczenie: `relay/c516457324fcfa614347ccf0e4e9d239/assignment`.

#### 40. `add_nn_distribution_board` — rozdzielnica nN wolnostojąca

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_nn_distribution_board",
    "idempotency_key": "przyklad-40",
    "payload": {
      "voltage_kv": 0.4,
      "name": "RGnN-1"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `BUS_CREATED`, `SUBSTATION_CREATED`; zaznaczenie: `nn/c25020028ba761efaf39ad8d1717ad5a/board`.

#### 41. `add_transformer_sn_nn` — transformator SN/nN zasilający rozdzielnicę RGnN-1 z węzła za trzecim odcinkiem

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_transformer_sn_nn",
    "idempotency_key": "przyklad-41",
    "payload": {
      "hv_bus_ref": "bus/cbe1be9d8e79464503ea6eb4d4953377/downstream",
      "lv_bus_ref": "nn/c25020028ba761efaf39ad8d1717ad5a/board_bus",
      "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `TRANSFORMER_CREATED`; zaznaczenie: `tr/2b8d6d71d697267ecd39b7e659e83c74/transformer`.

#### 42. `add_nn_outgoing_field` — odpływ F1 rozdzielnicy RGnN-1 (aparat odpływu i zacisk odpływu)

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_nn_outgoing_field",
    "idempotency_key": "przyklad-42",
    "payload": {
      "station_ref": "nn/c25020028ba761efaf39ad8d1717ad5a/board",
      "bus_nn_ref": "nn/c25020028ba761efaf39ad8d1717ad5a/board_bus",
      "field_name": "Odpływ F1",
      "catalog_ref": "cb_nn_630a"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `FIELDS_CREATED_NN`; zaznaczenie: `nn/bebdda0970ed470f0f3fe9628896b9e6/outgoing`.

#### 43. `add_nn_cable_segment` — kabel nN z zacisku odpływu F1

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_nn_cable_segment",
    "idempotency_key": "przyklad-43",
    "payload": {
      "from_bus_ref": "nn/da470729eec76c081755f9dde7dcc1f0/feeder_bus",
      "length_m": 80.0,
      "catalog_ref": "kab_nn_4x120_al",
      "name": "Kabel nN K1"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `BUS_CREATED`, `NN_CABLE_SEGMENT_CREATED`; zaznaczenie: `nn/55f7fa411878d7d44cee8664272d8683/cable`.

#### 44. `add_nn_distribution_board` — podrozdzielnica RGnN-2

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_nn_distribution_board",
    "idempotency_key": "przyklad-44",
    "payload": {
      "voltage_kv": 0.4,
      "name": "RGnN-2"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `BUS_CREATED`, `SUBSTATION_CREATED`; zaznaczenie: `nn/a5f367b2ac8880036ad52060287b0d8e/board`.

#### 45. `add_nn_switch_device` — bezpiecznik między końcem kabla K1 a szyną podrozdzielnicy RGnN-2

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_nn_switch_device",
    "idempotency_key": "przyklad-45",
    "payload": {
      "from_bus_ref": "nn/a4123adfdaaa269d3381db688ef11b44/cable_bus",
      "to_bus_ref": "nn/a5f367b2ac8880036ad52060287b0d8e/board_bus",
      "device_class": "fuse",
      "catalog_ref": "cb_nn_630a",
      "name": "Bezpiecznik złącza Z1"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 0; zdarzenia: `NN_SWITCH_DEVICE_CREATED`; zaznaczenie: `nn/ecd36c29d77863de5e0049fdd3c2b0a8/switch_device`.

#### 46. `add_nn_section_coupler` — druga sekcja szyn rozdzielnicy RGnN-1 ze sprzęgłem

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "add_nn_section_coupler",
    "idempotency_key": "przyklad-46",
    "payload": {
      "station_ref": "nn/c25020028ba761efaf39ad8d1717ad5a/board",
      "catalog_ref": "cb_nn_630a"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 2, zmienione 0, usunięte 0; zdarzenia: `BUS_CREATED`, `NN_SECTION_COUPLER_CREATED`; zaznaczenie: `nn/0305362c25d978377161bddc379f8f3d/section_bus`.

#### 47. `split_nn_segment` — podział kabla K1 w 30 m

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "split_nn_segment",
    "idempotency_key": "przyklad-47",
    "payload": {
      "segment_ref": "nn/55f7fa411878d7d44cee8664272d8683/cable",
      "split_at_m": 30.0
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 3, zmienione 0, usunięte 1; zdarzenia: `BRANCH_CREATED` ×2, `BUS_CREATED`, `SEGMENT_SPLIT`; zaznaczenie: `nn/267260b1b3f24b3939843ecd432a8d2f/split_bus`.

#### 48. `set_nn_cable_laying_conditions` — warunki ułożenia pierwszej połówki kabla

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "set_nn_cable_laying_conditions",
    "idempotency_key": "przyklad-48",
    "payload": {
      "segment_ref": "nn/267260b1b3f24b3939843ecd432a8d2f/split_left",
      "cable_laying_conditions": {
        "environment": "grunt",
        "insulation": "XLPE",
        "ambient_temperature_c": 20.0,
        "circuit_count": 2,
        "soil_thermal_resistivity_km_w": 1.5
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `NN_CABLE_LAYING_CONDITIONS_SET`; zaznaczenie: `nn/267260b1b3f24b3939843ecd432a8d2f/split_left`.

#### 49. `merge_nn_segments` — scalenie połówek kabla

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "merge_nn_segments",
    "idempotency_key": "przyklad-49",
    "payload": {
      "segment_a_ref": "nn/267260b1b3f24b3939843ecd432a8d2f/split_left",
      "segment_b_ref": "nn/267260b1b3f24b3939843ecd432a8d2f/split_right"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 1, zmienione 0, usunięte 3; zdarzenia: `SEGMENTS_MERGED`; zaznaczenie: `nn/a596cb138b888ad43118e41761b716c5/merged`.

#### 50. `copy_nn_feeder` — kopia odpływu F1 z kablem i bezpiecznikiem

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "copy_nn_feeder",
    "idempotency_key": "przyklad-50",
    "payload": {
      "feeder_apparatus_ref": "nn/da470729eec76c081755f9dde7dcc1f0/feeder_device",
      "name": "Odpływ F2"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 6, zmienione 0, usunięte 0; zdarzenia: `BRANCH_CREATED` ×3, `BUS_CREATED` ×3; zaznaczenie: `nn/a84872aea5829709f5e08383a185d1d6/copy_branch_1`.

#### 51. `assign_catalog_to_element` — zmiana pozycji katalogu kabla pierwszego odcinka

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "assign_catalog_to_element",
    "idempotency_key": "przyklad-51",
    "payload": {
      "element_ref": "seg/fde26ce612c7cc9c1d5f0411b5100d54/segment",
      "catalog_binding": {
        "catalog_namespace": "KABEL_SN",
        "catalog_item_id": "cable-base-xlpe-al-3c-240",
        "catalog_item_version": "2024.1"
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `CATALOG_ASSIGNED`; zaznaczenie: `seg/fde26ce612c7cc9c1d5f0411b5100d54/segment`.

#### 52. `update_element_parameters` — zmiana nazwy i mocy odbioru SN

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "update_element_parameters",
    "idempotency_key": "przyklad-52",
    "payload": {
      "element_ref": "load/9ed239f8488b67b6b57f7d55abb23954/sn",
      "parameters": {
        "name": "Odbiór przemysłowy",
        "p_mw": 0.5
      }
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `PARAMETERS_UPDATED`; zaznaczenie: `load/9ed239f8488b67b6b57f7d55abb23954/sn`.

#### 53. `set_connection_conditions` — warunki przyłączenia z dokumentu OSD

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "set_connection_conditions",
    "idempotency_key": "przyklad-53",
    "payload": {
      "moc_przylaczeniowa_mw": 2.0,
      "wymagany_cos_phi": 0.95,
      "tryb_pracy": "praca równoległa z siecią"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 1, usunięte 0; zdarzenia: `PARAMETERS_UPDATED`; zaznaczenie: brak.

#### 54. `refresh_snapshot` — odświeżenie migawki bez zmiany modelu

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "refresh_snapshot",
    "idempotency_key": "przyklad-54",
    "payload": {}
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 0, usunięte 0; zdarzenia: brak; zaznaczenie: brak.

#### 55. `delete_element` — usunięcie baterii kondensatorów

```json
{
  "project_id": "<id projektu>",
  "snapshot_base_hash": "<header.hash_sha256 migawki bazowej>",
  "operation": {
    "name": "delete_element",
    "idempotency_key": "przyklad-55",
    "payload": {
      "element_ref": "shunt/c84b420ba39265762c7fa4a4360f263b/cap"
    }
  }
}
```

Odpowiedź: HTTP 200; elementy utworzone 0, zmienione 0, usunięte 1; zdarzenia: `ELEMENT_DELETED`; zaznaczenie: brak.
<!-- GENEROWANE:przyklady-operacji:KONIEC -->

---

## 7. Zdarzenia domenowe

Zdarzenie niesie `event_seq` (kolejność w odpowiedzi, od 1), `event_type` i `element_id`.
Typ spoza rejestru jest błędem kontraktu (`backend/tests/enm/test_rejestr_zdarzen_domenowych.py`
skanuje wszystkie emisje w handlerach).

<!-- GENEROWANE:zdarzenia-domenowe:POCZATEK -->
Rejestr `DOMAIN_EVENT_TYPES` liczy **65** typów:

- `AUX_LOAD_CREATED`
- `BAY_EQUIPMENT_SET`
- `BESS_INVERTER_CREATED`
- `BESS_SOURCE_CREATED`
- `BRANCH_CREATED`
- `BRANCH_POINT_CREATED`
- `BUS_CREATED`
- `BUS_NN_CREATED`
- `CATALOG_ASSIGNED`
- `CATALOG_CLEARED`
- `CT_CREATED`
- `CUT_NODE_CREATED`
- `DEVICES_CREATED_NN`
- `DEVICES_CREATED_SN`
- `ELEMENT_DELETED`
- `ELEMENT_REATTACHED_TO_FIELD`
- `FIELDS_CREATED_NN`
- `FIELDS_CREATED_SN`
- `FIELD_DEVICE_CREATED_SN`
- `FIELD_DEVICE_UPDATED_SN`
- `FIELD_TERMINAL_CREATED_SN`
- `FIELD_UPDATED_SN`
- `FW_INVERTER_CREATED`
- `FW_SOURCE_CREATED`
- `GENERATOR_SN_CREATED`
- `GENSET_CREATED`
- `GPZ_LINE_FIELD_CREATED_SN`
- `GPZ_SECTION_ADDED`
- `GPZ_SECTION_DELETED`
- `GPZ_SECTION_UPDATED`
- `LOAD_SN_CREATED`
- `LOGICAL_VIEWS_UPDATED`
- `MEASUREMENT_SECONDARY_CIRCUIT_SET`
- `NN_CABLE_LAYING_CONDITIONS_SET`
- `NN_CABLE_SEGMENT_CREATED`
- `NN_FEEDER_ELEMENT_COPIED`
- `NN_LOAD_CREATED`
- `NN_SECTION_COUPLER_CREATED`
- `NN_SOURCE_FIELD_CREATED`
- `NN_SWITCH_DEVICE_CREATED`
- `NOP_CLEARED`
- `NOP_SET`
- `PARAMETERS_UPDATED`
- `PORTS_CREATED`
- `PROTECTION_CREATED`
- `PROTECTION_SETTINGS_UPDATED`
- `PV_INVERTER_CREATED`
- `RECONNECTED_GRAPH`
- `RING_CONNECTED`
- `SEGMENTS_MERGED`
- `SEGMENT_SPLIT`
- `SHUNT_COMPENSATOR_CREATED`
- `SOURCE_CREATED`
- `STATION_APPENDED_ON_ENDPOINT`
- `STATION_CREATED`
- `SUBSTATION_CREATED`
- `SURGE_ARRESTER_CREATED`
- `SWITCH_CLOSED`
- `SWITCH_INSERTED`
- `SWITCH_OPENED`
- `TAP_CHANGER_SET`
- `TRANSFORMER_CREATED`
- `TR_CREATED`
- `UPS_CREATED`
- `VT_CREATED`
<!-- GENEROWANE:zdarzenia-domenowe:KONIEC -->

---

## 8. Historia zmian

| Wersja | Data | Zmiana |
|---|---|---|
| 1.0.0 | 2026-02-17 | Dokument pisany ręcznie (nazwy, przykłady, schematy, zdarzenia). |
| 2.0.0 | 2026-10-22 | Dokument przepisany jako widok rejestru (karta MENU-KANON, V12K-351): wersja 1.0.0 opisywała część operacji (niektóre dwukrotnie), wymieniała operacje skasowane i fikcyjne, miała przykłady z polami, których żaden handler nie czyta, odsyłała do nieistniejącego modułu Pydantic i opisywała fikcyjny enum zdarzeń. Bloki generowane z kodu, przykłady wykonywane przez API, test spójności z iniekcjami. |
| 2.1.0 | 2026-10-22 | Kształty obiektów zagnieżdżonych ładunku i skutki operacji w ciągach liniowych (`line_runs`) jako bloki generowane; przykład stacji końcowej bez kluczy spoza kontraktu (`station.station_name` — nazwa, której operacja nie czyta). |
