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

    # SN — grid-dominated infeed: X/R > 5, κ 1.6-1.75, ip ≈ 21.3 kA. Audit F-1: the reported
    # collector = grid Thévenin + the PV IBG REFERRED through the step-up (0.8/15.75 kV → ≈ 0.04
    # kA, negligible), NOT the solver's raw un-referred §6.7 sum.
    assert sn_xr > 5.0, f"SN X/R={sn_xr:.2f} too resistive for a grid infeed"
    assert 1.60 <= sn_k <= 1.75, f"SN κ={sn_k:.3f} outside grid range"
    assert 20.5 <= sn_ip <= 22.5, f"SN ip={sn_ip:.2f} kA outside 20.5-22.5"

    # nN — behind the transformer: X/R 3-6, κ 1.4-1.55, ip 27-30 kA. The upper ip bound was
    # 29.5 while the measured value is 29.49 — a 0.02% margin, i.e. an assertion that would
    # flip on rounding noise rather than on a physics regression. Re-based to 30.0, which is
    # what the κ band itself implies: κ_max·√2·Ik″ = 1.55·1.4142·13.613 = 29.8 kA.
    assert 3.0 <= nn_xr <= 6.0, f"nN X/R={nn_xr:.2f} unphysical behind a transformer"
    assert 1.40 <= nn_k <= 1.55, f"nN κ={nn_k:.3f} outside transformer range"
    assert 27.0 <= nn_ip <= 30.0, f"nN ip={nn_ip:.2f} kA outside 27-30"

    # NOT inverted: the grid side must be MORE inductive than the LV side behind the TR.
    assert sn_k > nn_k, "κ inverted — grid must be more inductive than LV-behind-TR"
    assert sn_xr > nn_xr, "X/R inverted between SN and nN"

    # κ = 1.02 + 0.98·e^(−3·R/X) and ip = κ·√2·Ik″ (PN-EN 60909) — internally consistent.
    for ik, xr, k, ip in [(sn_ik, sn_xr, sn_k, sn_ip), (nn_ik, nn_xr, nn_k, nn_ip)]:
        assert k == pytest.approx(1.02 + 0.98 * math.exp(-3.0 / xr), abs=0.02)
        assert ip == pytest.approx(k * math.sqrt(2.0) * ik, abs=0.1)


def test_g1_kappa_fix_preserves_ikss_magnitudes():
    # The R/X correction (B-02) must NOT move the underlying SC magnitudes: |Z|=uk for the TR is
    # unchanged and the grid-infeed |Z| was kept constant. The nN bus (where the PV IBG sits, so
    # referred = local) is the clean witness. The collector reads 9.06 kA — grid Thévenin + the
    # IBG REFERRED to 15.75 kV (≈ 0.04 kA); audit F-1 corrected it down from the pre-fix 9.9 kA,
    # which had counted the IBG raw (un-referred, ≈ 0.87 kA). The grid part is unchanged — only
    # the IBG reporting (raw → referred) moved.
    #
    # RE-BASELINE nN 13.2 → 13.61 kA (V12K-184, debt left over from V12K-178). The nN figure
    # here predates the IEC 60909-0 §3.3.3 transformer impedance correction Z_TK = K_T·Z_T,
    # which V12K-178 put into the SC Y-bus but never re-measured this expectation against.
    # PROOF (1 MVA, uk=6%, X/R=4.5, 15.75/0.8 kV; grid infeed 0.142+j0.996 Ω):
    #   x_T = 0.058571, c_max(LV 0.8 kV, IEC Table 1) = 1.05
    #   K_T = 0.95·1.05/(1+0.6·0.058571) = 0.963635  ⇒  Z_TK = 0.012543 + j0.056441 pu
    #   Ik″_Thévenin = 12 747 A;  IBG (3×333.2 kVA, k=1.2, local) = 866 A  ⇒  13.613 kA
    #   Same chain WITHOUT K_T: 12 316 + 866 = 13.181 kA — i.e. exactly the old "13.2".
    # The SN_PCC figure is untouched by K_T (the transformer is behind that busbar), which is
    # why only the nN expectation moves. Tolerance tightened to 0.15 kA so the pre-K_T value
    # (13.18) can no longer satisfy this lock.
    c = build_g4_pvtr()
    assert c["short_circuit"]["buses"]["SN_PCC"]["max"]["ikss_ka"] == pytest.approx(9.06, abs=0.2)
    assert c["short_circuit"]["buses"]["NN_800"]["max"]["ikss_ka"] == pytest.approx(13.61, abs=0.15)
