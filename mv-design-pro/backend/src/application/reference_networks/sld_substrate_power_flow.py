"""Run the FROZEN power-flow solver on the SLD substrate and emit a deterministic
per-branch direction + energization companion for the SLD render path (P-A).

GOVERNING PRINCIPLE (P-A): the SLD is a PROJECTION of the math model — what it
shows MUST equal what the frozen solver computes. This module is the ONE TRUTH
producer: it runs the production load-flow path on the committed substrate ENM and
serialises, per ENM branch ``ref_id``:

  - ``flow_direction``  ∈ {"forward", "reverse", "none"} — sign of the solver's
    active power at the branch "from" end (``Re(branch_s_from)``). "forward" =
    power flows from→to (the ENM branch orientation); "reverse" = power flows
    to→from (e.g. where an OZE source backfeeds upstream); "none" = the branch is
    de-energised (the solver computed no flow because an endpoint is outside the
    slack island).
  - the ENERGIZED SET — buses/branches the solver actually solved (reachable from
    the slack through closed switches). De-energised buses are the solver's
    ``not_solved_nodes`` (e.g. the stub beyond a normally-open point).

READ-ONLY w.r.t. the frozen core (B-01): this only constructs the production
``PowerFlowInput`` (exactly as ``application.canonical_analysis._execute_power_flow``
does) and reads the result. It never modifies ``power_flow_newton*.py`` /
``power_flow_types.py`` / the solver.

Determinism (ZASADA NR 7): same substrate ENM → identical companion (the solver is
deterministic and all outputs are sorted / rounded to a fixed scale). The companion
carries the solver-input hash so the render path can assert it matches the ENM it
renders.

NOT a second truth: the SLD must NOT recompute direction/energization. It reads
THIS companion. ``SupplyPathHighlighter`` (frontend BFS) is a topology-only
approximation with no direction — the companion supersedes it for the substrate.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any, Literal

from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.core.node import NodeType
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    solve_power_flow_physics,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

# Production load-flow defaults — identical to canonical_analysis._execute_power_flow.
_BASE_MVA = 100.0
_TOLERANCE = 1e-8
_MAX_ITER = 30
# Active-power magnitude (MVA) below which a branch flow is treated as numerically
# zero (no meaningful direction). 1e-3 MVA = 1 kW — well above solver round-off
# (~1e-12) and well below the smallest real station load (250 kW).
_FLOW_EPS_MVA = 1.0e-3

FlowDirection = Literal["forward", "reverse", "none"]


def _ref_to_graph_id(ref_id: str) -> str:
    """Mirror of ``enm.mapping._ref_to_uuid`` (deterministic, invertible)."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, ref_id))


def _build_power_flow_input(enm: EnergyNetworkModel) -> tuple[PowerFlowInput, str]:
    """Build the production ``PowerFlowInput`` for the substrate ENM.

    Same construction as ``canonical_analysis._execute_power_flow`` (map ENM →
    graph, slack from the SLACK node, PQ from node net injections). Returns the
    input and the chosen slack node id.
    """
    graph = map_enm_to_network_graph(enm)
    slack_nodes = sorted(
        node_id for node_id, node in graph.nodes.items() if node.node_type == NodeType.SLACK
    )
    if not slack_nodes:
        raise ValueError("Substrate ENM has no SLACK node (no grid source).")
    slack_node_id = slack_nodes[0]

    def _wymagana_moc_pq(wezel: Any, node_id: str, pole: str) -> float:
        """FAB-E (E1): brak mocy wezla PQ NIE jest moca zerowa.

        `Node.__post_init__` (network_model/core/node.py) juz WYMUSZA
        active_power/reactive_power != None dla wezlow PQ przy konstrukcji
        grafu — `x or 0.0` tutaj bylo wiec martwym zabezpieczeniem, ktore w
        razie zlamania tego kontraktu (np. przyszla zmiana walidacji Node)
        cicho wstawialoby fikcyjne zero zamiast ujawnic naruszenie kontraktu.
        """
        wartosc = getattr(wezel, pole)
        if wartosc is None:
            raise ValueError(
                f"Wezel PQ {node_id!r} bez zdefiniowanej mocy '{pole}' — sprzeczne "
                "z kontraktem Node (network_model/core/node.py), ktory wymusza te "
                "wartosc dla wezlow PQ przy konstrukcji grafu."
            )
        return float(wartosc)

    pq_specs = [
        PQSpec(
            node_id=node_id,
            # F9.8 WHITE BOX: `node.active_power`/`node.reactive_power` use the
            # GENERATION convention (positive = injection; see enm/mapping.py,
            # pinned by test_enm_mapping.py). `PQSpec.p_mw`/`q_mvar` are consumed
            # by `power_flow_newton_internal.build_power_spec_v2`, which negates
            # them again expecting the LOAD convention. This is the single
            # conversion point gen->load at the PQSpec construction boundary;
            # mirrors `enm.canonical_analysis._execute_power_flow`.
            p_mw=-_wymagana_moc_pq(node, node_id, "active_power"),
            q_mvar=-_wymagana_moc_pq(node, node_id, "reactive_power"),
            zip_coeffs=node.zip_coeffs,
            # Defect D1 (audit 2026-08-01): the ZIP polynomial scales the LOAD
            # part only; generation on the same bus is constant power. Mirrors
            # `enm.canonical_analysis._execute_power_flow` (same twin builder).
            zip_base_p_mw=(
                None if node.zip_load_active_power is None else -float(node.zip_load_active_power)
            ),
            zip_base_q_mvar=(
                None
                if node.zip_load_reactive_power is None
                else -float(node.zip_load_reactive_power)
            ),
        )
        for node_id, node in sorted(graph.nodes.items())
        if node.node_type == NodeType.PQ and node_id != slack_node_id
    ]

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=_BASE_MVA,
        slack=SlackSpec(node_id=slack_node_id, u_pu=1.0, angle_rad=0.0),
        pq=pq_specs,
        options=PowerFlowOptions(
            tolerance=_TOLERANCE, max_iter=_MAX_ITER, trace_level="basic", validate=False
        ),
    )
    return pf_input, slack_node_id


def _flow_direction(p_from_mva: float) -> FlowDirection:
    if p_from_mva > _FLOW_EPS_MVA:
        return "forward"
    if p_from_mva < -_FLOW_EPS_MVA:
        return "reverse"
    return "none"


# Fields that ``model_validate`` populates non-deterministically (wall-clock
# timestamps in the header; per-element ``id`` UUID4s). These are NOT part of the
# ENM identity (``ref_id`` is) and are stripped before hashing.
_VOLATILE_HEADER_FIELDS = ("created_at", "updated_at")


def _strip_volatile(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _strip_volatile(v) for k, v in value.items() if k != "id"}
    if isinstance(value, list):
        return [_strip_volatile(item) for item in value]
    return value


def _stable_enm_hash(enm: EnergyNetworkModel) -> str:
    """Deterministic SHA-256 of the ENM topology/physics (fallback identity).

    Used only when the caller does not supply the builder snapshot hash. Strips
    volatile header timestamps and per-element ``id`` UUIDs so the same content
    always hashes identically.
    """
    dumped = enm.model_dump(mode="json")
    header = dumped.get("header")
    if isinstance(header, dict):
        for field in _VOLATILE_HEADER_FIELDS:
            header.pop(field, None)
    canonical = _strip_volatile(dumped)
    raw = json.dumps(canonical, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def compute_substrate_power_flow(
    enm: EnergyNetworkModel,
    *,
    case_ref: str,
    case_label: str,
    enm_hash: str | None = None,
) -> dict[str, Any]:
    """Run the frozen PF solver on the substrate ENM and build the SLD companion.

    Returns a JSON-serialisable dict (the SLD reads this verbatim):

    .. code-block:: text

        {
          "schema": "sld_power_flow_companion_v1",
          "case_ref": "...",            # active state declaration shown on canvas
          "case_label": "...",
          "solver_method": "newton-raphson",
          "converged": true,
          "iterations": 4,
          "base_mva": 100.0,
          "enm_hash": "<builder snapshot hash — binds companion to its ENM>",
          "branch_flow": { "<branch ref_id>": {"direction": "forward|reverse|none",
                                                 "p_from_mw": <float>} },
          "energized_branch_refs": [ ... ],     # solver-solved branches (sorted)
          "energized_bus_refs":    [ ... ],     # slack-island buses (sorted)
          "de_energized_bus_refs": [ ... ],     # not_solved buses (sorted)
          "open_point_branch_refs":[ ... ],     # ENM switch branches with status=open
        }
    """
    pf_input, _slack = _build_power_flow_input(enm)
    solution: PowerFlowNewtonSolution = solve_power_flow_physics(pf_input)

    # Invert the deterministic ref → graph-id map for buses and branches.
    bus_uuid_to_ref = {_ref_to_graph_id(b.ref_id): b.ref_id for b in enm.buses}
    island = set(solution.slack_island_nodes)
    energized_bus_refs = sorted(
        ref for graph_id, ref in bus_uuid_to_ref.items() if graph_id in island
    )
    de_energized_bus_refs = sorted(
        ref for graph_id, ref in bus_uuid_to_ref.items() if graph_id not in island
    )

    branch_flow: dict[str, dict[str, Any]] = {}
    energized_branch_refs: list[str] = []
    for branch in enm.branches:
        graph_id = _ref_to_graph_id(branch.ref_id)
        s_from = solution.branch_s_from.get(graph_id)
        if s_from is None:
            # Branch is de-energised: the solver omitted it because an endpoint is
            # outside the slack island (e.g. beyond the open NOP). One truth: no
            # flow → no direction.
            branch_flow[branch.ref_id] = {"direction": "none", "p_from_mw": 0.0}
            continue
        p_from_mw = round(float(s_from.real) * _BASE_MVA, 6)
        branch_flow[branch.ref_id] = {
            "direction": _flow_direction(p_from_mw),
            "p_from_mw": p_from_mw,
        }
        energized_branch_refs.append(branch.ref_id)

    open_point_branch_refs = sorted(
        branch.ref_id for branch in enm.branches if getattr(branch, "status", "closed") == "open"
    )

    return {
        "schema": "sld_power_flow_companion_v1",
        "case_ref": case_ref,
        "case_label": case_label,
        "solver_method": str(getattr(solution, "solver_method", "newton-raphson")),
        "converged": bool(solution.converged),
        "iterations": int(solution.iterations),
        "base_mva": _BASE_MVA,
        # Binds the companion to its ENM. The generator passes the builder snapshot
        # hash (== the ENM fixture's header.hash_sha256 / _meta.builder_snapshot_hash)
        # so the SLD can assert the companion belongs to the model it renders. This
        # is the single, deterministic identity (the per-element ``id`` UUIDs that
        # ``model_validate`` mints are volatile and intentionally NOT hashed).
        "enm_hash": enm_hash if enm_hash is not None else _stable_enm_hash(enm),
        "branch_flow": dict(sorted(branch_flow.items())),
        "energized_branch_refs": sorted(energized_branch_refs),
        "energized_bus_refs": energized_bus_refs,
        "de_energized_bus_refs": de_energized_bus_refs,
        "open_point_branch_refs": open_point_branch_refs,
    }
