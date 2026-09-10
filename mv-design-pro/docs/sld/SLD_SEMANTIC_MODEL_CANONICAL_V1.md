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

- ~~unia `SldElement` (projekcja modelu na SLD) nie ma wariantu węzła granicznego~~ — pin
  `backend/tests/test_sld_projection.py::test_connection_node_marker_not_in_projection` i
  ~~pole `is_connection_node` w `SldNodeSymbolDTO`~~ — pin
  `backend/tests/application/sld/test_sld_parity.py::test_node_symbol_no_is_connection_node_field`:
  OBA zeszły razem z kodem w W1 (2026-09-09) (kasacja `network_model/sld_projection.py` i
  `application/sld/**` z bramką wskrzeszenia `legacy_public_path_guard`). Do wycinka W7 reguła 6 na
  poziomie SLD ma WYŁĄCZNIE egzekucję pośrednią przez model (poniżej) — bez pinu na projekcji.

**KOREKTA 2026-09-09 (mapa domknięcia produktu, `../plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §6 w. 8):**
oba piny powyżej leżą na pakiecie `backend/src/application/sld/**` i `backend/src/network_model/sld_projection.py`,
który NIE ma produkcyjnego konsumenta — jedyny importer (`application/network_wizard/service.py`) nie jest
wołany przez żadną trasę API ani ekran (pomiar 2026-09-09). Żywa ścieżka SLD SN to projekcja po stronie
klienta (`frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts`, `frontend/src/ui/sld/v3/electrical/terminalGraph.ts`),
która nie ma węzła granicznego Z KONSTRUKCJI: `EnergyNetworkModel` nie zna takiego elementu
(`scripts/pcc_zero_guard.py` pilnuje rdzenia), więc adapter nie ma go z czego wyprowadzić. Piny są zatem
prawdziwe dla martwego kodu, a reguła 6 na żywej ścieżce jest egzekwowana pośrednio (przez model), nie
testem projekcji. Docelowo (wycinek W7 mapy): projekcja semantyczna ENM → `SldSemanticGraphV1` po stronie
backendu z pinem reguły 6 na TEJ ścieżce. Martwy pakiet `application/sld/**` SKASOWANY w W1 (2026-09-09)
z bramką wskrzeszenia (`scripts/legacy_public_path_guard.py::check_w1_legacy_persistence_resurrection`).

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
