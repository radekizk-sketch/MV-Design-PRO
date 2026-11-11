# CATALOG-FIRST DOMAIN OPERATIONS SPEC

## Zasada
Operacja tworząca element krytyczny musi zawierać referencję katalogową. Klucze, które
operacja przyjmuje, są polami rejestru `CANONICAL_OPERATIONS`
(`docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md` §4) — równymi kluczom czytanym przez handler.

## Trzy warstwy tej samej reguły
- **Formularz** (`frontend/src/ui/network-build/forms/catalogFirstRules.ts`,
  `validateCatalogFirst`): segmenty SN (`continue_trunk_segment_sn`, `start_branch_segment_sn`,
  `connect_secondary_ring_sn`) — `segment.catalog_binding`; stacja na odcinku
  (`insert_station_on_segment_sn`) — `transformer.catalog_binding`; punkty rozgałęzienia,
  łącznik sekcyjny, transformator SN/nN (`add_transformer_sn_nn`) i GPZ (`add_grid_source_sn`,
  albo jawny ekwiwalent ręczny) — `catalog_binding`; źródło przekształtnikowe
  (`add_converter_source`), przekładniki (`add_ct`, `add_vt`), zabezpieczenie (`add_relay`),
  operacje nN (`add_nn_cable_segment`, `add_nn_switch_device`, `add_nn_section_coupler`,
  `add_nn_load` — albo jawny tryb ekspercki) — pozycja katalogu wg reguły w pliku.
- **Brama API** (`backend/src/api/domain_ops_policy.py`, `API_CATALOG_GATE_INVENTORY`):
  referencja spoza katalogu modelu → HTTP 422 `catalog.item_not_found`; każda pozycja bramy jest
  kluczem czytanym przez handler (test
  `backend/tests/api/test_brama_katalogowa_api_inwentarz.py::test_pozycja_bramy_to_klucz_czytany_przez_handler`).
- **Handler** (`backend/src/enm/domain_operations.py`, `_require_catalog_ref`): brak referencji →
  `catalog.ref_required`.

## Zmiana pozycji katalogu istniejącego elementu
`assign_catalog_to_element` — materializuje tabliczkę nowej pozycji tą samą regułą co tworzenie
elementu; zdjęcie katalogu z elementu technicznego — odmowa `catalog.clear_forbidden`.
