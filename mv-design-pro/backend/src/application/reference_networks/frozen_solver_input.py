"""Build a FROZEN-solver ``PowerFlowInput`` from an IEEE reference ENM dict.

D-14 (production-solver cross-validation): the committed ``builders/ieee_<n>bus.py``
ENMs (structurally identical to ``pandapower.networks.case<n>``) are translated
here into the input contract of the PRODUCTION load-flow solver
``network_model.solvers.power_flow_newton.solve_power_flow_physics`` so it solves
the *identical* problem the committed pandapower references encode.

This is a READ-ONLY consumer of the frozen solver (B-01): it only constructs the
``PowerFlowInput`` and never modifies ``power_flow_newton.py`` /
``power_flow_newton_internal.py`` / ``power_flow_types.py``.

Fidelity (verified — Ybus identical to the harness/MATPOWER Ybus to ~1e-13, and
per-bus |V|/angle agree with the committed pandapower reference to ~5e-8 %):

- Lines: the committed ENM stores MATPOWER **system** per-unit ``r_pu``/``x_pu``
  (100 MVA, single system base). The frozen solver builds Ybus in ohms and
  converts to per-unit with ONE global ``z_base = slack_kv^2 / base_mva``. So a
  line is stamped with ``r_ohm_per_km = r_pu * z_base_system`` and ``length_km =
  1.0`` — the global per-unit conversion then recovers exactly ``r_pu``. Every
  bus carries ``voltage_level = slack_kv`` because the frozen per-unit Ybus uses
  only the slack node's voltage level (per-bus levels affect kV reporting only,
  not the per-unit physics being validated).
- Bus shunts (case14 capacitor at B8): mapped 1:1 to ``ShuntSpec`` on the 100 MVA
  system base (``b_pu`` already system-base in the ENM).
- Off-nominal transformer taps (case14 BR15/16/17, case39 BR35..BR45): the frozen
  solver applies a tap ratio ONLY to a ``TransformerBranch``. Each tap branch
  (all with zero line charging in these cases) becomes a ``TransformerBranch``
  whose effective system per-unit series impedance equals the MATPOWER ``r_pu +
  j*x_pu`` exactly, by choosing ``rated_power_mva = base_mva`` and
  ``voltage_hv_kv = voltage_lv_kv = slack_kv`` (so the transformer's LV z-base
  equals the system z-base) and then
  ``uk_percent = 100*sqrt(r_pu^2 + x_pu^2)`` and ``pk_kw = r_pu * 1e5`` (so
  ``r_pu_sn = (pk/1000)/Sn = r_pu`` and ``x_pu_sn = sqrt((uk/100)^2 - r_pu^2) =
  x_pu``). The tap itself is supplied via ``TransformerTapSpec``; the frozen
  solver's off-nominal stamping matches the MATPOWER ``Y_ii += y/t^2``,
  ``Y_ij = Y_ji -= y/t``, ``Y_jj += y`` exactly.

Sign / classification conventions of the frozen solver (``build_power_spec_v2``):

- ``PQSpec.p_mw``/``PVSpec.p_mw`` are CONSUMPTION (the solver negates them to form
  the net injection). A generator (injection) is therefore passed as a negative
  ``p_mw``; a PV bus that also carries a local load uses the *net*
  ``p_mw = P_load - P_gen``.
- The frozen solver forms a P/Q equation only for buses listed in ``pq``/``pv``.
  A zero-injection transit bus (no load, no gen) must still be listed as a
  ``PQSpec`` with ``p_mw = q_mvar = 0`` — otherwise it is left at the flat start
  and the solution diverges from the reference. All such buses are added here.

No pandapower import: the ENM comes from the committed builder.
"""

from __future__ import annotations

import math
from typing import Any

from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    ShuntSpec,
    SlackSpec,
    TransformerTapSpec,
)

# Matches the reference-generation solver tolerance (pandapower tolerance_mva=1e-10).
DEFAULT_SOLVER_TOLERANCE = 1e-10
DEFAULT_MAX_ITER = 60

# Nominal line length used so that ``per-km * length`` equals the total ohmic
# value derived from the per-unit impedance.
_UNIT_LENGTH_KM = 1.0


def _slack_bus_and_voltage(enm: dict[str, Any]) -> tuple[str, float]:
    for source in enm.get("sources", []):
        if source.get("source_kind") == "slack":
            return str(source["bus"]), float(source.get("v_pu", 1.0))
    raise ValueError("Reference ENM has no slack source (source_kind='slack').")


def _transformer_for_tap(
    branch_id: str,
    from_bus: str,
    to_bus: str,
    *,
    r_pu: float,
    x_pu: float,
    slack_kv: float,
    base_mva: float,
) -> TransformerBranch:
    """Build a ``TransformerBranch`` whose effective system per-unit series
    impedance equals ``r_pu + j*x_pu`` exactly (see module docstring)."""
    z_mag = math.sqrt(r_pu * r_pu + x_pu * x_pu)
    if z_mag <= 0.0:
        raise ValueError(f"Tap branch {branch_id!r} has zero impedance (r_pu=x_pu=0).")
    uk_percent = 100.0 * z_mag
    # r_pu_sn = (pk_kw/1000) / rated_power_mva; with rated_power_mva == base_mva
    # this gives r_pu_sn == r_pu when pk_kw = r_pu * 1000 * base_mva.
    pk_kw = r_pu * 1000.0 * base_mva
    return TransformerBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_bus,
        to_node_id=to_bus,
        rated_power_mva=base_mva,
        voltage_hv_kv=slack_kv,
        voltage_lv_kv=slack_kv,
        uk_percent=uk_percent,
        pk_kw=pk_kw,
        vector_group="Yy0",
        tap_position=0,
    )


def build_frozen_power_flow_input(
    enm: dict[str, Any],
    *,
    tolerance: float = DEFAULT_SOLVER_TOLERANCE,
    max_iter: int = DEFAULT_MAX_ITER,
) -> PowerFlowInput:
    """Translate a committed IEEE reference ENM into a frozen-solver input.

    The returned :class:`PowerFlowInput` is fed verbatim to
    ``solve_power_flow_physics`` (the production Newton-Raphson solver).
    """
    header = enm["header"]
    base_mva = float(header["base_mva"])
    slack_kv = float(header["base_kv"])
    if slack_kv <= 0:
        raise ValueError("Reference ENM header base_kv must be > 0.")
    z_base_system = (slack_kv * slack_kv) / base_mva

    slack_bus, slack_v = _slack_bus_and_voltage(enm)

    graph = NetworkGraph(network_model_id=str(header.get("name", "ieee-reference")))

    # Buses. Every bus uses voltage_level = slack_kv (the frozen per-unit Ybus
    # depends only on the slack node's voltage level).
    for bus in enm["buses"]:
        bus_id = str(bus["ref_id"])
        if bus_id == slack_bus:
            graph.add_node(
                Node(
                    id=bus_id,
                    name=bus_id,
                    node_type=NodeType.SLACK,
                    voltage_level=slack_kv,
                    voltage_magnitude=slack_v,
                    voltage_angle=0.0,
                )
            )
        else:
            graph.add_node(
                Node(
                    id=bus_id,
                    name=bus_id,
                    node_type=NodeType.PQ,
                    voltage_level=slack_kv,
                    active_power=0.0,
                    reactive_power=0.0,
                )
            )

    taps: list[TransformerTapSpec] = []
    for branch in enm["branches"]:
        branch_id = str(branch["ref_id"])
        from_bus = str(branch["from_bus"])
        to_bus = str(branch["to_bus"])
        r_pu = float(branch.get("r_pu", 0.0))
        x_pu = float(branch.get("x_pu", 0.0))
        b_pu = float(branch.get("b_pu", 0.0))
        ratio = float(branch.get("ratio", 1.0)) or 1.0

        if ratio != 1.0:
            if b_pu != 0.0:
                # The frozen TransformerBranch carries no line charging; a tap
                # branch with non-zero shunt cannot be represented faithfully.
                raise ValueError(
                    f"Tap branch {branch_id!r} has non-zero shunt b_pu={b_pu}; "
                    "frozen TransformerBranch cannot represent a charging shunt."
                )
            graph.add_branch(
                _transformer_for_tap(
                    branch_id,
                    from_bus,
                    to_bus,
                    r_pu=r_pu,
                    x_pu=x_pu,
                    slack_kv=slack_kv,
                    base_mva=base_mva,
                )
            )
            taps.append(TransformerTapSpec(branch_id=branch_id, tap_ratio=ratio))
        else:
            # Line: total shunt susceptance in per-unit is b_pu; the frozen Ybus
            # adds get_shunt_admittance_per_end() (= jB*L/2) at BOTH ends, summing
            # to the full jB*L, so b_us_per_km (with L=1) must satisfy
            # b_us_per_km*1e-6 * z_base_system == b_pu.
            b_us_per_km = (b_pu / z_base_system) * 1e6
            graph.add_branch(
                LineBranch(
                    id=branch_id,
                    name=branch_id,
                    branch_type=BranchType.LINE,
                    from_node_id=from_bus,
                    to_node_id=to_bus,
                    r_ohm_per_km=r_pu * z_base_system,
                    x_ohm_per_km=x_pu * z_base_system,
                    b_us_per_km=b_us_per_km,
                    length_km=_UNIT_LENGTH_KM,
                    rated_current_a=1000.0,
                )
            )

    shunts: list[ShuntSpec] = [
        ShuntSpec(
            node_id=str(shunt["bus"]),
            g_pu=float(shunt.get("g_pu", 0.0)),
            b_pu=float(shunt.get("b_pu", 0.0)),
        )
        for shunt in enm.get("shunts", [])
        if str(shunt.get("bus")) != ""
    ]

    # Aggregate loads and generators per bus.
    load_by_bus: dict[str, list[float]] = {}
    for load in enm.get("loads", []):
        bus_id = str(load["bus"])
        acc = load_by_bus.setdefault(bus_id, [0.0, 0.0])
        acc[0] += float(load.get("p_mw", 0.0))
        acc[1] += float(load.get("q_mvar", 0.0))

    gen_by_bus: dict[str, list[float]] = {}
    for gen in enm.get("generators", []):
        bus_id = str(gen["bus"])
        acc = gen_by_bus.setdefault(bus_id, [0.0, float(gen.get("v_pu", 1.0))])
        acc[0] += float(gen.get("p_mw", 0.0))
        acc[1] = float(gen.get("v_pu", 1.0))

    pv: list[PVSpec] = []
    for bus_id, (p_gen, v_pu) in gen_by_bus.items():
        if bus_id == slack_bus:
            continue
        p_load, _q_load = load_by_bus.get(bus_id, [0.0, 0.0])
        # Frozen convention: p_mw is consumption -> net injection P_gen - P_load
        # is supplied as p_mw = P_load - P_gen.
        pv.append(
            PVSpec(
                node_id=bus_id,
                p_mw=p_load - p_gen,
                u_pu=v_pu,
                q_min_mvar=-1.0e6,
                q_max_mvar=1.0e6,
            )
        )

    pv_ids = {spec.node_id for spec in pv}
    pq: list[PQSpec] = []
    for bus_id, (p_load, q_load) in load_by_bus.items():
        if bus_id == slack_bus or bus_id in pv_ids:
            continue
        pq.append(PQSpec(node_id=bus_id, p_mw=p_load, q_mvar=q_load))

    # Zero-injection transit buses must still appear as PQ buses, otherwise the
    # frozen solver forms no equation for them and leaves them at the flat start.
    listed = {spec.node_id for spec in pq} | pv_ids | {slack_bus}
    for bus in enm["buses"]:
        bus_id = str(bus["ref_id"])
        if bus_id not in listed:
            pq.append(PQSpec(node_id=bus_id, p_mw=0.0, q_mvar=0.0))

    options = PowerFlowOptions(
        tolerance=tolerance,
        max_iter=max_iter,
        flat_start=True,
        validate=True,
    )
    return PowerFlowInput(
        graph=graph,
        base_mva=base_mva,
        slack=SlackSpec(node_id=slack_bus, u_pu=slack_v, angle_rad=0.0),
        pq=pq,
        pv=pv,
        shunts=shunts,
        taps=taps,
        options=options,
    )
