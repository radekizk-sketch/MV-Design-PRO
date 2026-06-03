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
from application.reference_networks.station_archetype_substrate import build_g5_wind_t4


def _node(companion: dict, bus: str) -> tuple[float, float, float, float]:
    m = companion["short_circuit"]["buses"][bus]["max"]
    xr = (1.0 / m["rx_ratio"]) if m["rx_ratio"] else math.inf
    return m["ikss_ka"], xr, m["kappa"], m["ip_ka"]


def test_g5_per_node_kappa_ip_are_physical_and_not_inverted():
    c = build_g5_wind_t4()
    sn_ik, sn_xr, sn_k, sn_ip = _node(c, "SN_PCC")
    lv_ik, lv_xr, lv_k, lv_ip = _node(c, "WTG_LV_1")

    # Collector — grid infeed at 15 kV (family standard _GRID_INFEED): X/R > 5, κ 1.60-1.75,
    # ip 35-38 kA.
    assert sn_xr > 5.0, f"collector X/R={sn_xr:.2f} too resistive for a grid infeed"
    assert 1.60 <= sn_k <= 1.75, f"collector κ={sn_k:.3f} outside grid range"
    assert 35.0 <= sn_ip <= 38.0, f"collector ip={sn_ip:.2f} kA outside 35-38"

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
    # not the DER type. The Typ-4 IBG collector lands at ~15.5 kA / ~402 MVA (was a one-off 559).
    c = build_g5_wind_t4()
    coll = c["short_circuit"]["buses"]["SN_PCC"]
    assert coll["un_kv"] == 15.0
    assert coll["max"]["ikss_ka"] == pytest.approx(15.5, abs=0.4)
    assert coll["max"]["sk_mva"] == pytest.approx(402.0, abs=8.0)
    assert coll["verification"]["passed"] is True  # 15.5 kA ≤ 25 kA Icw board
    assert c["short_circuit"]["buses"]["WTG_LV_1"]["max"]["ikss_ka"] == pytest.approx(38.4, abs=1.0)


def test_g5_carries_p0_p1_model():
    # P0 (OSD neutral earthing) + P1 (dynamic withstand) must be present on the source.
    c = build_g5_wind_t4()
    src = c["source"]
    assert src["grid_earthing"]["neutral_point"] == "kompensowana"
    assert src["grid_earthing"]["imd_it_nn"] is False  # no station nN IT tier in a wind farm
    # I″k1f-z re-levelled to 15 kV (∝ Un): 0.06 kA, DISTINCT from G1 (PV, 0.12 kA) — not a copy.
    assert src["grid_earthing"]["ik_1f_ka"] == pytest.approx(0.06)
    assert src["withstand"]["sn_idyn_ka"] == pytest.approx(63.0)
    assert src["withstand"]["nn_idyn_ka"] == pytest.approx(105.0)
