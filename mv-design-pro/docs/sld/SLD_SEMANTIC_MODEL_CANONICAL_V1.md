# SLD Semantic Model — Canonical V1

## Cel

Dokument definiuje kanoniczny model semantyczny SLD niezależny od geometrii renderera.

## Najważniejsze reguły

1. `nodeType: STATION_SN_NN` + `stationKind`.
2. `nodeType: GENERATOR` + `generatorKind`.
3. Topologia tylko w relacjach krawędzi, nie w atrybutach node.
4. Port semantyczny: tylko `id` + `role`.
5. Jawne kontenery semantyczne (`containers`) dla struktur stacyjnych.
6. BoundaryNode (węzeł przyłączenia) nigdy jako węzeł/element tego kontraktu — wyłącznie
   nakładka interpretacyjna spoza `SldSemanticGraphV1`, dostawiana w warstwie analizy.

## Egzekucja reguły 6 (BoundaryNode)

Spisane 2026-09-09 (karta ARCHIWUM-CANONICAL-COMPLIANCE-2) z faktycznego zachowania
kodu — reguła ogólna (BoundaryNode wyłącznie w warstwie interpretacji, `BoundaryIdentifier`)
zostaje w `CLAUDE.md` § „BoundaryNode Prohibition Rule"; tu wyłącznie poziom SLD:

- unia `SldElement` (projekcja modelu na SLD) nie ma wariantu węzła granicznego —
  egzekwuje: `backend/src/network_model/sld_projection.py`; pin:
  `backend/tests/test_sld_projection.py::test_connection_node_marker_not_in_projection`
  (diagram po projekcji zawiera wyłącznie elementy `branch`/`bus`, zero markera węzła
  granicznego).
- symbol węzła w warstwie DTO nie ma pola `is_connection_node` — egzekwuje:
  `backend/src/application/sld/dtos.py::SldNodeSymbolDTO`; pin:
  `backend/tests/application/sld/test_sld_parity.py::test_node_symbol_no_is_connection_node_field`.

## Struktura kontraktu

- `SldSemanticGraphV1`
  - `nodes: SemanticNodeV1[]`
  - `edges: SemanticEdgeV1[]`
  - `containers: SemanticContainerV1[]`

## Relacja do warstw

- Snapshot/TopologyInput -> `SldSemanticGraphV1`
- `SldSemanticGraphV1` -> `LayoutInputGraphV1`
- `LayoutInputGraphV1` -> `LayoutResultV1`

## Status

Ten model jest kanonicznym kontraktem publicznym dla warstwy semantycznej SLD.
`VisualGraphV1` ma status przejściowy (legacy).
