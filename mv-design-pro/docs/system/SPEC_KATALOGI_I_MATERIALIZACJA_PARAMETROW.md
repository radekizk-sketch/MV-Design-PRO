# SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW

Status: wiazacy dla aktywnego kodu.

Kod:
- `backend/src/network_model/catalog/types.py`
- `backend/src/network_model/catalog/materialization.py`
- `backend/src/network_model/catalog/repository.py`
- `backend/src/network_model/catalog/governance.py`
- `backend/src/application/catalog_governance/service.py`
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

Governance biblioteki typow (P13b, eksport/import/wersjonowanie; spisane 2026-09-09,
karta ARCHIWUM-CANONICAL-COMPLIANCE-2, z faktycznego zachowania kodu — repo > specy):
- manifest biblioteki (id, nazwa, producent, seria, rewizja, wersja schematu, znacznik
  czasu, odcisk SHA-256) jest niemutowalny (`@dataclass(frozen=True)`) i deterministyczny
  — egzekwuje: `network_model/catalog/governance.py::TypeLibraryManifest`,
  `TypeLibraryExport.to_canonical_json`, `compute_fingerprint`; pin:
  `tests/network_model/catalog/test_governance.py::test_fingerprint_is_deterministic`,
  `test_canonical_json_is_deterministic`, `test_manifest_to_dict_preserves_order`,
- eksport sortuje kazda kategorie typow deterministycznie (nazwa -> id) przed policzeniem
  odcisku — egzekwuje: `governance.py::sort_types_deterministically`, wolane z
  `application/catalog_governance/service.py::CatalogGovernanceService.export_type_library`;
  pin: `test_governance.py::test_sort_types_deterministically`,
  `test_export_deterministic_ordering`, `test_export_determinism_with_real_data`,
- import w trybie MERGE (domyslny) wylacznie dodaje nowe typy; istniejacy `id` jest
  pomijany, zero nadpisan — egzekwuje:
  `catalog_governance/service.py::CatalogGovernanceService.import_type_library`; pin:
  `test_governance.py::test_import_merge_skips_existing`,
- import w trybie REPLACE jest blokowany (wyjatek, zero zapisu), jesli ktorykolwiek typ
  jest w uzyciu (`type_ref` na galezi/transformatorze albo przypisanie aparatu na
  laczniku, w ktorymkolwiek projekcie) — regula "brak masowych migracji" z docstringu
  `governance.py` — egzekwuje: `service.py::CatalogGovernanceService.import_type_library`
  + `_get_types_in_use`; pin: `test_governance.py::test_import_replace_blocked_when_types_in_use`,
- HTTP: `GET /api/catalog/export`, `POST /api/catalog/import?mode=merge|replace` —
  egzekwuje: `api/catalog.py::export_type_library`, `import_type_library`,
- ten sam mechanizm (manifest/eksport/import/odcisk/MERGE-REPLACE) jest powielony
  rownolegle dla biblioteki zabezpieczen (P14b) — egzekwuje:
  `governance.py::ProtectionLibraryManifest`, `ProtectionLibraryExport`,
  `compute_protection_fingerprint`, `CatalogGovernanceService.export_protection_library`
  / `.import_protection_library`; pin:
  `tests/test_protection_library.py::test_protection_export_deterministic_fingerprint`,
  `test_protection_import_merge_adds_new_skips_existing`,
  `test_protection_import_merge_detects_conflicts`.

Poza zakresem powyzszej sekcji (zaimplementowane w innych modulach, nie w
`governance.py` ani jego wywolaniach): typ jako referencja na instancji (`type_ref`),
precedencja override>type_ref>instance i struktura pol LineType/CableType/TransformerType
— patrz `network_model/catalog/resolver.py`, `types.py`, `core/branch.py` oraz Catalog
Binding Rule w `CLAUDE.md`. Archiwalna pozycja BEZ dedykowanego testu na poziomie
governance: "typy wspoldzielone miedzy projektami" (w zarchiwizowanej liscie CT-002
status byl VERIFY, nigdy niepotwierdzony) — celowo NIE wpisana tu jako regula.

Niemutowalnosc typow katalogowych i brak edycji w UI (spisane 2026-09-09, karta
ARCHIWUM-CANONICAL-COMPLIANCE-2):
- kazdy rekord typu katalogowego jest `@dataclass(frozen=True)`; proba nadpisania pola
  rzuca `FrozenInstanceError` w czasie wykonania — egzekwuje:
  `network_model/catalog/types.py` (naglowek modulu: "All types are FROZEN
  (immutable)"; m.in. `LineType`, `CableType`, `TransformerType`, `SwitchEquipmentType`,
  `InverterType`, `ConverterType` i pozostale klasy typow w tym pliku); pin:
  `tests/test_catalog_layer.py::test_catalog_types_are_frozen`,
- `backend/src/api/catalog.py` wystawia dla definicji typow wylacznie odczyt
  (kilkadziesiat endpointow `GET .../*-types`); zero `PUT`/`PATCH` na definicje typu —
  jedyne zapisy zwiazane z katalogiem to import calej biblioteki (wyzej, dodaje/pomija
  cale rekordy, nie edytuje pol) i przypisanie/odlaczenie `type_ref` NA ELEMENCIE SIECI
  (`POST`/`DELETE .../branches/{id}/type-ref`, `.../transformers/{id}/type-ref`,
  `.../switches/{id}/equipment-type` — zmienia, ktory typ element referencjonuje, nie
  tresc typu) — egzekwowane brakiem operacji zapisu w `api/catalog.py` dla definicji typu,
- `frontend/src/ui/catalog/api.ts` lustrzanie: wylacznie `fetchXTypes()` (GET) oraz
  `exportTypeLibrary`/`importTypeLibrary` (biblioteka jako calosc); zero funkcji edycji
  pojedynczego typu — patrz `docs/ui/UI_CATALOG_ENGINEERING_WORKFLOW.md` sekcja
  "Readonly — uzasadnienie",
- proba odlaczenia katalogu od elementu TECHNICZNEGO (materializowanego), ktory go
  wymaga, jest odrzucana kodem `catalog.clear_forbidden` — pokrewna bramka chroniaca
  integralnosc danych katalogowych przed usunieciem bez zastapienia — egzekwuje:
  `enm/domain_operations.py::assign_catalog_to_element`; pin:
  `tests/enm/test_catalog_materialization_persistence.py::test_reject_clear_catalog_for_physical_branch`,
  `tests/enm/test_domain_operations_flexible_sequences.py::test_sequence_reject_clear_and_reassign_catalog_keeps_snapshot_contract_valid`.
