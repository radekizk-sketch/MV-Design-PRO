"""Testy serwisu weryfikacji pokrycia krzywej P-Q wymaganiem NC RfG (D4).

Warstwa APPLICATION — porównanie wartości, ZERO fizyki. Profil operatora ``pge``
wymaga zakresu Q ±0.33 * Pn.
"""

from __future__ import annotations

import pytest
from application.analyses.pq_coverage import build_pq_coverage_view
from catalog.profiles.nc_rfg.loader import load_nc_rfg_profile
from network_model.catalog.types import ConverterKind, ConverterType

# pge: q_range_pct_pn = ±0.33; Pn = pmax_mw = 1.0 => wymaganie ±0.33 Mvar.
_PROFILE = load_nc_rfg_profile("pge")


def _converter(pq_curve) -> ConverterType:
    return ConverterType(
        id="conv-test",
        name="Test",
        kind=ConverterKind.BESS,
        un_kv=0.4,
        sn_mva=1.0,
        pmax_mw=1.0,
        qmin_mvar=-0.6,
        qmax_mvar=0.6,
        pq_curve=pq_curve,
    )


def test_full_coverage_verdict_and_margins() -> None:
    # Pasmo ±0.5 obejmuje wymaganie ±0.33 w kazdym punkcie.
    c = _converter(((0.0, -0.5, 0.5), (0.5, -0.5, 0.5), (1.0, -0.5, 0.5)))
    view = build_pq_coverage_view(c, _PROFILE)
    assert view["werdykt"]["pokryty"] is True
    assert view["werdykt"]["liczba_pokrytych"] == 3
    assert view["werdykt"]["liczba_punktow"] == 3
    # margines = min(0.33 - (-0.5), 0.5 - 0.33) = 0.17
    assert view["werdykt"]["min_margines_mvar"] == pytest.approx(0.17)
    for pt in view["punkty"]:
        assert pt["pokryty"] is True
        assert pt["margines_mvar"] == pytest.approx(0.17)


def test_partial_coverage() -> None:
    # Ostatni punkt zwezony do ±0.2 < wymagane 0.33 => niepokryty.
    c = _converter(((0.0, -0.5, 0.5), (0.5, -0.5, 0.5), (1.0, -0.2, 0.2)))
    view = build_pq_coverage_view(c, _PROFILE)
    assert view["werdykt"]["pokryty"] is False
    assert view["werdykt"]["liczba_pokrytych"] == 2
    last = view["punkty"][-1]
    assert last["pokryty"] is False
    # deficyt gorny = 0.2 - 0.33 = -0.13
    assert last["margines_mvar"] == pytest.approx(-0.13)
    assert "niepokryty" in last["uwaga"]


def test_no_coverage() -> None:
    c = _converter(((0.0, -0.1, 0.1), (1.0, -0.1, 0.1)))
    view = build_pq_coverage_view(c, _PROFILE)
    assert view["werdykt"]["pokryty"] is False
    assert view["werdykt"]["liczba_pokrytych"] == 0
    assert view["werdykt"]["min_margines_mvar"] == pytest.approx(-0.23)


def test_requirement_scales_with_pn() -> None:
    # Pn = pmax_mw uzyte jako odniesienie wymagania.
    c = _converter(((0.0, -0.5, 0.5),))
    view = build_pq_coverage_view(c, _PROFILE)
    assert view["wymaganie"]["q_wymagane_max_mvar"] == pytest.approx(0.33)
    assert view["wymaganie"]["q_wymagane_min_mvar"] == pytest.approx(-0.33)
    assert view["wymaganie"]["pn_mw"] == pytest.approx(1.0)


def test_whitebox_trace_present() -> None:
    c = _converter(((0.0, -0.5, 0.5), (1.0, -0.5, 0.5)))
    trace = build_pq_coverage_view(c, _PROFILE)["slad_whitebox"]
    assert "wzor" in trace and "q_wym_min" in trace["wzor"]
    assert trace["dane"]["liczba_punktow_krzywej"] == 2
    assert len(trace["podstawienie"]) == 2
    assert "POKRYTE" in trace["wynik"]


def test_deterministic_two_calls_identical() -> None:
    c = _converter(((0.0, -0.5, 0.5), (1.0, -0.4, 0.4)))
    first = build_pq_coverage_view(c, _PROFILE)
    second = build_pq_coverage_view(c, _PROFILE)
    assert first == second


def test_no_curve_raises_valueerror() -> None:
    c = _converter(pq_curve=None)
    with pytest.raises(ValueError, match="nie ma krzywej producenta"):
        build_pq_coverage_view(c, _PROFILE)


def test_operator_metadata_in_view() -> None:
    c = _converter(((0.0, -0.5, 0.5),))
    view = build_pq_coverage_view(c, _PROFILE)
    assert view["operator"]["id"] == "pge"
    assert view["operator"]["udzial_q_max_pct_pn"] == pytest.approx(0.33)
    assert view["typ_katalogowy"]["id"] == "conv-test"
