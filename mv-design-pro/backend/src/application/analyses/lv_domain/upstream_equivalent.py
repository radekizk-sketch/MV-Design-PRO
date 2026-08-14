"""Kotwica SN domeny nN — `UpstreamEquivalentSnapshot` (karta T5b, §0
rozstrzygnięcie 1, docs/nn/KONCEPCJA_LOD_NN_2026-08.md, werdykt właściciela).

ZASADA FUNDAMENTALNA werdyktu: "GRANICA WIZUALNA = GRANICA DOMENY
NAPIĘCIOWEJ I PROJEKCJI. Nie oznacza ona przerwania zależności obliczeniowej.
Każda domena niższego napięcia otrzymuje jawny, wersjonowany upstream
electrical equivalent wynikający z TEGO SAMEGO ENM, scenariusza i stanu
łączeniowego." Ten moduł jest DOKŁADNIE tym równoważnikiem: L2
(`LvDomainView`) chowa świat SN za kompaktowym chipem, ale kotwica pod nim
niesie PEŁNY, immutable snapshot z parametrami, którymi solver pętli zwarcia
nN faktycznie liczy stronę SN (`application.analyses.fault_loop.service`) —
ZERO nowej fizyki, wyłącznie liczby z ISTNIEJĄCYCH funkcji solvera.

Reuse-mapa (dowód "zero nowej fizyki"):
- `compute_upstream_hv_thevenin` (fault_loop.service, karta T5b: wydzielone
  z `_upstream_thevenin_lv_component` — TA SAMA funkcja liczy Z1 dla pętli
  zwarcia I dla tej kotwicy) → Z1 w Ω na szynie HV transformatora.
- `network_model.solvers.short_circuit_core.compute_ikss` (solver IEC 60909,
  NIETKNIĘTY) → Ik'' z Z1 i współczynnika napięciowego c.
- `network_model.core.voltage_factor.c_for_node` (JEDNO źródło tabeli c wg
  IEC 60909-0 Tab.1, już używane przez `TransformerBranch.
  get_voltage_factor_c_max/min` i `short_circuit_binding.py`) → c(MAX/MIN).
- `enm.mapping.build_zero_sequence_zbus` (sieć Z0 solvera zwarciowego dla
  zwarć 1F/2F+G, NIETKNIĘTA) → Z0 na szynie HV, best-effort (patrz
  `_hv_zero_sequence_ohm`).
- `enm.hash.compute_switching_snapshot_hash`/`compute_enm_hash` (V12S-010,
  NIETKNIĘTE) → `operating_state_id`/`model_hash`.

Sk'' = √3·Un·Ik'' jest tożsamością definicyjną (S=√3·U·I), TĄ SAMĄ zależnością
co `short_circuit_core.compute_post_fault_quantities.sk_mva` — liczona tu na
poziomie aplikacji (nie w solverze), bo reszta tamtej funkcji (Ith/Ip/kappa)
wymaga czasu trwania zwarcia, który nie dotyczy stacjonarnej kotwicy
równoważnika; jedyny nietrywialny krok fizyczny (Ik'' z Z_equiv, solver IEC
60909) pozostaje w `compute_ikss`, reużyty wprost.
"""

from __future__ import annotations

import math
from typing import Any, Literal
from uuid import NAMESPACE_URL, uuid5

from application.analyses.fault_loop.service import (
    _find_station as find_station,  # reeksport publiczny — reużyty też w graph_view.py
)
from application.analyses.fault_loop.service import compute_upstream_hv_thevenin
from enm.hash import compute_enm_hash, compute_switching_snapshot_hash
from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
from enm.models import EnergyNetworkModel, Substation, Transformer
from network_model.core.voltage_factor import c_for_node
from network_model.solvers.short_circuit_core import (
    ShortCircuitType,
    build_zbus,
    compute_ikss,
)

from .graph_view import voltage_level_id

Scenario = Literal["MAX", "MIN"]

# Namespace deterministycznych UUID5 dla `calculation_run_id` — ten sam wzorzec
# co `application/study_scenario/models.py` (NAMESPACE_STUDY/SCENARIO/RUN):
# uuid5(namespace, klucz kanoniczny) zamiast losowego uuid4, bo snapshot MUSI
# być deterministyczny (Determinism Rule, CLAUDE.md §7) — te same wejścia
# (case_id, stacja, transformator, scenariusz, stan łączeniowy, hash modelu)
# dają IDENTYCZNY `calculation_run_id`, bez potrzeby zapisu w bazie.
_NAMESPACE_LV_DOMAIN_SNAPSHOT = uuid5(NAMESPACE_URL, "mv-design-pro:lv-domain:upstream-equivalent")


def _resolve_transformer(
    enm: EnergyNetworkModel, station: Substation, transformer_ref: str | None
) -> tuple[Transformer | None, list[str]]:
    """Wybierz transformator stacji — jawny `transformer_ref`, albo domyślnie
    PIERWSZY posortowany po `ref_id` rosnąco (determinizm, ten sam wzorzec co
    frontend `findLvIncomerEdgeForStationTransformers`,
    `sld/v3/electrical/viewModel.ts`) — istotne dla stacji WIELOŹRÓDŁOWYCH
    (2×TR+sprzęgło, karta T5b §0 pkt 4).
    """
    if transformer_ref is not None:
        trafo = next((t for t in enm.transformers if t.ref_id == transformer_ref), None)
        if trafo is None:
            return None, ["transformer"]
        if trafo.ref_id not in set(station.transformer_refs or ()):
            return None, ["transformer_not_in_station"]
        return trafo, []

    for ref in sorted(set(station.transformer_refs or ())):
        trafo = next((t for t in enm.transformers if t.ref_id == ref), None)
        if trafo is not None:
            return trafo, []
    return None, ["transformer"]


def _hv_zero_sequence_ohm(
    enm: EnergyNetworkModel, hv_node_id: str
) -> tuple[complex | None, str | None]:
    """Z0 sieci SN w węźle HV transformatora — best effort, fail-closed.

    Reuse: `enm.mapping.build_zero_sequence_zbus` (TA SAMA sieć Z0, której
    solver zwarciowy używa dla zwarć 1F/2F+G) + `short_circuit_core.build_zbus`
    WYŁĄCZNIE dla indeksu węzła/z_base (deterministyczne, dzielą kolejność
    węzłów z `build_zero_sequence_zbus` — udokumentowane wprost w jej
    docstringu). Zwraca `(None, powód_pl)` gdy sieć zerowa jest osobliwa
    (brak drogi powrotu prądu zerowego do ziemi — sieć izolowana bez B0) —
    NIGDY fabrykowane zero.
    """
    try:
        graph = map_enm_to_network_graph(enm)
    except ValueError:
        return None, "Topologia sieci SN niepoprawna — Z0 nieobliczalne."
    if hv_node_id not in graph.nodes:
        return None, "Szyna HV poza rozwiązywalną siecią — Z0 nieobliczalne."
    try:
        builder, _z1_bus = build_zbus(graph)
    except (ValueError, ZeroDivisionError):
        return None, "Sieć SN osobliwa — Z0 nieobliczalne."
    node_index = builder.node_id_to_index.get(hv_node_id)
    if node_index is None:
        return None, "Szyna HV poza rozwiązywalną siecią — Z0 nieobliczalne."
    try:
        z0_bus = build_zero_sequence_zbus(enm, graph)
    except ValueError as exc:
        return None, str(exc)
    z_base_ohm = builder.get_zbase_ohm(hv_node_id)
    z0_ohm = complex(z0_bus[node_index, node_index]) * z_base_ohm
    return z0_ohm, None


def build_upstream_equivalent_snapshot(
    enm: EnergyNetworkModel,
    case_id: str,
    station_ref: str,
    *,
    scenario: Scenario = "MAX",
    transformer_ref: str | None = None,
) -> dict[str, Any]:
    """Zbuduj `UpstreamEquivalentSnapshot` — kotwica SN domeny nN (L2).

    Pola DOKŁADNIE wg werdyktu (§0 pkt 1, sekcja "L2 kotwica"): sourceNodeId,
    voltageLevelId, Uth, Sk″, Z1/R1/X1, Z0 (jeśli wymagane), R/X, scenarioId,
    operatingStateId, calculationRunId, modelRevision/hash — nazwy pól JSON w
    snake_case (konwencja tego API, patrz np. `nn_bus_ref`/
    `transformer_impedance_ohm` w `fault_loop.service`); znaczenie identyczne
    z listą werdyktu (komentarze przy każdym polu wiążą je z nazwą werdyktu).
    """
    station = find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "missing_data": ["station"],
            "station_ref": station_ref,
            "case_id": case_id,
        }

    trafo, missing = _resolve_transformer(enm, station, transformer_ref)
    if trafo is None:
        return {
            "status": "brak danych",
            "missing_data": missing,
            "station_ref": station_ref,
            "station_name": station.name,
            "case_id": case_id,
        }

    hv_equiv, missing = compute_upstream_hv_thevenin(enm, trafo)
    if hv_equiv is None:
        return {
            "status": "brak danych",
            "missing_data": missing,
            "station_ref": station_ref,
            "station_name": station.name,
            "case_id": case_id,
            "transformer_ref": trafo.ref_id,
        }

    c_factor = c_for_node(trafo.uhv_kv, scenario)
    un_hv_v = trafo.uhv_kv * 1000.0
    ikss_a = compute_ikss(
        un_v=un_hv_v,
        c_factor=c_factor,
        short_circuit_type=ShortCircuitType.THREE_PHASE,
        z_equiv=hv_equiv.z_hv_ohm,
    )
    sk_mva = (math.sqrt(3.0) * un_hv_v * ikss_a) / 1_000_000.0
    uth_kv = c_factor * trafo.uhv_kv

    r1_ohm = hv_equiv.z_hv_ohm.real
    x1_ohm = hv_equiv.z_hv_ohm.imag
    rx_ratio = (r1_ohm / x1_ohm) if x1_ohm != 0 else None

    z0_ohm, z0_missing_reason_pl = _hv_zero_sequence_ohm(enm, hv_equiv.hv_bus_ref)

    operating_state_id = compute_switching_snapshot_hash(enm)
    model_hash = compute_enm_hash(enm)
    calculation_run_id = str(
        uuid5(
            _NAMESPACE_LV_DOMAIN_SNAPSHOT,
            f"{case_id}:{station_ref}:{trafo.ref_id}:{scenario}:{operating_state_id}:{model_hash}",
        )
    )

    return {
        "status": "OK",
        "case_id": case_id,
        "station_ref": station_ref,
        "station_name": station.name,
        "transformer_ref": trafo.ref_id,
        "source_node_id": hv_equiv.hv_bus_ref,  # werdykt: sourceNodeId
        "voltage_level_id": voltage_level_id(trafo.uhv_kv),  # werdykt: voltageLevelId
        "voltage_kv": trafo.uhv_kv,
        "uth_kv": uth_kv,  # werdykt: Uth
        "sk_mva": sk_mva,  # werdykt: Sk″
        "ikss_ka": ikss_a / 1000.0,  # addytywne: Ik″ towarzyszące Sk″
        "z1_ohm": {"r": r1_ohm, "x": x1_ohm},  # werdykt: Z1/R1/X1
        "z0_ohm": (
            {"r": z0_ohm.real, "x": z0_ohm.imag} if z0_ohm is not None else None
        ),  # werdykt: Z0
        "z0_missing_reason_pl": z0_missing_reason_pl,
        "rx_ratio": rx_ratio,  # werdykt: R/X
        "c_factor": c_factor,  # WHITE BOX: współczynnik c faktycznie użyty dla scenario_id
        "scenario_id": scenario,  # werdykt: scenarioId
        "operating_state_id": operating_state_id,  # werdykt: operatingStateId
        "calculation_run_id": calculation_run_id,  # werdykt: calculationRunId
        "model_revision": enm.header.revision,  # werdykt: modelRevision
        "model_hash": model_hash,  # werdykt: /hash
        "missing_data": [],
        "note_pl": (
            "Równoważnik Thevenina sieci SN w punkcie HV transformatora — "
            "granica wizualna domeny nN (L2) jest granicą domeny napięciowej "
            "i projekcji, NIE przerwaniem zależności obliczeniowej: ten "
            "snapshot jest dokładnie tym wejściem, którym solver pętli "
            "zwarcia nN liczy stronę SN (application.analyses.fault_loop)."
        ),
    }
