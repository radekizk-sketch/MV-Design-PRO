# UX_KREATOR_SIECI_SN_OD_GPZ

Status: wiazacy dla aktualnego kreatora.

Kod:
- `frontend/src/ui/network-build/forms/ContinueTrunkForm.tsx`
- `frontend/src/ui/network-build/forms/InsertStationForm.tsx`
- `frontend/src/ui/network-build/forms/StartBranchForm.tsx`
- `frontend/src/ui/network-build/forms/InsertSectionSwitchForm.tsx`
- `frontend/src/ui/network-build/forms/ConnectRingForm.tsx`
- `frontend/src/ui/network-build/forms/AddTransformerForm.tsx`
- `frontend/src/ui/network-build/forms/AddGridSourceForm.tsx`
- `frontend/src/ui/network-build/forms/AddOzeSourceForm.tsx`

Aktywny przebieg pracy:
1. dodanie lub wskazanie zrodla zasilania,
2. dobor katalogu i utworzenie odcinka SN,
3. wstawienie stacji na odcinku lub rozpoczecie odgalezienia,
4. dobor transformatora, PV, BESS albo odbioru po stronie NN,
5. odczyt `readiness`, `fix_actions` i `selection_hint` po kazdej operacji.

Reguly:
- formularze emituja payload operacji domenowej, a nie lokalne mutacje grafu,
- kreator korzysta z danych zwrotnych backendu jako jedynej prawdy po zapisie,
- katalog jest walidowany lokalnie i dodatkowo po stronie backendu.

Kanoniczne payloady FE:
- `add_grid_source_sn`: `voltage_kv`, `catalog_binding`, opcjonalnie `source_name`, `sk3_mva`, `rx_ratio`, `notes`,
- `continue_trunk_segment_sn`: `trunk_id`, `from_terminal_id`, `segment`,
- `insert_station_on_segment_sn`: `segment_id`, `insert_at`, `station`, `sn_fields`, `transformer`, `nn_block`,
- `start_branch_segment_sn`: `from_ref`, `segment`,
- `insert_section_switch_sn`: `segment_id`, `insert_at`, `switch_type`, `normal_state`, `catalog_binding`,
- `connect_secondary_ring_sn`: `from_bus_ref`, `to_bus_ref`, `segment`, a punkt NOP jest ustawiany osobna operacja `set_normal_open_point` z `switch_ref`,
- `add_transformer_sn_nn`: `hv_bus_ref`, `lv_bus_ref`, `catalog_binding`,
- `add_converter_source`: `bus_nn_ref`, `station_ref`, `placement`, `source_technology` oraz kanoniczny `catalog_binding`.

Granice aktualnego stanu:
- backend i frontend uzywaja jednego zbioru nazw kanonicznych operacji, wiec kreator jest zgodny ze slownikiem domenowym V11,
- `insert_section_switch_sn` nie daje tak kompletnej materializacji jak operacje odcinkow i transformatorow,
- kreator nie ma jeszcze osobnego widoku kompletosci katalogowej i konfliktow dla wszystkich klas elementow.
