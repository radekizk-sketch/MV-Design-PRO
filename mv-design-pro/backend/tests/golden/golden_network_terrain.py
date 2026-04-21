"""
Golden Network Terrain — siec terenowa SN 15 kV z ringiem, sekcja i OZE.

Struktura:
- GPZ 15 kV (szyna nieskonczona, Sk=250 MVA)
- Magistrala glowna: GPZ → S1 → S2 → S3 → S4(sekcyjna) → S5 → S6
  AFL-120 napowietrzna (1.5, 1.2, 0.9, 2.0, 2.5, 1.8 km)
- Ring: S6 ↔ S1 via NOP (AFL-120, 3.0 km)
- S4: stacja sekcyjna (2 szyny SN-A/SN-B + sprzeglo, bez transformatora)
- Odgalezienie 1: S2 → B1 → B2 (kabel XRUHAKXS-120, 0.7 + 0.5 km)
- Odgalezienie 2: S2 → B3 (kabel 0.6 km, PV 0.5 MW na stronie nN)
- Odgalezienie 3: S5 → B4 → B5 (kabel 0.8 + 0.4 km)
- Sub-odgalezienie: B4 → B6 (kabel 0.3 km)
- 12 stacji, 11 transformatorow SN/nN, 1 PV (0.5 MW), 11 odbiorow (~1.31 MW)

Parytet topologiczny z frontendem: referenceTopologies.ts buildTerrainInput().
"""

import math

from network_model.core.branch import (
    BranchType,
    LineBranch,
    TransformerBranch,
)
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import ConverterKind, InverterSource
from network_model.core.node import Node, NodeType
from network_model.core.station import Station, StationType
from network_model.core.switch import Switch, SwitchState, SwitchType

# =============================================================================
# PARAMETRY SIECI
# =============================================================================

UN_SN = 15.0  # kV
UN_NN = 0.4  # kV

# Moc zwarciowa zasilania na szynach SN GPZ
SK_GPZ_MVA = 250.0
RX_GPZ = 0.1

# =============================================================================
# PARAMETRY LINII (Ohm/km) — z katalogu
# =============================================================================

# AFL-120 (napowietrzna 70mm2 odpowiednik AFL-6 70)
AFL120_R = 0.420
AFL120_X = 0.377
AFL120_B = 2.84
AFL120_I = 210.0

# XRUHAKXS 120 mm2 (kabel)
XR120_R = 0.253
XR120_X = 0.093
XR120_B = 16.34
XR120_I = 280.0


def _mk_line(
    lid: str,
    name: str,
    from_n: str,
    to_n: str,
    r: float,
    x: float,
    b: float,
    length: float,
    rated_i: float,
) -> LineBranch:
    return LineBranch(
        id=lid,
        name=name,
        branch_type=BranchType.LINE,
        from_node_id=from_n,
        to_node_id=to_n,
        in_service=True,
        r_ohm_per_km=r,
        x_ohm_per_km=x,
        b_us_per_km=b,
        length_km=length,
        rated_current_a=rated_i,
    )


def _mk_trafo(
    tid: str,
    name: str,
    from_n: str,
    to_n: str,
    sn_mva: float,
    uk_pct: float,
    pk_kw: float,
    vg: str = "Dyn11",
) -> TransformerBranch:
    return TransformerBranch(
        id=tid,
        name=name,
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_n,
        to_node_id=to_n,
        in_service=True,
        rated_power_mva=sn_mva,
        voltage_hv_kv=UN_SN,
        voltage_lv_kv=UN_NN,
        uk_percent=uk_pct,
        pk_kw=pk_kw,
        i0_percent=0.35,
        p0_kw=sn_mva * 1000 * 0.003,
        vector_group=vg,
        tap_position=0,
        tap_step_percent=2.5,
    )


def _mk_pq(nid: str, name: str, vl: float = UN_SN, p: float = 0.0, q: float = 0.0) -> Node:
    return Node(
        id=nid,
        name=name,
        node_type=NodeType.PQ,
        voltage_level=vl,
        active_power=p,
        reactive_power=q,
    )


def _mk_sw(
    sid: str,
    name: str,
    from_n: str,
    to_n: str,
    st: SwitchType = SwitchType.BREAKER,
    state: SwitchState = SwitchState.CLOSED,
    rated_i: float = 630.0,
) -> Switch:
    return Switch(
        id=sid,
        name=name,
        from_node_id=from_n,
        to_node_id=to_n,
        switch_type=st,
        state=state,
        in_service=True,
        rated_current_a=rated_i,
        rated_voltage_kv=UN_SN,
    )


def _add_station_trafo(
    g: NetworkGraph,
    station_id: str,
    station_name: str,
    sn_bus: str,
    sn_mva: float,
    p_mw: float,
    q_mvar: float,
) -> None:
    """Dodaje stacje SN/nN: wezel nN + transformator + obciazenie."""
    nn_bus = f"bus-{station_id}-nn"
    tr_id = f"tr-{station_id}"

    g.add_node(_mk_pq(nn_bus, f"{station_name} szyna nN", vl=UN_NN, p=p_mw, q=q_mvar))

    if sn_mva <= 0.160:
        uk = 4.0
        pk = sn_mva * 1000 * 0.02
    elif sn_mva <= 0.400:
        uk = 4.5
        pk = sn_mva * 1000 * 0.015
    elif sn_mva <= 0.630:
        uk = 5.0
        pk = sn_mva * 1000 * 0.013
    else:
        uk = 6.0
        pk = sn_mva * 1000 * 0.011

    g.add_branch(
        _mk_trafo(
            tr_id,
            f"{station_name} TR {int(sn_mva * 1000)} kVA",
            sn_bus,
            nn_bus,
            sn_mva=sn_mva,
            uk_pct=uk,
            pk_kw=pk,
        )
    )

    g.add_station(
        Station(
            id=f"station-{station_id}",
            name=station_name,
            station_type=StationType.TRANSFORMER,
            voltage_level_kv=UN_SN,
            bus_ids=[sn_bus, nn_bus],
            branch_ids=[tr_id],
        )
    )


def build_terrain_network() -> NetworkGraph:
    """
    Buduje siec terenowa SN 15 kV: GPZ + magistrala + ring + 3 odgalezienia + PV.

    Returns:
        NetworkGraph z pelna topologia sieci terenowej.
    """
    g = NetworkGraph()

    # =========================================================================
    # GPZ 15 kV — zasilanie (szyna nieskonczona)
    # =========================================================================

    g.add_node(
        Node(
            id="bus-gpz",
            name="GPZ 15 kV (zasilanie)",
            node_type=NodeType.SLACK,
            voltage_level=UN_SN,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )

    # Impedancja zasilania: Zsys = Un^2 / Sk = 15^2 / 250 = 0.9 Ohm
    _zsys = UN_SN**2 / SK_GPZ_MVA
    _xsys = _zsys / math.sqrt(1.0 + RX_GPZ**2)
    _rsys = RX_GPZ * _xsys

    g.add_node(_mk_pq("bus-gpz-out", "GPZ wyprowadzenie"))
    g.add_branch(
        _mk_line(
            "line-gpz-sys",
            "Impedancja zasilania GPZ",
            "bus-gpz",
            "bus-gpz-out",
            r=_rsys,
            x=_xsys,
            b=0.0,
            length=1.0,
            rated_i=10000.0,
        )
    )

    # =========================================================================
    # MAGISTRALA GLOWNA: GPZ → S1 → S2 → S3 → S4 → S5 → S6
    # =========================================================================

    # --- S1 (przelotowa, TR-630) ---
    g.add_node(_mk_pq("bus-s1-sn", "S1 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-gpz-s1",
            "GPZ-S1",
            "bus-gpz-out",
            "bus-s1-sn",
            AFL120_R,
            AFL120_X,
            AFL120_B,
            1.5,
            AFL120_I,
        )
    )
    _add_station_trafo(g, "s1", "Stacja 1 (przelotowa)", "bus-s1-sn", 0.630, 0.30, 0.08)

    # --- S2 (odgalezna, TR-400) ---
    g.add_node(_mk_pq("bus-s2-sn", "S2 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-s1-s2",
            "S1-S2",
            "bus-s1-sn",
            "bus-s2-sn",
            AFL120_R,
            AFL120_X,
            AFL120_B,
            1.2,
            AFL120_I,
        )
    )
    _add_station_trafo(g, "s2", "Stacja 2 (odgalezna)", "bus-s2-sn", 0.400, 0.20, 0.06)

    # --- S3 (przelotowa, TR-400) ---
    g.add_node(_mk_pq("bus-s3-sn", "S3 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-s2-s3",
            "S2-S3",
            "bus-s2-sn",
            "bus-s3-sn",
            AFL120_R,
            AFL120_X,
            AFL120_B,
            0.9,
            AFL120_I,
        )
    )
    _add_station_trafo(g, "s3", "Stacja 3 (przelotowa)", "bus-s3-sn", 0.400, 0.18, 0.05)

    # --- S4 (sekcyjna — 2 szyny SN, sprzeglo, BEZ transformatora) ---
    g.add_node(_mk_pq("bus-s4-sn-a", "S4 szyna SN-A"))
    g.add_node(_mk_pq("bus-s4-sn-b", "S4 szyna SN-B"))
    g.add_branch(
        _mk_line(
            "line-s3-s4",
            "S3-S4",
            "bus-s3-sn",
            "bus-s4-sn-a",
            AFL120_R,
            AFL120_X,
            AFL120_B,
            2.0,
            AFL120_I,
        )
    )
    # Sprzeglo sekcyjne S4 (normalnie zamkniete)
    g.add_switch(
        _mk_sw(
            "sw-coupler-s4",
            "Sprzeglo sekcyjne S4",
            "bus-s4-sn-a",
            "bus-s4-sn-b",
            st=SwitchType.BREAKER,
            state=SwitchState.CLOSED,
            rated_i=630.0,
        )
    )
    g.add_station(
        Station(
            id="station-s4",
            name="Stacja 4 (sekcyjna)",
            station_type=StationType.SWITCHING,
            voltage_level_kv=UN_SN,
            bus_ids=["bus-s4-sn-a", "bus-s4-sn-b"],
            switch_ids=["sw-coupler-s4"],
        )
    )

    # --- S5 (przelotowa, TR-250) ---
    g.add_node(_mk_pq("bus-s5-sn", "S5 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-s4-s5",
            "S4-S5",
            "bus-s4-sn-b",
            "bus-s5-sn",
            AFL120_R,
            AFL120_X,
            AFL120_B,
            2.5,
            AFL120_I,
        )
    )
    _add_station_trafo(g, "s5", "Stacja 5 (przelotowa)", "bus-s5-sn", 0.250, 0.10, 0.03)

    # --- S6 (koncowa, TR-250) ---
    g.add_node(_mk_pq("bus-s6-sn", "S6 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-s5-s6",
            "S5-S6",
            "bus-s5-sn",
            "bus-s6-sn",
            AFL120_R,
            AFL120_X,
            AFL120_B,
            1.8,
            AFL120_I,
        )
    )
    _add_station_trafo(g, "s6", "Stacja 6 (koncowa)", "bus-s6-sn", 0.250, 0.08, 0.02)

    # =========================================================================
    # RING: S6 ↔ S1 via NOP (normalnie otwarty)
    # =========================================================================

    g.add_branch(
        _mk_line(
            "line-s6-s1-nop",
            "S6-S1 odcinek NOP",
            "bus-s6-sn",
            "bus-s1-sn",
            AFL120_R,
            AFL120_X,
            AFL120_B,
            3.0,
            AFL120_I,
        )
    )
    g.add_switch(
        _mk_sw(
            "sw-nop-s6-s1",
            "NOP S6-S1",
            "bus-s6-sn",
            "bus-s1-sn",
            st=SwitchType.LOAD_SWITCH,
            state=SwitchState.OPEN,
        )
    )

    # =========================================================================
    # ODGALEZIENIE 1: S2 → B1 → B2 (kabel)
    # =========================================================================

    g.add_node(_mk_pq("bus-b1-sn", "B1 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-s2-b1",
            "S2-B1",
            "bus-s2-sn",
            "bus-b1-sn",
            XR120_R,
            XR120_X,
            XR120_B,
            0.7,
            XR120_I,
        )
    )
    _add_station_trafo(g, "b1", "Stacja B1 (przelotowa)", "bus-b1-sn", 0.250, 0.08, 0.02)

    g.add_node(_mk_pq("bus-b2-sn", "B2 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-b1-b2",
            "B1-B2",
            "bus-b1-sn",
            "bus-b2-sn",
            XR120_R,
            XR120_X,
            XR120_B,
            0.5,
            XR120_I,
        )
    )
    _add_station_trafo(g, "b2", "Stacja B2 (koncowa)", "bus-b2-sn", 0.160, 0.05, 0.01)

    # =========================================================================
    # ODGALEZIENIE 2: S2 → B3 (kabel + PV 0.5 MW)
    # =========================================================================

    g.add_node(_mk_pq("bus-b3-sn", "B3 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-s2-b3",
            "S2-B3",
            "bus-s2-sn",
            "bus-b3-sn",
            XR120_R,
            XR120_X,
            XR120_B,
            0.6,
            XR120_I,
        )
    )
    _add_station_trafo(g, "b3", "Stacja B3 (koncowa z PV)", "bus-b3-sn", 0.250, 0.10, 0.03)

    # PV 0.5 MW na stronie nN stacji B3
    # In = P / (sqrt(3) * Un) = 500000 / (sqrt(3) * 400) = 721.7 A
    pv_in_rated = 500_000 / (math.sqrt(3) * 400)
    g.add_inverter_source(
        InverterSource(
            id="inv-pv-b3",
            name="PV B3 0.5 MW",
            node_id="bus-b3-nn",
            type_ref="PV-0500",
            converter_kind=ConverterKind.PV,
            in_rated_a=round(pv_in_rated, 1),
            k_sc=1.1,
            in_service=True,
        )
    )

    # =========================================================================
    # ODGALEZIENIE 3: S5 → B4 → B5 (kabel)
    # =========================================================================

    g.add_node(_mk_pq("bus-b4-sn", "B4 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-s5-b4",
            "S5-B4",
            "bus-s5-sn",
            "bus-b4-sn",
            XR120_R,
            XR120_X,
            XR120_B,
            0.8,
            XR120_I,
        )
    )
    _add_station_trafo(g, "b4", "Stacja B4 (przelotowa)", "bus-b4-sn", 0.400, 0.12, 0.03)

    g.add_node(_mk_pq("bus-b5-sn", "B5 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-b4-b5",
            "B4-B5",
            "bus-b4-sn",
            "bus-b5-sn",
            XR120_R,
            XR120_X,
            XR120_B,
            0.4,
            XR120_I,
        )
    )
    _add_station_trafo(g, "b5", "Stacja B5 (koncowa)", "bus-b5-sn", 0.160, 0.06, 0.02)

    # =========================================================================
    # SUB-ODGALEZIENIE: B4 → B6 (kabel)
    # =========================================================================

    g.add_node(_mk_pq("bus-b6-sn", "B6 szyna SN"))
    g.add_branch(
        _mk_line(
            "line-b4-b6",
            "B4-B6",
            "bus-b4-sn",
            "bus-b6-sn",
            XR120_R,
            XR120_X,
            XR120_B,
            0.3,
            XR120_I,
        )
    )
    _add_station_trafo(g, "b6", "Stacja B6 (koncowa)", "bus-b6-sn", 0.160, 0.04, 0.01)

    return g


# =============================================================================
# STATYSTYKI I WALIDACJA
# =============================================================================


def get_terrain_network_statistics(g: NetworkGraph) -> dict:
    """Statystyki sieci terenowej do weryfikacji kompletnosci."""
    nodes = list(g.nodes.values())
    branches = list(g.branches.values())
    switches = list(g.switches.values())
    stations = list(g.stations.values())
    inverters = list(g.inverter_sources.values())

    line_branches = [b for b in branches if isinstance(b, LineBranch)]
    trafo_branches = [b for b in branches if isinstance(b, TransformerBranch)]

    open_switches = [s for s in switches if s.is_open]
    sn_nodes = [n for n in nodes if n.voltage_level == UN_SN]
    nn_nodes = [n for n in nodes if n.voltage_level == UN_NN]

    return {
        "wezly": len(nodes),
        "wezly_sn": len(sn_nodes),
        "wezly_nn": len(nn_nodes),
        "galezi_liniowe": len(line_branches),
        "transformatory": len(trafo_branches),
        "laczniki": len(switches),
        "laczniki_otwarte": len(open_switches),
        "stacje": len(stations),
        "inwertery": len(inverters),
    }
