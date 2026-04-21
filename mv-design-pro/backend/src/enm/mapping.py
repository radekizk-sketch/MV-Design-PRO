"""
Deterministic mapping: EnergyNetworkModel → NetworkGraph.

Rules:
1. Sort all elements by ref_id for determinism.
2. Bus → Node (voltage_kv, SLACK for source bus, PQ for load buses).
3. OverheadLine/Cable → LineBranch (R_total=r*l, X_total=x*l, B_total=b*l).
4. Transformer → TransformerBranch (sn, uhv, ulv, uk%, pk).
5. Source bus → SLACK node with voltage magnitude 1.0 pu.
6. SwitchBranch(status=open) → excluded from topology (Switch with state OPEN).
7. FuseBranch → LineBranch with near-zero impedance.
8. Load/Generator → adjustments on node P/Q.
9. Zero-sequence fields (r0, x0, grounding) are ignored by current solvers.
"""

from __future__ import annotations

import math
import uuid

from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType

from .models import (
    Cable,
    EnergyNetworkModel,
    FuseBranch,
    OverheadLine,
    SwitchBranch,
)


def _ref_to_uuid(ref_id: str) -> str:
    """Deterministic UUID-like string from ref_id (for mapping stability)."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, ref_id))


def map_enm_to_network_graph(enm: EnergyNetworkModel) -> NetworkGraph:
    """
    Map ENM to NetworkGraph consumed by existing solvers.

    This is a pure, deterministic function: same ENM → same NetworkGraph.
    """
    graph = NetworkGraph()

    # Collect source bus refs for SLACK identification
    source_bus_refs: set[str] = {s.bus_ref for s in enm.sources}

    # Collect P/Q per bus from loads and generators
    bus_p: dict[str, float] = {}
    bus_q: dict[str, float] = {}
    for load in enm.loads:
        bus_p[load.bus_ref] = bus_p.get(load.bus_ref, 0.0) - load.p_mw
        bus_q[load.bus_ref] = bus_q.get(load.bus_ref, 0.0) - load.q_mvar
    for gen in enm.generators:
        bus_p[gen.bus_ref] = bus_p.get(gen.bus_ref, 0.0) + gen.p_mw
        bus_q[gen.bus_ref] = bus_q.get(gen.bus_ref, 0.0) + (gen.q_mvar or 0.0)

    # Map ref_id → node_id for cross-referencing
    ref_to_node_id: dict[str, str] = {}

    # 1. Buses → Nodes (sorted by ref_id)
    for bus in sorted(enm.buses, key=lambda b: b.ref_id):
        node_id = _ref_to_uuid(bus.ref_id)
        ref_to_node_id[bus.ref_id] = node_id

        is_slack = bus.ref_id in source_bus_refs
        p = bus_p.get(bus.ref_id, 0.0)
        q = bus_q.get(bus.ref_id, 0.0)

        if is_slack:
            node = Node(
                id=node_id,
                name=bus.name,
                node_type=NodeType.SLACK,
                voltage_level=bus.voltage_kv,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
                active_power=p if p != 0.0 else None,
                reactive_power=q if q != 0.0 else None,
            )
        else:
            node = Node(
                id=node_id,
                name=bus.name,
                node_type=NodeType.PQ,
                voltage_level=bus.voltage_kv,
                active_power=p,
                reactive_power=q,
            )
        graph.add_node(node)

    # 2. Branches → LineBranch / Switch (sorted by ref_id)
    for branch in sorted(enm.branches, key=lambda b: b.ref_id):
        from_id = ref_to_node_id.get(branch.from_bus_ref)
        to_id = ref_to_node_id.get(branch.to_bus_ref)
        if from_id is None or to_id is None:
            continue

        branch_id = _ref_to_uuid(branch.ref_id)

        if isinstance(branch, OverheadLine | Cable):
            b_us_per_km = 0.0
            if branch.b_siemens_per_km is not None:
                b_us_per_km = branch.b_siemens_per_km * 1e6  # S/km → μS/km

            rated_a = 0.0
            if branch.rating and branch.rating.in_a:
                rated_a = branch.rating.in_a

            bt = BranchType.CABLE if isinstance(branch, Cable) else BranchType.LINE
            lb = LineBranch(
                id=branch_id,
                name=branch.name,
                branch_type=bt,
                from_node_id=from_id,
                to_node_id=to_id,
                in_service=(branch.status == "closed"),
                r_ohm_per_km=branch.r_ohm_per_km,
                x_ohm_per_km=branch.x_ohm_per_km,
                b_us_per_km=b_us_per_km,
                length_km=branch.length_km,
                rated_current_a=rated_a if rated_a > 0 else 1.0,
            )
            graph.add_branch(lb)

        elif isinstance(branch, SwitchBranch):
            sw_type_map = {
                "switch": SwitchType.LOAD_SWITCH,
                "breaker": SwitchType.BREAKER,
                "bus_coupler": SwitchType.LOAD_SWITCH,
                "disconnector": SwitchType.DISCONNECTOR,
            }
            sw = Switch(
                id=branch_id,
                name=branch.name,
                from_node_id=from_id,
                to_node_id=to_id,
                switch_type=sw_type_map.get(branch.type, SwitchType.LOAD_SWITCH),
                state=SwitchState.CLOSED if branch.status == "closed" else SwitchState.OPEN,
                in_service=True,
            )
            graph.add_switch(sw)

        elif isinstance(branch, FuseBranch):
            sw = Switch(
                id=branch_id,
                name=branch.name,
                from_node_id=from_id,
                to_node_id=to_id,
                switch_type=SwitchType.FUSE,
                state=SwitchState.CLOSED if branch.status == "closed" else SwitchState.OPEN,
                in_service=True,
                rated_current_a=branch.rated_current_a or 0.0,
                rated_voltage_kv=branch.rated_voltage_kv or 0.0,
            )
            graph.add_switch(sw)

    # 3. Transformers → TransformerBranch (sorted by ref_id)
    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        hv_id = ref_to_node_id.get(trafo.hv_bus_ref)
        lv_id = ref_to_node_id.get(trafo.lv_bus_ref)
        if hv_id is None or lv_id is None:
            continue

        tb = TransformerBranch(
            id=_ref_to_uuid(trafo.ref_id),
            name=trafo.name,
            branch_type=BranchType.TRANSFORMER,
            from_node_id=hv_id,
            to_node_id=lv_id,
            in_service=True,
            rated_power_mva=trafo.sn_mva,
            voltage_hv_kv=trafo.uhv_kv,
            voltage_lv_kv=trafo.ulv_kv,
            uk_percent=trafo.uk_percent,
            pk_kw=trafo.pk_kw,
            i0_percent=trafo.i0_percent or 0.0,
            p0_kw=trafo.p0_kw or 0.0,
            vector_group=trafo.vector_group or "Dyn11",
            tap_position=trafo.tap_position or 0,
            tap_step_percent=trafo.tap_step_percent or 2.5,
        )
        graph.add_branch(tb)

    # 4. Sources → virtual ground node + impedance branch
    #    The SC solver needs the source impedance in the Y-bus matrix.
    #    IEC 60909: Z_source = U_n² / Sk'' (at source bus voltage).
    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        bus_node_id = ref_to_node_id.get(source.bus_ref)
        if bus_node_id is None:
            continue

        # Find bus voltage
        bus_voltage_kv = 0.0
        for bus in enm.buses:
            if bus.ref_id == source.bus_ref:
                bus_voltage_kv = bus.voltage_kv
                break
        if bus_voltage_kv <= 0:
            continue

        # Compute source impedance R + jX
        r_ohm = 0.0
        x_ohm = 0.0

        if source.r_ohm is not None and source.x_ohm is not None:
            r_ohm = source.r_ohm
            x_ohm = source.x_ohm
        elif source.sk3_mva is not None and source.sk3_mva > 0:
            un_kv = bus_voltage_kv
            z_abs = (un_kv**2) / source.sk3_mva  # Z = Un² / Sk'' [Ohm]
            rx = source.rx_ratio if source.rx_ratio and source.rx_ratio > 0 else 0.1
            x_ohm = z_abs / math.sqrt(1.0 + rx**2)
            r_ohm = x_ohm * rx

        if r_ohm == 0 and x_ohm == 0:
            continue

        # Create virtual ground node (PQ with zero load)
        gnd_node_id = _ref_to_uuid(f"_gnd_{source.ref_id}")
        gnd_node = Node(
            id=gnd_node_id,
            name=f"GND ({source.name})",
            node_type=NodeType.PQ,
            voltage_level=bus_voltage_kv,
            active_power=0.0,
            reactive_power=0.0,
        )
        graph.add_node(gnd_node)

        # Create impedance branch: ground → source bus
        src_branch = LineBranch(
            id=_ref_to_uuid(f"_zsrc_{source.ref_id}"),
            name=f"Z_source ({source.name})",
            branch_type=BranchType.LINE,
            from_node_id=gnd_node_id,
            to_node_id=bus_node_id,
            in_service=True,
            r_ohm_per_km=r_ohm,
            x_ohm_per_km=x_ohm,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=1.0,
        )
        graph.add_branch(src_branch)

    return graph
