"""Wind Type 4 (preset G5-WIND-T4) — per-node κ / ip physics sanity (PN-EN 60909).

Regression lock mirroring the G1/B-02 fix, applied to the wind collector archetype. The
peak factor κ (hence ip) MUST be physical PER NODE: the grid-fed 15 kV collector is the
more inductive (X/R > 5, κ ≈ 1.6-1.75); the 0.69 kV turbine LV behind its Dyn turbine
transformer is less so (X/R ≈ 3.5-6, κ ≈ 1.45-1.60).

Before the fix the substrate used the low-X/R _SN_LINE for the grid infeed (collector
X/R=2, κ≈1.24) and a pure-reactance turbine transformer (LV X/R≈14, κ≈1.81) — inverted,
yet passing the ≤Icw verdict ("✓"): the Z2 trap. |Z| (hence Ik″) is preserved by the
fix; only R/X → κ → ip move.
"""

import math

import pytest
from application.reference_networks.station_archetype_substrate import (
    build_g5_wind_t4,
    build_g6_wind_dfig,
)


def _node(companion: dict, bus: str) -> tuple[float, float, float, float]:
    m = companion["short_circuit"]["buses"][bus]["max"]
    xr = (1.0 / m["rx_ratio"]) if m["rx_ratio"] else math.inf
    return m["ikss_ka"], xr, m["kappa"], m["ip_ka"]


def test_g5_per_node_kappa_ip_are_physical_and_not_inverted():
    c = build_g5_wind_t4()
    sn_ik, sn_xr, sn_k, sn_ip = _node(c, "SN_PCC")
    lv_ik, lv_xr, lv_k, lv_ip = _node(c, "WTG_LV_1")

    # Collector — grid infeed at 15 kV (family standard _GRID_INFEED): X/R > 5, κ 1.60-1.75,
    # ip ≈ 22.9 kA. Audit F-1: the reported collector = grid Thévenin + the IBG REFERRED through
    # the turbine-transformer ratio (≈ 0.28 kA), NOT the solver's raw un-referred §6.7 sum.
    assert sn_xr > 5.0, f"collector X/R={sn_xr:.2f} too resistive for a grid infeed"
    assert 1.60 <= sn_k <= 1.75, f"collector κ={sn_k:.3f} outside grid range"
    assert 22.0 <= sn_ip <= 24.0, f"collector ip={sn_ip:.2f} kA outside 22-24"

    # Turbine LV — behind the Dyn turbine transformer: X/R 3.5-6, κ 1.45-1.60, ip 82-86 kA.
    assert 3.5 <= lv_xr <= 6.0, f"turbine-LV X/R={lv_xr:.2f} unphysical behind a transformer"
    assert 1.45 <= lv_k <= 1.60, f"turbine-LV κ={lv_k:.3f} outside transformer range"
    assert 82.0 <= lv_ip <= 86.0, f"turbine-LV ip={lv_ip:.2f} kA outside 82-86"

    # NOT inverted: the grid side must be MORE inductive than the LV side behind the TR.
    assert sn_k > lv_k, "κ inverted — collector must be more inductive than LV-behind-TR"
    assert sn_xr > lv_xr, "X/R inverted between collector and turbine LV"

    # κ = 1.02 + 0.98·e^(−3·R/X) and ip = κ·√2·Ik″ (PN-EN 60909) — internally consistent.
    for ik, xr, k, ip in [(sn_ik, sn_xr, sn_k, sn_ip), (lv_ik, lv_xr, lv_k, lv_ip)]:
        assert k == pytest.approx(1.02 + 0.98 * math.exp(-3.0 / xr), abs=0.02)
        assert ip == pytest.approx(k * math.sqrt(2.0) * ik, abs=0.1)


def test_g5_collector_uses_family_standard_infeed():
    # ENEA SN has no 30 kV → collector is 15 kV. Audit F-1: all 15 kV presets share ONE grid
    # infeed (_GRID_INFEED, the ENEA family standard) — S_k″ is a connection-point property,
    # not the DER type. The reported collector Ik″/S_k″ is the CONSISTENT metric: grid Thévenin
    # (≈ 9.47 kA, IDENTICAL across the 15 kV family) + the DER REFERRED through the turns ratio.
    # The Typ-4 IBG adds only ≈ 0.28 kA referred → collector ≈ 9.75 kA / ≈ 253 MVA. (The FROZEN
    # solver's raw, UN-referred §6.7 sum ≈ 6 kA would 20× the apparent S_k″ — the metric bug
    # fixed here.) This MUST be ≤ G6 (DFIG: machine in the Z-bus, ≈ +1.3 kA) — see the ordering
    # lock below; reporting the IBG collector ABOVE the DFIG collector would be inverted.
    c = build_g5_wind_t4()
    coll = c["short_circuit"]["buses"]["SN_PCC"]
    assert coll["un_kv"] == 15.0
    assert coll["max"]["ikss_ka"] == pytest.approx(9.75, abs=0.3)
    assert coll["max"]["sk_mva"] == pytest.approx(253.0, abs=6.0)
    assert coll["verification"]["passed"] is True  # 9.75 kA ≤ 25 kA Icw board
    assert c["short_circuit"]["buses"]["WTG_LV_1"]["max"]["ikss_ka"] == pytest.approx(38.4, abs=1.0)


def test_g5_carries_p0_p1_model():
    # P0 (OSD neutral earthing) on the source + P1 (dynamic withstand) PER BUS.
    c = build_g5_wind_t4()
    src = c["source"]
    assert src["grid_earthing"]["neutral_point"] == "kompensowana"
    assert src["grid_earthing"]["imd_it_nn"] is False  # no station nN IT tier in a wind farm
    # I″k1f-z re-levelled to 15 kV (∝ Un): 0.06 kA, DISTINCT from G1 (PV, 0.12 kA) — not a copy.
    assert src["grid_earthing"]["ik_1f_ka"] == pytest.approx(0.06)
    # P1 — dynamic peak withstand is now a PER-BUS nameplate (Idyn = 2.5·Icw SN / 2.1·Icw nN),
    # no ambiguous source scalar; ip ≤ Idyn holds on every busbar.
    assert "withstand" not in src
    buses = c["short_circuit"]["buses"]
    assert buses["SN_PCC"]["idyn_ka"] == pytest.approx(62.5)  # 2.5 × 25 kA Icw (collector)
    assert buses["WTG_LV_1"]["idyn_ka"] == pytest.approx(105.0)  # 2.1 × 50 kA Icw (turbine LV)
    for b in buses.values():
        assert b["max"]["ip_ka"] <= b["idyn_ka"]


def test_g5_ibg_collector_not_above_g6_dfig_collector():
    """Audit F-1 direction lock (G5 Typ-4 IBG vs G6 Typ-3 DFIG).

    Both share the SAME _GRID_INFEED on the SAME 15 kV collector topology, so the GRID part of
    the collector Ik″ is identical. The DER part differs by physics: the DFIG is a rotating
    machine in the Z-bus (crowbar → I″k ≈ 1.3 kA), the Typ-4 turbine is an IBG referred through
    its transformer (≈ 0.28 kA). Superposing DER on the common grid Thévenin, the collector MUST
    satisfy G6 ≳ G5 — never inverted. The pre-fix metric counted the IBG raw (un-referred) and
    reported the IBG collector ABOVE the DFIG (G5 402 > G6 280 MVA): that is the bug this locks out.
    """
    g5 = build_g5_wind_t4()["short_circuit"]["buses"]["SN_PCC"]["max"]
    g6 = build_g6_wind_dfig()["short_circuit"]["buses"]["SN_PCC"]["max"]

    # Direction: DFIG (machine) collector ≥ Typ-4 (IBG) collector, in BOTH Ik″ and S_k″.
    assert g6["ikss_ka"] >= g5["ikss_ka"], "collector Ik″ inverted: DFIG must be ≥ Typ-4 IBG"
    assert g6["sk_mva"] >= g5["sk_mva"], "collector S_k″ inverted: DFIG must be ≥ Typ-4 IBG"

    # Grid dominates → the gap is small (a few kA / tens of MVA), self-explaining without tuning.
    assert 0.0 < (g6["ikss_ka"] - g5["ikss_ka"]) < 3.0
    # Both stay below the 25 kA collector withstand (no preset tuned to pass — physics does).
    assert g5["ikss_ka"] <= 25.0 and g6["ikss_ka"] <= 25.0
