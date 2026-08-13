# CATALOG MISSING SERIES — ADDED FULL SCOPE (BIEŻĄCY benchmark)

## Uzupełnione
- Przejście `CatalogBrowser` z mocków na API dla przestrzeni:
  - `LINIA_SN` -> `LINE`
  - `KABEL_SN` -> `CABLE`
  - `TRAFO_SN_NN` -> `TRANSFORMER`
  - `APARAT_SN`, `APARAT_NN` -> `SWITCH_EQUIPMENT`

## Braki do pełnego domknięcia OSD-grade
- Listowanie i mapowanie dla: `CT`, `VT`, `ZABEZPIECZENIE`, `ZRODLO_NN_PV`, `ZRODLO_NN_BESS`, `OBCIAZENIE`, `KABEL_NN`.
- Pełne typoszeregi i kontrakty wersjonowania katalogów dla ww. namespace.

## Mapowanie techniczne
- Klasa -> Namespace -> API -> UI -> materializacja:
  - Linia/kabel -> `LINIA_SN`/`KABEL_SN` -> `fetchTypesByCategory` -> `CatalogBrowser` -> `assign_catalog_to_element`.
  - Transformator -> `TRAFO_SN_NN` -> `fetchTypesByCategory` -> formularze stacji/trafo -> materialized params.

