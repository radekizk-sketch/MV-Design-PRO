"""Niezależna macierz PTPiREE 3.0, str. 5–6 (weryfikowana PDF)."""
from __future__ import annotations

import pytest

from application.ncrfg_compliance.test_scope import zakres_badan


@pytest.mark.parametrize("pgm", ["A", "B", "C", "D"])
@pytest.mark.parametrize("family", ["SYPGM", "PPM", "OFFSHORE_PPM"])
def test_matrix_covers_full_type_family_product(pgm: str, family: str) -> None:
    result = zakres_badan(pgm, family)
    assert result.status_formalny == "ZAKRES_NIE_WYKONANIE"
    assert len(result.punkty) > 10
    assert all(x.zrodlo_url.startswith("https://ptpiree.pl/") for x in result.punkty)
    assert all(x.strona_pdf in (5, 6) for x in result.punkty)
    assert len({x.zdolnosc for x in result.punkty}) == len(result.punkty)


def _s(family: str, pgm: str, ability: str) -> str:
    return next(x.status for x in zakres_badan(pgm, family).punkty if x.zdolnosc == ability)


def test_sync_lfsm_o_certificate_only_for_a_b() -> None:
    assert [_s("SYPGM", t, "LFSM_O") for t in "ABCD"] == [
        "CERT_IF_AB", "CERT_IF_AB", "TEST", "TEST",
    ]


def test_ppm_lfsm_o_no_field_test_for_a_b_in_table_only() -> None:
    assert [_s("PPM", t, "LFSM_O") for t in "ABCD"] == [
        "NONE", "NONE", "TEST", "TEST",
    ]
    assert "nie oznacza brak" in next(
        x.opis_pl for x in zakres_badan("A", "PPM").punkty if x.zdolnosc == "LFSM_O"
    )


def test_b_ppm_q_capability_is_test_required() -> None:
    assert _s("PPM", "B", "REACTIVE_CAPABILITY") == "TEST"
    assert _s("SYPGM", "B", "REACTIVE_CAPABILITY") == "CERT_IF_AB"


def test_active_p_mode_for_c_d_ppm() -> None:
    assert _s("PPM", "C", "ACTIVE_POWER_CONTROL") == "TEST"
    assert _s("PPM", "D", "ACTIVE_POWER_CONTROL") == "TEST"
    assert _s("PPM", "A", "ACTIVE_POWER_CONTROL") == "NONE"


def test_a_stop_b_stop_and_b_reduce_are_cert_optional() -> None:
    assert _s("SYPGM", "A", "STOP_GENERATION") == "CERT_IF_AB"
    assert _s("PPM", "B", "REDUCE_GENERATION") == "CERT_IF_AB"
    assert _s("PPM", "C", "REDUCE_GENERATION") == "NONE"


def test_b_active_p_control_additional() -> None:
    assert _s("SYPGM", "B", "ACTIVE_POWER_CONTROL_ADDITIONAL") == "TEST"


def test_optional_operator_functions_stay_conditional() -> None:
    assert _s("PPM", "D", "ISLAND_OPERATION") == "CONDITIONAL_OPERATOR"
    assert _s("SYPGM", "C", "BLACK_START") == "CONDITIONAL_OPERATOR"
    assert _s("SYPGM", "A", "BLACK_START") == "NONE"


def test_wos2018_oscillation_condition_not_universalized() -> None:
    assert _s("SYPGM", "D", "OSCILLATION_DAMPING") == "CONDITIONAL_WOS2018_P20"
    assert _s("SYPGM", "C", "OSCILLATION_DAMPING") == "NONE"


def test_offshore_ppm_has_distinct_family_and_reactive_mode() -> None:
    assert _s("OFFSHORE_PPM", "C", "POWER_FACTOR_CONTROL") == "TEST"
    assert _s("OFFSHORE_PPM", "B", "POWER_FACTOR_CONTROL") == "NONE"
