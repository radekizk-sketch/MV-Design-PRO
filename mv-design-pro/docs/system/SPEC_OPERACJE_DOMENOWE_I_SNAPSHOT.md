# SPEC_OPERACJE_DOMENOWE_I_SNAPSHOT

Status: wiazacy dla aktywnego toru zapisu.

Kod:
- `backend/src/api/main.py`
- `backend/src/api/enm.py`
- `backend/src/api/domain_ops_policy.py`
- `backend/src/enm/domain_operations.py`
- `backend/src/enm/domain_operations_v2.py`
- `backend/schemas/domain_op_response_schema.json`

Aktywna sciezka mutacji:
- jedyny aktywny endpoint zapisu ENM to `POST /api/cases/{case_id}/enm/domain-ops`,
- `PUT /enm`, `POST /enm/ops`, `POST /enm/ops/batch` i `POST /wizard/apply-step` sa produkcyjnie blokowane w `backend/src/api/enm.py`,
- `backend/src/api/domain_operations.py` pozostaje w repo, ale nie jest montowany.

Warstwa operacji:
- `domain_operations.py` prowadzi glowny tor SN oraz operacje `assign_catalog_to_element`, `update_element_parameters`, `delete_element`,
- `domain_operations_v2.py` prowadzi wybrane operacje NN, PV, BESS, CT, VT i relay,
- aktywna publiczna powierzchnia V11 uzywa wylacznie nazw kanonicznych operacji.

Odpowiedz kanoniczna:
- `snapshot`
- `logical_views`
- `readiness`
- `fix_actions`
- `changes`
- `selection_hint`
- `audit_trail`
- `domain_events`
- `materialized_params`
- `layout`

Reguly aktualne:
- `snapshot_base_hash` chroni zapis przed praca na nieaktualnej migawce,
- `backend/src/api/domain_ops_policy.py` wymusza `catalog_binding` dla kanonicznych operacji katalog-first, w tym `add_grid_source_sn`, glownych operacji toru SN, transformatorow, PV, BESS oraz wybranych operacji wstawieniowych SN,
- kanoniczny payload FE jest zagniezdzony tam, gdzie wymaga tego domena:
  - `continue_trunk_segment_sn`, `start_branch_segment_sn`, `connect_secondary_ring_sn` uzywaja `segment`,
  - `insert_station_on_segment_sn` uzywa `station`, `sn_fields`, `transformer`, `nn_block`,
- `add_converter_source` uzywa kanonicznego kontraktu źródła przekształtnikowego,
  - `set_normal_open_point` wskazuje `switch_ref`,
- operacje katalog-first utrwalaja `materialized_params` na elemencie snapshot oraz przenosza kluczowe pola solverowe do instancji,
- `assign_catalog_to_element` materializuje i utrwala dane dla branches, transformers i sources; proba `clear` na elemencie technicznym zwraca `catalog.clear_forbidden`,
- `update_element_parameters` nadal moze nadpisywac wiele pol instancyjnych, w tym pola solverowe i `materialized_params`,
- deterministyczne `ref_id` sa tworzone z ziaren operacji i topologii.

Granice aktualnego stanu:
- aktywny frontend zapisuje przez `domain-ops` i deleguje do jednego zbioru operacji kanonicznych,
- guard repo hygiene pilnuje, aby aliasy i stare write-pathy nie wracaly do aktywnej powierzchni FE ani testow E2E.
