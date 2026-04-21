# CATALOG-FIRST DOMAIN OPERATIONS SPEC

## Zasada
Operacja tworząca element krytyczny musi zawierać referencję katalogową (`catalog_ref`/`catalog_binding`/`catalog_item_id`).

## Objęte operacje (wdrożone walidacje frontend)
- `continue_trunk_segment_sn` -> `catalog_binding` wymagany
- `start_branch_segment_sn` -> `catalog_ref` wymagany
- `insert_station_on_segment_sn` -> `catalog_ref` wymagany
- `add_transformer_sn_nn` -> `catalog_ref` wymagany
- `insert_section_switch_sn` -> `catalog_binding` wymagany
- `add_converter_source` -> `catalog_binding.catalog_item_id` wymagany
- `add_converter_source` -> `catalog_binding.catalog_item_id` wymagany

## Migracja
- `assign_catalog_to_existing_legacy_element` pozostaje ścieżką naprawczą dla obiektów historycznych.
