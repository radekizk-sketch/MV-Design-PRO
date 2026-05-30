"""Build per-archetype SN station substrates and emit solver-true companions.

This script is the PROVENANCE for the numeric values the station-rozdzielnia v2
renderer displays. For each archetype (T1..T4) it assembles a minimal ENM-derived
:class:`NetworkGraph` — GPZ slack source → SN line → station SN busbar →
(transformer → nN busbar → nN loads + optional PV) — and runs the FROZEN
power-flow solver via :func:`compute_substrate_power_flow`. The resulting
companion payloads are the SINGLE source of truth for nN load power, PV
generation, power-flow direction and energisation in the renderer; the renderer
never recomputes them.

It performs NO physics itself: every numeric value comes from the frozen solver
(:func:`solve_power_flow_physics`). Run with ``python -m
src.application.reference_networks.station_archetype_substrate`` to print the four
companion payloads as JSON.

Layer: application provenance script. Frozen-core safe (read-only over solver
output).
"""

from __future__ import annotations

import json
from typing import Any

from src.application.reference_networks.sld_substrate_power_flow import (
    compute_substrate_power_flow,
)
from src.network_model.core.graph import (
    GraphBranch,
    GraphBus,
    GraphLoad,
    GraphSource,
    NetworkGraph,
)

# Branch impedances (ohm) used for the substrate graphs. Lines use a modest
# series impedance; the SN/nN transformer is modelled as a low-impedance branch
# so the solver carries real power across the transformation boundary. These are
# substrate inputs, not physics: the solver computes all flows.
_SN_LINE_R = 0.45
_SN_LINE_X = 0.90
_TRAFO_R = 0.02
_TRAFO_X = 0.40
_NN_FEEDER_R = 0.01
_NN_FEEDER_X = 0.02


def build_t1_graph() -> NetworkGraph:
    """T1 przelotowa: GPZ → SN busbar → (linia odpływowa) + (trafo → nN)."""
    return NetworkGraph(
        buses=[
            GraphBus("GPZ", 15.0, is_slack=True),
            GraphBus("SN_BUS", 15.0),
            GraphBus("LINE_OUT_END", 15.0),
            GraphBus("NN_BUS", 0.4),
            GraphBus("NN_F1", 0.4),
            GraphBus("NN_F2", 0.4),
            GraphBus("NN_PV", 0.4),
        ],
        branches=[
            GraphBranch("LINE-IN", "GPZ", "SN_BUS", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
            GraphBranch("LINE-OUT", "SN_BUS", "LINE_OUT_END", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
            GraphBranch("TRAFO", "SN_BUS", "NN_BUS", resistance_ohm=_TRAFO_R, reactance_ohm=_TRAFO_X),
            GraphBranch("NN-F1", "NN_BUS", "NN_F1", resistance_ohm=_NN_FEEDER_R, reactance_ohm=_NN_FEEDER_X),
            GraphBranch("NN-F2", "NN_BUS", "NN_F2", resistance_ohm=_NN_FEEDER_R, reactance_ohm=_NN_FEEDER_X),
            GraphBranch("NN-PV", "NN_BUS", "NN_PV", resistance_ohm=_NN_FEEDER_R, reactance_ohm=_NN_FEEDER_X),
        ],
        loads=[
            GraphLoad("LINE_OUT_END", active_power_kw=820.0, reactive_power_kvar=250.0),
            GraphLoad("NN_F1", active_power_kw=260.0, reactive_power_kvar=85.0),
            GraphLoad("NN_F2", active_power_kw=180.0, reactive_power_kvar=60.0),
        ],
        sources=[
            GraphSource("GPZ", is_slack=True),
            GraphSource("NN_PV", active_power_kw=150.0, reactive_power_kvar=0.0),
        ],
    )


def build_t2_graph() -> NetworkGraph:
    """T2 końcowa: GPZ → SN busbar → (trafo → nN). No linia odpływowa."""
    return NetworkGraph(
        buses=[
            GraphBus("GPZ", 15.0, is_slack=True),
            GraphBus("SN_BUS", 15.0),
            GraphBus("NN_BUS", 0.4),
            GraphBus("NN_F1", 0.4),
            GraphBus("NN_F2", 0.4),
            GraphBus("NN_PV", 0.4),
        ],
        branches=[
            GraphBranch("LINE-IN", "GPZ", "SN_BUS", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
            GraphBranch("TRAFO", "SN_BUS", "NN_BUS", resistance_ohm=_TRAFO_R, reactance_ohm=_TRAFO_X),
            GraphBranch("NN-F1", "NN_BUS", "NN_F1", resistance_ohm=_NN_FEEDER_R, reactance_ohm=_NN_FEEDER_X),
            GraphBranch("NN-F2", "NN_BUS", "NN_F2", resistance_ohm=_NN_FEEDER_R, reactance_ohm=_NN_FEEDER_X),
            GraphBranch("NN-PV", "NN_BUS", "NN_PV", resistance_ohm=_NN_FEEDER_R, reactance_ohm=_NN_FEEDER_X),
        ],
        loads=[
            GraphLoad("NN_F1", active_power_kw=210.0, reactive_power_kvar=70.0),
            GraphLoad("NN_F2", active_power_kw=140.0, reactive_power_kvar=45.0),
        ],
        sources=[
            GraphSource("GPZ", is_slack=True),
            GraphSource("NN_PV", active_power_kw=120.0, reactive_power_kvar=0.0),
        ],
    )


def build_t3_graph() -> NetworkGraph:
    """T3 ZKSN: cable junction MAIN_IN/MAIN_OUT/BRANCH. No transformer/nN."""
    return NetworkGraph(
        buses=[
            GraphBus("GPZ", 15.0, is_slack=True),
            GraphBus("ZKSN", 15.0),
            GraphBus("MAIN_OUT_END", 15.0),
            GraphBus("BRANCH_END", 15.0),
        ],
        branches=[
            GraphBranch("CABLE-IN", "GPZ", "ZKSN", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
            GraphBranch("CABLE-OUT", "ZKSN", "MAIN_OUT_END", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
            GraphBranch("CABLE-BRANCH", "ZKSN", "BRANCH_END", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
        ],
        loads=[
            GraphLoad("MAIN_OUT_END", active_power_kw=470.0, reactive_power_kvar=150.0),
            GraphLoad("BRANCH_END", active_power_kw=320.0, reactive_power_kvar=100.0),
        ],
        sources=[GraphSource("GPZ", is_slack=True)],
    )


def build_t4_graph() -> NetworkGraph:
    """T4 sekcyjna: two independently-fed bus sections, coupler normally open.

    The coupler branch is modelled as OPEN (is_closed=False) so each section is
    energised from its own line and the coupler carries no power — exactly the
    NOP state the renderer shows.
    """
    return NetworkGraph(
        buses=[
            GraphBus("GPZ_A", 15.0, is_slack=True),
            GraphBus("SEC_A", 15.0),
            GraphBus("SEC_B", 15.0),
            GraphBus("LOAD_A", 15.0),
            GraphBus("LOAD_B", 15.0),
        ],
        branches=[
            GraphBranch("LINE-A", "GPZ_A", "SEC_A", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
            GraphBranch("FEED-A", "SEC_A", "LOAD_A", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
            GraphBranch("COUPLER", "SEC_A", "SEC_B", resistance_ohm=_TRAFO_R, reactance_ohm=_TRAFO_X, is_closed=False),
            GraphBranch("LINE-B", "GPZ_A", "SEC_B", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
            GraphBranch("FEED-B", "SEC_B", "LOAD_B", resistance_ohm=_SN_LINE_R, reactance_ohm=_SN_LINE_X),
        ],
        loads=[
            GraphLoad("LOAD_A", active_power_kw=670.0, reactive_power_kvar=210.0),
            GraphLoad("LOAD_B", active_power_kw=610.0, reactive_power_kvar=190.0),
        ],
        sources=[GraphSource("GPZ_A", is_slack=True)],
    )


_ARCHETYPE_GRAPHS = {
    "T1": build_t1_graph,
    "T2": build_t2_graph,
    "T3": build_t3_graph,
    "T4": build_t4_graph,
}


def build_companion(archetype: str) -> dict[str, Any]:
    """Run the frozen solver for an archetype and return its companion payload."""
    builder = _ARCHETYPE_GRAPHS[archetype]
    return compute_substrate_power_flow(builder())


def build_all_companions() -> dict[str, dict[str, Any]]:
    return {name: build_companion(name) for name in _ARCHETYPE_GRAPHS}


def main() -> None:
    print(json.dumps(build_all_companions(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
