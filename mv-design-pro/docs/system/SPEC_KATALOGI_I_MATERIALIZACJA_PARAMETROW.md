# SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW

Status: wiazacy dla aktywnego kodu.

Kod:
- `backend/src/network_model/catalog/types.py`
- `backend/src/network_model/catalog/materialization.py`
- `backend/src/network_model/catalog/repository.py`
- `backend/src/api/catalog.py`
- `backend/src/api/domain_ops_policy.py`
- `backend/src/enm/domain_operations.py`
- `backend/src/enm/domain_operations_v2.py`

Kontrakt katalogowy:
- kanoniczny binding to `CatalogBinding(catalog_namespace, catalog_item_id, catalog_item_version, materialize, snapshot_mapping_version)`,
- polityka API wykonuje preflight katalogowy przed `POST /api/cases/{case_id}/enm/domain-ops`,
- aktywna lista operacji objetych bramka katalogowa jest utrzymywana w `backend/src/api/domain_ops_policy.py`.

Stan aktywny:
- domyslny katalog MV jest budowany przez `get_default_mv_catalog()`,
- aktywnie czytane namespace i typy obejmuja co najmniej: linie SN, kable SN, transformatory SN/nN, aparaty SN, zrodla systemowe GPZ, PV, BESS,
- `add_grid_source_sn` jest objete ta sama bramka katalogowa co glowny tor SN,
- kontrakty materializacji sa zdefiniowane szerzej niz aktualnie wypelniony katalog; czesc namespace pozostaje pusta w repozytorium domyslnym, w szczegolnosci obszar ochrony.

Materializacja:
- dla odcinkow SN `continue_trunk_segment_sn`, `start_branch_segment_sn` i `connect_secondary_ring_sn` zapisuje `materialized_params` na elemencie oraz kopiuje pola solverowe do instancji,
- dla transformatorow `insert_station_on_segment_sn`, `add_transformer_sn_nn` i `assign_catalog_to_element` zapisuje `materialized_params` oraz pola `sn_mva`, `uk_percent`, `uhv_kv`, `ulv_kv`,
- dla zrodel SN `add_grid_source_sn` zapisuje `materialized_params` oraz pola solverowe `voltage_rating_kv`, `sk3_mva`, `ik3_ka`, `rx_ratio` (scenariusz MAX) oraz `sk3_min_mva`, `ik3_min_ka`, `rx_ratio_min` (scenariusz MIN, CV-4.3 K7, IEC 60909-0:2016 §6.2.1 eq. 6 z c_min — 3 pola opcjonalne, `None` = OSD nie podal danych warunkow przylaczenia dla scenariusza minimalnego; razem 7 pol solverowych),
- dla PV i BESS materializacja jest wykonywana w `domain_operations_v2.py` i utrwalana na generatorze,
- `assign_catalog_to_element` wykonuje rematerializacje dla branches, transformers i sources; proba usuniecia katalogu z elementu technicznego zwraca `catalog.clear_forbidden`,
- odpowiedz operacji domenowej zwraca dodatkowo przekroj `materialized_params` dla UI,
- `parameter_source` i jawne nadpisania parametrow sa utrwalane w snapshot tam, gdzie operacja lub aktualizacja wprowadza stan `OVERRIDE`.

Granice aktualnego wdrozenia:
- `insert_section_switch_sn` nie wykonuje pelnej, analogicznej materializacji rozcietych odcinkow i odcinka lacznika,
- `branch_points`, `CT`, `VT` i `relay` przechowuja `catalog_ref`, ale nie maja tak samo domknietej sciezki materializacji jak odcinki, transformatory, zrodla SN, PV i BESS,
- solver nie czyta koperty odpowiedzi `materialized_params`; korzysta z pol instancyjnych ustawionych podczas operacji,
- aktywne endpointy `type-ref` i `equipment-type` w `backend/src/api/catalog.py` nadal obchodza kanoniczny tor `domain-ops`.
