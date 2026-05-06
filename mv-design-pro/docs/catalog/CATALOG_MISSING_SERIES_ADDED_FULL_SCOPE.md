# CATALOG MISSING SERIES — ADDED FULL SCOPE (BIEĹ»ĄCY benchmark)

## UzupeĹ‚nione
- PrzejĹ›cie `CatalogBrowser` z mockĂłw na API dla przestrzeni:
  - `LINIA_SN` -> `LINE`
  - `KABEL_SN` -> `CABLE`
  - `TRAFO_SN_NN` -> `TRANSFORMER`
  - `APARAT_SN`, `APARAT_NN` -> `SWITCH_EQUIPMENT`

## Braki do peĹ‚nego domknięcia OSD-grade
- Listowanie i mapowanie dla: `CT`, `VT`, `ZABEZPIECZENIE`, `ZRODLO_NN_PV`, `ZRODLO_NN_BESS`, `OBCIAZENIE`, `KABEL_NN`.
- PeĹ‚ne typoszeregi i kontrakty wersjonowania katalogĂłw dla ww. namespace.

## Mapowanie techniczne
- Klasa -> Namespace -> API -> UI -> materializacja:
  - Linia/kabel -> `LINIA_SN`/`KABEL_SN` -> `fetchTypesByCategory` -> `CatalogBrowser` -> `assign_catalog_to_element`.
  - Transformator -> `TRAFO_SN_NN` -> `fetchTypesByCategory` -> formularze stacji/trafo -> materialized params.

