"""MIN-scenario R_theta temperature correction for line/cable branches — karta P0.3.

Karta P0.3 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3, docs/nn/D_KONTRAKT_SN_NN_V1.md
§4, decision §0.4): for the SHORT_CIRCUIT_MIN scenario, IEC 60909 requires the
resistance of lines/cables to be corrected for conductor temperature at the
short-circuit before Ik''min is computed:

    R_theta = R20 * [1 + 0.004 * (theta_k - 20 degC)]

theta_k is read from the branch's catalog-materialized
``short_circuit_temperature_c`` (network_model.core.branch.LineBranch — carried
through by ``enm/mapping.py`` from LVCableType/MVCableType/LineType). A branch
without a known theta_k gets NO correction and an explicit White Box note
(zero fabrication — never guess a temperature).

THIS IS A DECORATION OF THE SOLVER *INPUT*, NOT THE SOLVER. It builds a NEW
NetworkGraph with corrected LineBranch copies (``dataclasses.replace`` — the
original graph and its Branch/Node objects are never mutated, so the MAX-
scenario graph the caller already holds stays valid) and hands it to the
FROZEN IEC 60909 solver unchanged. The short-circuit solvers themselves
(network_model/solvers/short_circuit_*.py) are never touched.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from network_model.core.branch import LineBranch
from network_model.core.graph import NetworkGraph

#: IEC 60909-0: temperature coefficient of resistance for copper/aluminium
#: conductors, per degree Celsius above the 20 degC reference.
TEMPERATURE_COEFFICIENT_PER_C = 0.004
REFERENCE_TEMPERATURE_C = 20.0


@dataclass(frozen=True)
class TemperatureCorrectionNote:
    """White Box note: what happened to one line/cable branch's R for MIN."""

    branch_id: str
    branch_name: str
    corrected: bool
    r20_ohm_per_km: float
    theta_k_c: float | None
    r_theta_ohm_per_km: float | None
    reason: str

    def to_dict(self) -> dict[str, object]:
        return {
            "branch_id": self.branch_id,
            "branch_name": self.branch_name,
            "corrected": self.corrected,
            "r20_ohm_per_km": self.r20_ohm_per_km,
            "theta_k_c": self.theta_k_c,
            "r_theta_ohm_per_km": self.r_theta_ohm_per_km,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class MinScenarioGraphResult:
    """Decorated (copied) graph for the MIN scenario + its correction trace."""

    graph: NetworkGraph
    notes: tuple[TemperatureCorrectionNote, ...]


def r_theta_ohm_per_km(r20_ohm_per_km: float, theta_k_c: float) -> float:
    """IEC 60909 resistance temperature correction: R_theta = R20*[1+0.004*(theta_k-20)]."""
    return r20_ohm_per_km * (
        1.0 + TEMPERATURE_COEFFICIENT_PER_C * (theta_k_c - REFERENCE_TEMPERATURE_C)
    )


def build_min_scenario_graph(graph: NetworkGraph) -> MinScenarioGraphResult:
    """Return a COPY of ``graph`` with R_theta applied to line/cable branches.

    Every LineBranch (LINE or CABLE — SN and nN alike, one rule, no band
    exception) with a known ``short_circuit_temperature_c`` gets its
    ``r_ohm_per_km`` replaced by the temperature-corrected value. Branches
    without a known temperature are copied UNCHANGED — no fabricated theta_k.
    All other graph elements (nodes, switches, sources, stations) are carried
    over by reference: this helper never mutates the input graph, so sharing
    read-only objects with the caller's MAX-scenario graph is safe.

    Args:
        graph: The MAX-scenario NetworkGraph (untouched by this call).

    Returns:
        MinScenarioGraphResult with the decorated graph and one
        TemperatureCorrectionNote per line/cable branch (deterministic order:
        sorted by branch_id, matching ``graph.branches`` insertion via dict).
    """
    decorated = NetworkGraph(network_model_id=graph.network_model_id)

    for node in graph.nodes.values():
        decorated.add_node(node)

    notes: list[TemperatureCorrectionNote] = []
    for branch_id in sorted(graph.branches.keys()):
        branch = graph.branches[branch_id]
        if isinstance(branch, LineBranch):
            theta_k = branch.short_circuit_temperature_c
            if theta_k is not None:
                r_theta = r_theta_ohm_per_km(branch.r_ohm_per_km, theta_k)
                decorated.add_branch(replace(branch, r_ohm_per_km=r_theta))
                notes.append(
                    TemperatureCorrectionNote(
                        branch_id=branch.id,
                        branch_name=branch.name,
                        corrected=True,
                        r20_ohm_per_km=branch.r_ohm_per_km,
                        theta_k_c=theta_k,
                        r_theta_ohm_per_km=r_theta,
                        reason=(
                            "R skorygowane temperaturowo dla scenariusza MIN "
                            "(IEC 60909, R_theta=R20*[1+0.004*(theta_k-20)])"
                        ),
                    )
                )
            else:
                decorated.add_branch(branch)
                notes.append(
                    TemperatureCorrectionNote(
                        branch_id=branch.id,
                        branch_name=branch.name,
                        corrected=False,
                        r20_ohm_per_km=branch.r_ohm_per_km,
                        theta_k_c=None,
                        r_theta_ohm_per_km=None,
                        reason=(
                            "R bez korekty temperaturowej — brak theta_k "
                            "(short_circuit_temperature_c) w danych katalogowych"
                        ),
                    )
                )
        else:
            decorated.add_branch(branch)

    for switch in graph.switches.values():
        decorated.add_switch(switch)
    for source in graph.inverter_sources.values():
        decorated.add_inverter_source(source)
    for source in graph.synchronous_machine_sources.values():
        decorated.add_synchronous_machine_source(source)
    for source in graph.asynchronous_machine_sources.values():
        decorated.add_asynchronous_machine_source(source)
    for source in graph.grid_sc_sources.values():
        decorated.add_grid_sc_source(source)
    for station in graph.stations.values():
        decorated.add_station(station)

    return MinScenarioGraphResult(graph=decorated, notes=tuple(notes))
