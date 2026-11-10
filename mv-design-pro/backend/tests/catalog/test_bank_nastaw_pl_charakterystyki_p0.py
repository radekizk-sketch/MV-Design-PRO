"""Sprawdzono bezpośrednio Bank Nastaw PL v1.1: FRT, IQ, Q(U), P recovery."""
from __future__ import annotations

import pytest
from application.ncrfg_compliance.bank_nastaw_pl import charakterystyki_banku


def _by_id(wariant: str, id_: str) -> dict:
    return next(x for x in charakterystyki_banku(wariant)["charakterystyki"] if x["id"]==id_)


def test_b_sn_frt_points_pu_time_s() -> None:
    x=_by_id("B_SN","FRT_PROFILE")
    assert x["u_ret_pu"]==.05
    assert x["t_clear_s"]==.25
    assert x["u_rec2_pu"]==.85
    assert x["t_rec3_s"]==2.5
    assert x["pdf_page"]==15


def test_b_sn_fast_fault_current_reference_do_not_change_sign() -> None:
    x=_by_id("B_SN","FAULT_REACTIVE_CURRENT")
    assert x["k1_default"]==2 and x["k2_default"]==2
    assert x["u_trigger_default_pu"]==.85
    assert x["response_time_max_ms"]==30
    assert x["settle_time_max_ms"]==60
    assert x["tolerance_minus_pct"]==-10
    assert x["tolerance_plus_pct"]==20
    assert x["reactive_priority"] and x["maximum_phase_current_not_exceeded"]
    assert "Delta_U1" in x["delta_iq1_formula"]


def test_b_sn_recovery_and_reconnect() -> None:
    r=_by_id("B_SN","ACTIVE_POWER_RECOVERY")
    assert r["voltage_recovery_start_pu"]==.9
    assert r["max_time_after_fault_s"]==5
    assert r["p_recovery_fraction_of_pre_fault"]==.9
    c=_by_id("B_SN","RECONNECTION")
    assert c["frequency_min_hz"]==49
    assert c["frequency_max_hz"]==50.05
    assert c["min_stable_time_s"]==60


def test_a_nn_qu_curve_source_values() -> None:
    q=_by_id("A_NN","QU")
    assert q["u_min_pu"]==.92
    assert q["u_prog1_pu"]==.94
    assert q["u_prog2_pu"]==1.06
    assert q["u_max_pu"]==1.08
    assert q["max_q_gen_in_Pd"]==.4843
    assert q["max_q_pobor_in_Pd"]==-.4843


def test_p_and_frequency_reference_preserves_zero_simulation() -> None:
    for variant in ("A_NN","B_SN"):
        x=charakterystyki_banku(variant)
        assert not x["wos_2025_przejete"]
        assert x["wynik_badania"]=="NIE_OCENIONO"
        f=_by_id(variant,"LFSM_O")
        assert f["frequency_threshold_hz"]==50.2 and f["droop_pct"]==5


def test_unknown_variants_do_not_derive_data() -> None:
    with pytest.raises(ValueError):
        charakterystyki_banku("C_SN")
