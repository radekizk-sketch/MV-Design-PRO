"""G4 (canon) PV+BESS hybrid — backend physics lock. Both coupling variants are generic
IBG archetypes (PV inverters + BESS PCS, IEC 60909-0:2016 §6.7 limited current k·In, gate
J ≠ machine):

  BUS — common 15 kV SN busbar, PV and BESS each behind their OWN transformer.
  AC  — AC-coupled: PV inverters + BESS PCS on ONE LV bus behind ONE connection transformer.

The SN busbar sits on ENEA-valid 15 kV, every bus withstand passes (Ik″ ≤ Icw), the source
contribution = the SUM of the PV + BESS IBG, and the base case exports PV generation + BESS
discharge (~2 MW reverse). Numbers come from the FROZEN solver (READ-ONLY)."""

import pytest

from application.reference_networks.station_archetype_substrate import (
    build_g4_pvbess_ac,
    build_g4_pvbess_bus,
)

_ENEA_SN_KV = {6.0, 15.0, 20.0}


@pytest.mark.parametrize("build", [build_g4_pvbess_bus, build_g4_pvbess_ac], ids=["bus", "ac"])
def test_hybrid_is_ibg_15kv_and_withstand_holds(build):
    c = build()
    assert c["converged"] is True
    assert c["source"]["machine_type"] == "IBG"  # both PV and BESS are IBG (gate J)
    assert c["source"]["bidirectional"] is True  # BESS portion
    h = c["source"]["hybrid"]
    assert h["pv_kw"] == pytest.approx(999.0)
    assert h["bess_kw"] == pytest.approx(1000.0)
    assert h["bess_capacity_kwh"] == pytest.approx(2000.0)
    # SN collector is ENEA-valid 15 kV (no 30 kV); every bus withstand passes (Ik″ ≤ Icw).
    sn = c["short_circuit"]["buses"]["SN_PCC"]
    assert sn["un_kv"] == 15.0
    assert sn["un_kv"] in _ENEA_SN_KV
    assert sn["max"]["kappa"] == pytest.approx(1.659, abs=0.01)  # grid-infeed X/R≈7
    for bus in c["short_circuit"]["buses"].values():
        sc = bus["source_contribution"]
        assert bus["verification"]["passed"] is True
        assert sc["machine_type"] == "IBG"
        assert sc["ik_contribution_ka"] > 0  # PV + BESS IBG sum (k·In)
        assert "machines" not in sc  # IBG: no rotating-machine breakdown


@pytest.mark.parametrize("build", [build_g4_pvbess_bus, build_g4_pvbess_ac], ids=["bus", "ac"])
def test_hybrid_base_case_exports_pv_plus_bess(build):
    # Base case = PV generation + BESS discharge → ~2 MW reverse (export) on the grid line.
    c = build()
    grid = c["voltage_flow"]["branches"]["sr/branch/in"]
    assert grid["direction"] == "reverse"
    assert grid["p_mw"] < -1.8  # ≈ −1.97 MW (PV+BESS minus own needs)
    assert c["source"]["hybrid"]["p_export_max_kw"] == pytest.approx(1999.0)
    assert c["source"]["power_hierarchy"]["valid"] is True


def test_bus_variant_splits_pv_and_bess_behind_two_transformers():
    # SN-coupled: PV and BESS on SEPARATE nN buses behind SEPARATE transformers.
    c = build_g4_pvbess_bus()
    buses = c["short_circuit"]["buses"]
    assert set(buses) == {"SN_PCC", "PV_NN", "BESS_NN"}
    assert buses["PV_NN"]["un_kv"] == 0.8
    assert buses["BESS_NN"]["un_kv"] == 0.4
    assert c["source"]["hybrid"]["coupling"] == "SN_BUS"
    assert len([f for f in c["fields"] if f["role"] == "transformer"]) == 2


def test_ac_variant_shares_one_bus_behind_one_transformer():
    # AC-coupled: PV inverters + BESS PCS on ONE LV bus behind ONE connection transformer.
    c = build_g4_pvbess_ac()
    buses = c["short_circuit"]["buses"]
    assert set(buses) == {"SN_PCC", "NN"}
    assert buses["NN"]["un_kv"] == 0.8
    assert c["source"]["hybrid"]["coupling"] == "AC_LV"
    assert len([f for f in c["fields"] if f["role"] == "transformer"]) == 1
    # 5 source bays = 3 PV inverters + 2 BESS PCS on the common bus.
    assert len([f for f in c["fields"] if f["role"] == "source"]) == 5


def test_ibg_contribution_referred_to_sn():
    # IBG (PV+BESS) is current-limited (§6.7); its contribution at the SN/PCC MUST be
    # REFERRED through the transformers (I_SN = Σ I_nN·U_nN/U_SN) → small (~0.09 kA), like
    # G6-WIND (referred to the collector), NOT the raw nN sum (~2.6 kA). The nN buses keep
    # the LOCAL k·In (larger). Regression guard for the "~20× overstated SN share" defect.
    for build in (build_g4_pvbess_bus, build_g4_pvbess_ac):
        c = build()
        b = c["short_circuit"]["buses"]
        sn_ibg = b["SN_PCC"]["source_contribution"]["ik_contribution_ka"]
        assert sn_ibg == pytest.approx(0.09, abs=0.03)  # referred to 15 kV (~0.1, like wind)
        assert sn_ibg < 0.2  # NOT the raw nN sum (~2.6 kA)
        for bus, e in b.items():
            if bus != "SN_PCC":  # every nN bus carries the larger LOCAL contribution
                assert e["source_contribution"]["ik_contribution_ka"] > sn_ibg * 5


def test_hybrid_deterministic():
    assert build_g4_pvbess_bus() == build_g4_pvbess_bus()
    assert build_g4_pvbess_ac() == build_g4_pvbess_ac()
