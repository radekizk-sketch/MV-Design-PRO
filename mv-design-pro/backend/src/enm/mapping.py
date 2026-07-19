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
9. Zero-sequence fields are mapped only by the explicit Z0 helper; they do not
   change the positive-sequence graph used by 3F calculations.
"""

from __future__ import annotations

import math
import uuid

import numpy as np
from network_model.core.branch import (
    BranchType,
    LineBranch,
    LineDropCompensation,
    TapChanger,
    TransformerBranch,
)
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.solvers.power_flow_zip import (
    ZipCoeffs,
    aggregate_zip,
    zip_coeffs_from_materialized_params,
)

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


def _map_tap_changer(tap_changer, ref_to_node_id: dict[str, str]) -> TapChanger | None:
    """Project an ENM TapChanger onto the domain TapChanger (V12K-045).

    Resolves ``controlled_bus_ref`` (a bus ref_id) to the domain node id so the
    LF OLTC loop can read the controlled bus voltage. Returns None when absent
    (legacy behaviour preserved).
    """
    if tap_changer is None:
        return None
    ldc = tap_changer.line_drop_compensation
    return TapChanger(
        regulation_type=tap_changer.regulation_type,
        regulated_winding=tap_changer.regulated_winding,
        neutral_position=tap_changer.neutral_position,
        current_position=tap_changer.current_position,
        min_position=tap_changer.min_position,
        max_position=tap_changer.max_position,
        step_percent=tap_changer.step_percent,
        control_mode=tap_changer.control_mode,
        voltage_setpoint_kv=tap_changer.voltage_setpoint_kv,
        deadband_kv=tap_changer.deadband_kv,
        delay_seconds=tap_changer.delay_seconds,
        controlled_bus_id=(
            ref_to_node_id.get(tap_changer.controlled_bus_ref)
            if tap_changer.controlled_bus_ref is not None
            else None
        ),
        line_drop_compensation=(
            LineDropCompensation(enabled=ldc.enabled, r_ohm=ldc.r_ohm, x_ohm=ldc.x_ohm)
            if ldc is not None
            else None
        ),
        catalog_ref=tap_changer.catalog_ref,
    )


def _source_positive_impedance_ohm(source, bus_voltage_kv: float) -> complex | None:
    if source.r_ohm is not None and source.x_ohm is not None:
        return complex(source.r_ohm, source.x_ohm)
    if source.sk3_mva is None or source.sk3_mva <= 0:
        return None
    z_abs = (bus_voltage_kv**2) / source.sk3_mva
    rx = source.rx_ratio if source.rx_ratio and source.rx_ratio > 0 else 0.1
    x_ohm = z_abs / math.sqrt(1.0 + rx**2)
    r_ohm = x_ohm * rx
    return complex(r_ohm, x_ohm)


def _source_zero_impedance_ohm(source, bus_voltage_kv: float) -> complex | None:
    if source.r0_ohm is not None and source.x0_ohm is not None:
        return complex(source.r0_ohm, source.x0_ohm)
    if source.z0_z1_ratio is None or source.z0_z1_ratio <= 0:
        return None
    z1 = _source_positive_impedance_ohm(source, bus_voltage_kv)
    if z1 is None:
        return None
    return z1 * source.z0_z1_ratio


def _add_series_admittance(
    y_bus: np.ndarray,
    *,
    from_idx: int,
    to_idx: int,
    z_ohm: complex,
    z_base_ohm: float,
) -> None:
    if from_idx == to_idx:
        return
    if z_ohm == 0:
        raise ZeroDivisionError("Cannot compute zero-sequence admittance: impedance is zero")
    z_pu = z_ohm / z_base_ohm
    y_series_pu = 1.0 / z_pu
    y_bus[from_idx, to_idx] -= y_series_pu
    y_bus[to_idx, from_idx] -= y_series_pu
    y_bus[from_idx, from_idx] += y_series_pu
    y_bus[to_idx, to_idx] += y_series_pu


def build_zero_sequence_zbus(enm: EnergyNetworkModel, graph: NetworkGraph) -> np.ndarray:
    """
    Build the zero-sequence Z-bus from ENM fields without mutating the graph.

    The returned matrix uses the same merged node order as
    ``AdmittanceMatrixBuilder(graph)`` so it can be passed directly as
    ``z0_bus`` to the IEC 60909 single-phase and two-phase-ground solvers.
    """
    builder = AdmittanceMatrixBuilder(graph)
    builder.build()
    node_index = builder.node_id_to_index
    size = len(set(node_index.values()))
    y0_bus = np.zeros((size, size), dtype=complex)

    ref_to_node_id = {bus.ref_id: _ref_to_uuid(bus.ref_id) for bus in enm.buses}
    bus_voltage = {bus.ref_id: bus.voltage_kv for bus in enm.buses}

    for branch in sorted(enm.branches, key=lambda b: b.ref_id):
        if not isinstance(branch, OverheadLine | Cable):
            continue
        if branch.status != "closed":
            continue
        if branch.r0_ohm_per_km is None or branch.x0_ohm_per_km is None:
            continue

        from_id = ref_to_node_id.get(branch.from_bus_ref)
        to_id = ref_to_node_id.get(branch.to_bus_ref)
        if from_id not in node_index or to_id not in node_index:
            continue
        from_idx = node_index[from_id]
        to_idx = node_index[to_id]
        z0_ohm = complex(branch.r0_ohm_per_km, branch.x0_ohm_per_km) * branch.length_km
        z_base_ohm = builder.get_zbase_ohm(from_id)
        _add_series_admittance(
            y0_bus,
            from_idx=from_idx,
            to_idx=to_idx,
            z_ohm=z0_ohm,
            z_base_ohm=z_base_ohm,
        )

    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        bus_id = ref_to_node_id.get(source.bus_ref)
        if bus_id not in node_index:
            continue
        bus_voltage_kv = bus_voltage.get(source.bus_ref, 0.0)
        if bus_voltage_kv <= 0:
            continue
        z0_ohm = _source_zero_impedance_ohm(source, bus_voltage_kv)
        if z0_ohm is None:
            continue
        if z0_ohm == 0:
            raise ZeroDivisionError(
                "Cannot compute source zero-sequence admittance: impedance is zero"
            )
        idx = node_index[bus_id]
        y0_bus[idx, idx] += 1.0 / (z0_ohm / builder.get_zbase_ohm(bus_id))

    # Source impedance mapping creates virtual ground nodes in the positive
    # graph. They are not physical ENM buses, so ground them in Z0 to avoid an
    # isolated row without changing the real bus impedances.
    for node in graph.nodes.values():
        idx = node_index.get(node.id)
        if idx is not None and node.name.startswith("GND ("):
            y0_bus[idx, idx] += complex(1e6, 0.0)

    # Zero-sequence paths can be intentionally blocked by transformer vector
    # groups. Such nodes are uncoupled in Z0 and must not make SN-side 1F/2F+G
    # calculations singular; adding a local numerical reference keeps them
    # isolated from the solved SN network.
    for idx in range(size):
        if np.allclose(y0_bus[idx, :], 0.0) and np.allclose(y0_bus[:, idx], 0.0):
            y0_bus[idx, idx] += complex(1e6, 0.0)

    try:
        return np.linalg.inv(y0_bus)
    except np.linalg.LinAlgError as exc:
        raise ValueError("Zero-sequence Y-bus is singular; cannot compute Z0-bus") from exc


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
    # ADR-011 (Z-ZIP-04): per-bus ZIP components for power-weighted aggregation.
    # Each entry is (P0_mw, Q0_mw, coeffs|None); coeffs comes from the load's
    # catalog-materialized params (None => constant power, no change).
    bus_zip_components: dict[str, list[tuple[float, float, ZipCoeffs | None]]] = {}
    for load in enm.loads:
        bus_p[load.bus_ref] = bus_p.get(load.bus_ref, 0.0) - load.p_mw
        bus_q[load.bus_ref] = bus_q.get(load.bus_ref, 0.0) - load.q_mvar
        bus_zip_components.setdefault(load.bus_ref, []).append(
            (
                load.p_mw,
                load.q_mvar,
                zip_coeffs_from_materialized_params(load.materialized_params),
            )
        )
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
        # ADR-011 (Z-ZIP-04): power-weighted aggregation of the bus loads into a
        # single ZipCoeffs. Constant-power buses aggregate to None (unchanged).
        bus_zip = aggregate_zip(bus_zip_components.get(bus.ref_id, []))

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
                zip_coeffs=bus_zip,
            )
        else:
            node = Node(
                id=node_id,
                name=bus.name,
                node_type=NodeType.PQ,
                voltage_level=bus.voltage_kv,
                active_power=p,
                reactive_power=q,
                zip_coeffs=bus_zip,
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

        tap_changer = _map_tap_changer(trafo.tap_changer, ref_to_node_id)
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
            tap_changer=tap_changer,
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
