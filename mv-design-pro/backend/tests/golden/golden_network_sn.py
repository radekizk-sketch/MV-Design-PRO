"""
Golden Network SN — kanoniczny model referencyjny sieci sredniogo napiecia 15 kV.

Struktura:
- GPZ 110/15 kV „Przykladowa" z 2× TR 25 MVA Yd11
- 2 sekcje szyn SN, sprzeglo sekcyjne (NO)
- 8 pol liniowych (po 4 na sekcje)
- MAGISTRALA A: OHL, 12 odcinkow, 10 stacji
- MAGISTRALA B: mieszana OHL/kabel, 10 odcinkow, ring z NO, 6 stacji + reklozer
- MAGISTRALA C: kabel, 9 odcinkow, OZE (PV + BESS), 4 stacje
- Lacznie: 20 stacji, 31+ odcinkow, 2 TR WN/SN, 20+ TR SN/nN

Dane zgodne z Wykladami 01-20, normami PN-EN 60909, metodologia Hoppel.
"""

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
# PARAMETRY SIECI (STALE)
# =============================================================================

# Moc zwarciowa systemu na szynach 110 kV
SK_SYS_MVA = 4000.0
RX_SYS = 0.1

# Napiecia znamionowe
UN_WN = 110.0  # kV
UN_SN = 15.0  # kV
UN_NN = 0.4  # kV

# Wspolczynnik napiecia (IEC 60909, siec > 1 kV, prad max)
C_FACTOR = 1.1


# =============================================================================
# PARAMETRY LINII (Ohm/km) — wg Hoppel / katalogow
# =============================================================================

# AFL-6 70 mm²
AFL70_R = 0.420
AFL70_X = 0.377
AFL70_B = 2.84
AFL70_I = 210.0

# AFL-6 50 mm²
AFL50_R = 0.603
AFL50_X = 0.386
AFL50_B = 2.74
AFL50_I = 175.0

# AFL-6 35 mm²
AFL35_R = 0.850
AFL35_X = 0.394
AFL35_B = 2.65
AFL35_I = 145.0

# XRUHAKXS 240 mm²
XR240_R = 0.125
XR240_X = 0.083
XR240_B = 23.25  # ~370 nF/km * 2*pi*50*1e-3
XR240_I = 420.0

# XRUHAKXS 120 mm²
XR120_R = 0.253
XR120_X = 0.093
XR120_B = 16.34  # ~260 nF/km * 2*pi*50*1e-3
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
    uhv: float,
    ulv: float,
    uk_pct: float,
    pk_kw: float,
    vg: str = "Yd11",
) -> TransformerBranch:
    return TransformerBranch(
        id=tid,
        name=name,
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_n,
        to_node_id=to_n,
        in_service=True,
        rated_power_mva=sn_mva,
        voltage_hv_kv=uhv,
        voltage_lv_kv=ulv,
        uk_percent=uk_pct,
        pk_kw=pk_kw,
        i0_percent=0.35,
        p0_kw=25.0,
        vector_group=vg,
        tap_position=0,
        tap_step_percent=2.5,
    )


def _mk_pq(nid: str, name: str, vl: float = UN_SN) -> Node:
    """Tworzy wezel PQ (szyna, wejscie, rozgalezienie) z P=Q=0."""
    return Node(
        id=nid,
        name=name,
        node_type=NodeType.PQ,
        voltage_level=vl,
        active_power=0.0,
        reactive_power=0.0,
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


def build_golden_network() -> NetworkGraph:
    """
    Buduje pelny Golden Network SN: GPZ + 3 magistrale + 20 stacji + ring + OZE.

    Returns:
        NetworkGraph z pelna topologia sieci SN 15 kV.
    """
    g = NetworkGraph()

    # =========================================================================
    # GPZ 110/15 kV
    # =========================================================================

    # Wezel referencyjny systemu (szyna nieskonczona)
    g.add_node(
        Node(
            id="bus-system-ref",
            name="System 110 kV (szyna nieskonczona)",
            node_type=NodeType.SLACK,
            voltage_level=UN_WN,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )

    # Szyna WN 110 kV GPZ
    g.add_node(_mk_pq("bus-wn-110", "Szyna 110 kV GPZ", vl=UN_WN))

    # Impedancja systemu: Zsys = Un^2 / Sk_sys = 110^2 / 4000 = 3.025 Ohm
    # R/X = 0.1 → X = 3.025/sqrt(1.01), R = 0.1*X
    import math as _math

    _zsys = UN_WN**2 / SK_SYS_MVA  # 3.025 Ohm
    _xsys = _zsys / _math.sqrt(1.0 + RX_SYS**2)
    _rsys = RX_SYS * _xsys
    g.add_branch(
        _mk_line(
            "line-system",
            "Impedancja systemu 110 kV",
            "bus-system-ref",
            "bus-wn-110",
            r=_rsys,
            x=_xsys,
            b=0.0,
            length=1.0,
            rated_i=10000.0,
        )
    )

    # Szyny SN — 2 sekcje
    g.add_node(_mk_pq("bus-sn-s1", "Szyna SN sekcja I"))
    g.add_node(_mk_pq("bus-sn-s2", "Szyna SN sekcja II"))

    # Wezly posrednie (strona SN transformatorow przed szyna)
    g.add_node(_mk_pq("bus-tr1-sn", "TR1 strona SN"))
    g.add_node(_mk_pq("bus-tr2-sn", "TR2 strona SN"))

    # Transformatory WN/SN
    g.add_branch(
        _mk_trafo(
            "tr-gpz-1",
            "TR1 110/15 kV 25 MVA",
            "bus-wn-110",
            "bus-tr1-sn",
            sn_mva=25.0,
            uhv=UN_WN,
            ulv=UN_SN,
            uk_pct=11.0,
            pk_kw=120.0,
        )
    )
    g.add_branch(
        _mk_trafo(
            "tr-gpz-2",
            "TR2 110/15 kV 25 MVA",
            "bus-wn-110",
            "bus-tr2-sn",
            sn_mva=25.0,
            uhv=UN_WN,
            ulv=UN_SN,
            uk_pct=11.0,
            pk_kw=120.0,
        )
    )

    # Wylaczniki pol transformatorowych
    g.add_switch(_mk_sw("sw-tr1-cb", "Q TR1", "bus-tr1-sn", "bus-sn-s1"))
    g.add_switch(_mk_sw("sw-tr2-cb", "Q TR2", "bus-tr2-sn", "bus-sn-s2"))

    # Sprzeglo sekcyjne (normalnie otwarte)
    g.add_switch(
        _mk_sw(
            "sw-coupler",
            "Sprzeglo sekcyjne",
            "bus-sn-s1",
            "bus-sn-s2",
            st=SwitchType.BREAKER,
            state=SwitchState.OPEN,
            rated_i=1250.0,
        )
    )

    # =========================================================================
    # POLA LINIOWE — wezly wyjsciowe na szynie
    # =========================================================================

    # Sekcja I: magistrale A, B, C, rezerwa
    for label, bus_id in [
        ("Pole liniowe A", "bus-bay-a"),
        ("Pole liniowe B", "bus-bay-b"),
        ("Pole liniowe C", "bus-bay-c"),
        ("Pole liniowe rezerwa I", "bus-bay-r1"),
    ]:
        g.add_node(_mk_pq(bus_id, label))
        g.add_switch(_mk_sw(f"sw-{bus_id}", f"Q {label}", "bus-sn-s1", bus_id))

    # Sekcja II: magistrale D, E (=ring B), rezerwa
    for label, bus_id in [
        ("Pole liniowe D", "bus-bay-d"),
        ("Pole liniowe E (ring B)", "bus-bay-e"),
        ("Pole liniowe rezerwa II-1", "bus-bay-r2"),
        ("Pole liniowe rezerwa II-2", "bus-bay-r3"),
    ]:
        g.add_node(_mk_pq(bus_id, label))
        g.add_switch(_mk_sw(f"sw-{bus_id}", f"Q {label}", "bus-sn-s2", bus_id))

    # =========================================================================
    # MAGISTRALA A — OHL, 12 odcinkow, 10 stacji
    # =========================================================================

    _build_magistrala_a(g)

    # =========================================================================
    # MAGISTRALA B — mieszana, ring z NO, 10 odcinkow, 6 stacji + reklozer
    # =========================================================================

    _build_magistrala_b(g)

    # =========================================================================
    # MAGISTRALA C — kabel, OZE, 9 odcinkow, 4 stacje
    # =========================================================================

    _build_magistrala_c(g)

    return g


def _build_magistrala_a(g: NetworkGraph) -> None:
    """Magistrala A: OHL, 12 odcinkow, 10 stacji SN/nN."""

    prev = "bus-bay-a"

    # A1: AFL-6 70 → punkt sekcjonowania 1
    g.add_node(_mk_pq("bus-a1", "Punkt sekc. A1"))
    g.add_branch(
        _mk_line("line-a1", "Odcinek A1", prev, "bus-a1", AFL70_R, AFL70_X, AFL70_B, 2.5, AFL70_I)
    )
    g.add_switch(
        _mk_sw("sw-sekc-a1", "DS sekcjonowanie A1", prev, "bus-a1", SwitchType.DISCONNECTOR)
    )
    prev = "bus-a1"

    # A2: AFL-6 70 → rozgalezienie → Stacja 01 (slupowa, 160 kVA)
    g.add_node(_mk_pq("bus-a2", "Rozgalezienie A2"))
    g.add_branch(
        _mk_line("line-a2", "Odcinek A2", prev, "bus-a2", AFL70_R, AFL70_X, AFL70_B, 1.8, AFL70_I)
    )
    _add_station(g, "st01", "Stacja 01", "bus-a2", StationType.TRANSFORMER, 0.160, "Dyn11")
    prev = "bus-a2"

    # A3: AFL-6 70 → Stacja 02 (kontenerowa, 400 kVA)
    g.add_node(_mk_pq("bus-a3", "Stacja 02 wejscie"))
    g.add_branch(
        _mk_line("line-a3", "Odcinek A3", prev, "bus-a3", AFL70_R, AFL70_X, AFL70_B, 3.2, AFL70_I)
    )
    _add_station(g, "st02", "Stacja 02", "bus-a3", StationType.TRANSFORMER, 0.400, "Dyn11")
    prev = "bus-a3"

    # A4: AFL-6 50 → punkt sekcjonowania 2
    g.add_node(_mk_pq("bus-a4", "Punkt sekc. A4"))
    g.add_branch(
        _mk_line("line-a4", "Odcinek A4", prev, "bus-a4", AFL50_R, AFL50_X, AFL50_B, 2.0, AFL50_I)
    )
    g.add_switch(
        _mk_sw("sw-sekc-a4", "DS sekcjonowanie A4", prev, "bus-a4", SwitchType.DISCONNECTOR)
    )
    prev = "bus-a4"

    # A5: AFL-6 50 → rozgalezienie → Stacja 03 (wnetrzowa, 630 kVA)
    g.add_node(_mk_pq("bus-a5", "Rozgalezienie A5"))
    g.add_branch(
        _mk_line("line-a5", "Odcinek A5", prev, "bus-a5", AFL50_R, AFL50_X, AFL50_B, 4.5, AFL50_I)
    )
    _add_station(g, "st03", "Stacja 03", "bus-a5", StationType.TRANSFORMER, 0.630, "Dyn11")
    prev = "bus-a5"

    # A6: AFL-6 50 → Stacja 04 (slupowa, 100 kVA)
    g.add_node(_mk_pq("bus-a6", "Stacja 04 wejscie"))
    g.add_branch(
        _mk_line("line-a6", "Odcinek A6", prev, "bus-a6", AFL50_R, AFL50_X, AFL50_B, 1.5, AFL50_I)
    )
    _add_station(g, "st04", "Stacja 04", "bus-a6", StationType.TRANSFORMER, 0.100, "Dyn11")
    prev = "bus-a6"

    # A7: AFL-6 35 → rozgalezienie → Stacja 05 (kontenerowa, 250 kVA)
    g.add_node(_mk_pq("bus-a7", "Rozgalezienie A7"))
    g.add_branch(
        _mk_line("line-a7", "Odcinek A7", prev, "bus-a7", AFL35_R, AFL35_X, AFL35_B, 3.0, AFL35_I)
    )
    _add_station(g, "st05", "Stacja 05", "bus-a7", StationType.TRANSFORMER, 0.250, "Dyn11")
    prev = "bus-a7"

    # A8: AFL-6 35 → Stacja 06 (slupowa, 160 kVA)
    g.add_node(_mk_pq("bus-a8", "Stacja 06 wejscie"))
    g.add_branch(
        _mk_line("line-a8", "Odcinek A8", prev, "bus-a8", AFL35_R, AFL35_X, AFL35_B, 2.8, AFL35_I)
    )
    _add_station(g, "st06", "Stacja 06", "bus-a8", StationType.TRANSFORMER, 0.160, "Dyn11")
    prev = "bus-a8"

    # A9: AFL-6 35 → Stacja 07 (slupowa, 63 kVA)
    g.add_node(_mk_pq("bus-a9", "Stacja 07 wejscie"))
    g.add_branch(
        _mk_line("line-a9", "Odcinek A9", prev, "bus-a9", AFL35_R, AFL35_X, AFL35_B, 1.2, AFL35_I)
    )
    _add_station(g, "st07", "Stacja 07", "bus-a9", StationType.TRANSFORMER, 0.063, "Dyn11")
    prev = "bus-a9"

    # A10: AFL-6 35 → Stacja 08 (kontenerowa, 400 kVA) — koncowa
    g.add_node(_mk_pq("bus-a10", "Stacja 08 wejscie"))
    g.add_branch(
        _mk_line(
            "line-a10", "Odcinek A10", prev, "bus-a10", AFL35_R, AFL35_X, AFL35_B, 4.0, AFL35_I
        )
    )
    _add_station(g, "st08", "Stacja 08", "bus-a10", StationType.TRANSFORMER, 0.400, "Dyn11")

    # Sub-branch od rozgalezienia A5
    # A11: AFL-6 50 → Stacja 09 (wnetrzowa, 250 kVA)
    g.add_node(_mk_pq("bus-a11", "Stacja 09 wejscie"))
    g.add_branch(
        _mk_line(
            "line-a11",
            "Odcinek A11 (sub-branch)",
            "bus-a5",
            "bus-a11",
            AFL50_R,
            AFL50_X,
            AFL50_B,
            2.5,
            AFL50_I,
        )
    )
    _add_station(g, "st09", "Stacja 09", "bus-a11", StationType.TRANSFORMER, 0.250, "Dyn11")

    # A12: AFL-6 35 → Stacja 10 (slupowa, 100 kVA) — koncowa sub
    g.add_node(_mk_pq("bus-a12", "Stacja 10 wejscie"))
    g.add_branch(
        _mk_line(
            "line-a12",
            "Odcinek A12 (sub-branch)",
            "bus-a11",
            "bus-a12",
            AFL35_R,
            AFL35_X,
            AFL35_B,
            1.0,
            AFL35_I,
        )
    )
    _add_station(g, "st10", "Stacja 10", "bus-a12", StationType.TRANSFORMER, 0.100, "Dyn11")


def _build_magistrala_b(g: NetworkGraph) -> None:
    """Magistrala B: mieszana OHL/kabel, ring z NO, 10 odcinkow, 6 stacji."""

    prev = "bus-bay-b"

    # B1: kabel XRUHAKXS 240 — wyprowadzenie kablowe z GPZ
    g.add_node(_mk_pq("bus-b1", "B1 RS-1 wejscie"))
    g.add_branch(
        _mk_line(
            "line-b1", "Odcinek B1 kabel", prev, "bus-b1", XR240_R, XR240_X, XR240_B, 1.2, XR240_I
        )
    )
    prev = "bus-b1"

    # B2: kabel XRUHAKXS 240 → RS-1 (rozdzielnica sieciowa)
    g.add_node(_mk_pq("bus-b2", "RS-1"))
    g.add_branch(
        _mk_line(
            "line-b2", "Odcinek B2 kabel", prev, "bus-b2", XR240_R, XR240_X, XR240_B, 0.8, XR240_I
        )
    )
    prev = "bus-b2"

    # B3: przejscie OHL↔kabel (mufa) + OHL AFL-6 70 → Stacja 11 (630 kVA)
    g.add_node(_mk_pq("bus-b3-mufa", "Mufa B3"))
    # Krotki odcinek kablowy do mufy
    g.add_branch(
        _mk_line(
            "line-b3-cable",
            "Odcinek B3 kabel->mufa",
            prev,
            "bus-b3-mufa",
            XR240_R,
            XR240_X,
            XR240_B,
            0.05,
            XR240_I,
        )
    )
    # OHL od mufy
    g.add_node(_mk_pq("bus-b3", "Stacja 11 wejscie"))
    g.add_branch(
        _mk_line(
            "line-b3",
            "Odcinek B3 OHL",
            "bus-b3-mufa",
            "bus-b3",
            AFL70_R,
            AFL70_X,
            AFL70_B,
            5.0,
            AFL70_I,
        )
    )
    _add_station(g, "st11", "Stacja 11", "bus-b3", StationType.TRANSFORMER, 0.630, "Dyn11")
    prev = "bus-b3"

    # B4: AFL-6 70 → rozgalezienie → Stacja 12 (400 kVA)
    g.add_node(_mk_pq("bus-b4", "Rozgalezienie B4"))
    g.add_branch(
        _mk_line("line-b4", "Odcinek B4", prev, "bus-b4", AFL70_R, AFL70_X, AFL70_B, 3.5, AFL70_I)
    )
    _add_station(g, "st12", "Stacja 12", "bus-b4", StationType.TRANSFORMER, 0.400, "Dyn11")
    prev = "bus-b4"

    # B5: AFL-6 50 → Stacja 13 (250 kVA)
    g.add_node(_mk_pq("bus-b5", "Stacja 13 wejscie"))
    g.add_branch(
        _mk_line("line-b5", "Odcinek B5", prev, "bus-b5", AFL50_R, AFL50_X, AFL50_B, 4.0, AFL50_I)
    )
    _add_station(g, "st13", "Stacja 13", "bus-b5", StationType.TRANSFORMER, 0.250, "Dyn11")
    prev = "bus-b5"

    # B6: AFL-6 50 → Reklozer R1
    g.add_node(_mk_pq("bus-b6", "Reklozer R1"))
    g.add_branch(
        _mk_line("line-b6", "Odcinek B6", prev, "bus-b6", AFL50_R, AFL50_X, AFL50_B, 2.5, AFL50_I)
    )
    g.add_switch(_mk_sw("sw-recloser-b6", "Reklozer R1", prev, "bus-b6", SwitchType.RECLOSER))
    prev = "bus-b6"

    # B7: AFL-6 50 → Stacja 14 (400 kVA)
    g.add_node(_mk_pq("bus-b7", "Stacja 14 wejscie"))
    g.add_branch(
        _mk_line("line-b7", "Odcinek B7", prev, "bus-b7", AFL50_R, AFL50_X, AFL50_B, 3.0, AFL50_I)
    )
    _add_station(g, "st14", "Stacja 14", "bus-b7", StationType.TRANSFORMER, 0.400, "Dyn11")
    prev = "bus-b7"

    # B8: AFL-6 35 → Stacja 15 (100 kVA) — punkt NO
    g.add_node(_mk_pq("bus-b8", "Stacja 15 wejscie / punkt NO"))
    g.add_branch(
        _mk_line("line-b8", "Odcinek B8", prev, "bus-b8", AFL35_R, AFL35_X, AFL35_B, 2.0, AFL35_I)
    )
    _add_station(g, "st15", "Stacja 15", "bus-b8", StationType.TRANSFORMER, 0.100, "Dyn11")

    # Ring: B8 → bus-bay-e (sekcja II) — lacznik NO
    g.add_node(_mk_pq("bus-b9", "Odcinek powrotny B9"))
    g.add_branch(
        _mk_line(
            "line-b9",
            "Odcinek B9 (ring)",
            "bus-b8",
            "bus-b9",
            AFL35_R,
            AFL35_X,
            AFL35_B,
            1.5,
            AFL35_I,
        )
    )
    g.add_switch(
        _mk_sw(
            "sw-no-ring",
            "Lacznik NO ring B",
            "bus-b9",
            "bus-bay-e",
            st=SwitchType.LOAD_SWITCH,
            state=SwitchState.OPEN,
            rated_i=400.0,
        )
    )

    # Sub-branch od B4
    # B10: AFL-6 50 → Stacja 16 (160 kVA)
    g.add_node(_mk_pq("bus-b10", "Stacja 16 wejscie"))
    g.add_branch(
        _mk_line(
            "line-b10",
            "Odcinek B10 (sub-branch)",
            "bus-b4",
            "bus-b10",
            AFL50_R,
            AFL50_X,
            AFL50_B,
            2.0,
            AFL50_I,
        )
    )
    _add_station(g, "st16", "Stacja 16", "bus-b10", StationType.TRANSFORMER, 0.160, "Dyn11")


def _build_magistrala_c(g: NetworkGraph) -> None:
    """Magistrala C: kabel + OZE, 9 odcinkow, 4 stacje."""

    prev = "bus-bay-c"

    # C1: kabel XRUHAKXS 240 → RS-2
    g.add_node(_mk_pq("bus-c1", "RS-2"))
    g.add_branch(
        _mk_line(
            "line-c1", "Odcinek C1 kabel", prev, "bus-c1", XR240_R, XR240_X, XR240_B, 2.0, XR240_I
        )
    )
    prev = "bus-c1"

    # C2: kabel XRUHAKXS 120 → Stacja 17 (630 kVA, przemyslowa)
    g.add_node(_mk_pq("bus-c2", "Stacja 17 wejscie"))
    g.add_branch(
        _mk_line(
            "line-c2", "Odcinek C2 kabel", prev, "bus-c2", XR120_R, XR120_X, XR120_B, 1.5, XR120_I
        )
    )
    _add_station(g, "st17", "Stacja 17", "bus-c2", StationType.TRANSFORMER, 0.630, "Dyn11")
    prev = "bus-c2"

    # C3: kabel XRUHAKXS 120 → Stacja 18 (400 kVA)
    g.add_node(_mk_pq("bus-c3", "Stacja 18 wejscie"))
    g.add_branch(
        _mk_line(
            "line-c3", "Odcinek C3 kabel", prev, "bus-c3", XR120_R, XR120_X, XR120_B, 1.0, XR120_I
        )
    )
    _add_station(g, "st18", "Stacja 18", "bus-c3", StationType.TRANSFORMER, 0.400, "Dyn11")
    prev = "bus-c3"

    # C4: kabel XRUHAKXS 120 → odgalezienie OZE
    g.add_node(_mk_pq("bus-c4", "Odgalezienie OZE"))
    g.add_branch(
        _mk_line(
            "line-c4", "Odcinek C4 kabel", prev, "bus-c4", XR120_R, XR120_X, XR120_B, 2.5, XR120_I
        )
    )
    prev_oze = "bus-c4"

    # C5: kabel → Farma PV 2 MW
    g.add_node(_mk_pq("bus-c5-pv", "Farma PV 2 MW"))
    g.add_branch(
        _mk_line(
            "line-c5",
            "Odcinek C5 kabel OZE",
            prev_oze,
            "bus-c5-pv",
            XR120_R,
            XR120_X,
            XR120_B,
            0.5,
            XR120_I,
        )
    )
    g.add_inverter_source(
        InverterSource(
            id="inv-pv-2mw",
            name="Inwerter PV 2 MW",
            node_id="bus-c5-pv",
            converter_kind=ConverterKind.PV,
            in_rated_a=77.0,  # 2 MW / (sqrt(3) * 15 kV)
            k_sc=1.1,
            contributes_negative_sequence=False,
            contributes_zero_sequence=False,
            in_service=True,
        )
    )

    # C6: kabel → BESS 1 MW / 2 MWh
    g.add_node(_mk_pq("bus-c6-bess", "BESS 1 MW"))
    g.add_branch(
        _mk_line(
            "line-c6",
            "Odcinek C6 kabel BESS",
            prev_oze,
            "bus-c6-bess",
            XR120_R,
            XR120_X,
            XR120_B,
            0.3,
            XR120_I,
        )
    )
    g.add_inverter_source(
        InverterSource(
            id="inv-bess-1mw",
            name="Inwerter BESS 1 MW",
            node_id="bus-c6-bess",
            converter_kind=ConverterKind.BESS,
            in_rated_a=38.5,  # 1 MW / (sqrt(3) * 15 kV)
            k_sc=1.0,
            contributes_negative_sequence=False,
            contributes_zero_sequence=False,
            in_service=True,
        )
    )

    # Kontynuacja magistrali C od odgalezienia OZE
    prev = "bus-c4"

    # C7: kabel XRUHAKXS 120 → Stacja 19 (250 kVA)
    g.add_node(_mk_pq("bus-c7", "Stacja 19 wejscie"))
    g.add_branch(
        _mk_line(
            "line-c7", "Odcinek C7 kabel", prev, "bus-c7", XR120_R, XR120_X, XR120_B, 1.8, XR120_I
        )
    )
    _add_station(g, "st19", "Stacja 19", "bus-c7", StationType.TRANSFORMER, 0.250, "Dyn11")
    prev = "bus-c7"

    # C8: kabel XRUHAKXS 120 → punkt rezerwy (DS normalnie otwarty)
    g.add_node(_mk_pq("bus-c8", "Punkt rezerwy C8"))
    g.add_branch(
        _mk_line(
            "line-c8", "Odcinek C8 kabel", prev, "bus-c8", XR120_R, XR120_X, XR120_B, 2.0, XR120_I
        )
    )
    g.add_switch(
        _mk_sw(
            "sw-rezerwa-c8",
            "DS rezerwa C8",
            prev,
            "bus-c8",
            st=SwitchType.DISCONNECTOR,
            state=SwitchState.OPEN,
        )
    )
    prev = "bus-c8"

    # C9: kabel XRUHAKXS 120 → Stacja 20 (160 kVA) — koncowa
    g.add_node(_mk_pq("bus-c9", "Stacja 20 wejscie"))
    g.add_branch(
        _mk_line(
            "line-c9", "Odcinek C9 kabel", prev, "bus-c9", XR120_R, XR120_X, XR120_B, 1.2, XR120_I
        )
    )
    _add_station(g, "st20", "Stacja 20", "bus-c9", StationType.TRANSFORMER, 0.160, "Dyn11")


def _add_station(
    g: NetworkGraph,
    station_id: str,
    station_name: str,
    entry_bus: str,
    station_type: StationType,
    sn_kva_mva: float,
    vector_group: str,
) -> None:
    """Dodaje stacje SN/nN: wezel nN + transformator SN/nN + obciazenie."""

    nn_bus = f"bus-{station_id}-nn"
    tr_id = f"tr-{station_id}"

    # Wezel nN w stacji
    g.add_node(
        Node(
            id=nn_bus,
            name=f"{station_name} szyna nN",
            node_type=NodeType.PQ,
            voltage_level=UN_NN,
            active_power=sn_kva_mva * 0.85,  # cos_phi=0.85 typowy
            reactive_power=sn_kva_mva * 0.53,  # sin(arccos(0.85)) ≈ 0.527
        )
    )

    # Transformator SN/nN
    # uk% zalezy od mocy: 4% (do 160 kVA), 4.5% (250-400 kVA), 5% (630 kVA), 6% (1000 kVA)
    if sn_kva_mva <= 0.160:
        uk = 4.0
        pk = sn_kva_mva * 1000 * 0.02  # ~2% strat
    elif sn_kva_mva <= 0.400:
        uk = 4.5
        pk = sn_kva_mva * 1000 * 0.015
    elif sn_kva_mva <= 0.630:
        uk = 5.0
        pk = sn_kva_mva * 1000 * 0.013
    else:
        uk = 6.0
        pk = sn_kva_mva * 1000 * 0.011

    g.add_branch(
        _mk_trafo(
            tr_id,
            f"{station_name} TR {int(sn_kva_mva * 1000)} kVA",
            entry_bus,
            nn_bus,
            sn_mva=sn_kva_mva,
            uhv=UN_SN,
            ulv=UN_NN,
            uk_pct=uk,
            pk_kw=pk,
            vg=vector_group,
        )
    )

    # Stacja logiczna
    g.add_station(
        Station(
            id=f"station-{station_id}",
            name=station_name,
            station_type=station_type,
            voltage_level_kv=UN_SN,
            bus_ids=[entry_bus, nn_bus],
            branch_ids=[tr_id],
            switch_ids=[],
        )
    )


# =============================================================================
# STATYSTYKI I WALIDACJA
# =============================================================================


def get_golden_network_statistics(g: NetworkGraph) -> dict:
    """Statystyki Golden Network do weryfikacji kompletnosci."""
    nodes = list(g.nodes.values())
    branches = list(g.branches.values())
    switches = list(g.switches.values())
    stations = list(g.stations.values())
    inverters = list(g.inverter_sources.values())

    line_branches = [b for b in branches if isinstance(b, LineBranch)]
    trafo_branches = [b for b in branches if isinstance(b, TransformerBranch)]
    wn_sn_trafos = [t for t in trafo_branches if t.voltage_hv_kv >= 100]
    sn_nn_trafos = [t for t in trafo_branches if t.voltage_hv_kv < 100]

    open_switches = [s for s in switches if s.is_open]
    reclosers = [s for s in switches if s.switch_type == SwitchType.RECLOSER]

    return {
        "wezly": len(nodes),
        "galezi_liniowe": len(line_branches),
        "transformatory_wn_sn": len(wn_sn_trafos),
        "transformatory_sn_nn": len(sn_nn_trafos),
        "laczniki": len(switches),
        "laczniki_otwarte": len(open_switches),
        "reklozery": len(reclosers),
        "stacje": len(stations),
        "inwertery": len(inverters),
    }
