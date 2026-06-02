"""PV 1 MW (preset G1) — per-node κ / ip physics sanity (PN-EN 60909).

Regression lock for the B-02 delta. The peak factor κ (hence the peak current ip) MUST
be physical PER NODE: the grid-fed SN busbar is the more inductive (X/R > 5, κ ≈ 1.6-1.75)
and the LV busbar behind the step-up transformer is less so (X/R ≈ 3-6, κ ≈ 1.4-1.55).

Two unphysical inputs are caught here:
  - a transformer modelled as pure reactance (pk=0) ⇒ X/R→∞ ⇒ κ_nN≈2 (impossible);
  - a too-resistive grid infeed (X/R=2) ⇒ κ_SN≈1.24.
Both passed the ≤Icw verdict ("✓") while the physics was inverted — exactly the Z2 trap
(green without verification). |Z| (hence Ik″) is unchanged by the fix; only R/X→κ→ip.
"""

import math

import pytest
from application.reference_networks.station_archetype_substrate import build_g4_pvtr


def _node(companion: dict, bus: str) -> tuple[float, float, float, float]:
    m = companion["short_circuit"]["buses"][bus]["max"]
    xr = (1.0 / m["rx_ratio"]) if m["rx_ratio"] else math.inf
    return m["ikss_ka"], xr, m["kappa"], m["ip_ka"]


def test_g1_per_node_kappa_ip_are_physical_and_not_inverted():
    c = build_g4_pvtr()
    sn_ik, sn_xr, sn_k, sn_ip = _node(c, "SN_PCC")
    nn_ik, nn_xr, nn_k, nn_ip = _node(c, "NN_800")

    # SN — grid-dominated infeed: X/R > 5, κ 1.6-1.75, ip 22-24 kA.
    assert sn_xr > 5.0, f"SN X/R={sn_xr:.2f} too resistive for a grid infeed"
    assert 1.60 <= sn_k <= 1.75, f"SN κ={sn_k:.3f} outside grid range"
    assert 22.0 <= sn_ip <= 24.5, f"SN ip={sn_ip:.2f} kA outside 22-24"

    # nN — behind the transformer: X/R 3-6, κ 1.4-1.55, ip 27-29 kA.
    assert 3.0 <= nn_xr <= 6.0, f"nN X/R={nn_xr:.2f} unphysical behind a transformer"
    assert 1.40 <= nn_k <= 1.55, f"nN κ={nn_k:.3f} outside transformer range"
    assert 27.0 <= nn_ip <= 29.5, f"nN ip={nn_ip:.2f} kA outside 27-29"

    # NOT inverted: the grid side must be MORE inductive than the LV side behind the TR.
    assert sn_k > nn_k, "κ inverted — grid must be more inductive than LV-behind-TR"
    assert sn_xr > nn_xr, "X/R inverted between SN and nN"

    # κ = 1.02 + 0.98·e^(−3·R/X) and ip = κ·√2·Ik″ (PN-EN 60909) — internally consistent.
    for ik, xr, k, ip in [(sn_ik, sn_xr, sn_k, sn_ip), (nn_ik, nn_xr, nn_k, nn_ip)]:
        assert k == pytest.approx(1.02 + 0.98 * math.exp(-3.0 / xr), abs=0.02)
        assert ip == pytest.approx(k * math.sqrt(2.0) * ik, abs=0.1)


def test_g1_kappa_fix_preserves_ikss_magnitudes():
    # The R/X correction must NOT move the SC magnitudes: |Z|=uk for the TR is unchanged
    # and the grid-infeed |Z| was kept constant — so Ik″ stays at the accepted values.
    c = build_g4_pvtr()
    assert c["short_circuit"]["buses"]["SN_PCC"]["max"]["ikss_ka"] == pytest.approx(9.9, abs=0.25)
    assert c["short_circuit"]["buses"]["NN_800"]["max"]["ikss_ka"] == pytest.approx(13.2, abs=0.4)
