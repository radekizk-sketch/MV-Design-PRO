"""P0 wartości Banku Nastaw Polska 1.1 z oryginalnej tabeli A oraz B SN."""
from __future__ import annotations

import pytest

from application.ncrfg_compliance.bank_nastaw_pl import bank_nastaw, bank_nastaw_dla_przypadku
from tests import ncrfg_fabryki as f


def _n(wariant: str, kod: str):
    return next(x for x in bank_nastaw(wariant).nastawy if x.id == kod)


def test_a_nn_voltage_and_frequency_protections() -> None:
    assert (_n("A_NN", "U_LT").wartosc, _n("A_NN", "U_LT").czas_s) == (0.85, 1.2)
    assert (_n("A_NN", "U_GT_1").wartosc, _n("A_NN", "U_GT_1").czas_s) == (1.1, 3.0)
    assert (_n("A_NN", "U_GT_2").wartosc, _n("A_NN", "U_GT_2").czas_s) == (1.15, 0.1)
    assert (_n("A_NN", "F_LT").wartosc, _n("A_NN", "F_LT").czas_s) == (47.5, 1.0)
    assert (_n("A_NN", "F_GT").wartosc, _n("A_NN", "F_GT").czas_s) == (51.5, 0.3)
    assert _n("A_NN", "ROCOF").wartosc == 2.5
    assert _n("A_NN", "ROCOF").tryb_czasu == "CZAS_MAKSYMALNY"
    assert _n("A_NN", "ROCOF").czas_s == 0.5
    assert _n("A_NN", "ROCOF").pdf_page == 2


def test_type_b_sn_is_not_type_a_protection_profile() -> None:
    assert (_n("B_SN", "U_LT").wartosc, _n("B_SN", "U_LT").czas_s) == (0.8, 3.0)
    assert _n("B_SN", "ROCOF").wartosc == 2.0
    assert _n("B_SN", "ROCOF").czas_s == 0.2
    assert _n("B_SN", "U_GT_2").czas_s == 0.1
    assert _n("B_SN", "U_GT_2").pdf_page == 13
    assert not bank_nastaw("B_SN").zatwierdzenie_osd


def test_no_invented_type_c_d_bank() -> None:
    with pytest.raises(ValueError):
        bank_nastaw("C_SN")


def test_case_499kw_sn_recovers_b_sn_benchmark_not_osd_proof() -> None:
    model = f.model(f.generator(p_mw=0.499))
    report = bank_nastaw_dla_przypadku(model, operator_id="enea")
    item = report["wyniki"][0]
    assert item["typ"] == "B"
    assert item["bank"]["wariant"] == "B_SN"
    assert item["bank"]["zatwierdzenie_osd"] is False
    assert report["status_formalny"] == "NIE_ZATWIERDZONO_NASTAW"


def test_bess_no_rfg_inverter_bank() -> None:
    model = f.model(f.generator(gen_type="bess", p_mw=0.5))
    report = bank_nastaw_dla_przypadku(model, operator_id="enea")
    assert report["wyniki"][0]["status"] == "POZA_NC_RFG_MAGAZYN"
